/// <reference lib="esnext.temporal" />
// The account routes' rows of the privacy matrix (slice 8: getMe, updateMe and listClubs), and the sign-in
// gate in front of every route (spec 23; TECH-DESIGN section 8; T14, T27, T53, T55; FQ13, FQ69, FQ89), as
// the matrix judges them. What it pins is this file's own copy, so a change to the contract's flags or to
// the app alone fails here and has to be made here too:
// - the gate: the operations that are `public` (no session is read at all) and the ones that work
//   `beforeProfile`, and for each kind of session the one answer the gate gives (gateOf): the 401 of
//   `{"code":"UNAUTHENTICATED"}` for a caller with no session, whatever the reason (a bad token, an account
//   whose deletion has begun), the 403 PROFILE_INCOMPLETE for an account that hasn't confirmed its age or
//   has no name, on a route that isn't `beforeProfile`;
// - getMe: 200 with the `Me` of the viewer's own row, which the scanner holds to the row (scanner.ts), and
//   every other account route the same;
// - listClubs: 200 with the clubs the viewer is an active member of and the invitations they accepted that
//   haven't become memberships, each count and each id read from the world's rows (clubsJudge);
// - updateMe: the table of bodies each session sends in each cell (updateMeCases), each with the answer
//   pinned byte for byte, so that a guessed, another account's and a drop's upload get the same bytes (T14),
//   a refused body says only its code and field and never a value (T55), a body past the route's 17 KiB is
//   refused before it is read, with no field and the connection closed (a million-character name once held the
//   event loop for a quarter of a second), and an account whose deletion has begun gets the 401 before its body
//   is read (T27).
// Every other operation answers the skeleton's neutral not-found to a caller the gate lets through.

import { NEUTRAL, PROFILE_INCOMPLETE, UNAUTHENTICATED, pinned, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import type { Answer, Viewer, WorldFacts } from "./scanner.ts";

/** What the gate makes of an account (matrix.ts's Session), from its row. */
export type Session = "active" | "unfinished" | "deleting";

export function sessionOf(row: { state: string; ageConfirmed: boolean; name: string | null }): Session {
  if (row.state !== "active") return "deleting";
  return row.ageConfirmed && row.name !== null ? "active" : "unfinished";
}

/** The operations that need no session: the contract's `public` (the gate reads no header for them). */
export const PUBLIC: ReadonlySet<string> = new Set(["removeDevice", "previewInvitationWeb"]);

/** The operations an account can use before its profile is finished: the contract's `beforeProfile` (FQ13, FQ69). */
export const BEFORE_PROFILE: ReadonlySet<string> = new Set([
  "getMe",
  "updateMe",
  "deleteMyAvatar",
  "getMyAvatar",
  "deleteAccount",
  "getConfig",
  "createUpload",
  "getUpload",
  "completeUpload",
]);

/** The one answer the gate gives a caller of `session` to `operation`, or undefined when it lets them through. */
export function gateOf(session: Session, operation: { id: string }): Answer | undefined {
  if (PUBLIC.has(operation.id)) return undefined;
  if (session === "deleting") return UNAUTHENTICATED;
  if (session === "unfinished" && !BEFORE_PROFILE.has(operation.id)) return PROFILE_INCOMPLETE;
  return undefined;
}

/** What the scanner and the judges know of the world and the viewer, as of the cell's instant. */
export interface Seen {
  world: WorldFacts;
  viewer: Viewer;
  now: Temporal.Instant;
}

/** The operations whose rows this file judges: the ones the app builds in slice 8, with the gate. */
export const JUDGED: ReadonlySet<string> = new Set(["getMe", "updateMe", "listClubs"]);

const invalid = (field?: string) =>
  pinned(
    400,
    "Bad Request",
    field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
  );

/**
 * The 400 of a body refused before it was read (past the route's limit): no field, and the connection closed,
 * which Fastify does so that what the client goes on sending is never read. It closes it for every caller
 * the gate lets through alike, and the matrix compares Connection as sent (harness.ts), so a route that
 * closes it for some cells and not others is seen.
 */
const unread = () => pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}', "close");

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body);
  } catch {
    return undefined;
  }
}

/** A 200 whose `Me` carries `fields`: the scanner holds the rest of it to the viewer's row. */
function meWith(fields: Readonly<Record<string, unknown>> = {}): (answer: Answer) => string[] {
  return (answer) => {
    if (answer.status !== 200) return [`status ${String(answer.status)}, not the account's Me`];
    const body = parsed(answer);
    if (!isObject(body)) return ["not the account's Me"];
    return Object.entries(fields)
      .filter(([key, value]) => body[key] !== value)
      .map(([key]) => `Me's ${key} isn't what the request set`);
  };
}

/** An answer's value as a finding says it. */
const shown = (value: unknown): string =>
  value === undefined ? "nothing" : typeof value === "string" ? value : JSON.stringify(value);

const idsOf = (items: unknown[], field: string) =>
  items.map((item) => (isObject(item) && typeof item[field] === "string" ? item[field] : "(none)"));

function sameIds(what: string, got: readonly string[], want: ReadonlySet<string>): string[] {
  const missing = [...want].filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.has(id));
  const repeated = got.length !== new Set(got).size;
  return [
    ...(missing.length > 0 ? [`${what} lacks ${missing.join(", ")}`] : []),
    ...(extra.length > 0 ? [`${what} holds ${extra.join(", ")}, which aren't the viewer's`] : []),
    ...(repeated ? [`${what} lists one twice`] : []),
  ];
}

/**
 * listClubs for the viewer (spec 04, 05; T7, T14, T33; the contract's ClubList): the server's instant in whole
 * seconds, the clubs the viewer is an active member of each with its active members counted, and the
 * invitations bound to the viewer's account whose person hasn't joined yet and that have an inviter to name:
 * read from the world's rows, apart from the query the route runs.
 */
export function clubsJudge(seen: () => Seen): (answer: Answer) => string[] {
  return (answer) => {
    if (answer.status !== 200) return [`status ${String(answer.status)}, not the viewer's clubs`];
    const body = parsed(answer);
    if (!isObject(body) || !Array.isArray(body.clubs) || !Array.isArray(body.invitations))
      return ["not the viewer's clubs and invitations"];
    const { world, viewer, now } = seen();
    const problems: string[] = [];
    const instant = now.toString({ smallestUnit: "second" });
    if (body.server_now !== instant)
      problems.push(`server_now is ${shown(body.server_now)}, not the server's ${instant}`);
    const active = new Map<string, number>();
    for (const member of world.members.values())
      if (member.leftAt === null) active.set(member.club, (active.get(member.club) ?? 0) + 1);
    const mine = new Set(
      [...world.members]
        .filter(([id, member]) => viewer.intervals.has(id) && member.leftAt === null)
        .map(([, member]) => member.club),
    );
    problems.push(...sameIds("the clubs", idsOf(body.clubs, "id"), mine));
    for (const club of body.clubs) {
      if (!isObject(club) || typeof club.id !== "string" || !mine.has(club.id)) continue;
      if (club.member_count !== active.get(club.id))
        problems.push(`a club says ${shown(club.member_count)} members, not ${String(active.get(club.id))}`);
    }
    const accepted = new Set(
      [...world.invitations]
        .filter(
          ([, found]) =>
            viewer.account !== null && found.boundTo === viewer.account && !found.joined && found.inviterName !== null,
        )
        .map(([id]) => id),
    );
    problems.push(...sameIds("the invitations", idsOf(body.invitations, "invitation_id"), accepted));
    return problems;
  };
}

/**
 * What a cell of `session` must get from `operation`'s ordinary request (specsFor: no body): the gate's
 * answer where the gate stops the caller, else the operation's row: the viewer's `Me`, the viewer's clubs,
 * the 400 of an update with no body, and the skeleton's neutral not-found for every operation not built yet.
 */
export function cellExpected(session: Session, operation: { id: string }, seen: () => Seen): Expected {
  const gate = gateOf(session, operation);
  if (gate !== undefined) return gate;
  switch (operation.id) {
    case "getMe":
      return meWith();
    case "updateMe":
      return invalid();
    case "listClubs":
      return clubsJudge(seen);
    default:
      return NEUTRAL;
  }
}

/** The uploads a cell's viewer has to send `updateMe` bodies about. */
export interface Own {
  /** The viewer's own avatar upload that isn't ready, and one that is, with the version `Me` will show. */
  pending: string;
  ready: { id: string; version: string };
  /** Another account's ready avatar, and the photo of a drop: uploads that aren't the viewer's avatars. */
  foreign: string;
  photo: string;
  /** An upload id that names nothing. */
  guessed: string;
  /** A name no one has, for the viewer to take. */
  name: string;
}

/** One body sent to `updateMe` in a cell, with the answer it must get. */
export interface BodyCase {
  name: string;
  /** The body as sent and the answer it must get, for the account's version when it is sent. */
  request(version: number): { body: string; expected: Expected };
  /** Cases of one group must get the same bytes, whatever each asked (T14). */
  group?: string;
  /** The case changes the viewer's account: the world is read again before its answer is scanned. */
  mutates: boolean;
}

const send = (fields: Readonly<Record<string, unknown>>) => JSON.stringify(fields);

/**
 * The bodies a cell sends `updateMe` as `session`, each with its answer: refusals first, and the changes
 * last, after which the world is read again. `last` is the cell's last phase, where an unfinished account
 * finishes its profile, as its owner would. An account whose deletion has begun gets the gate's 401 for
 * every body, valid or not, before the body is read (T27).
 */
export function updateMeCases(session: Session, own: Own, last: boolean): BodyCase[] {
  const refused = (
    name: string,
    fields: (version: number) => Record<string, unknown>,
    expected: (v: number) => Expected,
  ) => ({
    name,
    request: (v: number) => ({ body: send(fields(v)), expected: expected(v) }),
    mutates: false,
  });
  const avatar = (name: string, id: string, group: string, expected: Expected): BodyCase => ({
    name,
    request: (v) => ({ body: send({ expected_version: v, avatar_upload_id: id }), expected }),
    group,
    mutates: false,
  });
  const common: BodyCase[] = [
    refused(
      "a name the contract refuses",
      (v) => ({ expected_version: v, display_name: " padded " }),
      () => invalid("display_name"),
    ),
    refused(
      "a field the contract doesn't have",
      (v) => ({ expected_version: v, email: "ana@example.invalid" }),
      () => invalid(),
    ),
    // A lone surrogate, which Postgres would keep as U+FFFD: the API refuses a name rather than changing it.
    refused(
      "a name that isn't well formed",
      (v) => ({ expected_version: v, display_name: "A\ud800B" }),
      () => invalid("display_name"),
    ),
    // This file's own copy of the route's 17 KiB (app.ts's bodyLimitOf), so that raising it fails here. The
    // body is refused before it is read, so it names no field and the connection is closed.
    refused(
      "a body past the route's limit",
      (v) => ({ expected_version: v, display_name: "a".repeat(17 * 1024) }),
      () => unread(),
    ),
    refused(
      "a version that isn't the account's",
      (v) => ({ expected_version: v + 1, display_name: own.name }),
      (v) => pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":${String(v)}}`),
    ),
  ];
  if (session === "unfinished") {
    const early = invalid("avatar_upload_id");
    const group = "before the age is confirmed";
    return [
      ...common,
      refused(
        "a name before the age is confirmed",
        (v) => ({ expected_version: v, display_name: own.name }),
        () => invalid("display_name"),
      ),
      avatar("another account's avatar", own.foreign, group, early),
      avatar("an upload that names nothing", own.guessed, group, early),
      avatar("a drop's photo", own.photo, group, early),
      avatar("the viewer's own avatar, not ready", own.pending, group, early),
      ...(last
        ? [
            {
              name: "the age and a name: the profile is finished",
              request: (v: number) => ({
                body: send({ expected_version: v, age_confirmed: true, display_name: own.name }),
                expected: meWith({ age_confirmed: true, display_name: own.name }),
              }),
              mutates: true,
            },
          ]
        : []),
    ];
  }
  const group = "an upload that isn't the viewer's avatar";
  const cases: BodyCase[] = [
    ...common,
    avatar("another account's avatar", own.foreign, group, NEUTRAL),
    avatar("an upload that names nothing", own.guessed, group, NEUTRAL),
    avatar("a drop's photo", own.photo, group, NEUTRAL),
    avatar(
      "the viewer's own avatar, not ready",
      own.pending,
      "an avatar that isn't ready",
      pinned(409, "Conflict", '{"code":"MEDIA_NOT_READY"}'),
    ),
    {
      name: "the viewer's own avatar, ready",
      request: (v) => ({
        body: send({ expected_version: v, avatar_upload_id: own.ready.id }),
        expected: meWith({ avatar_version: own.ready.version }),
      }),
      mutates: true,
    },
    {
      name: "a new name",
      request: (v) => ({
        body: send({ expected_version: v, display_name: own.name }),
        expected: meWith({ display_name: own.name }),
      }),
      mutates: true,
    },
  ];
  if (session === "active") return cases;
  return cases.map((one) => ({
    ...one,
    request: (v) => ({ ...one.request(v), expected: UNAUTHENTICATED }),
    mutates: false,
  }));
}
