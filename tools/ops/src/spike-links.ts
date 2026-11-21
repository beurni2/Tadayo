// `spike-links`: spike S6's server-log check (docs/plans/api-b0-spike-links.md, section 2;
// docs/plans/B0.md, section 4, order 3; T52). The invitation page on tadayo.app reads its token from
// the link's fragment, which no request carries, and sends it in the body of one POST to the API, after
// the browser's preflight. This sends the same two requests to `dev`, with a token made for the run,
// and one more that puts the token in a URL, where no client puts it: if anything on `dev`'s side
// logged URLs, that line would hold it. Then it reads `dev`'s log buffer, the API's own lines and Fly's
// for the app, until the three requests' lines are in it, and counts the lines of flyctl's output that
// hold the token, its first or last 16 characters, or its SHA-256 in hex, the one form of it the
// database is given (`tokenHash`). Every count must be 0. Supabase's own logs aren't read here.
//
// It runs on the runner with `FLY_API_TOKEN` alone, and acts on `dev` only: flyctl through `flyOf`,
// whose `forDevApp` names no other app, and requests to `DEV_HOST`. It writes nothing, moves no clock
// and starts or stops nothing. The token names no invitation: 32 random bytes, so the POST is a token
// that names nothing, the neutral 404. It is never printed: what the run says is statuses, whether the
// answers' headers were what the page needs, counts, and flyctl's error lines that hold none of the
// token's forms. A request that gets no answer is said by its error's kind alone, since the message of a
// failed fetch can quote the URL.
//
// flyctl 0.5.8's `logs --no-tail` asks Fly's API once for the buffer's latest entries and returns, and
// `--json` prints each entry whole, as indented JSON, one object after another (its source,
// `internal/command/logs/logs.go` and `logs/polling.go`): the text form leaves out the message of an
// entry that has an error's message. An entry is told from an earlier read's by its timestamp, its
// instance and its message. If the run's three lines never come, it fails: it never passes on logs
// that might not include its requests. It reads no clock (T1): it waits with `sleep`, and each request
// has its own `AbortSignal.timeout`.

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

const listing = (names: readonly string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;

// ---- The token's forms, and the lines that hold them.

interface Needles {
  readonly token: string;
  readonly forms: readonly string[];
}

function needlesOf(token: string): Needles {
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, forms: [token, token.slice(0, PART), token.slice(-PART), hash] };
}

/** How many lines of flyctl's output held each form, over the reads made after the requests. */
class Counts {
  readonly #needles: Needles;
  readonly #lines = [0, 0, 0, 0];
  #reads = 0;
  #entries = 0;

  constructor(needles: Needles) {
    this.#needles = needles;
  }

  add(result: Spawned): void {
    this.#reads += 1;
    for (const line of `${result.stdout}\n${result.stderr}`.split("\n")) {
      this.#needles.forms.forEach((form, index) => {
        if (line.includes(form)) this.#lines[index] = (this.#lines[index] ?? 0) + 1;
      });
    }
  }

  addEntries(count: number): void {
    this.#entries += count;
  }

  get any(): boolean {
    return this.#lines.some((count) => count > 0);
  }

  get reads(): number {
    return this.#reads;
  }

  text(withEntries: boolean): string {
    const [whole = 0, first = 0, last = 0, hash = 0] = this.#lines;
    const reads = `${String(this.#reads)} read${this.#reads === 1 ? "" : "s"}`;
    return (
      `lines holding the token: ${String(whole)}, its first ${String(PART)} characters: ${String(first)}, ` +
      `its last ${String(PART)}: ${String(last)}, its SHA-256: ${String(hash)}, in ${reads}` +
      (withEntries ? ` (${String(this.#entries)} entries)` : "")
    );
  }
}

/** Why flyctl failed, by its exit code and its first error lines that hold none of the token's forms. */
function failure(result: Spawned, needles: Needles | undefined): string {
  if (result.timedOut) return "it ran out of time";
  const lines = result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !(needles?.forms.some((form) => line.includes(form)) ?? false))
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
export function objectsOf(text: string): unknown[] | undefined {
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
  const result = await input.fly.run(LOGS);
  counts?.add(result);
  if (result.code !== 0 || result.timedOut) {
    throw new OpsError(`spike-links: flyctl couldn't read the log buffer: ${failure(result, needles)}`);
  }
  const entries = entriesOf(result.stdout);
  if (entries === undefined) throw new OpsError("spike-links: flyctl's output isn't the JSON it prints with --json");
  counts?.addEntries(entries.length);
  return entries;
}

// ---- The run's three requests, and their lines in the API's log.

type Kind = "preflight" | "post" | "get";

const KINDS: readonly Kind[] = ["preflight", "post", "get"];

const LABEL: Record<Kind, string> = {
  preflight: "the preflight",
  post: "the page's POST",
  get: "the token in a URL",
};

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

/** Which of the run's requests a line could be: the preflight's 204, the POST's 404, or a 404 of no operation. */
function kindOf(message: string): Kind | undefined {
  const line = requestLine(message);
  if (line === undefined) return undefined;
  const { op, preflight, status } = line;
  if (preflight === "previewInvitationWeb" && op === undefined && status === 204) return "preflight";
  if (op === "previewInvitationWeb" && preflight === undefined && status === 404) return "post";
  if (op === undefined && preflight === undefined && status === 404) return "get";
  return undefined;
}

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
  readonly allowed: boolean;
  readonly vary: boolean;
}

/** What's wrong with an answer: only its status when that's wrong, since the rest then says nothing. */
function problems(label: string, answer: Answered | string, expected: Expected): string[] {
  if (typeof answer === "string") return [`${label} ${answer}`];
  if (answer.status !== expected.status) {
    return [`${label} answered ${String(answer.status)}, not ${String(expected.status)}`];
  }
  const wrong: string[] = [];
  if (expected.code !== undefined && answer.code !== expected.code) {
    wrong.push(
      answer.code === undefined
        ? `${label} has no code, where ${expected.code} was expected`
        : `${label} has the code ${answer.code}, not ${expected.code}`,
    );
  }
  if (expected.allowed && answer.headers.get("access-control-allow-origin") !== PAGE_ORIGIN) {
    wrong.push(`${label} doesn't allow ${PAGE_ORIGIN}`);
  }
  if (answer.headers.has("access-control-allow-credentials")) wrong.push(`${label} allows credentials`);
  const vary = (answer.headers.get("vary") ?? "").split(",").map((name) => name.trim().toLowerCase());
  if (expected.vary && !vary.includes("origin")) wrong.push(`${label} has no Vary: Origin`);
  return wrong;
}

async function sendRequests(input: SpikeLinksInput, token: string): Promise<void> {
  const preflight = await ask(input, PREVIEW, {
    method: "OPTIONS",
    headers: {
      origin: PAGE_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  const post = await ask(input, PREVIEW, {
    method: "POST",
    headers: { origin: PAGE_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const get = await ask(input, `${PREVIEW}?token=${token}`, { method: "GET" });
  const wrong = [
    ...problems(LABEL.preflight, preflight, { status: 204, allowed: true, vary: false }),
    ...problems(LABEL.post, post, { status: 404, code: "NOT_FOUND", allowed: true, vary: true }),
    ...problems(LABEL.get, get, { status: 404, code: "NOT_FOUND", allowed: false, vary: false }),
  ];
  if (wrong.length > 0) {
    throw new OpsError(
      `spike-links: ${wrong.join("; ")}: dev isn't answering as the page expects, so the logs weren't read`,
    );
  }
  say(input, `${LABEL.preflight}: 204, allowed for ${PAGE_ORIGIN}`);
  say(input, `${LABEL.post}: 404 NOT_FOUND, allowed for ${PAGE_ORIGIN}, with Vary: Origin`);
  say(input, `${LABEL.get}: 404 NOT_FOUND`);
}

/** Reads the buffer until the run's three lines are among the entries that weren't there before, then once more. */
async function readUntilLines(input: SpikeLinksInput, needles: Needles, before: Set<string>, counts: Counts) {
  const found = new Set<Kind>();
  for (let poll = 1; poll <= POLLS; poll += 1) {
    await input.sleep(POLL_MS);
    for (const entry of await read(input, needles, counts)) {
      if (before.has(entry.key)) continue;
      const kind = kindOf(entry.message);
      if (kind !== undefined) found.add(kind);
    }
    if (found.size === KINDS.length) {
      say(input, `the requests' three lines came in read ${String(poll)} of ${String(POLLS)}`);
      await input.sleep(POLL_MS);
      const last = await read(input, needles, counts);
      say(input, `one read more, ${String(POLL_MS / 1000)} seconds later: ${String(last.length)} entries`);
      return;
    }
  }
  const missing = KINDS.filter((kind) => !found.has(kind)).map((kind) => LABEL[kind]);
  throw new OpsError(
    `spike-links: after ${String(POLLS)} reads, ${String(POLL_MS / 1000)} seconds apart, the log buffer's new entries have no line for ${listing(missing)}: the check can't show what the API logged, so it fails`,
  );
}

export async function spikeLinks(input: SpikeLinksInput): Promise<void> {
  // The shortest token the contract takes (`InvitationToken`, 43 to 128 characters of base64url).
  const needles = needlesOf(randomBytes(32).toString("base64url"));
  say(input, `a made-up token of ${String(needles.token.length)} characters, sent to ${API} and never printed`);

  const before = await read(input, undefined);
  say(input, `the log buffer before the requests: ${String(before.length)} entries`);

  await sendRequests(input, needles.token);

  const counts = new Counts(needles);
  let failed: OpsError | undefined;
  try {
    await readUntilLines(input, needles, new Set(before.map((entry) => entry.key)), counts);
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
