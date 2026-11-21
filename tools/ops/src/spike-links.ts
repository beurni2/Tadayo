// `spike-links`: spike S6's server-log check (docs/plans/api-b0-spike-links.md, section 2;
// docs/plans/B0.md, section 4, order 3; T52). The invitation page on tadayo.app reads its token from
// the link's fragment, which no request carries, and sends it in the body of one POST to the API, after
// the browser's preflight. This sends the same two requests to `dev`, with a token made for the run,
// and one more: the same preflight with the token in its URL, where no client puts it, so that a line
// that logged URLs, the API's or one of Fly's, would hold it. Then it reads `dev`'s log buffer until the
// requests' three lines are in it, and counts the lines of flyctl's output that hold the token, its
// first or last 16 characters, or its SHA-256 in hex, the one form of it the database is given
// (`tokenHash`). Every count must be 0. Supabase's own logs aren't read here.
//
// It runs on the runner with `FLY_API_TOKEN` alone, and acts on `dev` only: flyctl through `flyOf`,
// whose `forDevApp` names no other app, and requests to `DEV_HOST`. It writes nothing, moves no clock
// and starts or stops nothing. The token names no invitation: 32 random bytes, so the POST is a token
// that names nothing, the neutral 404. It is never printed: what the run says is statuses, whether the
// answers' headers were the ones the page needs (the allowance for its origin, its method and its header,
// no credentials, `Vary: Origin`), counts, and flyctl's error lines that hold none of the token's forms.
// Nothing an answer carries is said, only whether it was what was expected; a request that gets no answer
// is said by its error's kind alone, since the message of a failed fetch can quote the URL.
//
// flyctl 0.5.8's `logs --no-tail` asks Fly's API for one page of the buffer, the one it gives for an
// empty next token (which entries those are is the server's choice), making at most 10 calls when one
// fails with a passing error, none more after a refused token or a missing app, and returns; `--json`
// prints each entry as indented JSON, one object after another, with the fields flyctl decodes: the
// timestamp, the instance, the region, the level, the message, and Fly's own fields for the instance,
// the region, the provider, the HTTP request (id, method, version), the response's status, an error
// (code, message) and a URL (its source, `internal/command/logs/logs.go` and `logs/polling.go`, and
// fly-go's `LogEntry`). Any other field Fly's API holds is dropped before it is printed, so the check
// shows what flyctl's view of the buffer holds, not everything Fly keeps. The text form would leave out
// the message of an entry that has an error's message.
//
// The run's lines are the API's (services/api/src/logging.ts, `logEachRequest`): two preflight lines
// (`preflight: "previewInvitationWeb"`, 204) and one line of the operation (`op: "previewInvitationWeb"`,
// 404), each told from every other by its random request id (`reqId`), never by Fly's fields. Only a
// request to that one path makes either: a scanner's request elsewhere can't, but the invitation page
// does, from any browser that opens a link without the app, since the page calls `dev` in the closed
// trial (apps/web/public/i.html). So the run fails if it sees fewer of those lines than it sent, and if
// it sees more: another client then used the path during the run, and its lines can't be told from the
// run's (the plan, section 2). It reads no clock (T1): it waits with `sleep`, each request has its own
// `AbortSignal.timeout`, and each read its own time limit.

import { createHash, randomBytes } from "node:crypto";
import { DEV_APP, DEV_HOST } from "./environment.ts";
import type { Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawned } from "./spawn.ts";

export interface SpikeLinksInput {
  readonly fly: Fly;
  readonly fetch: typeof fetch;
  readonly say: (line: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

/** How many times the buffer is read after the requests, at most, before the run gives up on their lines. */
export const POLLS = 12;
/** The time before each of those reads, in milliseconds. */
export const POLL_MS = 5000;
/**
 * The longest one read of the buffer may take, in milliseconds. With it the run's longest, 14 reads,
 * 13 waits and 3 requests, is under 13 minutes, inside the `ops` job's 20, so it ends with its own message.
 */
export const READ_MS = 45_000;
/** The longest one request waits, its body included. */
export const CALL_MS = 15_000;

/** The page's origin, as the API allows it (services/api/src/web-origin.ts, `WEB_ORIGIN`). */
const PAGE_ORIGIN = "https://tadayo.app";
const API = `https://${DEV_HOST}`;
/** `previewInvitationWeb`'s path (packages/contracts/openapi.yaml). */
const PREVIEW = `${API}/v1/invitations/web-preview`;
const LOGS = ["logs", "-a", DEV_APP, "--no-tail", "--json"];

/** The parts of a token the logs are searched for, besides the whole token. */
const PART = 16;

const say = (input: SpikeLinksInput, line: string) => {
  input.say(`spike-links: ${line}`);
};

const entriesText = (count: number) => `${String(count)} ${count === 1 ? "entry" : "entries"}`;

// ---- The token's forms, and the lines that hold them.

interface Needles {
  readonly token: string;
  readonly forms: readonly string[];
}

function needlesOf(token: string): Needles {
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, forms: [token, token.slice(0, PART), token.slice(-PART), hash] };
}

const holds = (needles: Needles, text: string) => needles.forms.some((form) => text.includes(form));

/**
 * The lines of flyctl's output that held each form, over the reads made after the requests: each line's
 * text once, however many reads printed it, since the buffer gives an entry again on every read (so two
 * entries with an identical line count once; the check fails on either).
 */
class Counts {
  readonly #needles: Needles;
  readonly #lines: Set<string>[] = [new Set(), new Set(), new Set(), new Set()];
  readonly #entries = new Set<string>();
  #reads = 0;

  constructor(needles: Needles) {
    this.#needles = needles;
  }

  add(result: Spawned): void {
    this.#reads += 1;
    for (const [stream, text] of [
      ["stdout", result.stdout],
      ["stderr", result.stderr],
    ] as const) {
      for (const line of text.split("\n")) {
        this.#needles.forms.forEach((form, index) => {
          if (line.includes(form)) this.#lines[index]?.add(`${stream}\n${line}`);
        });
      }
    }
  }

  addEntries(entries: readonly Entry[]): void {
    for (const entry of entries) this.#entries.add(entry.key);
  }

  get any(): boolean {
    return this.#lines.some((lines) => lines.size > 0);
  }

  text(withEntries: boolean): string {
    const [whole = 0, first = 0, last = 0, hash = 0] = this.#lines.map((lines) => lines.size);
    const reads = `${String(this.#reads)} read${this.#reads === 1 ? "" : "s"}`;
    return (
      `lines holding the token, each counted once: ${String(whole)}, its first ${String(PART)} characters: ` +
      `${String(first)}, its last ${String(PART)}: ${String(last)}, its SHA-256: ${String(hash)}, in ${reads}` +
      (withEntries ? ` of ${entriesText(this.#entries.size)}` : "")
    );
  }
}

/** Why flyctl failed, by its exit code and its first error lines that hold none of the token's forms. */
function failure(result: Spawned, needles: Needles | undefined): string {
  if (result.timedOut) return "it ran out of time";
  const lines = result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !(needles !== undefined && holds(needles, line)))
    .slice(0, 3)
    .map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));
  const code = result.code === null ? "no exit code" : `exit code ${String(result.code)}`;
  return lines.length === 0 ? code : `${code}: ${lines.join(" / ")}`;
}

// ---- The buffer, as `flyctl logs --json` prints it.

interface Entry {
  /** The entry's timestamp, instance and message: what tells it from another. */
  readonly key: string;
  readonly message: string;
}

/** The JSON values of a text that is objects one after another, or nothing when it isn't. */
function objectsOf(text: string): unknown[] | undefined {
  const values: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start === -1) {
      if (char === " " || char === "\n" || char === "\r" || char === "\t") continue;
      if (char !== "{") return undefined;
      start = index;
      depth = 1;
    } else if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          values.push(JSON.parse(text.slice(start, index + 1)));
        } catch {
          return undefined;
        }
        start = -1;
      }
    }
  }
  return start === -1 ? values : undefined;
}

const textOf = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function entriesOf(stdout: string): Entry[] | undefined {
  const values = objectsOf(stdout);
  if (values === undefined) return undefined;
  const entries: Entry[] = [];
  for (const value of values) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const fields = value as Record<string, unknown>;
    const message = textOf(fields["message"]);
    if (message === undefined) return undefined;
    const key = JSON.stringify([textOf(fields["timestamp"]) ?? "", textOf(fields["instance"]) ?? "", message]);
    entries.push({ key, message });
  }
  return entries;
}

async function read(input: SpikeLinksInput, needles: Needles | undefined, counts?: Counts): Promise<Entry[]> {
  const result = await input.fly.run(LOGS, { timeoutMs: READ_MS });
  counts?.add(result);
  if (result.code !== 0 || result.timedOut) {
    throw new OpsError(`spike-links: flyctl couldn't read the log buffer: ${failure(result, needles)}`);
  }
  const entries = entriesOf(result.stdout);
  if (entries === undefined) throw new OpsError("spike-links: flyctl's output isn't the JSON it prints with --json");
  counts?.addEntries(entries);
  return entries;
}

// ---- The run's three requests, and their lines in the API's log.

const LABEL = {
  preflight: "the preflight",
  post: "the page's POST",
  url: "the preflight with the token in its URL",
} as const;

/** The API's one line for a request (services/api/src/logging.ts, `logEachRequest`), as a record, or nothing. */
function requestLine(message: string): Record<string, unknown> | undefined {
  const tries = [message];
  const start = message.indexOf("{");
  if (start > 0) tries.push(message.slice(start));
  for (const text of tries) {
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const fields = value as Record<string, unknown>;
        if (fields["msg"] === "request") return fields;
      }
    } catch {
      // Not JSON: a line of Fly's, or of the app's that isn't a request's.
    }
  }
  return undefined;
}

type Kind = "preflight" | "post";

/** The request id of a line of the API's, or nothing: what tells one request's line from another's. */
function idOf(message: string): string | undefined {
  const id = requestLine(message)?.["reqId"];
  return typeof id === "string" && id !== "" ? id : undefined;
}

/** Which of the run's lines a line could be: a preflight's 204 or the POST's 404, both on the page's path. */
function kindOf(message: string): Kind | undefined {
  const line = requestLine(message);
  if (line === undefined) return undefined;
  const { op, preflight, status } = line;
  if (preflight === "previewInvitationWeb" && op === undefined && status === 204) return "preflight";
  if (op === "previewInvitationWeb" && preflight === undefined && status === 404) return "post";
  return undefined;
}

/** How many of each line the run's requests make: the two preflights' and the POST's. */
const SENT: Record<Kind, number> = { preflight: 2, post: 1 };

interface Answered {
  readonly status: number;
  readonly headers: Headers;
  readonly code: string | undefined;
}

/** What a failed request is said by: its error's name and its cause's code, never its message. */
function kindOfError(error: unknown): string {
  const name = error instanceof Error ? error.name : "unknown";
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return typeof cause?.code === "string" ? `${name}, ${cause.code}` : name;
}

async function ask(input: SpikeLinksInput, url: string, init: RequestInit): Promise<Answered | string> {
  try {
    const response = await input.fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(CALL_MS) });
    const body = await response.text();
    let code: string | undefined;
    try {
      const parsed: unknown = JSON.parse(body);
      code =
        typeof parsed === "object" && parsed !== null ? textOf((parsed as Record<string, unknown>)["code"]) : undefined;
    } catch {
      code = undefined;
    }
    return { status: response.status, headers: response.headers, code };
  } catch (error) {
    return `got no answer (${kindOfError(error)})`;
  }
}

interface Expected {
  readonly status: number;
  readonly code?: string;
  /** A preflight's answer: it has to allow the page's method and header too. */
  readonly preflight: boolean;
  readonly vary: boolean;
}

/** A header's list of names, as the browser compares them. */
const namesIn = (headers: Headers, name: string, lower: boolean) =>
  (headers.get(name) ?? "").split(",").map((one) => (lower ? one.trim().toLowerCase() : one.trim()));

/** What's wrong with an answer: only its status when that's wrong, since the rest then says nothing. */
function problems(label: string, answer: Answered | string, expected: Expected): string[] {
  if (typeof answer === "string") return [`${label} ${answer}`];
  if (answer.status !== expected.status) {
    return [`${label} answered ${String(answer.status)}, not ${String(expected.status)}`];
  }
  const wrong: string[] = [];
  if (expected.code !== undefined && answer.code !== expected.code) {
    // The code itself isn't said: it is the server's text, which a fault could make an echo of the token.
    wrong.push(
      answer.code === undefined
        ? `${label} has no code, where ${expected.code} was expected`
        : `${label} has a code other than ${expected.code}`,
    );
  }
  if (answer.headers.get("access-control-allow-origin") !== PAGE_ORIGIN) {
    wrong.push(`${label} doesn't allow ${PAGE_ORIGIN}`);
  }
  if (expected.preflight && !namesIn(answer.headers, "access-control-allow-methods", false).includes("POST")) {
    wrong.push(`${label} doesn't allow POST`);
  }
  if (expected.preflight && !namesIn(answer.headers, "access-control-allow-headers", true).includes("content-type")) {
    wrong.push(`${label} doesn't allow the header content-type`);
  }
  if (answer.headers.has("access-control-allow-credentials")) wrong.push(`${label} allows credentials`);
  if (expected.vary && !namesIn(answer.headers, "vary", true).includes("origin")) {
    wrong.push(`${label} has no Vary: Origin`);
  }
  return wrong;
}

async function sendRequests(input: SpikeLinksInput, needles: Needles): Promise<void> {
  const asked = {
    method: "OPTIONS",
    headers: {
      origin: PAGE_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  };
  const preflight = await ask(input, PREVIEW, asked);
  const post = await ask(input, PREVIEW, {
    method: "POST",
    headers: { origin: PAGE_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ token: needles.token }),
  });
  const url = await ask(input, `${PREVIEW}?token=${needles.token}`, asked);
  const wrong = [
    ...problems(LABEL.preflight, preflight, { status: 204, preflight: true, vary: false }),
    ...problems(LABEL.post, post, { status: 404, code: "NOT_FOUND", preflight: false, vary: true }),
    ...problems(LABEL.url, url, { status: 204, preflight: true, vary: false }),
  ];
  if (wrong.length > 0) {
    throw new OpsError(
      `spike-links: ${wrong.join("; ")}: dev isn't answering as the page expects, so the logs weren't read`,
    );
  }
  const allowed = `allowed for ${PAGE_ORIGIN}`;
  say(input, `${LABEL.preflight}: 204, ${allowed}, its POST and its content-type`);
  say(input, `${LABEL.post}: 404 NOT_FOUND, ${allowed}, with Vary: Origin`);
  say(input, `${LABEL.url}: 204, ${allowed}, its POST and its content-type`);
}

const lines = (count: number, what: string) => `${String(count)} ${what} line${count === 1 ? "" : "s"}`;

/**
 * Reads the buffer until the lines of the run's three requests are among those of requests that weren't
 * in it before, then once more, and fails if more such lines came than the run sent.
 */
async function readUntilLines(input: SpikeLinksInput, needles: Needles, before: Set<string>, counts: Counts) {
  const found = new Map<string, Kind>();
  const count = (kind: Kind) => [...found.values()].filter((one) => one === kind).length;
  const take = (entries: readonly Entry[]) => {
    for (const entry of entries) {
      const id = idOf(entry.message);
      const kind = kindOf(entry.message);
      if (id !== undefined && kind !== undefined && !before.has(id)) found.set(id, kind);
    }
  };
  for (let poll = 1; poll <= POLLS; poll += 1) {
    await input.sleep(POLL_MS);
    take(await read(input, needles, counts));
    if (count("preflight") >= SENT.preflight && count("post") >= SENT.post) {
      say(input, `the requests' three lines came in read ${String(poll)} of ${String(POLLS)}`);
      await input.sleep(POLL_MS);
      const last = await read(input, needles, counts);
      say(input, `one read more, ${String(POLL_MS / 1000)} seconds later: ${entriesText(last.length)}`);
      take(last);
      if (count("preflight") > SENT.preflight || count("post") > SENT.post) {
        throw new OpsError(
          `spike-links: the log buffer's new entries hold ${lines(count("preflight"), "preflight")} and ${lines(count("post"), "POST")}, more than the run sent (${String(SENT.preflight)} and ${String(SENT.post)}): another client used the page's path during the run, so its lines can't be told from the run's, and the check fails`,
        );
      }
      return;
    }
  }
  throw new OpsError(
    `spike-links: after ${String(POLLS)} reads, ${String(POLL_MS / 1000)} seconds apart, the log buffer's new entries hold ${lines(count("preflight"), "preflight")} and ${lines(count("post"), "POST")}, where the run sent ${String(SENT.preflight)} and ${String(SENT.post)}: the check can't show what the API logged, so it fails`,
  );
}

export async function spikeLinks(input: SpikeLinksInput): Promise<void> {
  // The shortest token the contract takes (`InvitationToken`, 43 to 128 characters of base64url).
  const needles = needlesOf(randomBytes(32).toString("base64url"));
  say(input, `a made-up token of ${String(needles.token.length)} characters, sent to ${API} and never printed`);

  const before = await read(input, undefined);
  say(input, `the log buffer before the requests: ${entriesText(before.length)}`);

  await sendRequests(input, needles);

  const counts = new Counts(needles);
  let failed: OpsError | undefined;
  try {
    const ids = before.map((entry) => idOf(entry.message)).filter((id) => id !== undefined);
    await readUntilLines(input, needles, new Set(ids), counts);
  } catch (error) {
    if (!(error instanceof OpsError)) throw error;
    failed = error;
  }
  if (counts.any) {
    const also = failed === undefined ? "" : `. And ${failed.message.replace(/^spike-links: /, "")}`;
    throw new OpsError(`spike-links: flyctl's output holds the token: ${counts.text(false)}${also}`);
  }
  if (failed !== undefined) throw failed;
  say(input, counts.text(true));
  say(input, "every check passed");
}
