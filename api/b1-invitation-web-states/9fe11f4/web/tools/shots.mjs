// Screenshots of the signed-out invitation page's states, for api/b1-invitation-web-states (not committed).
// Serves apps/web/public as https://tadayo.app with _headers' rule; answers the API's POST per state.
// Usage: node shots.mjs <public dir> <out dir>
import { readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [pub, out] = process.argv.slice(2);
const rules = readFileSync(join(pub, "_headers"), "utf8");
const block = rules.slice(rules.indexOf("\n/*\n") + 4).split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim());
const siteHeaders = Object.fromEntries(block.map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
const CORS = { "access-control-allow-origin": "https://tadayo.app", "content-type": "application/json", "cache-control": "private, no-store" };

const browser = await chromium.launch();
const notes = [];

/** One state: `answers` is a list of handlers for the POSTs in turn; `then` acts on the page before the shot. */
async function shot(name, answers, { dark = false, zoom = false, js = true, reduce = false, then } = {}) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
    javaScriptEnabled: js,
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  let posts = 0;
  await page.route("https://tadayo.app/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === "/i" ? "/i.html" : path;
    try {
      route.fulfill({ status: 200, headers: { ...siteHeaders, "content-type": TYPES[extname(file)] ?? "application/octet-stream" }, body: readFileSync(join(pub, file)) });
    } catch {
      route.fulfill({ status: 404, headers: siteHeaders, body: "" });
    }
  });
  await page.route("https://api-dev.tadayo.app/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
    const handler = answers[Math.min(posts, answers.length - 1)];
    posts += 1;
    return handler(route);
  });
  await page.goto(`https://tadayo.app/i#${TOKEN}`);
  if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(300);
  if (then) await then(page);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const status = document.querySelector('[role="status"]');
    const retry = document.querySelector("[data-retry]");
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width === 0 ? null : [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100); };
    const visibleTitle = [...document.querySelectorAll("[data-state]")].find((e) => !e.hidden)?.querySelector("h1");
    const visibleBody = [...document.querySelectorAll("[data-state]:not([hidden]) .body, [data-state]:not([hidden]) .brand")].find((e) => !e.hidden);
    return {
      status: status?.textContent?.replace(/\s+/g, " ").trim(),
      live: [status?.getAttribute("aria-live"), status?.getAttribute("aria-atomic")],
      active: document.activeElement?.className ?? null,
      retry: retry ? { hidden: retry.hidden, disabled: retry.getAttribute("aria-disabled"), describedby: retry.getAttribute("aria-describedby") } : null,
      get: [document.querySelector("[data-get]")?.getAttribute("aria-describedby"), document.querySelector("[data-get]")?.getAttribute("aria-labelledby")],
      rects: { title: rect(visibleTitle), body: rect(visibleBody), retry: rect(retry), get: rect(document.querySelector("[data-get]")), wordmark: rect(document.querySelector(".wordmark")), nojs: rect(document.querySelector(".nojs")) },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: zoom });
  notes.push({ name, posts, errors, ...state });
  await context.close();
}

const hang = () => new Promise(() => {});
const fail = (route) => route.abort("failed");
const busy = (code) => (route) => route.fulfill({ status: code, headers: CORS, body: '{"code":"INTERNAL"}' });
const ben = (route) => route.fulfill({ status: 200, headers: CORS, body: '{"inviter_name":"Ben"}' });
const gone = (route) => route.fulfill({ status: 404, headers: CORS, body: '{"code":"NOT_FOUND"}' });
const retry = async (page) => { await page.click("[data-retry]"); };

for (const dark of [false, true]) {
  const d = dark ? "-dark" : "";
  await shot(`checking-first${d}`, [hang], { dark });
  await shot(`checking-retry${d}`, [fail, hang], { dark, reduce: true, then: retry });
  await shot(`failed-network${d}`, [fail], { dark });
  await shot(`failed-answered${d}`, [busy(503)], { dark });
  await shot(`nojs${d}`, [hang], { dark, js: false });
  await shot(`invited${d}`, [ben], { dark });
  await shot(`unavailable${d}`, [gone], { dark });
}
await shot("checking-retry-xl", [fail, hang], { zoom: true, reduce: true, then: retry });
await shot("failed-network-xl", [fail], { zoom: true });
await shot("checking-first-xl", [hang], { zoom: true });
await shot("nojs-xl", [hang], { zoom: true, js: false });
await shot("invited-xl", [ben], { zoom: true });
// Focus: Retry keeps it on a failure; a final answer gives it to Get Tadayo; a double click asks once.
await shot("after-retry-failed", [busy(503), busy(429)], { then: async (p) => { await p.focus("[data-retry]"); await p.keyboard.press("Enter"); await p.waitForTimeout(200); } });
await shot("after-retry-invited", [fail, ben], { then: async (p) => { await p.focus("[data-retry]"); await p.keyboard.press("Enter"); await p.waitForTimeout(200); } });
await shot("after-retry-double", [fail, hang, ben], { then: async (p) => { await p.focus("[data-retry]"); await p.keyboard.press("Enter"); await p.keyboard.press("Enter"); await p.keyboard.press("Space"); await p.waitForTimeout(200); } });
writeFileSync(join(out, "notes.json"), JSON.stringify(notes, null, 1));
await browser.close();
