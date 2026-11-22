/// <reference lib="esnext.temporal" />
// The invitation's rows of the privacy matrix (B1's third slice: `previewInvitationWeb`, `previewInvitation`
// and `acceptInvitation`; the contract's `WebInvitationPreview`, `InvitationPreview` and
// `InvitationAcceptance`; spec 04, 32; T7, T9, T14, T19, T33, T52, T55; handoff 4; FQ47, FQ59, FQ65, FQ66,
// FQ71, FQ75, FQ80, FQ84): what each caller must get for a link's token, judged from the world's rows apart
// from the statements the routes run.
//
// - A token names nothing, the neutral not-found byte for byte, when no link has its hash, when the link
//   was revoked or replaced, when another account accepted with it, and when moderation suspended its club
//   (T14, FQ59, FQ80).
// - Signed out (`previewInvitationWeb`): the inviter's name, and only that, for a link nobody has used,
//   before its expiry, whose candidate is still open. Anything else is the neutral not-found.
// - Signed in (`previewInvitation`), in order: `joined` with the club to one of the club's members; nothing
//   once the link's candidate has joined; `did_not_go_ahead` with the inviter's name to the account that
//   accepted with the link when its candidate ended (nothing when the inviter has no name to show, FQ75),
//   nothing to anyone else; `expired` with the inviter's name for a link nobody used, past its expiry;
//   nothing to an account that holds another place in the club's roster; `full` with the inviter's name at
//   six members; then the exact roster of the club's open revision, names only: `waiting` when the
//   candidate accepted it with this link, the account's profile name is still the label it shows and a
//   member's approval is still to come; `changed` when the account accepted an earlier roster with it,
//   has changed its name since, or accepted a roster every member has since approved without joining;
//   else `open`. No id of a person, no decision and no acceptance of anyone (T7, T33).
// - Accepting (`acceptInvitation`), in order: the neutral not-found as above, to a member holding a link
//   they didn't join with, for an ended candidate's link nobody of this account accepted, and for a
//   revision that doesn't list the candidate; INVITATION_EXPIRED; the neutral not-found to an account
//   that holds another place in the club's roster; ROSTER_CHANGED with the newest revision's id; VERSION_CONFLICT with the revision's version; then `changed` when the account's profile
//   name isn't the label the revision shows (the server makes a new revision, FQ66), else `waiting`, or
//   `joined` when every member has approved (FQ65).
//
// The leak scanner reads the same answers for names and ids: it allows a roster's names only to a caller
// who presented the link's own token (scanner.ts). It can't judge a state or an order of refusals, so
// these rows do.

import { createHash, randomBytes } from "node:crypto";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import {
  CLUB_FULL,
  newestOf,
  rosterChanged,
  sameAnswer,
  versionConflict,
  type LinkRows,
  type RosterWorld,
} from "./roster.ts";
import type { Answer } from "./scanner.ts";
import { viewerIn, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const INVITATION_JUDGED: ReadonlySet<string> = new Set([
  "previewInvitationWeb",
  "previewInvitation",
  "acceptInvitation",
]);

const SIX = 6;
const EXPIRED = pinned(410, "Gone", '{"code":"INVITATION_EXPIRED"}');

const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A token nobody made, in the contract's shape: 43 base64url characters. */
export const freshToken = () => randomBytes(32).toString("base64url");

/** The link whose row holds the SHA-256 of `token`, or undefined. */
export function linkOf(roster: RosterWorld, token: string): LinkRows | undefined {
  const hash = createHash("sha256").update(token).digest("hex");
  return [...roster.links.values()].find((link) => link.hash === hash);
}

/** The link `token` names to `account`, or undefined when it names nothing to them (T14, FQ59, FQ80). */
function named(world: ScheduleWorld, roster: RosterWorld, token: string, account: string | null): LinkRows | undefined {
  const link = linkOf(roster, token);
  if (link === undefined || link.revoked || link.replaced) return undefined;
  if (world.clubs.get(link.club)?.suspended !== false) return undefined;
  if (link.boundTo !== null && link.boundTo !== account) return undefined;
  return link;
}

/** The name members see of whoever proposed the link's candidate (FQ75), or undefined. */
function inviterOf(world: ScheduleWorld, link: LinkRows): string | undefined {
  return world.members.get(link.proposer)?.name ?? undefined;
}

const activeMembers = (world: ScheduleWorld, club: string) =>
  [...world.members.values()].filter((member) => member.club === club && member.active).length;

/** The club's open revision, when it lists the link's candidate. */
function openRosterOf(roster: RosterWorld, link: LinkRows) {
  const found = [...roster.revisions].find(
    ([, revision]) =>
      revision.club === link.club &&
      revision.state === "open" &&
      revision.sealed &&
      revision.candidates.some((candidate) => candidate.id === link.candidate),
  );
  return found === undefined ? undefined : { id: found[0], rows: found[1] };
}

/** The account accepted with another link, for another candidate of the club who is still open. */
function holdsAnother(roster: RosterWorld, link: LinkRows, account: string | null): boolean {
  return [...roster.links.values()].some(
    (other) =>
      other.boundTo !== null &&
      other.boundTo === account &&
      other.club === link.club &&
      other.candidate !== link.candidate &&
      roster.candidates.get(other.candidate)?.state === "open",
  );
}

/** The contract's WebInvitationPreview for `token` at `now`, or undefined: the neutral not-found. */
export function webPreviewFor(
  world: ScheduleWorld,
  roster: RosterWorld,
  token: string,
  now: Temporal.Instant,
): Record<string, unknown> | undefined {
  const link = named(world, roster, token, null);
  if (link === undefined || Temporal.Instant.compare(link.expiresAt, now) <= 0) return undefined;
  if (roster.candidates.get(link.candidate)?.state !== "open") return undefined;
  const inviter = inviterOf(world, link);
  return inviter === undefined ? undefined : { inviter_name: inviter };
}

/** The contract's InvitationPreview for `token`, asked for by `account` at `now`, or undefined: the neutral not-found. */
export function previewFor(
  world: ScheduleWorld,
  roster: RosterWorld,
  token: string,
  account: string | null,
  now: Temporal.Instant,
): Record<string, unknown> | undefined {
  const link = named(world, roster, token, account);
  if (link === undefined || account === null) return undefined;
  const club = world.clubs.get(link.club);
  const viewer = viewerIn(world, link.club, account);
  if (club === undefined) return undefined;
  if (viewer !== undefined) {
    return {
      state: "joined",
      club: { id: link.club, name: club.name, timezone: club.timezone, my_membership_id: viewer },
    };
  }
  const state = roster.candidates.get(link.candidate)?.state;
  if (state === "joined" || state === undefined) return undefined;
  const mine = link.boundTo === account;
  const inviter = inviterOf(world, link);
  if (state === "ended")
    return mine && inviter !== undefined ? { state: "did_not_go_ahead", inviter_name: inviter } : undefined;
  if (!mine && Temporal.Instant.compare(link.expiresAt, now) <= 0) {
    return inviter === undefined ? undefined : { state: "expired", inviter_name: inviter };
  }
  if (!mine && holdsAnother(roster, link, account)) return undefined;
  const open = openRosterOf(roster, link);
  if (open === undefined) throw new Error("the judge found an open candidate on no open revision");
  const members = open.rows.members
    .map((interval) => ({ interval, member: world.members.get(interval) }))
    .filter(({ member }) => member !== undefined && member.active && member.name !== null)
    .sort(
      (a, b) =>
        (a.member === undefined || b.member === undefined
          ? 0
          : Temporal.Instant.compare(a.member.joinedAt, b.member.joinedAt)) || byBytes(a.interval, b.interval),
    );
  if (inviter === undefined || members.length === 0) return undefined;
  if (activeMembers(world, link.club) >= SIX) return { state: "full", inviter_name: inviter };
  // An acceptance stands while the account's profile name is the label the members read (FQ66).
  const listed = open.rows.candidates.find((candidate) => candidate.id === link.candidate);
  // And there is something to wait for only while the roster isn't ready but for the acceptance: every
  // listed member approved, the listed members exactly the club's active ones.
  const active = [...world.members].filter(([, member]) => member.club === link.club && member.active);
  const ready =
    open.rows.members.every((interval) => open.rows.decisions.get(interval) === "approved") &&
    active.length === open.rows.members.length &&
    active.every(([interval]) => open.rows.members.includes(interval));
  const accepted = listed?.acceptedWith === link.id && link.boundName === listed.label && !ready;
  return {
    state: accepted ? "waiting" : mine ? "changed" : "open",
    invitation_id: link.id,
    inviter_name: inviter,
    club_name: club.name,
    revision_id: open.id,
    revision_version: open.rows.version,
    roster: [
      ...members.map(({ member }) => ({ name: member?.name, kind: "member", is_you: false })),
      ...open.rows.candidates.map((candidate) => ({
        name: candidate.label,
        kind: "candidate",
        is_you: candidate.id === link.candidate,
      })),
    ],
    ...(accepted ? {} : { expires_at: second(link.expiresAt) }),
  };
}

/**
 * What accepting the revision `revision` at `expected` with `token` must get, for the account `account`
 * whose profile name is `name`, from the rows before it: a pinned refusal, or what the acceptance says.
 * "joined again" is the account that already joined by the revision, which changes nothing.
 */
export function acceptOutcome(
  world: ScheduleWorld,
  roster: RosterWorld,
  token: string,
  account: string,
  name: string,
  revision: string,
  expected: number,
  now: Temporal.Instant,
): Answer | "changed" | "waiting" | "joined" | "joined again" {
  const link = named(world, roster, token, account);
  if (link === undefined) return NEUTRAL;
  const mine = link.boundTo === account;
  const state = roster.candidates.get(link.candidate)?.state;
  const viewer = viewerIn(world, link.club, account);
  if (viewer !== undefined && !(mine && state === "joined")) return NEUTRAL;
  if (state === "ended" && !mine) return NEUTRAL;
  // Someone who joined by the link and has left is a former member (T14).
  if (state === "joined" && viewer === undefined) return NEUTRAL;
  const rows = roster.revisions.get(revision);
  const listed = rows?.candidates.find((candidate) => candidate.id === link.candidate);
  if (rows === undefined || rows.club !== link.club || !rows.sealed || listed === undefined) return NEUTRAL;
  if (!mine && Temporal.Instant.compare(link.expiresAt, now) <= 0) return EXPIRED;
  if (holdsAnother(roster, link, account)) return NEUTRAL;
  if (rows.state === "superseded") {
    // Told of the newest revision only while it lists the candidate: a leave may have ended them and
    // carried the others on.
    const newest = newestOf(roster, revision);
    const still = roster.revisions.get(newest)?.candidates.some((candidate) => candidate.id === link.candidate);
    return still === true ? rosterChanged(newest) : NEUTRAL;
  }
  if (rows.version !== expected) return versionConflict(rows.version);
  if (rows.state !== "open") return rows.state === "applied" && viewer !== undefined ? "joined again" : NEUTRAL;
  if (state !== "open" || viewer !== undefined) return NEUTRAL;
  if (activeMembers(world, link.club) >= SIX) return CLUB_FULL;
  if (name !== listed.label) return "changed";
  // Applied when every member the revision lists has approved it (FQ65): this account then joins.
  const approved = rows.members.every((interval) => rows.decisions.get(interval) === "approved");
  return approved ? "joined" : "waiting";
}

/** previewInvitationWeb's answer for `token` in a cell. */
export function webPreviewExpected(
  seen: () => { schedule: ScheduleWorld; roster: RosterWorld; now: Temporal.Instant },
  token: string,
): Expected {
  return (answer) => {
    const { schedule, roster, now } = seen();
    const want = webPreviewFor(schedule, roster, token, now);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameAnswer("the inviter's name", 200, want)(answer);
  };
}

/** previewInvitation's answer for `token` in a cell, asked for by `account`. */
export function previewExpected(
  seen: () => { schedule: ScheduleWorld; roster: RosterWorld; now: Temporal.Instant },
  token: string,
  account: string | null,
): Expected {
  return (answer) => {
    const { schedule, roster, now } = seen();
    const want = previewFor(schedule, roster, token, account, now);
    return want === undefined
      ? pinnedProblems(answer, NEUTRAL)
      : sameAnswer("the invitation's preview", 200, want)(answer);
  };
}
