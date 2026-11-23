// The signed-out invitation page (public/i.html, i.js, i.css; G02-web, G02-web-revoked, G02-web-checking,
// G02-web-failed; spec 04; T7, T52; docs/plans/api-b0-spike-links-web.md and
// docs/plans/api-b1-invitation-web-states.md): the script's logic, with a fake page and a fake fetch, and the
// files as Pages serves them. How it looks is the screenshots' beside the frames (the PR's evidence); Safari
// on an iPhone is the device run's.

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
const HINT = { "aria-describedby": "get-hint" };
const NETWORK = { state: "failed", reason: "network" };
const ANSWERED = { state: "failed", reason: "answered" };

type Init = RequestInit & { signal: AbortSignal };
type Page = Parameters<typeof show>[0];

/** A fake answer: its status and the JSON it reads as, or a body that isn't JSON. */
function answering(status: number, body?: unknown): Response {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError("not JSON")) : Promise.resolve(body)),
  } as unknown as Response;
}

/** Lets every answer already given run through the page, and a frame asked for be drawn and waited out. */
const settle = async () => {
  for (let turn = 0; turn < 2; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * A fake page with i.html's parts as the HTML has them: each `data-state` part and each failure's
 * `data-reason` line, hidden; the name's place; Retry, hidden, and its slot; Get Tadayo; the API's meta; and
 * another control the person can focus. `focused` lists each focus the page moves, in turn.
 */
function fakePage(api: string | null = API) {
  let active: unknown = null;
  const focused: string[] = [];
  const element = (label: string, hidden: boolean, dataset: Record<string, string> = {}, attributes = {}) => {
    const attrs = new Map<string, string>(Object.entries(attributes));
    const self = {
      dataset,
      hidden,
      attrs,
      setAttribute: (key: string, value: string) => void attrs.set(key, value),
      removeAttribute: (key: string) => void attrs.delete(key),
      getAttribute: (key: string) => attrs.get(key) ?? null,
      focus: () => {
        active = self;
        focused.push(label);
      },
    };
    return self;
  };
  const parts = ["checking", "invited", "unavailable", "failed"].map((state) => element(state, true, { state }));
  const reasons = ["network", "answered"].map((reason) => element(reason, reason !== "network", { reason }));
  const name = { textContent: "" as string | null };
  const get = element("get", false, {}, HINT);
  const clicks: (() => void)[] = [];
  const touches: unknown[] = [];
  const retry = Object.assign(element("retry", true, {}, { "aria-describedby": "retry-hint" }), {
    addEventListener: (type: string, listener: () => void, options?: unknown) => {
      if (type === "click") clicks.push(listener);
      if (type === "touchstart") touches.push(options);
    },
  });
  const slot = element("slot", false);
  // The status block: the height it is drawn at, and the least height the page holds it to.
  // Its height is the drawn one, fractions of a pixel included (offsetHeight would round them away).
  const held: { minHeight: string | null } = { minHeight: null };
  const status = {
    height: 132.5,
    getBoundingClientRect() {
      return { height: this.height };
    },
    style: {
      set minHeight(value: string) {
        held.minHeight = value;
      },
      removeProperty: (property: string) => {
        if (property === "min-height") held.minHeight = null;
      },
    },
  };
  const other = element("other", false);
  const meta = { getAttribute: (key: string) => (key === "content" ? api : null) };
  const page = {
    get activeElement() {
      return active;
    },
    querySelectorAll: (selector: string) =>
      selector === "[data-state]" ? parts : selector === "[data-reason]" ? reasons : [],
    querySelector: (selector: string) =>
      (
        ({
          "[data-name]": name,
          "[data-get]": get,
          "[data-retry]": retry,
          ".retry-slot": slot,
          ".status": status,
          'meta[name="tadayo-api"]': meta,
        }) as Record<string, unknown>
      )[selector] ?? null,
  } as unknown as Page;
  /** What the page shows: its part, the failure's line, Retry's attributes or null, the slot, Get's names. */
  const seen = () => ({
    parts: parts.filter((part) => !part.hidden).map((part) => part.dataset["state"]),
    line: reasons.filter((line) => !line.hidden).map((line) => line.dataset["reason"]),
    retry: retry.hidden ? null : Object.fromEntries(retry.attrs),
    slot: !slot.hidden,
    get: Object.fromEntries(get.attrs),
  });
  return { page, name, seen, clicks, touches, focused, retry, other, status, held };
}

/**
 * The window `start` is given: the address's fragment, the page, the fetch, the listeners it adds, the reloads
 * it asks for, and its frames, drawn soon after they are asked for, as a browser draws them, or, `byHand`,
 * only when the test calls `draw`.
 */
function windowOf(
  page: Page,
  fetch: (url: string, init: RequestInit) => Promise<Response>,
  hash = `#${LIVE}`,
  byHand = false,
) {
  const listeners: [string, () => void][] = [];
  const frames: (() => void)[] = [];
  let reloads = 0;
  const window = {
    location: {
      hash,
      reload: () => {
        reloads += 1;
      },
    },
    document: page,
    fetch,
    addEventListener: (type: string, listener: () => void) => void listeners.push([type, listener]),
    requestAnimationFrame: (callback: () => void) => {
      if (byHand) frames.push(callback);
      else queueMicrotask(callback);
      return 0;
    },
  };
  const draw = async () => {
    for (const frame of frames.splice(0)) frame();
    await settle();
  };
  return { window, listeners, draw, reloads: () => reloads, frames };
}

/** A fetch the test answers one request at a time, the oldest open request first. */
function network() {
  const asked: [string, Init][] = [];
  const open: { resolve: (response: Response) => void; reject: (error: unknown) => void }[] = [];
  return {
    asked,
    fetch: (url: string, init: RequestInit) => {
      asked.push([url, init as Init]);
      return new Promise<Response>((resolve, reject) => void open.push({ resolve, reject }));
    },
    answer: async (response: Response) => {
      open.shift()?.resolve(response);
      await settle();
    },
    fail: async () => {
      open.shift()?.reject(new TypeError("Load failed"));
      await settle();
    },
  };
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
  it("shows the name of a 200; a 200 it can't read a name in is the server's answer, a failure to try again", () => {
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
      expect(outcomeOf(200, body), JSON.stringify(body)).toEqual(ANSWERED);
    }
  });

  it("says only a 404 isn't available; any other answer, a 400 too, is a failure to try again, never a link that's gone", () => {
    expect(outcomeOf(404, null)).toEqual({ state: "unavailable" });
    expect(outcomeOf(404, { inviter_name: "Ben" })).toEqual({ state: "unavailable" });
    for (const status of [0, 201, 204, 301, 400, 401, 403, 409, 413, 415, 429, 500, 502, 503, 504]) {
      expect(outcomeOf(status, { inviter_name: "Ben" }), String(status)).toEqual(ANSWERED);
    }
  });

  it("blames the connection only when no answer came whole: a failed request, the wait run out, a 200 that isn't JSON", async () => {
    expect(await check(() => Promise.reject(new TypeError("Load failed")), API, LIVE)).toEqual(NETWORK);
    expect(await check(() => Promise.resolve(answering(200)), API, LIVE)).toEqual(NETWORK);
    const slow = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation timed out.", "TimeoutError"));
        });
      });
    expect(await check(slow, API, LIVE, 20)).toEqual(NETWORK);
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
    expect(await check(slowBody, API, LIVE, 20)).toEqual(NETWORK);
    // An answer read in full is the server's, whatever its body: a status isn't the connection's fault.
    for (const status of [400, 429, 500, 503]) {
      expect(await check(() => Promise.resolve(answering(status)), API, LIVE), String(status)).toEqual(ANSWERED);
    }
    expect(await check(() => Promise.resolve(answering(200, { name: "Ben" })), API, LIVE)).toEqual(ANSWERED);
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
      expect(await check(slow, API, LIVE, 20)).toEqual(NETWORK);
    } finally {
      if (timeout !== undefined) Object.defineProperty(AbortSignal, "timeout", timeout);
    }
  });

  it("says it couldn't check, rather than stopping at checking, where even the wait can't be made", async () => {
    const controller = Object.getOwnPropertyDescriptor(globalThis, "AbortController");
    Reflect.deleteProperty(globalThis, "AbortController");
    try {
      expect("AbortController" in globalThis).toBe(false);
      expect(await check(() => Promise.resolve(answering(200, { inviter_name: "Ben" })), API, LIVE)).toEqual(NETWORK);
    } finally {
      if (controller !== undefined) Object.defineProperty(globalThis, "AbortController", controller);
    }
  });
});

describe("what the page shows", () => {
  it("shows one part at a time, a failure's line by its reason, the name as text, and Get Tadayo the same in each", () => {
    const { page, name, seen } = fakePage();
    show(page, { state: "invited", name: "<b>Ben</b> & co" });
    expect(seen()).toEqual({ parts: ["invited"], line: [], retry: null, slot: false, get: HINT });
    expect(name.textContent).toBe("<b>Ben</b> & co");
    show(page, { state: "unavailable" });
    expect(seen()).toEqual({ parts: ["unavailable"], line: [], retry: null, slot: false, get: HINT });
    expect(name.textContent).toBe("");
    show(page, { state: "checking" });
    expect(seen()).toEqual({ parts: ["checking"], line: [], retry: null, slot: true, get: HINT });
    show(page, { state: "failed", reason: "network" });
    const idle = { "aria-describedby": "retry-hint" };
    expect(seen()).toEqual({ parts: ["failed"], line: ["network"], retry: idle, slot: true, get: HINT });
    show(page, { state: "failed", reason: "answered" });
    expect(seen()).toEqual({ parts: ["failed"], line: ["answered"], retry: idle, slot: true, get: HINT });
  });

  it("keeps Retry in place and busy in the checking after it, its hint kept, and only there (frame 12)", () => {
    const { page, seen } = fakePage();
    show(page, { state: "failed", reason: "network" });
    show(page, { state: "checking" }, true);
    expect(seen()).toEqual({
      parts: ["checking"],
      line: [],
      retry: { "aria-describedby": "retry-busy retry-hint", "aria-disabled": "true" },
      slot: true,
      get: HINT,
    });
    show(page, { state: "failed", reason: "answered" }, true);
    expect(seen().retry).toEqual({ "aria-describedby": "retry-hint" });
    show(page, { state: "invited", name: "Ben" }, true);
    expect(seen()).toEqual({ parts: ["invited"], line: [], retry: null, slot: false, get: HINT });
  });

  it("moves no focus, but gives it to Get Tadayo when a final answer takes away a Retry that had it", () => {
    const { page, focused, retry, other } = fakePage();
    show(page, { state: "checking" });
    show(page, { state: "failed", reason: "network" });
    show(page, { state: "invited", name: "Ben" });
    expect(focused).toEqual([]);
    for (const final of [{ state: "invited", name: "Ben" } as const, { state: "unavailable" } as const]) {
      show(page, { state: "failed", reason: "network" });
      retry.focus();
      focused.length = 0;
      show(page, { state: "checking" }, true);
      show(page, { state: "failed", reason: "answered" });
      show(page, { state: "checking" }, true);
      expect(focused, final.state).toEqual([]);
      expect(page.activeElement, final.state).toBe(retry);
      show(page, final);
      expect(focused, final.state).toEqual(["get"]);
      // Where the person put the focus elsewhere, the final answer leaves it there.
      show(page, { state: "failed", reason: "network" });
      other.focus();
      focused.length = 0;
      show(page, { state: "checking" }, true);
      show(page, final);
      expect(focused, final.state).toEqual([]);
      expect(page.activeElement, final.state).toBe(other);
    }
  });

  it("checks at once with no Retry, then on Retry asks again in place, once at a time, and hands the focus on at the end", async () => {
    const { page, name, seen, clicks, focused, retry } = fakePage();
    const net = network();
    const started = start(windowOf(page, net.fetch).window);
    await settle();
    // The first load: checking, Retry's slot kept for it, nothing focused.
    expect(seen()).toEqual({ parts: ["checking"], line: [], retry: null, slot: true, get: HINT });
    expect(net.asked).toHaveLength(1);
    expect(net.asked[0]?.[0]).toBe(`${API}/v1/invitations/web-preview`);
    expect(net.asked[0]?.[1].body).toBe(`{"token":"${LIVE}"}`);
    await net.answer(answering(503));
    await started;
    const idle = { "aria-describedby": "retry-hint" };
    const busy = { "aria-describedby": "retry-busy retry-hint", "aria-disabled": "true" };
    expect(seen()).toEqual({ parts: ["failed"], line: ["answered"], retry: idle, slot: true, get: HINT });
    expect(focused).toEqual([]);
    // Retry, from the keyboard, so it has the focus: busy in place, and pressing it again asks nothing.
    retry.focus();
    focused.length = 0;
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(seen()).toEqual({ parts: ["checking"], line: [], retry: busy, slot: true, get: HINT });
    clicks[0]?.();
    clicks[0]?.();
    await settle();
    expect(net.asked).toHaveLength(2);
    // Another failure: Retry stays where it was, with the focus.
    await net.fail();
    expect(seen()).toEqual({ parts: ["failed"], line: ["network"], retry: idle, slot: true, get: HINT });
    expect(focused).toEqual([]);
    expect(page.activeElement).toBe(retry);
    // Then the name: Retry goes, and the focus it had goes to Get Tadayo.
    clicks[0]?.();
    expect(net.asked).toHaveLength(3);
    await net.answer(answering(200, { inviter_name: "Ben" }));
    expect(seen()).toEqual({ parts: ["invited"], line: [], retry: null, slot: false, get: HINT });
    expect(name.textContent).toBe("Ben");
    expect(focused).toEqual(["get"]);
    expect(net.asked.map(([, init]) => init.body)).toEqual(Array(3).fill(`{"token":"${LIVE}"}`));
  });

  it("moves no focus after a Retry tapped without taking it, as Safari taps a button", async () => {
    const { page, seen, clicks, focused } = fakePage();
    const net = network();
    const started = start(windowOf(page, net.fetch).window);
    await net.fail();
    await started;
    clicks[0]?.();
    await net.answer(answering(404));
    expect(seen()).toEqual({ parts: ["unavailable"], line: [], retry: null, slot: false, get: HINT });
    expect(focused).toEqual([]);
    expect(page.activeElement).toBeNull();
  });

  it("draws the checking after Retry before an answer that comes at once replaces it, and waits for no frame on the first load", async () => {
    const { page, seen, clicks } = fakePage();
    const net = network();
    const { window, draw, frames } = windowOf(page, net.fetch, `#${LIVE}`, true);
    const started = start(window);
    await net.fail();
    await started;
    // The first load's failure shows with no frame asked for (handoff 9's firstLoad: no wait of any kind).
    expect(seen().parts).toEqual(["failed"]);
    expect(frames).toHaveLength(0);
    // Retry offline: the request fails at once, but the checking stays until a frame of it is drawn, so the
    // screen changes and the status region has the failure to announce again.
    clicks[0]?.();
    await net.fail();
    await settle();
    expect(seen().parts).toEqual(["checking"]);
    expect(frames).toHaveLength(1);
    await draw();
    expect(seen()).toEqual({
      parts: ["failed"],
      line: ["network"],
      retry: { "aria-describedby": "retry-hint" },
      slot: true,
      get: HINT,
    });
    // An answer that takes longer than a frame shows as soon as it comes.
    clicks[0]?.();
    await draw();
    expect(seen().parts).toEqual(["checking"]);
    await net.answer(answering(200, { inviter_name: "Ben" }));
    expect(seen().parts).toEqual(["invited"]);
  });

  it("holds the status block at its height from Retry to the answer, so neither control moves; the first load holds nothing", async () => {
    const { page, seen, clicks, status, held } = fakePage();
    const net = network();
    const started = start(windowOf(page, net.fetch).window);
    expect(held.minHeight).toBeNull();
    await net.fail();
    await started;
    expect(held.minHeight).toBeNull();
    // At 200% text the failure's block is taller than the checking's: Retry keeps it at the failure's height.
    status.height = 478.33;
    clicks[0]?.();
    expect(seen().parts).toEqual(["checking"]);
    expect(held.minHeight).toBe("478.33px");
    await net.fail();
    await settle();
    expect(seen().parts).toEqual(["failed"]);
    expect(held.minHeight).toBeNull();
    clicks[0]?.();
    expect(held.minHeight).toBe("478.33px");
    await net.answer(answering(404));
    expect(seen().parts).toEqual(["unavailable"]);
    expect(held.minHeight).toBeNull();
  });

  it("reloads for another link opened in the same tab, and gives Retry the touch listener Safari's pressed look needs", async () => {
    const { page, touches } = fakePage();
    const net = network();
    const { window, listeners, reloads } = windowOf(page, net.fetch);
    const started = start(window);
    await net.answer(answering(200, { inviter_name: "Ben" }));
    await started;
    expect(listeners.map(([type]) => type)).toEqual(["hashchange"]);
    expect(reloads()).toBe(0);
    for (const [, listener] of listeners) listener();
    expect(reloads()).toBe(1);
    expect(net.asked).toHaveLength(1);
    expect(touches).toEqual([{ passive: true }]);
    // And no grey tap highlight of Safari's over the pressed colour.
    expect(read("i.css")).toMatch(/\n\.retry \{[^}]*-webkit-tap-highlight-color: transparent;[^}]*\}/);
  });

  it("can't check without the API's address: the server's kind of failure, never a link that's gone (handoff 4)", async () => {
    for (const api of [null, ""]) {
      const { page, seen, clicks, focused } = fakePage(api);
      let asked = 0;
      const fetch = () => {
        asked += 1;
        return Promise.resolve(answering(200, { inviter_name: "Ben" }));
      };
      await start(windowOf(page, fetch).window);
      const failed = {
        parts: ["failed"],
        line: ["answered"],
        retry: { "aria-describedby": "retry-hint" },
        slot: true,
        get: HINT,
      };
      expect(seen(), String(api)).toEqual(failed);
      clicks[0]?.();
      await settle();
      expect(seen(), String(api)).toEqual(failed);
      expect(focused, String(api)).toEqual([]);
      expect(asked, String(api)).toBe(0);
    }
  });

  it("asks nothing for a fragment that holds no token: the invitation isn't available", async () => {
    for (const hash of ["", "#", "#short", `#${LIVE}=`]) {
      const { page, seen } = fakePage();
      let asked = 0;
      const fetch = () => {
        asked += 1;
        return Promise.resolve(answering(200, { inviter_name: "Ben" }));
      };
      await start(windowOf(page, fetch, hash).window);
      expect(seen().parts, hash).toEqual(["unavailable"]);
      expect(seen().retry, hash).toBeNull();
      expect(asked, hash).toBe(0);
    }
  });

  it("never turns the live region off, focuses no heading and sends no alert: Get Tadayo is all it ever focuses", () => {
    const js = read("i.js");
    expect(js).not.toMatch(/aria-live|aria-atomic|\brole\b|alert|tabindex/i);
    expect([...js.matchAll(/\.focus\(/g)]).toHaveLength(1);
    expect(js).toContain("get?.focus()");
  });
});

describe("the files Pages serves", () => {
  const html = read("i.html");
  const REGION = '<div class="status" role="status" aria-live="polite" aria-atomic="true">';
  const strings = (
    JSON.parse(readFileSync(join(REPO, "design/reference/claude-design/handoff-9/copy-contracts.json"), "utf8")) as {
      handoff9: { strings: Record<string, string> };
    }
  ).handoff9.strings;
  const say = (key: string) => {
    const text = strings[key];
    expect(text, key).toBeTypeOf("string");
    return text ?? "";
  };

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

  it("has one status region, polite and atomic, in the HTML before any change, holding the four parts and neither control", () => {
    expect(html.match(/role=/g)).toHaveLength(1);
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).toContain(REGION);
    const from = html.indexOf(REGION) + REGION.length;
    const region = html.slice(from, html.indexOf("</div>", from));
    expect([...region.matchAll(/<section data-state="([a-z]+)" hidden>/g)].map((match) => match[1])).toEqual([
      "checking",
      "invited",
      "unavailable",
      "failed",
    ]);
    expect(region).not.toMatch(/<div|<button|<a\b|data-retry|data-get|<noscript|<span id=/);
    expect(html.indexOf("data-retry")).toBeGreaterThan(from);
    expect(html.indexOf("data-get")).toBeGreaterThan(from);
    expect(html).not.toContain("tabindex");
  });

  it("says nothing of checking with JavaScript off: the noscript line, Retry and every part hidden in the HTML", () => {
    expect(html).toContain(`<noscript><p class="body nojs">${say("handoff9.web.noJavaScript")}</p></noscript>`);
    expect(html.indexOf("<noscript>")).toBeLessThan(html.indexOf(REGION));
    expect(html).toContain('<button class="retry" type="button" aria-describedby="retry-hint" data-retry hidden>');
    expect(html.match(/<section data-state="[a-z]+"(?! hidden>)/g)).toBeNull();
  });

  it("says each of handoff 9's words for the page as its copy contracts give them", () => {
    expect(html).toContain(`<h1 class="title">${say("handoff9.web.checking")}</h1>`);
    expect(html).toContain(`<h1 class="title">${say("handoff9.check.title")}</h1>`);
    expect(html).toContain(`<p class="body" data-reason="network">${say("handoff9.check.network")}</p>`);
    expect(html).toContain(
      `<p class="body" data-reason="answered" hidden>${say("handoff9.check.answeredFailure")}</p>`,
    );
    expect(html).toMatch(new RegExp(`</svg\\s*>${say("handoff9.common.retry")}</span\\s*>\\s*</button>`));
    expect(html).toContain(`<span id="retry-hint" hidden>${say("handoff9.check.retry.hint")}</span>`);
    expect(html).toContain(`<span id="retry-busy" hidden>${say("handoff9.check.busy.value")}</span>`);
    expect(html).toMatch(new RegExp(`data-get\\s*>${say("handoff9.web.get")}</a\\s*>`));
    // Get Tadayo's hint follows its address, TestFlight's App Store page in the trial (FQ133, getHint).
    expect(html).toContain(`<span id="get-hint" hidden>${say("handoff9.web.get.trialTestFlight.hint")}</span>`);
    expect(html).not.toContain(say("handoff9.web.get.production.hint"));
    // The atomic region reads a failure's title and its line, which is the failure's VoiceOver text.
    expect(`${say("handoff9.check.title")} ${say("handoff9.check.network")}`).toBe(say("handoff9.check.network.vo"));
    expect(`${say("handoff9.check.title")} ${say("handoff9.check.answeredFailure")}`).toBe(
      say("handoff9.check.answeredFailure.vo"),
    );
  });

  it("keeps the invited and unavailable pages' words, but no App Store claim for TestFlight's link, and puts the name in a bdi", () => {
    expect(html).toContain('<h1 class="title"><bdi data-name></bdi> invited you to a club on Tadayo</h1>');
    const four = readFileSync(join(REPO, "design/reference/claude-design/handoff-4/copy-contracts.json"), "utf8");
    const eight = readFileSync(join(REPO, "design/reference/claude-design/handoff-8/copy-contracts.json"), "utf8");
    for (const [contract, key, text, markup] of [
      [four, "unavailable.title", "This invitation isn’t available.", '<h1 class="title neutral">'],
      [four, "unavailable.body", "Ask for a new invitation link.", '<p class="body">'],
      [eight, "handoff8.welcome.brand", "Your day. Your story. A thought from your friends.", '<p class="brand">'],
    ] as const) {
      expect(contract, key).toContain(`"${key}": "${text}"`);
      expect(html, key).toContain(`${markup}${text}<`);
    }
    // Handoff 4 named Get Tadayo on the unavailable page "Get Tadayo from the App Store."; handoff 9's precedence
    // map supersedes it (getHint: the trial's TestFlight link never claims Tadayo is in the App Store), so the
    // unavailable page keeps the label and the TestFlight hint of every other state (FQ133).
    expect(four).toContain('"unavailable.web.get.vo": "Get Tadayo from the App Store."');
    expect(html).not.toContain("Get Tadayo from the App Store");
    expect(html).not.toContain("aria-labelledby");
    expect(strings["handoff9.web.get.trialTestFlight.hint"]).toBe("Open TestFlight in the App Store.");
  });

  it("draws Retry's spinner as the frame's eight ticks, hidden from VoiceOver, and still under reduced motion", () => {
    const svg = /<svg class="spinner"([^>]*)>([\s\S]*?)<\/svg/.exec(html);
    expect(svg?.[1]).toBe(' viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"');
    const ticks = [
      ...(svg?.[2] ?? "").matchAll(
        /<path d="M([\d.]+) ([\d.]+)([LVH])([\d.]+)(?: ([\d.]+))?"(?: opacity="([\d.]+)")? \/>/g,
      ),
    ];
    expect(ticks.map((tick) => Number(tick[6] ?? 1))).toEqual([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
    for (const [, x1, y1, op, a, b] of ticks) {
      const [x2, y2] =
        op === "L" ? [Number(a), Number(b)] : op === "V" ? [Number(x1), Number(a)] : [Number(a), Number(y1)];
      const radius = (x: number, y: number) => Math.hypot(x - 8, y - 8);
      expect(radius(Number(x1), Number(y1))).toBeCloseTo(4.32, 1);
      expect(radius(x2, y2)).toBeCloseTo(6.88, 1);
    }
    const css = read("i.css");
    expect(css).toMatch(
      /\.retry\[aria-disabled="true"\] \.spinner \{\s*display: block;\s*animation: turn 1s steps\(8\) infinite;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.retry\[aria-disabled="true"\] \.spinner \{\s*animation: none;\s*\}\s*\}/,
    );
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
