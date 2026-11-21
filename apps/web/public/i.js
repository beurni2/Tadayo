// @ts-check
/* global window, document, AbortController, setTimeout, clearTimeout */
// The signed-out invitation page, tadayo.app/i#<token> (G02-web and G02-web-revoked; spec 04; T7, T52;
// docs/plans/api-b0-spike-links-web.md, section 1). The token is the link's fragment, which a browser never
// sends to a server: this script sends it in one POST body to the API's `previewInvitationWeb` and shows the
// inviter's name, the neutral page for a link that can't be used, or a failure to retry. Every word is in
// i.html, where the copy lint reads it; the script only chooses which part is shown and puts the name in
// place, as text. It writes the token to no storage, request URL, referrer or log; it stays in the address's
// fragment, where the link put it, and goes in that one body alone.

/** The contract's InvitationToken: base64url, 43 to 128 characters. */
export const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

/** How long the page waits for the API before it says it couldn't check, in milliseconds. */
export const WAIT_MS = 15_000;

/** @typedef {{ state: "invited", name: string } | { state: "unavailable" } | { state: "failed" }} Outcome */
/** @typedef {Outcome | { state: "checking" }} Shown */

/**
 * The token in `hash` (the page's `location.hash`), or null when it isn't one the contract accepts, which
 * no link can hold: the page then says the invitation isn't available without asking the API.
 * @param {string} hash
 * @returns {string | null}
 */
export function tokenFrom(hash) {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  return TOKEN.test(token) ? token : null;
}

/**
 * The request that asks `api` for the inviter's name: the token in a JSON body alone, no cookie, no
 * referrer, nothing cached, no redirect followed.
 * @param {string} api
 * @param {string} token
 * @param {AbortSignal} signal
 * @returns {{ url: string, init: RequestInit }}
 */
export function previewRequest(api, token, signal) {
  return {
    url: `${api}/v1/invitations/web-preview`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      mode: "cors",
      signal,
    },
  };
}

/**
 * What an answer means. A 404 is the contract's one answer for a link that is expired, revoked, replaced,
 * used or unknown: the neutral page. Anything else that isn't a 200 with a name is a failure to check, a 400
 * too, which refuses the request, not the link (the page checks the token's form first): never read as a
 * link that no longer works (handoff 4).
 * @param {number} status
 * @param {unknown} body
 * @returns {Outcome}
 */
export function outcomeOf(status, body) {
  if (status === 404) return { state: "unavailable" };
  if (status !== 200 || typeof body !== "object" || body === null) return { state: "failed" };
  const name = /** @type {Record<string, unknown>} */ (body)["inviter_name"];
  return typeof name === "string" && name.trim() !== "" ? { state: "invited", name } : { state: "failed" };
}

/**
 * Asks `api` about `token`, waiting `wait` milliseconds at most for the answer and its body; a network
 * error, a timeout or a body that isn't JSON is a failure to check. The wait is an AbortController's and a
 * timer's, which every Safari that runs the page has (`AbortSignal.timeout` came only with Safari 16).
 * @param {(url: string, init: RequestInit) => Promise<Response>} fetcher
 * @param {string} api
 * @param {string} token
 * @param {number} [wait]
 * @returns {Promise<Outcome>}
 */
export async function check(fetcher, api, token, wait = WAIT_MS) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => {
      controller.abort();
    }, wait);
    const { url, init } = previewRequest(api, token, controller.signal);
    const response = await fetcher(url, init);
    if (response.status !== 200) return outcomeOf(response.status, null);
    return outcomeOf(200, await response.json());
  } catch {
    return { state: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shows `shown` in `page`: its part alone, the inviter's name as text, and Get Tadayo's accessible name and
 * hint as the state's renders have them (handoff 8's G02-web; handoff 4's G02-web-revoked). With `focus`,
 * after Retry, whose button the change hides, focus moves to the shown part's first line, so it isn't lost.
 * @param {Pick<ParentNode, "querySelector" | "querySelectorAll">} page
 * @param {Shown} shown
 * @param {boolean} [focus]
 */
export function show(page, shown, focus = false) {
  for (const part of page.querySelectorAll("[data-state]")) {
    const element = /** @type {HTMLElement} */ (part);
    element.hidden = element.dataset["state"] !== shown.state;
    if (focus && !element.hidden) /** @type {HTMLElement | null} */ (element.querySelector("[tabindex='-1']"))?.focus();
  }
  const name = page.querySelector("[data-name]");
  if (name !== null) name.textContent = shown.state === "invited" ? shown.name : "";
  const get = page.querySelector("[data-get]");
  if (get === null) return;
  if (shown.state === "unavailable") {
    get.setAttribute("aria-labelledby", "get-unavailable");
    get.removeAttribute("aria-describedby");
  } else {
    get.removeAttribute("aria-labelledby");
    get.setAttribute("aria-describedby", "get-hint");
  }
}

/**
 * The page: the token from the address's fragment, then the API's answer about it; Retry asks again. With
 * no API named, the page can't check, which is a failure, never a link that no longer works (handoff 4).
 * @param {{ location: { hash: string }, document: Pick<Document, "querySelector" | "querySelectorAll">, fetch: (url: string, init: RequestInit) => Promise<Response> }} page
 * @param {number} [wait]
 */
export async function start(page, wait = WAIT_MS) {
  const doc = page.document;
  const api = doc.querySelector('meta[name="tadayo-api"]')?.getAttribute("content") ?? "";
  const token = tokenFrom(page.location.hash);
  /** @param {boolean} again */
  const run = async (again) => {
    if (token === null) {
      show(doc, { state: "unavailable" }, again);
      return;
    }
    if (api === "") {
      show(doc, { state: "failed" }, again);
      return;
    }
    show(doc, { state: "checking" }, again);
    show(doc, await check((url, init) => page.fetch(url, init), api, token, wait), again);
  };
  // The first answer is read out by the parts' live region; after Retry, focus reads each part instead, so
  // the region falls silent, and nothing is announced twice (handoff 8: once).
  doc.querySelector("[data-retry]")?.addEventListener("click", () => {
    doc.querySelector("[aria-live]")?.setAttribute("aria-live", "off");
    void run(true);
  });
  await run(false);
}

if (typeof document !== "undefined") void start(window);
