// Screenshots of the invitation page as Pages would serve it at https://tadayo.app/i, the API answered by a route.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const [dist, out] = process.argv.slice(2);
const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
const rules = readFileSync(join(dist, "_headers"), "utf8");
const block = rules.slice(rules.indexOf("\n/*\n") + 4).split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
const siteHeaders = Object.fromEntries(block.map((l) => [l.slice(0, l.indexOf(":")).toLowerCase(), l.slice(l.indexOf(":") + 1).trim()]));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const log = [];

async function shoot(name, { scheme = "light", hash = `#${TOKEN}`, api, zoom = false, full = false }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const posts = [];
  await page.route("https://tadayo.app/**", async (route) => {
    const url = new URL(route.request().url());
    let path = url.pathname === "/i" ? "/i.html" : url.pathname;
    const file = join(dist, path);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "", headers: siteHeaders });
    await route.fulfill({ status: 200, body: readFileSync(file), headers: { ...siteHeaders, "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
  });
  await page.route("https://api-dev.tadayo.app/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "https://tadayo.app", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
    posts.push({ url: request.url(), headers: await request.allHeaders(), body: request.postData() });
    const answer = await api();
    if (answer === "hang") return; // never answered: the checking state
    await route.fulfill({ status: answer.status, body: answer.body ?? "", headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "access-control-allow-origin": "https://tadayo.app", vary: "Origin" } });
  });
  await page.goto(`https://tadayo.app/i${hash}`);
  await page.waitForTimeout(400);
  if (zoom) { await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await page.waitForTimeout(200); }
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  const visible = await page.evaluate(() => [...document.querySelectorAll("[data-state]")].filter((e) => !e.hidden).map((e) => e.dataset.state));
  const getLink = await page.evaluate(() => { const a = document.querySelector("[data-get]"); return { href: a.href, labelledby: a.getAttribute("aria-labelledby"), describedby: a.getAttribute("aria-describedby") }; });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  log.push({ name, scheme, zoom, visible, getLink, height, url: page.url(), errors, posts: posts.map((p) => ({ url: p.url, body: p.body, origin: p.headers.origin, referer: p.headers.referer ?? null, cookie: p.headers.cookie ?? null, contentType: p.headers["content-type"] })) });
  await browser.close();
}

const named = () => Promise.resolve({ status: 200, body: '{"inviter_name":"Ben"}' });
await shoot("G02-web", { api: named });
await shoot("G02-web-dark", { scheme: "dark", api: named });
await shoot("G02-web-xl", { api: named, zoom: true });
await shoot("G02-web-xl-full", { api: named, zoom: true, full: true });
await shoot("G02-web-revoked", { api: () => Promise.resolve({ status: 404, body: '{"code":"NOT_FOUND"}' }) });
await shoot("G02-web-revoked-dark", { scheme: "dark", api: () => Promise.resolve({ status: 404, body: '{"code":"NOT_FOUND"}' }) });
await shoot("G02-web-revoked-xl", { zoom: true, api: () => Promise.resolve({ status: 404, body: '{"code":"NOT_FOUND"}' }) });
await shoot("G02-web-no-token", { hash: "", api: named });
await shoot("G02-web-checking", { api: () => Promise.resolve("hang") });
await shoot("G02-web-failed", { api: () => Promise.resolve({ status: 503, body: "" }) });
await shoot("G02-web-failed-dark", { scheme: "dark", api: () => Promise.resolve({ status: 503, body: "" }) });
await shoot("G02-web-long-name", { api: () => Promise.resolve({ status: 200, body: JSON.stringify({ inviter_name: "Maximiliana Wolfeschlegelsteinhausen-Bergerdorff" }) }) });
await shoot("G02-web-rtl-name", { api: () => Promise.resolve({ status: 200, body: JSON.stringify({ inviter_name: "ليلى" }) }) });
console.log(JSON.stringify(log, null, 1));
