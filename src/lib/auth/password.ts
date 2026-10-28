import crypto from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 64;
export const MIN_PASSWORD_LENGTH = 12;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Constant-ish work so unknown accounts are not distinguishable by timing.
    await scrypt(password, crypto.randomBytes(16), N, R, P);
    return false;
  }
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const key = await scrypt(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  const expected = Buffer.from(hash, "base64");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return "Password is too long.";
  if (/^(.)\1+$/.test(pw)) return "Password is too simple.";
  return null;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
