// What the status region and the controls expose to assistive tech, per state (not committed).
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const pub = process.argv[2];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
const CORS = { "access-control-allow-origin": "https://tadayo.app", "content-type": "application/json" };
const browser = await chromium.launch();
for (const [name, answers, retry] of [["failed-network", ["fail"], false], ["failed-answered", ["503"], false], ["checking-retry", ["fail", "hang"], true], ["invited", ["ben"], false]]) {
  const page = await browser.newPage();
  const csp = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused/.test(m.text())) csp.push(m.text()); });
  await page.route("https://tadayo.app/**", (r) => { const p = new URL(r.request().url()).pathname; const f = p === "/i" ? "/i.html" : p; try { r.fulfill({ status: 200, headers: { "content-type": TYPES[extname(f)] ?? "text/plain" }, body: readFileSync(join(pub, f)) }); } catch { r.fulfill({ status: 404, body: "" }); } });
  let n = 0;
  await page.route("https://api-dev.tadayo.app/**", (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
    const a = answers[Math.min(n++, answers.length - 1)];
    if (a === "fail") return r.abort("failed");
    if (a === "hang") return;
    if (a === "503") return r.fulfill({ status: 503, headers: CORS, body: "{}" });
    return r.fulfill({ status: 200, headers: CORS, body: '{"inviter_name":"Ben"}' });
  });
  await page.goto("https://tadayo.app/i#q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM");
  await page.waitForTimeout(300);
  if (retry) { await page.click("[data-retry]"); await page.waitForTimeout(200); }
  console.log(`## ${name}\n${await page.locator("main").ariaSnapshot()}\nCSP: ${csp.length}`);
  await page.close();
}
await browser.close();
