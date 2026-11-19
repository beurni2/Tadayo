// The privacy matrix's rows: one for each operation of the contract (TECH-DESIGN section 8: "a route
// with no matrix row fails the build"). A row says what each cell (a role, a state of the drop, a
// phase of the day) gets from its route.
//
// A row is NONE, the skeleton's, until the slice that builds a route gives it its own: every role the sign-in
// gate lets through, in every state and phase, gets the neutral not-found (T14; docs/plans/B0.md, slice 7).
// Since slice 8 the gate answers first: a caller without a session gets its one 401 from every route that
// isn't `public`, whatever the route's row (below), so the neutral not-found is what a caller the gate lets
// through gets. The harness refuses a row that nothing judges, so the slice that first builds
// a route defines the row's shape, writes the judge of each of its branches (account.ts is the first) and
// tests that each can fail. Slice 8 built the account routes and the sign-in gate in front of every route:
// - the answer each role gets from getMe, updateMe and listClubs, by what the gate makes of its account
//   (account.ts: gateOf, cellExpected, clubsJudge, updateMeCases), and the one 401 every caller without a
//   session gets from every route that isn't `public`, whatever its token (tokens.ts: an expired token, one
//   of another key, project, issuer or audience, an anon, service-role or anonymous person's, an unsecured
//   one, a shared secret's). A deleted account has no sign-in subject left, so its old token is no
//   session for anything but a new account (docs/LIMITATIONS.md: B6's deletion job ends the Supabase
//   user); the role "deletion pending" is the account whose deletion has begun (T27). What the sources
//   leave to a later slice:
// - for the first route that answers drop references (B1, B2), each cell's status and, for each of
//   the world's drops, the form it may take, absent, caption, own or revealed, from the role, the
//   state, the phase and who wrote it, checked by finding drop ids in every answer in every phase.
//   T9's denials (a withdrawn, held or removed drop, a suspended or cancelled day, a suspended club,
//   a deleting account, a block) are the row's to judge: the leak scanner knows only the audience,
//   the author and the reveal;
// - a body, with its Id fields bound through bindings.ts and replaced in the guessed-id step;
// - an object in the world for each binding still marked `missing`;
// - for the first route that pages (getOccurrence, B2; listComments, listFavourites, listMemories and
//   listMyDrops, B6), a cursor issued to another role and one issued before a removal, each answered
//   as the row says (T14), beside the forged and malformed cursors the harness sends now, and a
//   check that each cursor the route issues is a random handle of 24 to 32 bytes or a sealed value
//   only the server can read (the contract's Cursor; T15). The leak scanner catches a cursor's common
//   readable forms but can't prove one random: a key that shows none of their marks passes, packed
//   in binary, in runs of text shorter than 24 bytes among other bytes, written in base64url's own
//   letters (`hidden_1_of_2_xx`, a count, or a time in milliseconds), with a date in another writing
//   than the three it looks for (`20261106`, `06-11-2026`, `2026-11-6`) or encoded behind a prefix
//   with only text in it (scanner.ts's header lists them). A version tag goes inside the encoded
//   bytes or fills whole groups of 4 characters, as the ids' `drp_` does: the scanner refuses a
//   cursor that isn't base64url as the server writes it, which a text prefix before encoded bytes is
//   only at some lengths of key, and that check is not to be loosened to fit a prefix. Random
//   handles fail the scanner by chance about once in 1.5 billion at 24 bytes and once in 660 million
//   at 32, longer values more often (about once in 310 million at 48 bytes, and once in 26 million at
//   the contract's longest, 384), and handles of 12 about once in 100,000, which the matrix's runs
//   would meet (scanner.ts: readableKey, READABLE_TEXT, URL_RUN, LINK_MARKS, ownTextKey);
// - for the invitation's routes (B1), a person who holds a link and hasn't accepted it: the matrix's
//   role "invited, not yet a member" has accepted and waits for the roster (Q05), since a link
//   nobody has accepted ties no account to the club;
// - for createUpload, the replays of its intent (TECH-DESIGN section 8), before it grants anything:
//   spike S1's server part needs them before Gate A;
// - for listClubs (slice 8, done), the invitations the role "invited, not yet a member" has accepted: the
//   club's name and the inviter's name, read from the world's invitations bound to that account (the
//   scanner's `WorldInvitation`), and nothing else of that club (scanner.ts, its header);
// - for listClubs (spike S5, done), each club's `open_day` and `next_day` at the cell's instant, each the
//   whole Occurrence the world's rows and the time give, or none: in a suspended club, on a suspended or
//   cancelled day, after the day closes (account.ts: daysOf). A state where the day's star leaves or asks to
//   delete their account is still to come with B6's leaving; the held day is proved on Postgres meanwhile
//   (tests/src/db/home-days.test.ts), and the schedule's checks below keep `next_day` for B2's
//   membership changes;
// - for a route that changes the world (a commit, a reservation, a leave, a block), the facts each
//   answer is scanned against, read from the world after it (scanner.ts, its header);
// - for the schedule's routes built by B2's schedule slice (getSchedule, chooseScheduleDays and
//   confirmScheduleDays, done for the club's first days): what the contract gives each viewer (B2's contract
//   PR; `Schedule`'s description, T55), judged from the world's rows by schedule.ts: `held_by` only to a
//   member still choosing, `holders` only to the members who hold the day, no name on a `no_reveal` day,
//   `first_date` only on a confirmed day whose owner is still a member; `current` alone to an active member
//   the open proposal doesn't include (FQ100); a proposal's `version` unchanged by a choice or by a
//   confirmation that leaves its `state` as it was, and moved with `state` when the first days apply (T33);
//   and the neutral not-found before any other code to a caller the proposal doesn't include (T9, T14).
//   The leak scanner can't judge these: it accepts any person of a club the viewer is in (scanner.ts), so
//   each row judges them.
// - for the schedule's routes still to come (listMembers and the membership change, B2's later schedule
//   PRs; getHome, listClubs' `next_day` and a revealed day's `add_target` where a schedule's day shows),
//   each as a check a row can run:
//   - `held_by` to every member of a membership change; `announced` only in a membership change, never to
//     its new member, and never in the first days;
//   - a membership change's answers to a viewer the same before and after any other member's
//     confirmation at the same server time: only `my_state` changes, on the viewer's own, and `announced`
//     only as its days close; and before its start no member's `position`, `next_day` or `next_up` in
//     listMembers changes, and no day it adds shows in getHome, listClubs' `next_day` or a revealed day's
//     `add_target`, so nobody learns that everyone has confirmed (FQ81, FQ101);
//   - listMembers' `members` the same for every member; in the first days a choice changes none of them,
//     and a confirmation that leaves the first days open changes only the confirmer's `next_day` (once
//     their day is dated, FQ79) and `next_up`, which marks whoever's next day opens first; `position`
//     moves only when the first days apply, on their last confirmation or on a leave that leaves only
//     confirmed members, to the schedule's order (FQ98, FQ102);
//   - after a leave, the leaver in no `held_by` or `holders`, and still the `owner` of a day they
//     confirmed, with no `first_date` (FQ63, FQ102), once a leave frees a leaver's holds (the first days'
//     roster PR); a revision of the first days moving the `version` (FQ102); and a former member listed in
//     a replaced proposal getting the neutral not-found.

import { JUDGED as ACCOUNT_JUDGED } from "./account.ts";
import { SCHEDULE_JUDGED } from "./schedule.ts";

/** The operations some file judges: the account routes (slice 8) and the schedule routes (B2's schedule slice). */
export const JUDGED: ReadonlySet<string> = new Set([...ACCOUNT_JUDGED, ...SCHEDULE_JUDGED]);

const GATE =
  "the gate's one 401 to an account whose deletion has begun (T27) and to every caller without a session, " +
  "the 403 PROFILE_INCOMPLETE to an account that hasn't finished its profile unless the route is beforeProfile";

/** The skeleton's row: the neutral not-found (T14) to every caller the gate lets through. */
export const NONE = Object.freeze({
  answer: `the neutral NOT_FOUND to every role the gate lets through, in every state and phase (${GATE})`,
});

/** getMe (slice 8): the viewer's own account, and no one else's. */
export const ME = Object.freeze({
  answer: `200 with the viewer's own Me, in every state and phase, to an account with a session (${GATE})`,
});

/** updateMe (slice 8): the table of bodies in account.ts, each answered byte for byte. */
export const UPDATE_ME = Object.freeze({
  answer: `each body of account.ts's table answered as it says, in every state and phase (${GATE})`,
});

/** listClubs (slice 8): the viewer's active clubs and the invitations they accepted, from the world's rows. */
export const CLUBS = Object.freeze({
  answer: `200 with the viewer's active clubs and accepted invitations, in every state and phase (${GATE})`,
});

/** getSchedule (B2's schedule slice): the club's week for one of its members, whole, from the world's rows. */
export const SCHEDULE = Object.freeze({
  answer:
    "200 with the club's Schedule as schedule.ts's weekFor makes it from the world's rows, to an account with an " +
    "active interval in a club that isn't suspended: `current`, and the open proposal only when it includes that " +
    `interval (FQ100), each slot naming only whom the contract gives that viewer; the neutral NOT_FOUND to every other role the gate lets through (${GATE})`,
});

/** chooseScheduleDays and confirmScheduleDays (B2's schedule slice): schedule.ts's table of bodies. */
export const SCHEDULE_COMMAND = Object.freeze({
  answer:
    "each body of schedule.ts's table answered as its outcomeOf says from the world's rows: INVALID_REQUEST to " +
    "what the contract refuses, then the neutral NOT_FOUND to anyone the proposal doesn't include, MEMBERSHIP_CHANGED, " +
    `VERSION_CONFLICT, NOT_ALLOWED, or 200 with the proposal as the viewer sees it after the change (${GATE})`,
});

export const ROWS: Readonly<Record<string, unknown>> = {
  acceptInvitation: NONE,
  approveRoster: NONE,
  blockMember: NONE,
  chooseScheduleDays: SCHEDULE_COMMAND,
  clearReaction: NONE,
  completeUpload: NONE,
  confirmScheduleDays: SCHEDULE_COMMAND,
  createClub: NONE,
  createComment: NONE,
  createDrop: NONE,
  createInvitation: NONE,
  createReport: NONE,
  createReservation: NONE,
  createUpload: NONE,
  declineRoster: NONE,
  deleteAccount: NONE,
  deleteComment: NONE,
  deleteMyAvatar: NONE,
  getAuthorPreview: NONE,
  getClub: NONE,
  getClubNotificationPreferences: NONE,
  getCommentMedia: NONE,
  getConfig: NONE,
  getDrop: NONE,
  getDropMedia: NONE,
  getEmbed: NONE,
  getHome: NONE,
  getMe: ME,
  getMemberAvatar: NONE,
  getMyAvatar: NONE,
  getNotificationPreferences: NONE,
  getOccurrence: NONE,
  getOwnDay: NONE,
  getRosterRevision: NONE,
  getSchedule: SCHEDULE,
  getUpload: NONE,
  hideDrop: NONE,
  leaveClub: NONE,
  listBlocks: NONE,
  listClubs: CLUBS,
  listComments: NONE,
  listFavourites: NONE,
  listMembers: NONE,
  listMemories: NONE,
  listMyDrops: NONE,
  previewBlock: NONE,
  previewInvitation: NONE,
  previewInvitationWeb: NONE,
  proposeRoster: NONE,
  registerDevice: NONE,
  releaseReservation: NONE,
  removeDevice: NONE,
  removeDrop: NONE,
  removeFavourite: NONE,
  resolveSource: NONE,
  revokeInvitation: NONE,
  saveFavourite: NONE,
  searchMemories: NONE,
  sendEvents: NONE,
  setClubNotificationPreferences: NONE,
  setHighlight: NONE,
  setNotificationPreferences: NONE,
  setReaction: NONE,
  setThreadNotifications: NONE,
  updateComment: NONE,
  updateDrop: NONE,
  updateMe: UPDATE_ME,
};

/**
 * What's wrong with `rows` for `operations`: an operation with no row, a row with no operation, a row that
 * isn't NONE and that nothing judges (JUDGED: the operations account.ts and schedule.ts answer), and an
 * operation it judges whose row is NONE, which would leave its judge unasked.
 */
export function rowProblems(
  operations: readonly { id: string }[],
  rows: Readonly<Record<string, unknown>>,
  judged: ReadonlySet<string> = JUDGED,
): string[] {
  const ids = new Set(operations.map((operation) => operation.id));
  return [
    ...[...ids].filter((id) => !Object.hasOwn(rows, id)).map((id) => `${id} has no row in the privacy matrix`),
    ...Object.keys(rows)
      .filter((id) => !ids.has(id))
      .map((id) => `${id} has a row but no operation in the contract`),
    ...Object.entries(rows)
      .filter(([id, row]) => row !== NONE && !judged.has(id))
      .map(
        ([id]) =>
          `${id}'s row isn't NONE and nothing judges it: the slice that builds a route writes its judge and its checks`,
      ),
    ...Object.entries(rows)
      .filter(([id, row]) => row === NONE && judged.has(id))
      .map(([id]) => `${id} is judged but its row is NONE`),
  ];
}
