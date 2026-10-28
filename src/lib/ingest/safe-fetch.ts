import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { env, isProduction } from "../env";

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code: "blocked_url" | "timeout" | "too_large" | "http_status" | "network" | "too_many_redirects",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
};

export type SafeFetchResult = { url: string; status: number; contentType: string; body: string };

const DEFAULTS = { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 5 };

/** True for loopback, private, link-local, CGNAT, multicast, reserved and cloud-metadata addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

function allowPrivate() {
  return !isProduction() && env().FETCH_ALLOW_PRIVATE_HOSTS;
}

/** Validate a URL before any network activity. Throws FetchError("blocked_url"). */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError(`Invalid URL: ${raw}`, "blocked_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchError(`Blocked protocol ${url.protocol}`, "blocked_url");
  }
  if (url.username || url.password) throw new FetchError("Credentials in URL are not allowed", "blocked_url");
  if (url.port && !["80", "443"].includes(url.port) && !allowPrivate()) {
    throw new FetchError(`Blocked port ${url.port}`, "blocked_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate()) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new FetchError(`Blocked host ${host}`, "blocked_url");
    }
    if (net.isIP(host) && isPrivateAddress(host)) throw new FetchError(`Blocked address ${host}`, "blocked_url");
  }
  return url;
}

/** DNS lookup that refuses private addresses, used at connect time (prevents DNS rebinding). */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = (addresses as dns.LookupAddress[]) ?? [];
    const ok = allowPrivate() ? list : list.filter((a) => !isPrivateAddress(a.address));
    if (!ok.length) {
      return callback(new FetchError(`Host ${hostname} resolves to a blocked address`, "blocked_url") as NodeJS.ErrnoException, "", 0);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, ok);
    callback(null, ok[0].address, ok[0].family);
  });
};

const lastRequestByHost = new Map<string, number>();
const MIN_HOST_SPACING_MS = 1000;

async function politeDelay(host: string) {
  const last = lastRequestByHost.get(host) ?? 0;
  const wait = last + MIN_HOST_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestByHost.set(host, Date.now());
}

function requestOnce(url: URL, opts: Required<SafeFetchOptions>): Promise<SafeFetchResult & { location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        headers: {
          "User-Agent": env().FETCH_USER_AGENT,
          Accept: opts.accept,
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-CA,en;q=0.8",
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ url: url.toString(), status, contentType, body: "", location: res.headers.location });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new FetchError(`Response too large (${declared} bytes)`, "too_large", status));
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip"
            ? res.pipe(zlib.createGunzip())
            : enc === "deflate"
              ? res.pipe(zlib.createInflate())
              : enc === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy();
            stream.destroy();
            reject(new FetchError(`Response exceeded ${opts.maxBytes} bytes`, "too_large", status));
          } else chunks.push(c);
        });
        stream.on("error", (e) => reject(new FetchError(`Decode error: ${e.message}`, "network", status)));
        stream.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            return reject(new FetchError(`HTTP ${status} from ${url.hostname}`, "http_status", status));
          }
          resolve({ url: url.toString(), status, contentType, body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new FetchError(`Timed out after ${opts.timeoutMs} ms`, "timeout")));
    req.on("error", (e) => reject(e instanceof FetchError ? e : new FetchError(e.message, "network")));
    req.end();
  });
}

/**
 * Fetch a public URL with SSRF protection, manual redirect validation, timeout, size cap, polite per-host
 * spacing and an identifying User-Agent.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts: Required<SafeFetchOptions> = {
    ...DEFAULTS,
    accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5",
    ...options,
  };
  let url = assertSafeUrl(rawUrl);
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    await politeDelay(url.host);
    const res = await requestOnce(url, opts);
    if (!res.location) return res;
    url = assertSafeUrl(new URL(res.location, url).toString());
  }
  throw new FetchError(`Too many redirects for ${rawUrl}`, "too_many_redirects");
}
