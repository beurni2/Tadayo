// The signed-out invitation page (public/i.html, i.js, i.css; G02-web, G02-web-revoked; spec 04; T7, T52;
// docs/plans/api-b0-spike-links-web.md): the script's logic, with a fake page and a fake fetch, and the files
// as Pages serves them. How it looks is the screenshots' beside the renders (the PR's evidence); Safari on an
// iPhone is the spike's run.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKEN, WAIT_MS, check, outcomeOf, previewRequest, show, start, tokenFrom } from "../public/i.js";
import { SOURCE } from "./build.ts";

const REPO = join(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(SOURCE, path), "utf8");
const API = "https://api-dev.tadayo.app";
const STORE = "https://apps.apple.com/app/testflight/id899247664";
const LIVE = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";

type Init = RequestInit & { signal: AbortSignal };

/** A fake answer: its status and the JSON it reads as, or a body that isn't JSON. */
function answering(status: number, body?: unknown): Response {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError("not JSON")) : Promise.resolve(body)),
  } as unknown as Response;
}

/** A fake page with i.html's parts: each `data-state` and its first line, the name's place, Get Tadayo and Retry. */
function fakePage(api: string | null = API) {
  const focused: string[] = [];
  const parts = ["checking", "invited", "unavailable", "failed"].map((state) => {
    const first = { focus: () => void focused.push(state) };
    return {
      dataset: { state },
      hidden: state !== "checking",
      querySelector: (selector: string) => (selector === "[tabindex='-1']" ? first : null),
    };
  });
  const name = { textContent: "" as string | null };
  const attributes = new Map<string, string>([["aria-describedby", "get-hint"]]);
  const get = {
    setAttribute: (key: string, value: string) => void attributes.set(key, value),
    removeAttribute: (key: string) => void attributes.delete(key),
  };
  const clicks: (() => void)[] = [];
  const retry = { addEventListener: (_type: string, listener: () => void) => void clicks.push(listener) };
  const meta = { getAttribute: (key: string) => (key === "content" ? api : null) };
  const page = {
    querySelectorAll: (selector: string) => (selector === "[data-state]" ? parts : []),
    querySelector: (selector: string) =>
      ({ "[data-name]": name, "[data-get]": get, "[data-retry]": retry, 'meta[name="tadayo-api"]': meta })[selector] ??
      null,
  } as unknown as Pick<Document, "querySelector" | "querySelectorAll">;
  const visible = () => parts.filter((part) => !part.hidden).map((part) => part.dataset.state);
  return { page, name, attributes, visible, clicks, focused };
}

/** The contract's InvitationToken (packages/contracts/openapi.yaml): its lengths and its pattern. */
function contractToken() {
  const contract = readFileSync(join(REPO, "packages", "contracts", "openapi.yaml"), "utf8");
  const found =
    /\n {4}InvitationToken:\n {6}type: string\n {6}minLength: (\d+)\n {6}maxLength: (\d+)\n {6}pattern: (\S+)\n/.exec(
      contract,
    );
  return { min: Number(found?.[1]), max: Number(found?.[2]), pattern: found?.[3] ?? "" };
}

describe("the token from the link's fragment", () => {
  it("takes what the contract's InvitationToken takes, and nothing else", () => {
    const { min, max, pattern } = contractToken();
    expect([min, max, pattern]).toEqual([43, 128, "^[A-Za-z0-9_-]+$"]);
    expect(TOKEN.source).toBe(`${pattern.slice(0, -2)}{${String(min)},${String(max)}}$`);
    const contract = new RegExp(pattern);
    for (const length of [0, 1, min - 1, min, min + 1, max - 1, max, max + 1]) {
      for (const fill of ["A", "z", "0", "-", "_", "=", "+", "/", ".", " ", "é"]) {
        const token = fill.repeat(length);
        expect(TOKEN.test(token), `${fill} x ${String(length)}`).toBe(
          contract.test(token) && token.length >= min && token.length <= max,
        );
      }
    }
    expect(tokenFrom(`#${LIVE}`)).toBe(LIVE);
    expect(tokenFrom(`#${"A".repeat(43)}`)).toBe("A".repeat(43));
    expect(tokenFrom(`#${"-_".repeat(64)}`)).toBe("-_".repeat(64));
    for (const hash of [
      "",
      "#",
      `#${"A".repeat(42)}`,
      `#${"A".repeat(129)}`,
      `#${"A".repeat(42)}=`,
      `#${"A".repeat(42)}+`,
      `#${"A".repeat(42)}/`,
      `#${"A".repeat(40)} AA`,
      `#${"A".repeat(40)}%41AA`,
      `#${LIVE}\n`,
      `#${LIVE}#`,
      `##${LIVE}`,
    ]) {
      expect(tokenFrom(hash), JSON.stringify(hash)).toBeNull();
    }
  });
});

describe("the request for the inviter's name", () => {
  it("sends the token in a JSON body alone, with no cookie, no referrer, no cache and no redirect", () => {
    const signal = AbortSignal.timeout(1000);
    const { url, init } = previewRequest(API, LIVE, signal);
    expect(url).toBe("https://api-dev.tadayo.app/v1/invitations/web-preview");
    expect(init).toEqual({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"token":"${LIVE}"}`,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      mode: "cors",
      signal,
    });
    expect(url).not.toContain(LIVE);
  });
});

describe("what each answer means", () => {
  it("shows the name of a 200, and nothing it can't read as one", () => {
    expect(outcomeOf(200, { inviter_name: "Ben" })).toEqual({ state: "invited", name: "Ben" });
    expect(outcomeOf(200, { inviter_name: "Ben", club_name: "Kitchen table" })).toEqual({
      state: "invited",
      name: "Ben",
    });
    for (const body of [
      null,
      "Ben",
      [],
      {},
      { inviter_name: "" },
      { inviter_name: "  " },
      { inviter_name: 7 },
      { name: "Ben" },
    ]) {
      expect(outcomeOf(200, body), JSON.stringify(body)).toEqual({ state: "failed" });
    }
  });

  it("says a 404 or a 400 isn't available, and anything else couldn't be checked, never that the link is gone", () => {
    expect(outcomeOf(404, null)).toEqual({ state: "unavailable" });
    expect(outcomeOf(400, null)).toEqual({ state: "unavailable" });
    for (const status of [0, 201, 204, 301, 401, 403, 409, 413, 429, 500, 502, 503, 504]) {
      expect(outcomeOf(status, { inviter_name: "Ben" }), String(status)).toEqual({ state: "failed" });
    }
  });

  it("couldn't check when the network fails, the API is too slow or a 200's body isn't JSON", async () => {
    expect(await check(() => Promise.reject(new TypeError("Load failed")), API, LIVE)).toEqual({ state: "failed" });
    expect(await check(() => Promise.resolve(answering(200)), API, LIVE)).toEqual({ state: "failed" });
    const slow = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation timed out.", "TimeoutError"));
        });
      });
    expect(await check(slow, API, LIVE, 20)).toEqual({ state: "failed" });
    expect(WAIT_MS).toBe(15_000);
    // The wait holds while the body is read, too.
    const slowBody = (_url: string, init: RequestInit) =>
      Promise.resolve({
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      } as unknown as Response);
    expect(await check(slowBody, API, LIVE, 20)).toEqual({ state: "failed" });
    expect(await check(() => Promise.resolve(answering(200, { inviter_name: "Ben" })), API, LIVE)).toEqual({
      state: "invited",
      name: "Ben",
    });
    expect(await check(() => Promise.resolve(answering(404)), API, LIVE)).toEqual({ state: "unavailable" });
  });
});

describe("the wait, on a Safari older than 16", () => {
  it("still gives up after the wait, with no AbortSignal.timeout", async () => {
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Reflect.deleteProperty(AbortSignal, "timeout");
    try {
      expect("timeout" in AbortSignal).toBe(false);
      const slow = (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      expect(await check(slow, API, LIVE, 20)).toEqual({ state: "failed" });
    } finally {
      if (timeout !== undefined) Object.defineProperty(AbortSignal, "timeout", timeout);
    }
  });
});

describe("what the page shows", () => {
  it("shows one part at a time, the name as text, and Get Tadayo's name and hint as the renders have them", () => {
    const { page, name, attributes, visible } = fakePage();
    show(page, { state: "invited", name: "<b>Ben</b> & co" });
    expect(visible()).toEqual(["invited"]);
    expect(name.textContent).toBe("<b>Ben</b> & co");
    expect([...attributes]).toEqual([["aria-describedby", "get-hint"]]);
    show(page, { state: "unavailable" });
    expect(visible()).toEqual(["unavailable"]);
    expect(name.textContent).toBe("");
    expect([...attributes]).toEqual([["aria-labelledby", "get-unavailable"]]);
    for (const state of ["checking", "failed"] as const) {
      show(page, { state });
      expect(visible()).toEqual([state]);
      expect([...attributes]).toEqual([["aria-describedby", "get-hint"]]);
    }
  });

  it("moves focus only when asked, to the first line of the part it shows", () => {
    const { page, focused } = fakePage();
    show(page, { state: "invited", name: "Ben" });
    show(page, { state: "failed" });
    expect(focused).toEqual([]);
    show(page, { state: "checking" }, true);
    show(page, { state: "unavailable" }, true);
    expect(focused).toEqual(["checking", "unavailable"]);
  });

  it("asks the API once with the fragment's token, shows the name, and asks again on Retry after a failure", async () => {
    const { page, name, visible, clicks, focused } = fakePage();
    const asked: [string, Init][] = [];
    const answers = [Promise.resolve(answering(503)), Promise.resolve(answering(200, { inviter_name: "Ben" }))];
    await start({
      location: { hash: `#${LIVE}` },
      document: page,
      fetch: (url, init) => {
        asked.push([url, init as Init]);
        return answers.shift() ?? Promise.reject(new Error("asked too often"));
      },
    });
    expect(visible()).toEqual(["failed"]);
    expect(focused).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.[0]).toBe(`${API}/v1/invitations/web-preview`);
    expect(asked[0]?.[1].body).toBe(`{"token":"${LIVE}"}`);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toHaveLength(2);
    expect(visible()).toEqual(["invited"]);
    expect(name.textContent).toBe("Ben");
    // Retry's button went with the failure: focus followed the page, to checking, then to the answer.
    expect(focused).toEqual(["checking", "invited"]);
  });

  it("can't check without the API's address, and never says the link is gone (handoff 4)", async () => {
    for (const api of [null, ""]) {
      const { page, visible, clicks, focused } = fakePage(api);
      let asked = 0;
      const fetch = () => {
        asked += 1;
        return Promise.resolve(answering(200, { inviter_name: "Ben" }));
      };
      await start({ location: { hash: `#${LIVE}` }, document: page, fetch });
      expect(visible(), String(api)).toEqual(["failed"]);
      clicks[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(visible(), String(api)).toEqual(["failed"]);
      expect(focused, String(api)).toEqual(["failed"]);
      expect(asked, String(api)).toBe(0);
    }
  });

  it("asks nothing for a fragment that holds no token: the invitation isn't available", async () => {
    for (const hash of ["", "#", "#short", `#${LIVE}=`]) {
      const { page, visible } = fakePage();
      let asked = 0;
      await start({
        location: { hash },
        document: page,
        fetch: () => {
          asked += 1;
          return Promise.resolve(answering(200, { inviter_name: "Ben" }));
        },
      });
      expect(visible(), hash).toEqual(["unavailable"]);
      expect(asked, hash).toBe(0);
    }
  });
});

describe("the files Pages serves", () => {
  const html = read("i.html");

  it("loads only its own files: no inline script or style, no handler, no font, nothing from elsewhere", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    expect(html).not.toMatch(/<style|\sstyle=|\son[a-z]+=/i);
    expect([...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1])).toEqual(["/i.js"]);
    expect([...html.matchAll(/<link[^>]*\bhref="([^"]+)"/g)].map((match) => match[1])).toEqual(["/i.css"]);
    expect([...html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((match) => match[0]).sort()).toEqual([API, STORE].sort());
    expect(read("i.css")).not.toMatch(/url\(|@import|https?:/);
    expect(read("i.js")).not.toMatch(/https?:\/\//);
    expect(read("i.js")).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|console\./,
    );
  });

  it("lets each part's first line take focus after Retry, whose button says what handoff 4's common.retry says", () => {
    for (const state of ["checking", "invited", "unavailable", "failed"]) {
      expect(html, state).toMatch(new RegExp(`<section data-state="${state}"[^>]*>\\s*<(h1|p) [^>]*tabindex="-1"`));
    }
    expect(html).toContain('<button class="action retry" type="button" data-retry>Retry</button>');
    const copy = readFileSync(join(REPO, "design/reference/claude-design/handoff-4/copy-contracts.json"), "utf8");
    expect(copy).toContain('"common.retry": "Retry",');
  });

  it("gives a link preview nothing, and keeps the page out of search", () => {
    expect(html).not.toMatch(/property="og:|name="twitter:|name="description"/);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain("<title>Tadayo</title>");
  });

  it("links Get Tadayo to one App Store address, with no token, query or fragment", () => {
    const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toEqual([STORE]);
    expect(STORE).not.toMatch(/[?#]/);
  });

  it("allows zoom: no maximum scale, no fixed scale", () => {
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    expect(html).not.toMatch(/maximum-scale|user-scalable|minimum-scale/);
    expect(read("i.css")).not.toMatch(/text-size-adjust|position:\s*fixed|100vh/);
  });

  it("asks only the API its meta names, which the CSP allows alone, and sends no referrer", () => {
    const api = /<meta name="tadayo-api" content="([^"]+)" \/>/.exec(html)?.[1];
    expect(api).toBe(API);
    const rules = read("_headers");
    const block = rules.slice(rules.indexOf("\n/*\n"));
    const csp = /Content-Security-Policy: (.+)/.exec(block)?.[1] ?? "";
    const directives = Object.fromEntries(
      csp.split(";").map((directive) => {
        const [name = "", ...values] = directive.trim().split(/\s+/);
        return [name, values.join(" ")];
      }),
    );
    expect(directives).toEqual({
      "default-src": "'none'",
      "script-src": "'self'",
      "style-src": "'self'",
      "img-src": "'self'",
      "connect-src": api,
      "base-uri": "'none'",
      "form-action": "'none'",
      "frame-ancestors": "'none'",
    });
    expect(block).toContain("\n  Referrer-Policy: no-referrer\n");
    expect(block).toContain("\n  X-Content-Type-Options: nosniff\n");
  });

  it("shows the wordmarks Claude Design delivered, byte for byte", () => {
    const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(sha(join(SOURCE, "brand/wordmark.svg"))).toBe(
      sha(join(REPO, "design/reference/claude-design/handoff-8/assets/brand-wordmark.svg")),
    );
    expect(sha(join(SOURCE, "brand/wordmark-dark.svg"))).toBe(
      sha(join(REPO, "design/reference/claude-design/handoff-8/assets/brand-wordmark-dark.svg")),
    );
    expect(html).toContain('<source srcset="/brand/wordmark-dark.svg" media="(prefers-color-scheme: dark)" />');
    expect(html).toContain('<img class="wordmark" src="/brand/wordmark.svg" alt="Tadayo" width="144" height="46" />');
  });
});
