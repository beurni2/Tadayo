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
// - for createUpload, the replays of its intent (TECH-DESIGN section 8), before it grants anything:
//   spike S1's server part needs them before Gate A;
// - for listClubs (slice 8, done), the invitations the role "invited, not yet a member" has accepted: the
//   club's name and the inviter's name, read from the world's invitations bound to that account (the
//   scanner's `WorldInvitation`), and nothing else of that club (scanner.ts, its header);
// - for listClubs (spike S5, done), each club's `open_day` and `next_day` at the cell's instant, each the
//   whole Occurrence the world's rows and the time give, or none: in a suspended club, on a suspended or
//   cancelled day, after the day closes (account.ts: daysOf). A state where the day's star leaves or asks to
//   delete their account is still to come with B6's leaving; the held day is proved on Postgres meanwhile
//   (tests/src/db/home-days.test.ts), and the schedule's checks below keep `next_day` for a new member's
//   pick and the days a fourth member's join frees;
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
// - for listMembers (B2's generation slice, done): the club's roster, whole, judged from the world's rows by
//   members.ts: the same `members` for every member, in the order they joined while the first days are open
//   and in the week's order once they have applied (FQ98), each with their own next day (account.ts's
//   `daysOf`, among that member's days) and `next_up` on the star of the club's next day; no `cover` and no
//   `open_revision` yet; and the neutral not-found to everyone else. The matrix asks it in every cell and
//   again after the viewer's own schedule commands, so a choice is seen to change none of it and the last
//   confirmation to move the rows once;
// - for the club's two routes (B1's first slice, done): getClub's ClubDetail for one of the club's members,
//   whole, judged from the world's rows by club.ts (the state, the active members, the two days, the
//   roster's version, `can_propose` and the open revision's id), and the neutral not-found to everyone
//   else; createClub's table of bodies in every cell, where each account the gate lets through makes a
//   club, reads it, lists it once and retries it under its key, and someone of another club is refused
//   it. A club the viewer makes changes the world, so the facts are read again before its answer is
//   scanned. Since the roster's table (below) a member's club has an open revision after its first
//   proposal and is full once enough candidates are carried, so `open_revision_id` and a false
//   `can_propose` pass through the cells of the phases after it; the read's rule for them is also tested
//   on rows built by hand (tests/src/db/create-club.test.ts) and the serializer's on the contract's
//   `kitchen_table` example;
// - for the roster's four routes (B1's second slice, done): getRosterRevision's RosterRevision, whole, judged
//   from the world's rows by roster.ts, for a member the revision itself lists (FQ119), with a candidate's
//   link only for the member who proposed that candidate, and the neutral not-found to everyone else. The
//   world's own revision, the applied one that brought Ben and Cleo in, lists Ana alone, and its link is
//   one Ben accepted with, so in every cell only Ana reads it and only Ana's revoke of that link is
//   NOT_ALLOWED. Then, in every phase, a table of proposals (what the contract refuses, a stale version,
//   one person proposed, its retry and another body under its key), and for each revision it makes: the
//   revision read by its proposer, by another member and by someone of another club; a link made by its
//   proposer, refused to the other two, and retried; the token held to its row's hash and kept back from
//   every later answer; the link revoked, twice, and refused to the other two. A proposal changes the
//   world, so the facts are read again before its answer is scanned; an answer given to the other member is
//   scanned with that member's own facts. The leak scanner allows a link's id only to the member whose
//   active interval proposed its candidate, and the `url` only in createInvitation's 201, as the token its
//   row's hash is of (scanner.ts). A later phase of a cell may find the club full of the candidates
//   carried, and then its proposal is CLUB_FULL and the rest of its table isn't run: each role's test
//   counts the revisions, links and other member's answers its table made and asserts them, and one test
//   names the six roles that made any (matrix.test.ts, "the roster's table ran"). Since the invitation's
//   table (below) ends each phase's revision by a decline, its candidates end with it, so a later phase no
//   longer finds the club full of them; the judge still says CLUB_FULL should the rows ever hold six;
// - for the invitation's three routes and the roster's two decisions (B1's third slice, done): in every
//   cell, each with a body the contract accepts that changes nothing (a token nobody made, a version no
//   revision is at), judged by invitation.ts and roster.ts's `decisionOutcome`: the neutral not-found, or
//   VERSION_CONFLICT to the one member who reads the world's own revision. Then, in every phase, for the
//   revision the roster's table made: a second link for its candidate, held by someone of another club.
//   The signed-out page reads the inviter's name, and nothing once the link is used; the holder previews
//   the exact roster (`open`), is refused a stale version, accepts under their own name (`changed`: a new
//   revision under that name with no approval and no acceptance, FQ66, FQ84; its retry the same bytes),
//   previews it (`changed`), accepts it (`waiting`) and previews again (`waiting`); a member of the club
//   previewing the link is told `joined`, and can't accept with it; the proposer reads the superseded
//   revision, is refused a decision of it (ROSTER_CHANGED), reads the open revision in listMembers'
//   `open_revision`, approves (its retry the same bytes; a second approval changes nothing); another
//   member declines; the holder then previews `did_not_go_ahead` and is refused acceptance. Each step is
//   held to the outcome the table names, so a judge that agreed with a refusal would fail, and each answer
//   is scanned with its own caller's facts and the token its request presented. Another member declines
//   in every phase, so no cell applies a roster: the club's members stay who the cell's other rows expect.
//   A roster applied to a club that has started, and a joiner's own answers, go through the app in
//   matrix.test.ts's "a roster applied through the app"; a club's start with its first days goes through
//   the commands on Postgres only (tests/src/db/accept-roster.test.ts). What passes through no cell, and
//   is held by the database tests and invitation.test.ts's judge tests: `expired`, `full`,
//   INVITATION_EXPIRED and CLUB_FULL of an acceptance (a link is made and used within its phase; six
//   members are built only by hand); a revoked or a replaced link's token on the three routes (the
//   table's first link is revoked and never presented); a suspended club's link; a second place in the
//   same club; a link whose candidate joined and then left; ROSTER_CHANGED of an acceptance; an inviter
//   with no name; an ended proposal's link nobody used; and an account that changed its name after
//   accepting;
// - for the schedule's routes still to come (the first days' roster, B2's later schedule PRs; getHome,
//   listClubs' `next_day` and a revealed day's `add_target` where a schedule's day shows), each as a check a
//   row can run:
//   - in a new member's pick (`api/b2-new-member-day`), the latest week's days shown as their members'
//     confirmed days to every member it includes, a confirmation's days in the club's week from the next
//     week on, and nobody else's day moved: judged here by schedule.ts and, through the app, by matrix.test.ts's
//     "a new member's pick through the app"; what a fourth member's join frees and cancels, and the days a
//     confirmation makes, on Postgres in tests/src/db/membership-change.test.ts. Still to come: no freed
//     day, and no leaver's cancelled day, in getHome, listClubs' `next_day` or a revealed day's `add_target`;
//   - listMembers' `members` the same for every member; in the first days a choice changes none of them,
//     and a confirmation that leaves the first days open changes only the confirmer's `next_day` (once
//     their day is dated, FQ79) and `next_up`, which marks whoever's next day opens first; `position`
//     moves only when the first days apply, on their last confirmation or on a leave that leaves only
//     confirmed members, to the schedule's order (FQ98, FQ102), and for a restarted club on the day its
//     new week starts (FQ124);
//   - after a leave, the leaver in no `held_by` or `holders`, and still the `owner` of a day they
//     confirmed, with no `first_date` (FQ63, FQ102), now that a leave frees a leaver's holds; a revision
//     of the first days moving the `version` (FQ102), both in tests/src/db/first-days-roster.test.ts; and
//     a former member listed in a replaced proposal getting the neutral not-found.

import { JUDGED as ACCOUNT_JUDGED } from "./account.ts";
import { CLUB_JUDGED } from "./club.ts";
import { INVITATION_JUDGED } from "./invitation.ts";
import { LEAVE_JUDGED } from "./leave.ts";
import { MEMBERS_JUDGED } from "./members.ts";
import { ROSTER_JUDGED } from "./roster.ts";
import { SCHEDULE_JUDGED } from "./schedule.ts";

/**
 * The operations some file judges: the account routes (slice 8), the schedule routes (B2's schedule slice),
 * the roster (B2's generation slice), the club's two routes (B1's first slice), the roster's four (B1's
 * second slice) and its two decisions and the invitation's three (B1's third slice).
 */
export const JUDGED: ReadonlySet<string> = new Set([
  ...ACCOUNT_JUDGED,
  ...SCHEDULE_JUDGED,
  ...MEMBERS_JUDGED,
  ...CLUB_JUDGED,
  ...ROSTER_JUDGED,
  ...INVITATION_JUDGED,
  ...LEAVE_JUDGED,
]);

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
    "interval (FQ100), each slot naming only whom the contract gives that viewer, and in a new member's pick each " +
    "day of the club's latest week whose member is still in the club as that member's confirmed day, dated only " +
    `on the viewer's own (FQ125 to FQ127, FQ129 to FQ131); the neutral NOT_FOUND to every other role the gate lets through (${GATE})`,
});

/** listMembers (B2's generation slice): the club's roster for one of its members, whole, from the world's rows. */
export const MEMBERS = Object.freeze({
  answer:
    "200 with the club's Members as members.ts's membersFor makes it from the world's rows, to an account with an " +
    "active interval in a club that isn't suspended: every active member with a name, the same list for each of " +
    "them, in the roster's order (FQ98), each with their own next day and whether they are next, and no other " +
    `field; the neutral NOT_FOUND to every other role the gate lets through (${GATE})`,
});

/** getClub (B1's first slice): the club's information for one of its members, whole, from the world's rows. */
export const CLUB = Object.freeze({
  answer:
    "200 with the club's ClubDetail as club.ts's clubFor makes it from the world's rows, to an account with an " +
    "active interval in a club that isn't suspended: its state, its active members counted, its two days, the " +
    "roster's version, whether another person can be proposed and the open revision's id, and no other field; " +
    `the neutral NOT_FOUND to every other role the gate lets through (${GATE})`,
});

/** createClub (B1's first slice): club.ts's table of bodies. */
export const CREATE_CLUB = Object.freeze({
  answer:
    "each body of club.ts's table answered as it says: INVALID_REQUEST to what the contract refuses, 201 with the " +
    "new club as its creator reads it, the same bytes to its retry under the same key, and IDEMPOTENCY_CONFLICT " +
    `to another body under that key, to any account the gate lets through (${GATE})`,
});

/** getRosterRevision (B1's second slice): a roster revision for a member it lists, whole, from the world's rows. */
export const ROSTER_REVISION = Object.freeze({
  answer:
    "200 with the RosterRevision as roster.ts's revisionFor makes it from the world's rows, to an account with an " +
    "active interval in a club that isn't suspended whose interval the revision lists (FQ119): its members, its " +
    "candidates by their labels, the viewer's own decision, and a candidate's link only for the member who proposed " +
    `that candidate, and no other field; the neutral NOT_FOUND to every other role the gate lets through (${GATE})`,
});

/** proposeRoster (B1's second slice): roster.ts's table of bodies. */
export const PROPOSE_ROSTER = Object.freeze({
  answer:
    "each body of roster.ts's table answered as its proposalOutcome says from the world's rows: INVALID_REQUEST to " +
    "what the contract refuses, then the neutral NOT_FOUND to anyone who isn't a member, VERSION_CONFLICT with the " +
    "club's version, CLUB_FULL, or 201 with the new revision as its proposer reads it, the same bytes to its retry " +
    `and IDEMPOTENCY_CONFLICT to another body under its key (${GATE})`,
});

/** createInvitation (B1's second slice): a link for the member who proposed the candidate, and nobody else. */
export const CREATE_INVITATION = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; 201 with the link, its token once in the url's fragment, to the " +
    "member who proposed the candidate, and the same answer without the url to its retry; NOT_ALLOWED to that " +
    `member once an account accepted with the latest link; the neutral NOT_FOUND to everyone else (${GATE})`,
});

/** revokeInvitation (B1's second slice): roster.ts's revokeOutcome. */
export const REVOKE_INVITATION = Object.freeze({
  answer:
    "200 with the RevokedInvitation to the member who proposed the link's candidate, each time; NOT_ALLOWED to that " +
    `member once an account accepted with the link; the neutral NOT_FOUND to everyone else (${GATE})`,
});

/** approveRoster and declineRoster (B1's third slice): roster.ts's decisionOutcome. */
export const ROSTER_DECISION = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; the neutral NOT_FOUND to anyone who can't read the revision " +
    "(FQ119); ROSTER_CHANGED with the newest revision's id once a newer one replaced it; VERSION_CONFLICT with the " +
    "revision's version; then 200 with the RosterRevision as the caller reads it after their own decision, taken " +
    `once on an open revision, or as it stands when there is nothing to decide; the same bytes to a retry (${GATE})`,
});

/** previewInvitationWeb (B1's third slice): the inviter's name for a live link, to anyone, signed in or not. */
export const INVITATION_WEB = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; 200 with the inviter's name, and nothing else, for the token of " +
    "a link nobody has used, not revoked, replaced or expired, whose candidate is still open in a club that isn't " +
    "suspended; the neutral NOT_FOUND for every other token, to every caller: the route is public, so the gate " +
    "reads no session for it",
});

/** previewInvitation (B1's third slice): invitation.ts's previewFor. */
export const INVITATION_PREVIEW = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; 200 with the InvitationPreview as invitation.ts's previewFor " +
    "makes it from the world's rows for the token's link and the caller: joined to a member of its club, " +
    "did_not_go_ahead to the account that accepted with it, expired, full, or the open revision's exact roster by " +
    "names as open, changed or waiting; the neutral NOT_FOUND for a token that names nothing to the caller: no " +
    `link, one revoked, replaced or used by another account, or a suspended club's (${GATE})`,
});

/** acceptInvitation (B1's third slice): invitation.ts's acceptOutcome. */
export const INVITATION_ACCEPT = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; then as invitation.ts's acceptOutcome says from the world's " +
    "rows: the neutral NOT_FOUND for a token that names nothing to the caller, to a member holding a link they " +
    "didn't join with and for a revision that doesn't list the link's candidate, INVITATION_EXPIRED, ROSTER_CHANGED " +
    "with the newest revision's id, VERSION_CONFLICT with the revision's version, CLUB_FULL, or 200 with the " +
    `InvitationAcceptance, changed, waiting or joined; the same bytes to a retry under its key (${GATE})`,
});

/** leaveClub (B1's fourth slice): leave.ts's leaveOutcome, leftExpected and leaveProblems. */
export const LEAVE_CLUB = Object.freeze({
  answer:
    "INVALID_REQUEST to what the contract refuses; 200 with the LeftClub, the club's id, the server's instant in " +
    "whole seconds and the caller's own choice and no other field, to an account with an active interval in a club " +
    "that isn't suspended, whose interval ends at that instant with the rows leave.ts's leaveProblems asks for; the " +
    "same bytes to its retry under the same key, though the caller is no longer a member; the neutral NOT_FOUND to " +
    `every other role the gate lets through, and to the person who left under any other key (${GATE})`,
});

/** chooseScheduleDays and confirmScheduleDays (B2's schedule slice): schedule.ts's table of bodies. */
export const SCHEDULE_COMMAND = Object.freeze({
  answer:
    "each body of schedule.ts's table answered as its outcomeOf says from the world's rows: INVALID_REQUEST to " +
    "what the contract refuses, then the neutral NOT_FOUND to anyone the proposal doesn't include, MEMBERSHIP_CHANGED, " +
    "VERSION_CONFLICT, NOT_ALLOWED, or 200 with the proposal as the viewer sees it after the change; a membership " +
    `change takes only its confirmation, of exactly the days it proposes for the caller, and moves no version (FQ81) (${GATE})`,
});

export const ROWS: Readonly<Record<string, unknown>> = {
  acceptInvitation: INVITATION_ACCEPT,
  approveRoster: ROSTER_DECISION,
  blockMember: NONE,
  chooseScheduleDays: SCHEDULE_COMMAND,
  clearReaction: NONE,
  completeUpload: NONE,
  confirmScheduleDays: SCHEDULE_COMMAND,
  createClub: CREATE_CLUB,
  createComment: NONE,
  createDrop: NONE,
  createInvitation: CREATE_INVITATION,
  createReport: NONE,
  createReservation: NONE,
  createUpload: NONE,
  declineRoster: ROSTER_DECISION,
  deleteAccount: NONE,
  deleteComment: NONE,
  deleteMyAvatar: NONE,
  getAuthorPreview: NONE,
  getClub: CLUB,
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
  getRosterRevision: ROSTER_REVISION,
  getSchedule: SCHEDULE,
  getUpload: NONE,
  hideDrop: NONE,
  leaveClub: LEAVE_CLUB,
  listBlocks: NONE,
  listClubs: CLUBS,
  listComments: NONE,
  listFavourites: NONE,
  listMembers: MEMBERS,
  listMemories: NONE,
  listMyDrops: NONE,
  previewBlock: NONE,
  previewInvitation: INVITATION_PREVIEW,
  previewInvitationWeb: INVITATION_WEB,
  proposeRoster: PROPOSE_ROSTER,
  registerDevice: NONE,
  releaseReservation: NONE,
  removeDevice: NONE,
  removeDrop: NONE,
  removeFavourite: NONE,
  resolveSource: NONE,
  revokeInvitation: REVOKE_INVITATION,
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
