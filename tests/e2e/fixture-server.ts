import http from "node:http";

// Local stand-in for a partner website during e2e tests (the app may fetch localhost only when
// FETCH_ALLOW_PRIVATE_HOSTS=true outside production).
const PORT = Number(process.env.FIXTURE_PORT ?? 3299);
const base = `http://127.0.0.1:${PORT}`;

const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Fixture Partner News</title><link>${base}/</link>
<item><title>Fixture partner opens new Edmonton family centre</title><link>${base}/news/family-centre</link>
<description>Fixture description of a new family centre.</description><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>Fixture partner volunteer evening</title><link>${base}/news/volunteers</link>
<description>Fixture volunteer event.</description><pubDate>${new Date(Date.now() - 3600_000).toUTCString()}</pubDate></item>
</channel></rss>`;

const pages: Record<string, [string, string]> = {
  "/robots.txt": ["text/plain", "User-agent: *\nAllow: /\n"],
  "/": [
    "text/html",
    `<html><head><title>Fixture Partner</title><link rel="alternate" type="application/rss+xml" title="Fixture Partner News" href="/feed/"></head><body>Home</body></html>`,
  ],
  "/feed/": ["application/rss+xml", feed],
  "/news/live-test": [
    "text/html",
    `<html><head><meta property="og:title" content="Fixture live update story"><meta name="description" content="Fixture story submitted during the live update test."></head><body></body></html>`,
  ],
};

http
  .createServer((req, res) => {
    const page = pages[(req.url ?? "/").split("?")[0]];
    if (!page) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": page[0] }).end(page[1]);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fixture server on ${base}`));
