/// <reference lib="esnext.temporal" />
// The uploads' rows of the privacy matrix (spike S1's server part: `createUpload` for a drop's photo, `getUpload`
// and `completeUpload`, the contract's Upload and UploadStatus; spec 32, 33; T3, T4, T9, T12, T14, T19;
// docs/plans/api-b2-spike-uploads.md): what each role must get, judged from the world's rows and the time
// alone, apart from the statements the routes run.
//
// - createUpload for a drop's photo, with a body the contract accepts: PROFILE_INCOMPLETE to an account that
//   hasn't finished its profile, before anything is read (the route's own check; the gate lets the route by,
//   as it is `beforeProfile`). Then the neutral not-found unless the reservation is the caller's: of their
//   active interval, by reservation.ts's `adderOf` (Q06 included), in a club that isn't suspended, on a day
//   that is scheduled. A day whose star has gone before its reveal: MEMBERSHIP_CHANGED. From the reveal on:
//   OCCURRENCE_CLOSED with the day and the star's next day, as createReservation answers it (T3, T4). Then the
//   neutral not-found unless the reservation is a photo's, live, and not lapsed (T18). Otherwise 201 with a
//   new pending upload of the caller's, living 24 hours from the instant, and its signed upload: the URL for
//   that upload's own object, a PUT with the declared type and upsert off, good for Storage's two hours (the
//   fake Storage's, services/api/src/testing.ts) from the instant (`madeProblems` holds the row it made).
// - A replay under the key that made one: the same upload, with a new URL for the same object while it is
//   pending and lives, and the stored answer alone, with no URL, once it isn't (TECH-DESIGN section 6).
// - getUpload: the caller's own upload until its `expires_at`, its UploadStatus; the neutral not-found for
//   anyone else's, a lapsed one, or an id nobody has (T12, T14).
// - completeUpload: the same rule; a pending upload whose object isn't in Storage is MEDIA_NOT_READY and stays
//   pending; one that is becomes preparing; an upload past pending is answered as it is, 202.
//
// The leak scanner reads the same answers (scanner.ts: an upload's id only its owner's; the signed upload URL
// only in createUpload's 201, for the viewer's own pending upload's object); it can't judge a refusal's order,
// an instant or a row, so this file does.

import { daysOf, occurrenceOf } from "./account.ts";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import { adderOf, MEMBERSHIP_CHANGED } from "./reservation.ts";
import { canonical, rowsSeen } from "./schedule.ts";
import type { Answer, WorldFacts, WorldUpload } from "./scanner.ts";

/** The operations whose rows this file judges. */
export const UPLOAD_JUDGED: ReadonlySet<string> = new Set(["createUpload", "getUpload", "completeUpload"]);

/** createUpload's ordinary request (specsFor: a key and no body): the contract refuses it. */
export const UPLOAD_NO_BODY: Answer = pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}');

/** A drop's photo before the profile is finished (the contract: only the avatar's purpose works before it). */
export const PROFILE_INCOMPLETE: Answer = pinned(403, "Forbidden", '{"code":"PROFILE_INCOMPLETE"}');

/** A pending upload whose bytes aren't in Storage yet. */
export const MEDIA_NOT_READY: Answer = pinned(409, "Conflict", '{"code":"MEDIA_NOT_READY"}');

/** How long an upload lives from its intent (the plan's section 0.6). */
const UPLOAD_HOURS = 24;

/** The fake Storage's signed lifetime, Storage's two hours (services/api/src/testing.ts' FAKE_SIGNED_SECONDS). */
export const SIGNED_SECONDS = 7200;

/** The body every createUpload of the matrix sends, but for its reservation: a JPEG of 2.5 MB. */
export const PHOTO_BODY = { purpose: "drop_photo", content_type: "image/jpeg", byte_size: 2_500_000 } as const;

/** The project of the fake Storage's URLs (services/api/src/testing.ts' TEST_PROJECT_URL). */
const PROJECT = "https://tadayotestprojectref.supabase.co";

const before = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b) < 0;
const later = (a: Temporal.Instant, b: Temporal.Instant) => (before(a, b) ? b : a);
const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/** One flat row as text, each instant in full (schedule.ts's `rowsSeen`), or "none". */
const rowText = (row: object | undefined) => (row === undefined ? "none" : rowsSeen(new Map([["", row]])));

/** Whether the day's star left, or asked to delete their account, before its reveal (FQ63). */
function held(world: WorldFacts, day: string): boolean {
  const theDay = world.days.get(day);
  const star = theDay === undefined ? undefined : world.members.get(theDay.star);
  if (theDay === undefined || star === undefined) return true;
  const asked = world.accounts.get(star.account)?.deletionRequestedAt ?? null;
  return (
    (star.leftAt !== null && before(star.leftAt, theDay.revealAt)) || (asked !== null && before(asked, theDay.revealAt))
  );
}

/** Whether the account has finished its profile: its age confirmed and a name (FQ13, FQ69). */
function finished(world: WorldFacts, account: string | null): boolean {
  const row = account === null ? undefined : world.accounts.get(account);
  return row !== undefined && row.ageConfirmed && row.name !== null;
}

/** What createUpload must answer, from the world's rows before it. */
export type UploadOutcome =
  | { kind: "pinned"; answer: Answer }
  | { kind: "refused"; code: string; body: Record<string, unknown> }
  | { kind: "made"; account: string; reservation: string; now: Temporal.Instant };

/** What the world's rows give `account` starting a drop's photo under `reservation` at `now` (the rule above). */
export function uploadOutcome(
  world: WorldFacts,
  account: string | null,
  reservation: string,
  now: Temporal.Instant,
): UploadOutcome {
  if (!finished(world, account)) return { kind: "pinned", answer: PROFILE_INCOMPLETE };
  const slot = world.reservations.get(reservation);
  if (slot === undefined || account === null) return { kind: "pinned", answer: NEUTRAL };
  const interval = adderOf(world, account, slot.day);
  const theDay = world.days.get(slot.day);
  if (interval === undefined || interval !== slot.interval || theDay === undefined)
    return { kind: "pinned", answer: NEUTRAL };
  if (held(world, slot.day)) return { kind: "pinned", answer: MEMBERSHIP_CHANGED };
  if (!before(now, theDay.revealAt)) {
    const phase = before(now, theDay.closeAt) ? "open" : "past";
    const next = daysOf(world, theDay.club, later(now, theDay.revealAt), theDay.star).next;
    return {
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: {
        code: "OCCURRENCE_CLOSED",
        target: occurrenceOf(world, slot.day, phase),
        ...(next === undefined ? {} : { next_target: next }),
      },
    };
  }
  if (slot.media !== "photo" || slot.state !== "live" || !before(now, slot.expiresAt))
    return { kind: "pinned", answer: NEUTRAL };
  return { kind: "made", account, reservation, now };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body) as unknown;
  } catch {
    return undefined;
  }
}

/** A copy of a body without one of its fields, the others in their order. */
export function without(body: Readonly<Record<string, unknown>>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([name]) => name !== field));
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

/** The URL the fake Storage signs for `objectKey`: its form, with any token. */
function urlFor(objectKey: string): RegExp {
  return new RegExp(
    `^${PROJECT.replaceAll(".", "\\.")}/storage/v1/object/upload/sign/uploads/${objectKey}\\?token=[A-Za-z0-9._~%-]+$`,
  );
}

/** What is wrong with `signed`, a signed upload for `upload` given at `now`. */
export function signedProblems(signed: unknown, upload: WorldUpload, now: Temporal.Instant): string[] {
  if (!isObject(signed)) return ["no signed upload"];
  const problems: string[] = [];
  if (typeof signed.url !== "string" || !urlFor(upload.objectKey).test(signed.url))
    problems.push("a signed upload URL that isn't Storage's upload route for the upload's own object");
  return [
    ...problems,
    ...fieldProblems(
      "the signed upload",
      { method: signed.method, headers: signed.headers, expires_at: signed.expires_at },
      {
        method: "PUT",
        headers: { "Content-Type": upload.contentType, "x-upsert": "false" },
        expires_at: second(now.add({ seconds: SIGNED_SECONDS })),
      },
    ),
  ];
}

/**
 * createUpload's answer for `outcome`, read with the world after it, `after`: the pinned refusal, the refusal
 * with its facts, or the new upload, pending, with its signed upload, and no other field. The fields' order is
 * the receipt's (Postgres's jsonb keeps keys shortest first), which every replay repeats, so it isn't judged here.
 */
export function uploadExpected(outcome: UploadOutcome, after: () => WorldFacts): Expected {
  if (outcome.kind === "pinned") return outcome.answer;
  if (outcome.kind === "refused") {
    return (answer) => {
      const body = bodyOf(answer, 409, outcome.code);
      return Array.isArray(body) ? body : fieldProblems(outcome.code, body, outcome.body);
    };
  }
  return (answer) => {
    const body = bodyOf(answer, 201, "the upload made");
    if (Array.isArray(body)) return body;
    const { id, signed_upload: signed, ...rest } = body;
    const upload = typeof id === "string" ? after().uploads.get(id) : undefined;
    if (upload === undefined) return ["the upload made names no upload of the world"];
    return [
      ...fieldProblems("the upload made", rest, {
        purpose: "drop_photo",
        state: "pending",
        expires_at: second(outcome.now.add({ hours: UPLOAD_HOURS })),
      }),
      ...signedProblems(signed, upload, outcome.now),
    ];
  };
}

/**
 * What is wrong with `answer`, createUpload's request again under the key that made the upload `first` answered
 * (T19; TECH-DESIGN section 6): the same upload in the same fields, and, while it is pending and lives at `now`
 * in `after`, a new signed upload for the same object, good from `now`; once it isn't, the stored answer alone,
 * with no URL. Nothing is made or changed.
 */
export function replayProblems(
  first: Answer,
  answer: Answer,
  previous: WorldFacts,
  after: WorldFacts,
  now: Temporal.Instant,
): string[] {
  const made = parsed(first);
  if (!isObject(made) || typeof made.id !== "string") return ["the first answer made no upload"];
  const body = bodyOf(answer, 201, "the upload made, again");
  if (Array.isArray(body)) return body;
  const { signed_upload: signed, ...rest } = body;
  const stored = without(made, "signed_upload");
  const upload = after.uploads.get(made.id);
  if (upload === undefined) return ["the upload made is gone"];
  const live = upload.state === "pending" && before(now, upload.expiresAt);
  const problems = [
    ...fieldProblems("the upload made, again", rest, stored),
    ...(Object.keys(body).join() === Object.keys(live ? made : stored).join()
      ? []
      : [`the upload made, again, has the fields ${Object.keys(body).join()}`]),
    ...(live
      ? signedProblems(signed, upload, now)
      : signed === undefined
        ? []
        : ["a signed upload once it isn't pending"]),
  ];
  if (rowsSeen(after.uploads) !== rowsSeen(previous.uploads))
    problems.push("a retry under its key made or changed an upload (T19)");
  if (rowsSeen(after.reservations) !== rowsSeen(previous.reservations))
    problems.push("a retry under its key changed a reservation (T19)");
  return problems;
}

/** The ids of the world's uploads. */
const uploadIds = (world: WorldFacts) => new Set(world.uploads.keys());

/**
 * What is wrong with the world after createUpload's `answer`, given the world before it and the outcome it was
 * judged by: an upload made is one new upload of the caller's, pending, for a drop's photo, of the declared type,
 * living 24 hours from the instant; a refusal made none (T19: it leaves nothing); and no other upload and no
 * reservation changed (the command settles nothing).
 */
export function madeProblems(
  previous: WorldFacts,
  after: WorldFacts,
  answer: Answer,
  outcome: UploadOutcome,
): string[] {
  const problems: string[] = [];
  const was = uploadIds(previous);
  const made = [...after.uploads.keys()].filter((id) => !was.has(id));
  const body = parsed(answer);
  const id = isObject(body) && typeof body.id === "string" ? body.id : undefined;
  if (outcome.kind === "made") {
    if (made.length !== 1 || made[0] !== id)
      problems.push(`the upload made made ${JSON.stringify(made)}, not its own id`);
    const upload = id === undefined ? undefined : after.uploads.get(id);
    if (
      upload !== undefined &&
      (upload.owner !== outcome.account ||
        upload.purpose !== "drop_photo" ||
        upload.state !== "pending" ||
        upload.contentType !== PHOTO_BODY.content_type ||
        upload.expiresAt.toString() !== outcome.now.add({ hours: UPLOAD_HOURS }).toString())
    )
      problems.push("the upload made isn't the caller's pending photo, living 24 hours from the instant");
  } else if (made.length > 0) problems.push(`a refusal made ${JSON.stringify(made)} (T19)`);
  for (const [other, row] of previous.uploads) {
    if (rowText(after.uploads.get(other)) !== rowText(row)) problems.push(`the upload ${other} changed`);
  }
  if (rowsSeen(after.reservations) !== rowsSeen(previous.reservations)) problems.push("a reservation changed");
  return problems;
}

/** The caller's own upload at `now`, or undefined for anyone else's, a lapsed one, or an id nobody has. */
function ownLive(
  world: WorldFacts,
  account: string | null,
  id: string,
  now: Temporal.Instant,
): WorldUpload | undefined {
  const upload = world.uploads.get(id);
  return upload !== undefined && account !== null && upload.owner === account && before(now, upload.expiresAt)
    ? upload
    : undefined;
}

/** An upload as the contract's UploadStatus, as it is or in the state `state`. */
function statusOf(
  id: string,
  upload: WorldUpload,
  state: WorldUpload["state"] = upload.state,
): Record<string, unknown> {
  return {
    id,
    purpose: upload.purpose,
    state,
    ...(state === "rejected" && upload.rejection !== null ? { rejection: upload.rejection } : {}),
    expires_at: second(upload.expiresAt),
  };
}

/** getUpload's answer: the caller's own upload while it lives, and the neutral not-found otherwise. */
export function readExpected(world: WorldFacts, account: string | null, id: string, now: Temporal.Instant): Expected {
  const upload = ownLive(world, account, id, now);
  if (upload === undefined) return NEUTRAL;
  const want = statusOf(id, upload);
  return (answer) => {
    const body = bodyOf(answer, 200, "the upload");
    return Array.isArray(body) ? body : fieldProblems("the upload", body, want);
  };
}

/** What completeUpload must answer, from the world's rows before it and what Storage holds. */
export type CompleteOutcome =
  { kind: "pinned"; answer: Answer } | { kind: "status"; id: string; body: Record<string, unknown>; moves: boolean };

/** What the world's rows give `account` completing the upload `id` at `now`, with Storage holding `objects`. */
export function completeOutcome(
  world: WorldFacts,
  account: string | null,
  id: string,
  now: Temporal.Instant,
  objects: ReadonlySet<string>,
): CompleteOutcome {
  const upload = ownLive(world, account, id, now);
  if (upload === undefined) return { kind: "pinned", answer: NEUTRAL };
  if (upload.state !== "pending") return { kind: "status", id, body: statusOf(id, upload), moves: false };
  if (!objects.has(upload.objectKey)) return { kind: "pinned", answer: MEDIA_NOT_READY };
  return { kind: "status", id, body: statusOf(id, upload, "preparing"), moves: true };
}

/** completeUpload's answer for `outcome`. */
export function completeExpected(outcome: CompleteOutcome): Expected {
  if (outcome.kind === "pinned") return outcome.answer;
  return (answer) => {
    const body = bodyOf(answer, 202, "the upload completed");
    return Array.isArray(body) ? body : fieldProblems("the upload completed", body, outcome.body);
  };
}

/** What is wrong with the world after completeUpload: only a pending upload whose bytes are in moved, to preparing. */
export function completedProblems(previous: WorldFacts, after: WorldFacts, outcome: CompleteOutcome): string[] {
  const problems: string[] = [];
  if (after.uploads.size !== previous.uploads.size) problems.push("a completion made or lost an upload");
  for (const [other, row] of previous.uploads) {
    const now = after.uploads.get(other);
    const moved = outcome.kind === "status" && outcome.moves && other === outcome.id;
    const want = moved ? { ...row, state: "preparing" } : row;
    if (rowText(now) !== rowText(want))
      problems.push(`the upload ${other} is ${now === undefined ? "gone" : rowText(now)}, not ${rowText(want)}`);
  }
  if (rowsSeen(after.reservations) !== rowsSeen(previous.reservations)) problems.push("a reservation changed");
  return problems;
}
