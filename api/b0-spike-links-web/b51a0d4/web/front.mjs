// A local stand-in for the two hosts, with no interception in the browser: one HTTPS server on 443 serves
// apps/web/public as tadayo.app (with _headers' rule), a bare page as evil.example, and forwards
// api-dev.tadayo.app to the real API app (services/api/src/app.ts's buildApp, web-origin.test.ts's fake
// transaction) on a local port: 8711 a live link (Ben), 8712 a link that names nothing, 8713 a failed
// database. A control port, 8799, sets which app answers each POST in turn.
import { createServer as https } from "node:https";
import { createServer as http, request as forward } from "node:http";
import { createWriteStream, readFileSync } from "node:fs";
import { join, extname } from "node:path";
const { buildApp } = await import("/home/user/tadayo-fq77/services/api/src/app.ts");
const [dist, certDir, logPath] = process.argv.slice(2);
const log = createWriteStream(logPath);
const kinds = { 8711: () => Promise.resolve({ inviterName: "Ben" }), 8712: () => Promise.resolve(null), 8713: () => Promise.reject(new Error("no database")) };
for (const [port, begin] of Object.entries(kinds)) {
  const app = buildApp({ sql: { end: () => Promise.resolve(), begin: () => begin() }, clock: {}, authenticate: () => Promise.reject(new Error("never asked")), log: { level: "trace", stream: { write: (line) => void log.write(line) } } });
  await app.listen({ port: Number(port), host: "127.0.0.1" });
}
const rules = readFileSync(join(dist, "_headers"), "utf8");
const block = rules.slice(rules.indexOf("\n/*\n") + 4).split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
const siteHeaders = Object.fromEntries(block.map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
let queue = [8711];
const seen = [];
https({ key: readFileSync(join(certDir, "key.pem")), cert: readFileSync(join(certDir, "cert.pem")) }, (req, res) => {
  const host = (req.headers.host ?? "").split(":")[0];
  if (host === "tadayo.app") {
    const path = req.url.split("#")[0].split("?")[0];
    const file = path === "/i" ? "/i.html" : path;
    try { res.writeHead(200, { ...siteHeaders, "content-type": TYPES[extname(file)] ?? "application/octet-stream" }); res.end(readFileSync(join(dist, file))); }
    catch { res.writeHead(404, siteHeaders); res.end(); }
    return;
  }
  if (host === "evil.example") { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>x</title>"); return; }
  if (host === "api-dev.tadayo.app") {
    const port = req.method === "OPTIONS" ? queue[0] : (queue.length > 1 ? queue.shift() : queue[0]);
    const entry = { method: req.method, port, origin: req.headers.origin ?? null, referer: req.headers.referer ?? null, cookie: req.headers.cookie ?? null, acrm: req.headers["access-control-request-method"] ?? null, acrh: req.headers["access-control-request-headers"] ?? null };
    const upstream = forward({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (answer) => {
      entry.status = answer.statusCode; entry.acao = answer.headers["access-control-allow-origin"] ?? null; entry.acac = answer.headers["access-control-allow-credentials"] ?? null; entry.vary = answer.headers.vary ?? null; entry.acam = answer.headers["access-control-allow-methods"] ?? null; entry.acah = answer.headers["access-control-allow-headers"] ?? null;
      seen.push(entry);
      res.writeHead(answer.statusCode, answer.rawHeaders.filter((_, i) => i % 2 === 0 ? !["connection", "keep-alive", "transfer-encoding"].includes(answer.rawHeaders[i].toLowerCase()) : !["connection", "keep-alive", "transfer-encoding"].includes(answer.rawHeaders[i - 1].toLowerCase())));
      answer.pipe(res);
    });
    req.pipe(upstream);
    return;
  }
  res.writeHead(421); res.end();
}).listen(443, "127.0.0.1");
http((req, res) => {
  const url = new URL(req.url, "http://control");
  if (url.pathname === "/queue") { queue = url.searchParams.get("ports").split(",").map(Number); seen.length = 0; res.end("ok"); return; }
  if (url.pathname === "/seen") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(seen)); return; }
  res.statusCode = 404; res.end();
}).listen(8799, "127.0.0.1");
console.log("listening");
