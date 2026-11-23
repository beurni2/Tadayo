// @ts-check
/* global window, document, AbortController, setTimeout, clearTimeout */
// The signed-out invitation page, tadayo.app/i#<token> (G02-web, G02-web-revoked, G02-web-checking and
// G02-web-failed; spec 04; T7, T52; docs/plans/api-b0-spike-links-web.md, section 1, and
// docs/plans/api-b1-invitation-web-states.md). The token is the link's fragment, which a browser never
// sends to a server: this script sends it in one POST body to the API's `previewInvitationWeb` and shows the
// inviter's name, the neutral page for a link that can't be used, or a failure to retry. Every word is in
// i.html, where the copy lint reads it; the script only chooses which part is shown and puts the name in
// place, as text. It writes the token to no storage, request URL, referrer or log; it stays in the address's
// fragment, where the link put it, and goes in that one body alone.

/** The contract's InvitationToken: base64url, 43 to 128 characters. */
export const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

/** How long the page waits for the API before it says it couldn't check, in milliseconds. */
export const WAIT_MS = 15_000;

/** @typedef {"network" | "answered"} Reason */
/** @typedef {{ state: "invited", name: string } | { state: "unavailable" } | { state: "failed", reason: Reason }} Outcome */
/** @typedef {Outcome | { state: "checking" }} Shown */
/** @typedef {Pick<Document, "querySelector" | "querySelectorAll" | "activeElement">} Page */

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
 * What an answer read in full means. A 404 is the contract's one answer for a link that is expired, revoked,
 * replaced, used or unknown: the neutral page. Anything else that isn't a 200 with a name is a failure to
 * check, a 400 too, which refuses the request, not the link (the page checks the token's form first): never
 * read as a link that no longer works (handoff 4). It is the server's answer, so it says to try again, not
 * to check the connection (handoff 9's web.answeredFailure).
 * @param {number} status
 * @param {unknown} body
 * @returns {Outcome}
 */
export function outcomeOf(status, body) {
  if (status === 404) return { state: "unavailable" };
  if (status !== 200 || typeof body !== "object" || body === null) return { state: "failed", reason: "answered" };
  const name = /** @type {Record<string, unknown>} */ (body)["inviter_name"];
  return typeof name === "string" && name.trim() !== ""
    ? { state: "invited", name }
    : { state: "failed", reason: "answered" };
}

/**
 * Asks `api` about `token`, waiting `wait` milliseconds at most for the answer and its body. No complete
 * answer is a failure of the connection (handoff 9's web.network): a request that failed (no network, a
 * CORS refusal, a redirect), the wait run out, or a 200 whose body isn't JSON, which is a page the network
 * put in the API's place, such as a captive portal's. The wait is an AbortController's and a timer's, which
 * every Safari that runs the page has (`AbortSignal.timeout` came only with Safari 16).
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
    return { state: "failed", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shows `shown` in `page` (handoff 9's G02-web-checking and G02-web-failed; handoff 8's G02-web; handoff 4's
 * G02-web-revoked). Its part alone, in the status region, which stays polite and reads each change once; a
 * failure's line by its reason; the inviter's name as text. Retry, outside the region, shows in a failure,
 * and with `busy` in the checking that follows it, in place, `aria-disabled` and described as in progress
 * (frame 12); its slot goes only with a final answer. A final answer that takes away a Retry that had the
 * focus gives the focus to Get Tadayo; otherwise the page never moves it. Get Tadayo's name and hint are the
 * state's (handoff 9's getHint: the hint names TestFlight, the trial's address, FQ133).
 * @param {Page} page
 * @param {Shown} shown
 * @param {boolean} [busy]
 */
export function show(page, shown, busy = false) {
  for (const part of page.querySelectorAll("[data-state]")) {
    const element = /** @type {HTMLElement} */ (part);
    element.hidden = element.dataset["state"] !== shown.state;
  }
  for (const line of page.querySelectorAll("[data-reason]")) {
    const element = /** @type {HTMLElement} */ (line);
    element.hidden = shown.state !== "failed" || element.dataset["reason"] !== shown.reason;
  }
  const name = page.querySelector("[data-name]");
  if (name !== null) name.textContent = shown.state === "invited" ? shown.name : "";
  const get = /** @type {HTMLElement | null} */ (page.querySelector("[data-get]"));
  const retry = /** @type {HTMLElement | null} */ (page.querySelector("[data-retry]"));
  const slot = /** @type {HTMLElement | null} */ (page.querySelector(".retry-slot"));
  const working = busy && shown.state === "checking";
  if (retry !== null) {
    const focused = page.activeElement === retry;
    retry.hidden = !(shown.state === "failed" || working);
    if (working) retry.setAttribute("aria-disabled", "true");
    else retry.removeAttribute("aria-disabled");
    retry.setAttribute("aria-describedby", working ? "retry-busy" : "retry-hint");
    if (focused && retry.hidden) get?.focus();
  }
  if (slot !== null) slot.hidden = shown.state === "invited" || shown.state === "unavailable";
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
 * The page: the token from the address's fragment, then the API's answer about it; Retry asks again, once at
 * a time. The checking part shows when the script starts, never before, so a browser with JavaScript off
 * shows the noscript line instead. With no API named, the page can't ask, which is a failure, never a link
 * that no longer works (handoff 4).
 * @param {{ location: { hash: string }, document: Page, fetch: (url: string, init: RequestInit) => Promise<Response> }} page
 * @param {number} [wait]
 */
export async function start(page, wait = WAIT_MS) {
  const doc = page.document;
  const api = doc.querySelector('meta[name="tadayo-api"]')?.getAttribute("content") ?? "";
  const token = tokenFrom(page.location.hash);
  let asking = false;
  /** @param {boolean} again */
  const run = async (again) => {
    asking = true;
    try {
      if (token === null) {
        show(doc, { state: "unavailable" });
        return;
      }
      if (api === "") {
        show(doc, { state: "failed", reason: "answered" });
        return;
      }
      show(doc, { state: "checking" }, again);
      show(doc, await check((url, init) => page.fetch(url, init), api, token, wait));
    } finally {
      asking = false;
    }
  };
  // Retry is guarded here, not disabled, so it keeps the focus while it is busy (handoff 9's afterRetry).
  doc.querySelector("[data-retry]")?.addEventListener("click", () => {
    if (!asking) void run(true);
  });
  await run(false);
}

if (typeof document !== "undefined") void start(window);
