// The page in Chromium against the real API app's answers, with nothing intercepted: front.mjs serves
// tadayo.app, evil.example and api-dev.tadayo.app on 127.0.0.1:443 (a self-signed certificate, which the
// context accepts), and Chromium resolves the three names there. Chromium's own CORS checks judge the app.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { writeFileSync } from "node:fs";
const [out] = process.argv.slice(2);
const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
const control = (path) => fetch(`http://127.0.0.1:8799${path}`).then((r) => r.text());
// The session's proxy stays for everything else; the three names bypass it, to the local stand-in.
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP tadayo.app 127.0.0.1, MAP api-dev.tadayo.app 127.0.0.1, MAP evil.example 127.0.0.1"],
  ...(proxy ? { proxy: { server: proxy, bypass: "tadayo.app,api-dev.tadayo.app,evil.example" } } : {}),
});
const results = [];
const visible = (page) => page.evaluate(() => [...document.querySelectorAll("[data-state]")].filter((e) => !e.hidden).map((e) => e.dataset.state));
const focused = (page) => page.evaluate(() => { const e = document.activeElement; return e === document.body ? "BODY" : `${e.tagName}: ${(e.textContent ?? "").trim().slice(0, 34)}`; });
for (const [name, ports, retry] of [["a live link", "8711", false], ["a link that names nothing", "8712", false], ["a failed database", "8713", false], ["a failure, then Retry, a live link", "8713,8711", true], ["a failure, then Retry, a failure", "8713,8713", true]]) {
  await control(`/queue?ports=${ports}`);
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  await page.goto(`https://tadayo.app/i#${TOKEN}`);
  await page.waitForFunction(() => document.querySelector('[data-state="checking"]').hidden, null, { timeout: 5000 });
  const live = (page) => page.evaluate(() => document.querySelector(".parts").getAttribute("aria-live"));
  const first = { visible: await visible(page), focused: await focused(page), name: await page.evaluate(() => document.querySelector("[data-name]").textContent), live: await live(page) };
  let after = null;
  if (retry) {
    await page.focus("[data-retry]");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-state="checking"]').hidden, null, { timeout: 5000 });
    after = { visible: await visible(page), focused: await focused(page), name: await page.evaluate(() => document.querySelector("[data-name]").textContent), live: await live(page) };
  }
  results.push({ name, address: page.url(), first, after, console: errors, api: JSON.parse(await control("/seen")) });
  await context.close();
}
// Another origin asks the same API with a live token: the browser must refuse it every answer.
{
  await control("/queue?ports=8711");
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("https://evil.example/");
  const ask = (type) => page.evaluate(async ([token, type]) => {
    try {
      const response = await fetch("https://api-dev.tadayo.app/v1/invitations/web-preview", { method: "POST", headers: { "content-type": type }, body: JSON.stringify({ token }) });
      return `read ${response.status} ${await response.text()}`;
    } catch (error) { return `refused: ${error.name}: ${error.message}`; }
  }, [TOKEN, type]);
  const json = await ask("application/json");
  const plain = await ask("text/plain");
  results.push({ name: "another origin, evil.example", json, plain, api: JSON.parse(await control("/seen")) });
  await context.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(results, null, 1));
for (const r of results) console.log(JSON.stringify({ name: r.name, first: r.first, after: r.after, json: r.json, plain: r.plain, console: r.console, api: r.api.map((a) => `${a.method} ${a.status} origin=${a.origin} acao=${a.acao} acac=${a.acac} vary=${a.vary} referer=${a.referer} cookie=${a.cookie} acrh=${a.acrh}`) }));
