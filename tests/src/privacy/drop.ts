/// <reference lib="esnext.temporal" />
// The commit's row of the privacy matrix (step (w): `createDrop` for a photo, the contract's DropReceipt; spec 06,
// 07, 11, 14, 32; T3, T4, T8, T9, T14, T15, T17, T18, T19, T20, T21; docs/plans/api-b2-spike-commit.md): what each
// role must get, judged from the world's rows and the time alone, apart from the statements the route runs.
//
// - Who may add to the day: reservation.ts's `adderOf` (an active account with an active interval in the day's
//   club that began before the day closed, Q06; a club that isn't suspended; a scheduled day). Everyone else the
//   gate lets through gets the neutral not-found, byte for byte, before the receipt is read (T14).
// - Then the receipt: the same request under the same key gets its first answer, byte for byte, after the cutoff
//   too, but for the day's star, named as the world names them now, or MEMBERSHIP_CHANGED once they have no name
//   left to show (`replayExpected`; FQ75, FQ139); another body under it IDEMPOTENCY_CONFLICT; each changing nothing
//   (T19).
// - A day whose star has gone before its reveal: MEMBERSHIP_CHANGED, with no fact (FQ63). From the reveal on:
//   OCCURRENCE_CLOSED with the day as the contract's Occurrence at that instant and the star's next day (T3, T4),
//   whatever the body names.
// - A link: the neutral not-found, as no account can hold a source until `resolveSource` is built (the plan's
//   section 0.2).
// - The upload: the neutral not-found unless it is the caller's own and lives, a drop's photo, under a slot of the
//   caller's interval in this day, and `reservation_id`, when sent, names that slot (T4: nothing is moved; T12,
//   T14). Not ready: MEDIA_NOT_READY. The same photo as one of the caller's own active or held drops in the day,
//   by the upload's content hash and the drop's dedupe key: DUPLICATE_DROP with the earliest such drop by commit
//   time, then id (T21). An upload another drop already used: the neutral not-found.
// - The slot: still live, and not lapsed, it is consumed by the drop. Ended, the caller's limits for their role
//   (T17, addendum 2) decide from their allowance, lapsed slots off it (T18): QUOTA_FULL, then PHOTO_LIMIT, each
//   with the day, the allowance and the next day; otherwise a free slot is taken.
// - Added: 201 with the DropReceipt (the new drop's id, the day at that instant, a photo, added at version 1, the
//   caller's allowance with the drop counted, and the caller's highlight in the day as it stands), and the rows
//   after it hold one new drop of the caller's, active, with its caption (an empty one is none, the plan's section
//   0.9), its upload, the upload's hash as its dedupe key, committed at the instant, with every active member of
//   the club in its audience (T8); the slot consumed by it when live; only the caller's own lapsed slots in that
//   day settled besides; and no upload changed (`committedProblems`). A refusal leaves nothing (T19).
//
// The leak scanner reads the same answers (scanner.ts: a DropReceipt's and a HighlightPointer's drop the viewer's
// own, an Error's existing_drop_id the viewer's own, an allowance no more than the viewer's own); it can't judge a
// refusal's order, a duplicate's choice, an audience or a row, so this file does.

import type { WorldTx } from "../db/harness.ts";
import { occurrenceOf } from "./account.ts";
import { NEUTRAL, pinned, said, type Expected } from "./harness.ts";
import { adderOf, allowanceIn, dayAt, held, MEMBERSHIP_CHANGED, nextOf } from "./reservation.ts";
import { canonical, rowsSeen } from "./schedule.ts";
import type { Answer, WorldFacts } from "./scanner.ts";

/** The operations whose rows this file judges. */
export const DROP_JUDGED: ReadonlySet<string> = new Set(["createDrop"]);

/** createDrop's ordinary request (specsFor: a key and no body): the contract refuses it. */
export const DROP_NO_BODY: Answer = pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}');

/** A photo whose preparation hasn't made it ready. */
export const MEDIA_NOT_READY: Answer = pinned(409, "Conflict", '{"code":"MEDIA_NOT_READY"}');

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const before = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b) < 0;

/** Bytewise order, as `COLLATE "C"` sorts ids. */
const byBytes = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** What the judge reads beyond the scanner's facts: uploads' hashes, drops' uploads and dedupe keys, highlights. */
export interface DropRows {
  /** Each upload's content hash in hex, or null before its preparation, by id. */
  hashes: ReadonlyMap<string, string | null>;
  /** Each drop's upload (null for a link), its dedupe key in hex, and when it was committed, by id. */
  drops: ReadonlyMap<string, { upload: string | null; dedupe: string; submittedAt: Temporal.Instant }>;
  /** Each highlight pointer, its drop (null once cleared) and version, by `${day} ${interval}`. */
  highlights: ReadonlyMap<string, { drop: string | null; version: number }>;
}

/** Reads those rows of `clubs` and of their people's uploads on `db`, a connection of the test's own. */
export async function dropRowsOf(db: WorldTx, clubs: readonly string[]): Promise<DropRows> {
  const uploads = await db<{ id: string; hash: string | null }[]>`
    SELECT id, pg_catalog.encode(content_hash, 'hex') AS hash FROM app.uploads
     WHERE owner_user_id IN (SELECT user_id FROM app.memberships WHERE club_id IN ${db(clubs)})`;
  const drops = await db<{ id: string; upload: string | null; dedupe: string; submitted_at: Temporal.Instant }[]>`
    SELECT id, upload_id AS upload, pg_catalog.encode(dedupe_key, 'hex') AS dedupe, submitted_at
      FROM app.drops WHERE club_id IN ${db(clubs)}`;
  const highlights = await db<{ day: string; interval: string; drop: string | null; version: number }[]>`
    SELECT h.occurrence_id AS day, h.interval_id AS interval, h.drop_id AS drop, h.version
      FROM app.highlights h JOIN app.occurrences o ON o.id = h.occurrence_id
     WHERE o.club_id IN ${db(clubs)}`;
  return {
    hashes: new Map(uploads.map((row) => [row.id, row.hash])),
    drops: new Map(
      drops.map((row) => [row.id, { upload: row.upload, dedupe: row.dedupe, submittedAt: row.submitted_at }]),
    ),
    highlights: new Map(
      highlights.map((row) => [`${row.day} ${row.interval}`, { drop: row.drop, version: row.version }]),
    ),
  };
}

/** The world as this file judges it: the scanner's facts and the rows above. */
export interface DropWorld {
  world: WorldFacts;
  rows: DropRows;
}

/** What a commit asks for: the path's day and the body's upload, link or reservation. */
export interface CommitAsk {
  day: string;
  media: { kind: "photo"; upload: string } | { kind: "external_video"; source: string };
  /** The body's `reservation_id`, when it sent one. */
  reservation?: string;
}

/** What createDrop must answer, from the world's rows before it. */
export type CommitOutcome =
  | { kind: "pinned"; answer: Answer }
  | { kind: "refused"; code: string; body: Record<string, unknown> }
  | {
      kind: "added";
      interval: string;
      day: string;
      upload: string;
      slot: string;
      /** Whether the slot was still live and not lapsed, so the drop consumes it. */
      live: boolean;
      /** The day as the contract's Occurrence at the instant. */
      target: unknown;
      now: Temporal.Instant;
    };

/** What the world's rows give `account` committing `ask` at `now` (the rule above). */
export function commitOutcome(
  { world, rows }: DropWorld,
  account: string | null,
  ask: CommitAsk,
  now: Temporal.Instant,
): CommitOutcome {
  const { day } = ask;
  const interval = ID.test(day) ? adderOf(world, account, day) : undefined;
  const theDay = world.days.get(day);
  if (interval === undefined || theDay === undefined || account === null) return { kind: "pinned", answer: NEUTRAL };
  if (held(world, day)) return { kind: "pinned", answer: MEMBERSHIP_CHANGED };
  const target = dayAt(world, day, now);
  const next = nextOf(world, day, now);
  const facts = (code: string, extra: Record<string, unknown> = {}) => ({
    code,
    target,
    ...(next === undefined ? {} : { next_target: next }),
    ...extra,
  });
  if (!before(now, theDay.revealAt))
    return { kind: "refused", code: "OCCURRENCE_CLOSED", body: facts("OCCURRENCE_CLOSED") };
  if (ask.media.kind !== "photo") return { kind: "pinned", answer: NEUTRAL };
  const uploadId = ask.media.upload;
  const upload = world.uploads.get(uploadId);
  const slotId = upload?.reservation ?? null;
  const slot = slotId === null ? undefined : world.reservations.get(slotId);
  if (
    upload === undefined ||
    upload.owner !== account ||
    !before(now, upload.expiresAt) ||
    upload.purpose !== "drop_photo" ||
    slotId === null ||
    slot === undefined ||
    slot.day !== day ||
    slot.interval !== interval ||
    (ask.reservation !== undefined && ask.reservation !== slotId)
  )
    return { kind: "pinned", answer: NEUTRAL };
  if (upload.state !== "ready") return { kind: "pinned", answer: MEDIA_NOT_READY };
  const hash = rows.hashes.get(uploadId) ?? null;
  const same = [...world.drops]
    .filter(
      ([id, drop]) =>
        drop.day === day &&
        drop.author === interval &&
        (drop.state === "active" || drop.state === "held") &&
        hash !== null &&
        rows.drops.get(id)?.dedupe === hash,
    )
    .map(([id]) => id)
    .sort((a, b) => {
      const at = (id: string) => rows.drops.get(id)?.submittedAt ?? now;
      return Temporal.Instant.compare(at(a), at(b)) || byBytes(a, b);
    });
  const existing = same[0];
  if (existing !== undefined)
    return {
      kind: "refused",
      code: "DUPLICATE_DROP",
      body: { code: "DUPLICATE_DROP", existing_drop_id: existing },
    };
  if ([...rows.drops.values()].some((drop) => drop.upload === uploadId)) return { kind: "pinned", answer: NEUTRAL };
  const live = slot.state === "live" && before(now, slot.expiresAt);
  if (!live) {
    // The command settles the counter's lapsed slots first; `allowanceIn` already leaves them off.
    const allowance = allowanceIn(world, day, interval, now);
    const code =
      allowance.added + allowance.reserved >= allowance.limit
        ? "QUOTA_FULL"
        : allowance.photo_added + allowance.photo_reserved >= allowance.photo_limit
          ? "PHOTO_LIMIT"
          : null;
    if (code !== null) return { kind: "refused", code, body: facts(code, { allowance }) };
  }
  return { kind: "added", interval, day, upload: uploadId, slot: slotId, live, target, now };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How `body` differs from `want`, field by field, as `what`. */
function fieldProblems(what: string, body: Record<string, unknown>, want: Record<string, unknown>): string[] {
  if (canonical(body) === canonical(want)) return [];
  const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
  return keys
    .filter((key) => canonical(body[key]) !== canonical(want[key]))
    .map(
      (key) => `${what}'s ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`,
    );
}

/** An answer of `status` that only the caller may keep, whose body is JSON: its body, or the problems. */
function bodyOf(answer: Answer, status: number, what: string): Record<string, unknown> | string[] {
  if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with ${what}`];
  if (answer.headers["cache-control"] !== "private, no-store") return [`${what} without private, no-store`];
  if (answer.headers["content-type"] !== "application/json; charset=utf-8") return [`${what} not as JSON`];
  const body = parsed(answer);
  return isObject(body) ? body : [`not ${what}`];
}

/**
 * createDrop's answer for `outcome`, read with the world after it, `after`: the pinned refusal, the refusal with
 * its facts, or the DropReceipt of the new drop, and no other field. The fields' order is the receipt's, which
 * every replay repeats, so it isn't judged here.
 */
export function commitExpected(outcome: CommitOutcome, after: () => DropWorld): Expected {
  if (outcome.kind === "pinned") return outcome.answer;
  if (outcome.kind === "refused") {
    return (answer) => {
      const body = bodyOf(answer, 409, outcome.code);
      return Array.isArray(body) ? body : fieldProblems(outcome.code, body, outcome.body);
    };
  }
  return (answer) => {
    const body = bodyOf(answer, 201, "the drop added");
    if (Array.isArray(body)) return body;
    const { drop_id: id, ...rest } = body;
    if (typeof id !== "string" || !ID.test(id)) return ["the drop added has no id"];
    const { world, rows } = after();
    if (!world.drops.has(id)) return ["the drop added names no drop of the world"];
    const pointer = rows.highlights.get(`${outcome.day} ${outcome.interval}`);
    return fieldProblems("the drop added", rest, {
      occurrence: outcome.target,
      media_class: "photo",
      state: "added",
      version: 1,
      allowance: allowanceIn(world, outcome.day, outcome.interval, outcome.now),
      highlight:
        pointer === undefined
          ? { version: 0 }
          : { ...(pointer.drop === null ? {} : { drop_id: pointer.drop }), version: pointer.version },
    });
  };
}

/**
 * What a retry under the key that added a drop, `first` its answer, must get from the world's rows now, as the
 * matrix compares it, its text (T19, Q12): the first answer byte for byte, but for the day's star, named as the
 * world names them now, the name members see and an avatar version only while the star is a member (FQ75, FQ139),
 * written where the first answer had them; MEMBERSHIP_CHANGED once the star has no name left to show. Whether the
 * key is still the caller's to use is `commitOutcome`'s first rule, the matrix's to apply before this.
 */
export function replayExpected(world: WorldFacts, day: string, first: Answer): Answer | string {
  const star = occurrenceOf(world, day, "collecting")?.["star"];
  if (!isObject(star) || typeof star["display_name"] !== "string") return MEMBERSHIP_CHANGED;
  const body: unknown = JSON.parse(first.body);
  if (!isObject(body) || !isObject(body["occurrence"])) throw new Error("drop: the first answer is no receipt");
  return said({ ...first, body: JSON.stringify({ ...body, occurrence: { ...body["occurrence"], star } }) });
}

/** The world's drops as one text to compare: each field, its audience in order, its instants in full. */
function dropsSeen({ world, rows }: DropWorld, leaving: ReadonlySet<string> = new Set()): string {
  return canonical(
    [...world.drops]
      .filter(([id]) => !leaving.has(id))
      .sort(([a], [b]) => byBytes(a, b))
      .map(([id, drop]) => {
        const row = rows.drops.get(id);
        return [
          id,
          {
            ...drop,
            endedAt: drop.endedAt?.toString() ?? null,
            audience: [...drop.audience].sort(byBytes),
            upload: row?.upload ?? null,
            dedupe: row?.dedupe ?? null,
            submittedAt: row?.submittedAt.toString() ?? null,
          },
        ];
      }),
  );
}

/** The highlight pointers as one text to compare. */
const highlightsSeen = (rows: DropRows) => canonical([...rows.highlights].sort(([a], [b]) => byBytes(a, b)));

/**
 * What is wrong with the world after a request that must change nothing: a retry under its key, another body under
 * it, another member's commit of the viewer's upload (T19).
 */
export function unchangedProblems(previous: DropWorld, after: DropWorld): string[] {
  return [
    ...(dropsSeen(after) === dropsSeen(previous) ? [] : ["a drop was made or changed"]),
    ...(rowsSeen(after.world.reservations) === rowsSeen(previous.world.reservations) ? [] : ["a reservation changed"]),
    ...(rowsSeen(after.world.uploads) === rowsSeen(previous.world.uploads) ? [] : ["an upload changed"]),
    ...(highlightsSeen(after.rows) === highlightsSeen(previous.rows) ? [] : ["a highlight changed"]),
  ];
}

/**
 * What is wrong with the world after createDrop's `answer`, given the world before it and the outcome it was judged
 * by, `caption` the body's: an added drop is one new drop of the caller's interval, active, a photo, in its day,
 * with its caption kept (an empty one is none), its upload and that upload's hash as its dedupe key, committed at
 * the instant, every active member of the club in its audience (T8); the slot consumed by it when live, and
 * otherwise as it was; no other reservation changed but the caller's own lapsed slots in that day, settled; no
 * other drop, upload or highlight changed. A refusal made and changed nothing (T19).
 */
export function committedProblems(
  previous: DropWorld,
  after: DropWorld,
  answer: Answer,
  outcome: CommitOutcome,
  caption: string | undefined,
): string[] {
  if (outcome.kind !== "added") return unchangedProblems(previous, after).map((problem) => `a refusal: ${problem}`);
  const problems: string[] = [];
  const made = [...after.world.drops.keys()].filter((id) => !previous.world.drops.has(id));
  const body = parsed(answer);
  const id = isObject(body) && typeof body.drop_id === "string" ? body.drop_id : undefined;
  if (made.length !== 1 || made[0] !== id) problems.push(`the drop added made ${JSON.stringify(made)}, not its own id`);
  const drop = id === undefined ? undefined : after.world.drops.get(id);
  const row = id === undefined ? undefined : after.rows.drops.get(id);
  const club = previous.world.days.get(outcome.day)?.club;
  const audience = [...previous.world.members]
    .filter(([, member]) => member.club === club && member.leftAt === null)
    .map(([interval]) => interval)
    .sort(byBytes);
  if (drop !== undefined) {
    const want = {
      author: outcome.interval,
      day: outcome.day,
      media: "photo",
      state: "active",
      endedAt: null,
      caption: caption === undefined || caption === "" ? null : caption,
      audience,
      comments: [],
      upload: outcome.upload,
      dedupe: previous.rows.hashes.get(outcome.upload) ?? null,
      submittedAt: outcome.now.toString(),
    };
    const got = {
      ...drop,
      endedAt: drop.endedAt?.toString() ?? null,
      audience: [...drop.audience].sort(byBytes),
      upload: row?.upload ?? null,
      dedupe: row?.dedupe ?? null,
      submittedAt: row?.submittedAt.toString() ?? null,
    };
    problems.push(...fieldProblems("the drop added's row", got, want));
  }
  if (dropsSeen(after, new Set(made)) !== dropsSeen(previous)) problems.push("another drop was changed");
  if (after.world.reservations.size !== previous.world.reservations.size)
    problems.push("a commit made or lost a reservation");
  for (const [other, was] of previous.world.reservations) {
    const now_ = after.world.reservations.get(other);
    if (now_ === undefined) continue;
    if (other === outcome.slot && outcome.live) {
      if (now_.state !== "consumed" || now_.drop !== id)
        problems.push(`the slot ${other} is ${now_.state} with ${String(now_.drop)}, not consumed by the drop (T20)`);
      continue;
    }
    if (now_.state === was.state && now_.drop === was.drop) continue;
    const settled =
      was.state === "live" &&
      now_.state === "expired" &&
      now_.drop === null &&
      was.interval === outcome.interval &&
      was.day === outcome.day &&
      !before(outcome.now, was.expiresAt);
    if (!settled) problems.push(`${other} went from ${was.state} to ${now_.state}`);
  }
  if (rowsSeen(after.world.uploads) !== rowsSeen(previous.world.uploads)) problems.push("a commit changed an upload");
  if (highlightsSeen(after.rows) !== highlightsSeen(previous.rows)) problems.push("a commit changed a highlight");
  return problems;
}
