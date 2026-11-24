// Clubs, rosters, invitations, schedules, leaving and blocking (spec 04, 05, 07, 22, 31; book p9 to
// p11, p24, p30, p32, p33). Membership changes only through an exact roster revision, a leave, a block or
// an account deletion (spec 04, 32; T7): no route inserts or removes another member, and nobody has an
// admin role. Nothing here is derived from drops (T15, T33): no counts, no activity, no "who hasn't".
import * as z from "zod";

import {
  ClubName,
  ClubRef,
  ClubState,
  DisplayName,
  Id,
  Instant,
  LocalDate,
  Occurrence,
  Person,
  Timezone,
  Version,
  Weekday,
  name,
} from "../common.ts";
import { named, tag, tagged } from "../registry.ts";

export const ClubSummary = named(
  "ClubSummary",
  "A club the caller is an active member of, for the switcher, the top bar and the share extension's " +
    "roster cache (book p32, TECH-DESIGN section 4). `open_day` is present only while a day is open " +
    "(reveal_at <= server_now < close_at, T5); `next_day` is the next day to open. `member_count` counts " +
    "active members only and always agrees with the roster (book p24).",
  z.object({
    id: Id,
    name: ClubName,
    timezone: Timezone,
    my_membership_id: Id,
    state: ClubState,
    member_count: z.int().min(1).max(6),
    open_day: Occurrence.optional(),
    next_day: Occurrence.optional(),
  }),
);

export const MyInvitationState = named(
  "MyInvitationState",
  "Where an invitation the caller accepted stands: waiting for the members (G03-waiting), the roster " +
    "changed and needs accepting again (G02-changed), or it didn't go ahead, which never says who declined " +
    "(G03-declined, book p30). A link used to accept can't be revoked (CandidateLinkState), so a revoke " +
    "never reaches it. Accepting a changed roster takes the link's token again, which the app keeps with " +
    "the invitation's intent (handoff 1: invitation intent survives sign-in and retries) as FQ77 keeps a " +
    "proposer's link: in its per-account store, purged at logout and at an account switch, never in a log, " +
    "a crash or breadcrumb record or analytics (handoff 4), and dropped once the invitation has joined or " +
    "ended. How an account that no longer holds it, after a logout, a reinstall or on another phone, " +
    "accepts again is B1's to settle.",
  z.enum(["waiting", "roster_changed", "did_not_go_ahead"]),
);

export const MyInvitation = named(
  "MyInvitation",
  "An invitation the caller has accepted, while it waits on the members. It carries no roster, approval " +
    "count or progress (book p30, T33).",
  z.object({ invitation_id: Id, club_name: ClubName, inviter_name: DisplayName, state: MyInvitationState }),
);

export const ClubList = named(
  "ClubList",
  "The caller's clubs (only those with an active interval; a club they left is never listed) and the " +
    "invitations they've accepted that haven't become a membership yet. Empty lists are G06-no-club.",
  z.object({
    server_now: Instant,
    clubs: z.array(ClubSummary).max(50),
    invitations: z.array(MyInvitation).max(50),
  }),
);

export const CreateClubRequest = named(
  "CreateClubRequest",
  "Create a club (G01-create): its name and the creator's device zone, fixed from then on (spec 05, " +
    "FQ19). No cover (FQ17). The creator's membership starts with it; people are proposed next.",
  z.strictObject({ name: ClubName, timezone: Timezone }),
);

export const ClubDetail = named(
  "ClubDetail",
  "Club information (G05-club-details). `roster_version` is what a proposal sends as " +
    "`expected_roster_version`: it moves when a membership starts or ends or the open revision is " +
    "proposed, made, applied or ended, never on an approval or an acceptance, so it counts neither (T33). " +
    "`can_propose` is false when active members and open candidates already " +
    "make six (A01, T6, book p24), or the club can't take proposals.",
  z.object({
    server_now: Instant,
    club: ClubSummary,
    roster_version: Version,
    can_propose: z.boolean(),
    open_revision_id: Id.optional(),
  }),
);

export const Member = named(
  "Member",
  "One active member in the Friends roster (F01) and Club information (G05-members). `position` is the " +
    "server's stable roster order, never a ranking (spec 09): in the club's first days, until the " +
    "first-days proposal has applied, every member in the order they joined, so no row moves when a member " +
    "chooses or confirms, and the order shows no proposed day (FQ98); afterwards, the schedule in force " +
    "today from Monday, a member with two days by the earlier, then anyone with no day in force in the order " +
    "they joined (FQ26). So rows move only when the first days end, when a week that a new member's " +
    "confirmation, or days freed for members with none, writes comes into force (`ScheduleProposal`, FQ130, " +
    "FQ131), and, " +
    "in a club whose first days were opened again with a week of their own, on the day that " +
    "week starts (FQ124). `cover` is the colour of this member's folded cards (FQ41). `next_day` is their next day to " +
    "open, the one an Add for them targets (spec 05), absent while they have none, as before their first " +
    "day is confirmed (T49); `next_up` marks the member whose day opens first.",
  z.object({
    person: Person,
    position: z.int().min(1).max(6),
    cover: z.int().min(1).max(6).optional(),
    next_day: Occurrence.optional(),
    next_up: z.boolean(),
  }),
);

export const CandidateLabel = named(
  "CandidateLabel",
  "The name a candidate goes by in a roster revision: the one the proposer types for them, or their own " +
    "profile name in a revision the server made for it (FQ66). 1 to 40 grapheme clusters, well formed (no " +
    "lone surrogate), with no space at either end, no control, bidirectional-control or line-separator " +
    "character, and at least one visible character (FQ70's default).",
  name(40),
);

export const CandidateLinkState = named(
  "CandidateLinkState",
  "Where the candidate's latest link stands, for its proposer only, never for another member (handoff " +
    "1). live: it works and hasn't been used. accepted: the candidate has accepted this revision with it " +
    "(Accepted). used: the candidate accepted an earlier revision with it and hasn't accepted this one " +
    "yet, as after a roster change or a new revision for their name (they see G02-changed); in the " +
    "proposer's list, the candidate's row offers Share again only while the app holds the link, and " +
    "otherwise handoff 8's two lines and no action (G01-invite-people-accept-again, InvitationLink). " +
    "revoked: Link revoked, with Create new link. expired: it expired before anyone used it (FQ71). A " +
    "link used to accept can't be revoked or replaced, since accepting isn't undone by revoking a link " +
    "(handoff 4). Whether a live link is Not shared or Shared is the app's own record of a completed " +
    "share activity for that link, a copy included (FQ67), kept with the link in its encrypted " +
    "per-account store on the device (FQ77, InvitationLink): the server never knows which.",
  z.enum(["live", "accepted", "used", "revoked", "expired"]),
);

export const CandidateInvitation = named(
  "CandidateInvitation",
  "The candidate's latest link, by its id, state and expiry, never its token, which reaches the proposer " +
    "once, when the link is made (T7, FQ77). Only for the member who proposed the candidate (the " +
    "candidate's own `proposed_by`, never the revision's), so after a relaunch they can see it, revoke it or " +
    "make a new one.",
  z.object({ id: Id, state: CandidateLinkState, expires_at: Instant }),
);

export const Candidate = named(
  "Candidate",
  "Someone proposed in a roster revision, by the one name the revision shows (`name`): the proposer's " +
    "label, or the candidate's own profile name in a revision the server made because the account that " +
    "accepted is named differently (FQ66). So a revision's names never change, and nothing in it says who " +
    "has accepted, which only the proposer's `invitation` does (handoff 1). A new revision for a name does " +
    "tell the members and the other candidates that someone accepted under it, as FQ66's default asks, so " +
    "that they approve and accept who'll join. `proposed_by` is the member who proposed this candidate " +
    '("Proposed by Ben", handoff 1), which a candidate carried into a newer revision keeps. Members see a ' +
    "candidate's initial, never their photo, before they join (G03-approve, handoff 4). `invitation` is " +
    "present only for that member, once they've made a link; for a candidate with none, their app offers " +
    "to make one.",
  z.object({
    id: Id,
    name: CandidateLabel,
    proposed_by: Person,
    invitation: CandidateInvitation.optional(),
  }),
);

export const RosterRevisionState = named(
  "RosterRevisionState",
  "open: waiting for approvals and acceptances. applied: its candidates who accepted have joined. " +
    "did_not_go_ahead: a member declined (book p30). superseded: a newer revision replaced it, one a member " +
    "proposed or one the server made for a candidate's own name (FQ66), and its approvals no longer count " +
    "(T7). A revoked or expired link ends only that link, never the revision or the candidate's place in " +
    "it: the proposer can make a new link.",
  z.enum(["open", "applied", "did_not_go_ahead", "superseded"]),
);

export const RosterDecision = named(
  "RosterDecision",
  "The caller's own decision on a revision. Proposing counts as the proposer's approval (FQ60), except in " +
    "a revision the server made for a candidate's own name, where nobody has approved that name yet and " +
    "the proposer is asked like every other member (FQ84).",
  z.enum(["pending", "approved", "declined"]),
);

export const RosterRevision = named(
  "RosterRevision",
  "An exact proposed roster (G03-approve, G05-members): the active members and the candidates, which " +
    "every active member approves and each candidate accepts, in either order (spec 04, FQ65). It never " +
    "says how other members decided, how many have approved, or who hasn't (book p30, T15, T33): its " +
    "`version` moves only when its own `state` does, never on an approval or an acceptance, and " +
    "`expected_version` on approving, declining and accepting checks only that. " +
    "`proposed_by` is the member who proposed the revision; in one the server made for a name, the " +
    "candidate's proposer, whose link was used (FQ84). B1 " +
    "settles, with FQ51, how a first roster's other candidates go on once it has started (FQ54, FQ84), the " +
    "account a revision was made for included, when another candidate's acceptance started it: handoff 1 " +
    "says starting adds nobody merely invited, and a broader roster still needs its approvals.",
  z.object({
    id: Id,
    version: Version,
    club: ClubRef,
    state: RosterRevisionState,
    proposed_by: Person,
    members: z.array(Person).min(1).max(6),
    candidates: z.array(Candidate).min(1).max(5),
    my_decision: RosterDecision,
    superseded_by: Id.optional(),
  }),
);

export const Members = named(
  "Members",
  "The club's current eligible roster with each member's next day (spec 32), and the open roster " +
    "revision if there is one. Every active member gets the same list (T55): nothing in it comes from drops.",
  z.object({
    server_now: Instant,
    club: ClubRef,
    members: z.array(Member).min(1).max(6),
    open_revision: RosterRevision.optional(),
  }),
);

export const ProposeRosterRequest = named(
  "ProposeRosterRequest",
  "Propose people (G01-invite-people during setup, the only time FQ51's default reaches that list, and " +
    "later additions such as Leila in Kitchen table, book p30): a " +
    "new revision of the exact roster, never a direct insertion (spec 32). It replaces any open revision: " +
    "its candidates carry over and accept again, and its approvals no longer count (spec 04, T7). Active " +
    "members, open candidates and these together are at most six (CLUB_FULL).",
  z.strictObject({
    expected_roster_version: Version,
    add: z
      .array(z.strictObject({ label: CandidateLabel }))
      .min(1)
      .max(5),
  }),
);

export const RosterDecisionRequest = named(
  "RosterDecisionRequest",
  "Approve or decline the exact revision the member saw (spec 32: a concurrency check). One decline ends " +
    "it for every candidate, and nobody is told who declined (book p30).",
  z.strictObject({ expected_version: Version }),
);

export const CreateInvitationRequest = named(
  "CreateInvitationRequest",
  "A share link for one candidate the caller proposed (G01-invite-people; spec 04: a system share link, " +
    "never contacts). A new link for the same candidate (Create new link) replaces the earlier one, which " +
    "stops working, unless the candidate has accepted with it (NOT_ALLOWED, handoff 4).",
  z.strictObject({ candidate_id: Id }),
);

export const InvitationLink = named(
  "InvitationLink",
  "The link to share, returned to its proposer once: the token rides in the URL's fragment, so it never " +
    "reaches a server log (T7, T52), and the server keeps only its hash (the contract's choice, FQ77). " +
    "The app keeps the link in an encrypted per-account store on the device (handoff 8), never in a URL " +
    "it builds, a log, a crash or breadcrumb record, analytics or a snapshot (T52). Each successful " +
    "`listMembers` answer it requested after storing the link decides: the app keeps the link while that " +
    "answer's `open_revision` lists a candidate whose `id` is the link's `candidate_id` and whose " +
    "`invitation.id` is its `invitation_id`, in the state live, accepted or used (CandidateLinkState), " +
    "and purges it otherwise: the candidate joined, their proposal ended, or the link was revoked, " +
    "expired or replaced by a newer one. A NOT_FOUND from `listMembers`, or the club gone from " +
    "`listClubs`, purges it too; a failed or offline read changes nothing. It also purges the link at " +
    "logout and at an account switch (FQ77, ADR-037). A live row shares that copy with Share link, or " +
    "Share again once it reads Shared (FQ67), and a used row with Share again; an accepted row offers " +
    "neither Share again nor Revoke link (handoff 8). A retry with the same key returns this same answer " +
    "without `url`, as an upload's replay does once it's complete (TECH-DESIGN section 6), and changes " +
    "nothing (T19). Where the app doesn't hold a live link, it offers Create new link, under a new key; a " +
    "link the candidate has accepted with (accepted or used) the server neither replaces nor revokes, so " +
    "it offers none. `expires_at` is the server's setting (FQ71).",
  z.object({
    invitation_id: Id,
    candidate_id: Id,
    url: z
      .url({ protocol: /^https$/, hostname: /^tadayo\.app$/ })
      .max(512)
      .regex(/^https:\/\/tadayo\.app\/i#[A-Za-z0-9_-]{43,128}$/)
      .optional(),
    expires_at: Instant,
  }),
);

export const InvitationToken = named(
  "InvitationToken",
  "An invitation's single-use token, read from the link's fragment and sent only in a request body, never " +
    "in a path, a query or a log (T7, T52). Base64url, 43 to 128 characters.",
  z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
);

export const InvitationTokenRequest = named(
  "InvitationTokenRequest",
  "An invitation's token, in the body.",
  z.strictObject({ token: InvitationToken }),
);

export const WebInvitationPreview = named(
  "WebInvitationPreview",
  "The signed-out invitation page on tadayo.app (G02-web): the inviter's name and nothing else, for a live " +
    "link only (T7). A token that is expired, revoked, replaced, used or unknown is the same NOT_FOUND, " +
    "with no name (G02-web-revoked, FQ59); the app explains an expiry after sign-in (G02-expired).",
  z.object({ inviter_name: DisplayName }),
);

export const InvitationRosterEntry = named(
  "InvitationRosterEntry",
  "One name on the roster an invitation proposes: an active member's profile name, another candidate's " +
    "name as the revision shows it (FQ66), or the caller themself once as You. Names only, never a photo " +
    "before joining (FQ47, T7).",
  z.object({ name: DisplayName, kind: z.enum(["member", "candidate"]), is_you: z.boolean() }),
);

const invitationRoster = {
  invitation_id: Id,
  inviter_name: DisplayName,
  club_name: ClubName,
  revision_id: Id,
  revision_version: Version,
  roster: z.array(InvitationRosterEntry).min(2).max(6),
};

export const InvitationOpen = named(
  "InvitationOpen",
  "The invitation landing after sign-in (G02-invitation): the inviter, the club and the exact roster to " +
    "accept (spec 04). It grants nothing: no captions, photos, dates, schedule, state or progress (T7, Q05).",
  z.object({ state: tag("open"), ...invitationRoster, expires_at: Instant }),
);

export const InvitationChanged = named(
  "InvitationChanged",
  "The caller accepted an earlier roster, and a newer one replaced it: review and accept again (G02-changed).",
  z.object({ state: tag("changed"), ...invitationRoster, expires_at: Instant }),
);

export const InvitationWaiting = named(
  "InvitationWaiting",
  "The caller has accepted this roster and waits for the members (G03-waiting), with no progress shown: " +
    "`revision_version` moves only with the revision's own state (RosterRevision).",
  z.object({ state: tag("waiting"), ...invitationRoster }),
);

export const InvitationExpired = named(
  "InvitationExpired",
  "The link expired before anyone used it (G02-expired): only who to ask for a new one.",
  z.object({ state: tag("expired"), inviter_name: DisplayName }),
);

export const InvitationFull = named(
  "InvitationFull",
  "The club already has six members (G02-full): only who to ask should a place open, with no club name, " +
    "roster or waitlist. The inviter's name is the one the open roster would show (FQ75).",
  z.object({ state: tag("full"), inviter_name: DisplayName }),
);

export const InvitationEnded = named(
  "InvitationEnded",
  "For someone who accepted, the invitation didn't go ahead (G03-declined): a member declined, or the " +
    "revision ended without them. It never says which, or who; it names only the inviter, by the name " +
    "`listClubs` shows for the same invitation (FQ75), and says nothing of whether they are still a member: one " +
    "who left is named as the club last knew them (FQ137). An inviter with no name to show leaves nothing to " +
    "say: NOT_FOUND, as `listClubs` lists no such invitation.",
  z.object({ state: tag("did_not_go_ahead"), inviter_name: DisplayName }),
);

export const InvitationJoined = named(
  "InvitationJoined",
  "The caller is already a member of this club: the app opens it. The token isn't used up.",
  z.object({ state: tag("joined"), club: ClubRef }),
);

export const InvitationPreview = tagged(
  "InvitationPreview",
  "What an invitation shows the signed-in person holding it (spec 04, T7). Previewing never uses up the " +
    "token. A token that's unknown, revoked, replaced by a newer link, or used by another account is " +
    "NOT_FOUND, even once past its expiry (FQ59, T14): only a link that expired while still live is expired.",
  "state",
  [
    InvitationOpen,
    InvitationChanged,
    InvitationWaiting,
    InvitationExpired,
    InvitationFull,
    InvitationEnded,
    InvitationJoined,
  ],
);

export const AcceptInvitationRequest = named(
  "AcceptInvitationRequest",
  "Accept the exact roster the caller saw. The token binds to the first account that accepts; that account " +
    "can accept again after the roster changes, and every other account gets NOT_FOUND (T7). If the " +
    "account's profile name isn't the name the revision shows for its candidate, the server replaces the " +
    "revision with one that shows the account's name, and binds the token to the account (FQ66, after " +
    "handoff 1's \"If the accepting identity differs from the reviewed candidate, require the roster " +
    'process again"). The server compares names only, so a matching name proves nothing: someone holding a ' +
    "forwarded link who gives the candidate's name accepts as the candidate, and the single-use link and " +
    "the members' approval of the exact roster are what T7 relies on (FQ84). The old revision is " +
    "superseded and its " +
    "approvals and acceptances no longer count: everyone accepts the new one again (FQ66's default), " +
    "every active member approving it, the proposer included, since nobody has approved that name (FQ84), " +
    "and every candidate accepting it, this account too, which then sees itself under its own name.",
  z.strictObject({ token: InvitationToken, revision_id: Id, expected_version: Version }),
);

export const InvitationAcceptance = named(
  "InvitationAcceptance",
  "joined: the membership started, a new interval that inherits nothing earlier (T8, Q06). waiting: the " +
    "members haven't all approved yet (G03-waiting). changed: the account's profile name isn't the one the " +
    "revision showed, so the server made a new revision with it (FQ66): the app previews the token again " +
    "and the account reviews and accepts that revision (G02-changed).",
  z.object({ invitation_id: Id, state: z.enum(["joined", "waiting", "changed"]), club: ClubRef.optional() }),
);

export const RevokedInvitation = named(
  "RevokedInvitation",
  "The link no longer works. Only the link ends: the candidate keeps their place in the revision, and the " +
    "proposer can make a new link (Link revoked, Create new link). Anyone holding it gets the same " +
    "NOT_FOUND as for an unknown link (FQ59).",
  z.object({ invitation_id: Id, state: tag("revoked") }),
);

export const ScheduleAssignment = named(
  "ScheduleAssignment",
  "One weekday and whose day it is.",
  z.object({ weekday: Weekday, person: Person }),
);

export const CurrentSchedule = named(
  "CurrentSchedule",
  "The schedule in force today: each member's weekday or two (spec 05's table), from a local date in the " +
    "club's zone. It holds only the days of members still in the club: a member who leaves is in it no " +
    "more, since their days that haven't opened won't (FQ63), though one already open when they leave " +
    "stays open, under their name, until it closes (FQ132); it is absent when nobody's day is left. It can " +
    "trail the club's latest week by a day or more: a week that a confirmation or freed days write starts " +
    "on the club's local date that day, or the day after the latest week's start when that is today or " +
    "later, so a member's just-confirmed days may be in neither this nor the proposal until it starts, and " +
    "a membership change's taken days follow the latest week (`ScheduleProposal`). In the club's first " +
    "days it holds the days confirmed so far, from the club's first local date, and each first opens on " +
    "its own date (`ScheduleSlot.first_date`; FQ55, FQ79). In a club whose first days were opened again " +
    "with a week of their own (`ScheduleProposal`; FQ102, FQ123), it stays the earlier week, with none " +
    "confirmed since, until the new week starts; from that start it holds the days confirmed in the new " +
    "week, from the new week's start, and is absent while there are none (FQ124). Members change it only " +
    "by confirming their first days (FQ57), by leaving, or, once those have applied, by a new member's " +
    "confirmation or a join, or late joiner, that leaves too few days free for the members with none, as " +
    "when a fourth member joins three who hold all six, each of which writes a new week at once " +
    "(`ScheduleProposal`; FQ130, FQ131): " +
    "from its start, a new member's days show in it, each first opening in the week after the " +
    "confirmation, and freed days leave it, though their days this week still open.",
  z.object({ effective_from: LocalDate, assignments: z.array(ScheduleAssignment).min(1).max(6) }),
);

export const ScheduleSlotState = named(
  "ScheduleSlotState",
  "One weekday of an open proposal, as the caller sees it. In the club's first days: yours (the caller " +
    "holds it and nobody else does, or the caller has confirmed it); taken (another member has confirmed " +
    "it, its owner: book p11, FQ78; a day only proposed or chosen isn't taken, FQ48); available (nobody has " +
    "confirmed it, and at most one other member holds it); clash (the caller and one or more other members " +
    "hold it, so none of them can confirm it until all but one have chosen another day, FQ55); or no_reveal " +
    "(two or more other members hold it and the caller doesn't: Contested and No reveal scheduled, with no " +
    "names and no count, FQ46; a caller still choosing may choose it, and then holds it too, FQ48). In a " +
    "membership change, a new member's days, the same, where a day of the club's latest week whose member " +
    "is still in the club is taken by its member and only the free days can be anyone's choice (FQ125, " +
    "FQ127).",
  z.enum(["yours", "taken", "available", "clash", "no_reveal"]),
);

export const ScheduleSlot = named(
  "ScheduleSlot",
  "A weekday of the proposal; never Sunday. `owner` is the member who confirmed a taken day (book p11: " +
    '"Occupied days identify their owner"; FQ78). `holders` are, on a clash only, every member who holds ' +
    "the day, the caller included, in the club's roster order (`Member.position`), a member holding it only " +
    "by proposal too; only they see any name on it (FQ46). `held_by` is, on an available day only and never " +
    "the caller, the one other member who holds it: in the club's first days only for a caller still " +
    "choosing, for the day picker (G04), since the club's week and a confirmed member's view name nobody on " +
    "a day nobody has confirmed (FQ48), and so in a membership change too. It doesn't say whether that " +
    "member chose the day or holds it by proposal. `first_date` is the first local date of a day confirmed in the first days: the first of " +
    "its dates whose 7 AM in the club's zone is at least 24 elapsed hours after the confirmation (FQ79), and " +
    "never before the proposal's `effective_from`, which is later than the confirmation only in first days " +
    "opened again with a week of their own (FQ124). It " +
    "is absent on any other day, which has no date yet (T49), on a day whose owner has left, which won't " +
    "open (FQ63, FQ102), and in a membership change on any day but the caller's own confirmed one, whose " +
    "first date is FQ130's. `suggested` marks " +
    "the days proposed for the caller (spec 05), and stays on one they set aside, which only they see so " +
    "(FQ48).",
  z.object({
    weekday: Weekday,
    state: ScheduleSlotState,
    owner: Person.optional(),
    holders: z.array(Person).min(2).max(6).optional(),
    held_by: Person.optional(),
    first_date: LocalDate.optional(),
    suggested: z.boolean(),
  }),
);

export const ScheduleProposal = named(
  "ScheduleProposal",
  "A proposed schedule each member confirms (spec 05; G04). The club's first days (`activation`): a member " +
    "holds the days proposed for them until they first choose, then exactly what they last chose (FQ48). " +
    "A revision of the first days (a join, or a leave, before any day is confirmed) proposes the week again " +
    "for the new roster: where `days_per_member` stays, every member keeps what they hold, a leaver's days " +
    "are freed and a new member holds the days it proposes for them, which nobody holds, so nobody is " +
    "moved (FQ55); where it changes (between three and four members), every member holds the days it " +
    "proposes for them until they choose again (FQ102). Each day goes ahead as its member confirms it, " +
    "while others still choose; a day two or more members hold has no reveal until all but one have chosen " +
    "another, and every confirmed day goes ahead meanwhile (FQ55). A member whose membership ends holds " +
    "nothing; once a day is confirmed a leave revises nothing: a day the leaver confirmed stays taken by " +
    "them, with no `first_date` and its announced days held (FQ63); once the first days have applied, the " +
    "members with no day pick free days in a membership change (FQ102, FQ131), a late joiner's too " +
    "(FQ100). The " +
    "proposal applies when every member it includes who is still active has confirmed their days, on the " +
    "last confirmation or on a leave that leaves only such members, and no date passing replaces it; a " +
    "leave that leaves one member who hasn't confirmed supersedes it with no successor, the club paused " +
    "(FQ16, FQ102), and so does a leave after which nobody it includes is still a member (FQ123). New first " +
    "days then open, replacing nothing: on the join that brings a paused club back to two members (FQ102), " +
    "or at once for two or more members who remain (FQ123). The ended proposal's id never answers " +
    "MEMBERSHIP_CHANGED, since no newer proposal replaced it: it answers VERSION_CONFLICT, then NOT_ALLOWED, " +
    "to a member it includes, and NOT_FOUND once nobody it includes is a member, and the app reads the " +
    "schedule again. A first-days proposal's `effective_from` is the start of the week its confirmed days " +
    "join, not the date any day first opens. The first time, it is the club's first local date. First days " +
    "opened again use the club's latest week and its start when no day was confirmed in it; when one was, by " +
    "a member who has left since, they get a week of their own, which starts on the latest of the local " +
    "date the new first days are opened, the day after the last day already made, if any, and the day after " +
    "the earlier week's start, on any weekday (FQ124). " +
    "A membership change " +
    "(`membership_change`): a new member's days. Once a club's first days have applied, the club's members " +
    "with no day in its latest week (someone who joined since, or a late joiner of the first days, FQ100) " +
    "pick from the free days, and nobody else is asked anything: every member already in the week keeps " +
    "exactly their days, through any join or leave (FQ125, FQ126, FQ131), but where the free days can't " +
    "give each member with no day spec 05's number for the club's size, as when a fourth member joins three " +
    "who hold all six days: then a day is freed now. Each member already in the week keeps their first day " +
    "from Monday; their other days leave it, in a new week written at once (from the " +
    "same start as a confirmation's, below), and their days on those weekdays announced from the next Monday " +
    "on are cancelled: they open for nobody, and what was added for them stays hidden with its authors " +
    "(the founder's answer on three to four members; FQ63, FQ131). A club has one; it includes only " +
    "those members: a member who joins while it is open is added to it, one who leaves drops out, and it " +
    "ends with no successor when nobody it includes is still a member or the club is paused (FQ16). When a " +
    "join or a leave changes the days each, a new one takes its place for the members then without a day, " +
    "each holding first the free days they held in the earlier one, up to the new number from Monday, the " +
    "earlier joiner's where two held one (FQ125, FQ126), and the " +
    "earlier one's id answers MEMBERSHIP_CHANGED with the new one's to a member the new one includes; to " +
    "anyone else it answers as any ended proposal does (FQ126). A day " +
    "of the club's latest week whose member is still in the club is taken by its member, though that week " +
    "can start after today, so `current` may not show it yet (`CurrentSchedule`); a free day, one no " +
    "active member has in the latest week, " +
    "is available, or held or contested by the members it includes as in the first days (FQ48, FQ55). Each " +
    "holds spec 05's number of days for the club's size (`days_per_member`, FQ131), chooses and confirms as " +
    "in the first days, and each confirmed day goes ahead at once: the caller's from its first date, that " +
    "weekday in the week after the confirmation, the first such date whose 7 AM is at least 24 elapsed " +
    "hours after it (FQ79, FQ130). The confirmation writes a new week at once, holding every day of the " +
    "latest week whose member is still in the club, as it was, and the caller's: it starts on the club's " +
    "local date of the confirmation, or the day after the latest week's start when that is today or later, " +
    "so a week is never rewritten. A day of a member who left, on " +
    "the caller's weekday from the caller's first date on, is cancelled: it opens for nobody, and what was added for it stays " +
    "hidden with its authors (FQ63, FQ129). Nothing waits for a start, and the days' generation goes on " +
    "(FQ127). It applies when every member it includes who is still active has confirmed. Its " +
    "`effective_from` is the club's local date it opened on. `version` moves only with `state` or a new " +
    "revision of the proposed week (in the first days, a join or a leave before any day is confirmed, FQ102), " +
    "never on a choice, never on a member added to a membership change, and never on a " +
    "confirmation or a leave that leaves `state` as it was: the first days' last confirmation, or a leave " +
    "that leaves only confirmed members, applies them, which moves `state` and `version` and tells nobody " +
    "anything, since every day then has a date (T33). A " +
    "taken day names its owner (book p11), and the day picker names who holds a day nobody has confirmed " +
    "(FQ48); nothing counts anyone or waits on them (T33). `my_days` are the weekdays the caller holds: in " +
    "the first days none to `days_per_member` (spec 05's table for the roster the first days were last " +
    "proposed for: one for four to six members, two for two or three; it stays through a leave or a late " +
    "join once a day is confirmed, FQ100, FQ102); in a membership change, likewise none to `days_per_member`.",
  z.object({
    id: Id,
    version: Version,
    reason: z.enum(["activation", "membership_change"]),
    effective_from: LocalDate,
    days_per_member: z.int().min(1).max(2),
    slots: z.array(ScheduleSlot).length(6),
    my_days: z.array(Weekday).max(2),
    my_state: z.enum(["choosing", "confirmed"]),
    state: z.enum(["open", "applied", "superseded"]),
  }),
);

export const Schedule = named(
  "Schedule",
  "The club's week (G04, G05-schedule): the schedule in force today, if any, and the open proposal that " +
    "includes the caller, if any. What each viewer gets (T55): a member choosing in the club's first days, " +
    "`current` (the days confirmed so far; in first days opened again with a week of their own, the earlier " +
    "week until the new one starts, so a member's own confirmed days show only in the proposal, and, once " +
    "those first days have applied, nowhere until that start: FQ124) and every slot's state, with `owner` and `first_date` on a taken " +
    "day, `holders` on a day they hold with others, and `held_by` on a day one other member holds; a member " +
    "who has confirmed in the first days, the same with `first_date` on their own days and no `held_by`; a " +
    "member a membership change includes, a new member, `current` and the change, the days of the club's " +
    "latest week taken by their members with no `first_date` (`current` can trail that week by a day or " +
    "more: `CurrentSchedule`), a free day with `holders` and `held_by` as in the " +
    "first days, and `first_date` only on the caller's own confirmed days; every member already in the week, `current` alone, " +
    "since nobody else is asked anything (FQ126); a member the " +
    "open proposal doesn't include, one who joined after the first days' first confirmation and gets a day " +
    "only once they have applied (FQ100), `current` alone, so a contested day shows to them as an unused " +
    "one, not as Contested (FQ46, FQ100); anyone without an active membership, NOT_FOUND (T14).",
  z.object({
    server_now: Instant,
    club: ClubRef,
    current: CurrentSchedule.optional(),
    proposal: ScheduleProposal.optional(),
  }),
);

export const ChosenWeekdays = named(
  "ChosenWeekdays",
  "None, one or two weekdays, each only once: the API refuses the same weekday twice (T6). A choice of " +
    "none is kept, since a two-day picker removes a choice on a tap, the last one too (handoff 6).",
  z
    .array(Weekday)
    .max(2)
    .refine((days) => new Set(days).size === days.length, "each weekday only once"),
);

export const ConfirmedWeekdays = named(
  "ConfirmedWeekdays",
  "One or two weekdays, each only once (T6): the days the caller saw as theirs and confirms.",
  z
    .array(Weekday)
    .min(1)
    .max(2)
    .refine((days) => new Set(days).size === days.length, "each weekday only once"),
);

export const ScheduleChoiceRequest = named(
  "ScheduleChoiceRequest",
  "Choose the caller's days in the club's first days or a membership change, before they confirm, in the " +
    "proposal they saw: the " +
    "weekdays they hold from now on, replacing what they held, none to `days_per_member`, from slots that " +
    "are yours, clash (a contested day they may keep, since nobody is asked to give way, FQ55), no_reveal " +
    "(joining a contested day, FQ46, FQ48) or available (which another member's hold makes contested); " +
    "never a taken day, a day of the club's latest week in a membership change, never Sunday (T6). A " +
    "proposed " +
    "day the caller sets aside is free (FQ48).",
  z.strictObject({ expected_version: Version, weekdays: ChosenWeekdays }),
);

export const ScheduleConfirmRequest = named(
  "ScheduleConfirmRequest",
  'Confirm the caller\'s days in the proposal they saw ("Confirm Monday", "Confirm two days"), naming ' +
    "them, so a confirmation never confirms days the caller didn't see. Refused with NOT_ALLOWED unless " +
    "`weekdays` are exactly the days the caller holds, `days_per_member` of them (book p11), and none is " +
    "held by another member too (FQ55): in a club of two or three, a member whose one day is contested " +
    "confirms neither until the contest ends (FQ99). The same in a membership change, where each day is the " +
    "caller's from its first date (FQ130).",
  z.strictObject({ expected_version: Version, weekdays: ConfirmedWeekdays }),
);

export const Contributions = named(
  "Contributions",
  "What happens to the caller's drops in a club they leave: keep them in the club's days, or withdraw them " +
    "(spec 22, T26). Either way the caller loses the club and its favourites (spec 18).",
  z.enum(["keep", "withdraw"]),
);

export const LeaveClubRequest = named(
  "LeaveClubRequest",
  "Leave a club (G05-leave), choosing explicitly for the caller's drops (spec 22). Leaving pushes to nobody " +
    "(T36: spec 21 has no such event); a drop withdrawn by it is an authored withdrawal, whose notice to its " +
    "day's star (spec 21) comes with the notifications, in B8. Withdrawing can't be undone. The caller's own " +
    "days that haven't opened are held, neither " +
    "opened nor deleted, and the drops added for them stay hidden, with their authors (FQ63); a held day " +
    "gets its shape with leaving, in B6.",
  z.strictObject({ contributions: Contributions }),
);

export const LeftClub = named(
  "LeftClub",
  "The caller's membership interval has ended, and their days that haven't opened are held (FQ63).",
  z.object({ club_id: Id, left_at: Instant, contributions: Contributions }),
);

export const BlockPreview = named(
  "BlockPreview",
  "Block's first step (S02-block, D11): the person and the clubs the caller shares with them, which a " +
    "block leaves. Nothing about the person's other clubs, and no counts.",
  z.object({ name: DisplayName, shared_clubs: z.array(ClubRef).min(1).max(50) }),
);

export const BlockRequest = named(
  "BlockRequest",
  "Block someone through their membership in a club the caller shares with them, and leave every shared " +
    "club (spec 22, D11): drops not yet revealed there are withdrawn, and earlier ones kept or withdrawn as " +
    "chosen. `expected_club_ids` is the list the caller was shown; if it changed, MEMBERSHIP_CHANGED. The " +
    "caller's own days there that haven't opened are held, as when leaving (FQ63). The blocked person is " +
    "never told (spec 21).",
  z.strictObject({
    membership_id: Id,
    expected_club_ids: z.array(Id).min(1).max(50),
    past_contributions: Contributions,
  }),
);

export const BlockedAccount = named(
  "BlockedAccount",
  "Someone the caller has blocked, by the name they had when the block took effect, which left every club " +
    "the two shared, so a later change of name doesn't reach the caller (S02-blocked-list, FQ75). There is " +
    "no unblock in the trial (FQ72).",
  z.object({ block_id: Id, name: DisplayName }),
);

export const BlockedAccounts = named(
  "BlockedAccounts",
  "The caller's own blocks, newest first.",
  z.object({ items: z.array(BlockedAccount).max(200) }),
);

export const BlockResult = named(
  "BlockResult",
  "The block is recorded and the caller has left these clubs.",
  z.object({ block_id: Id, left_club_ids: z.array(Id).min(1).max(50), past_contributions: Contributions }),
);
