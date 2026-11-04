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
    "the invitation's intent (handoff 1: invitation intent survives sign-in and retries); how an account " +
    "that no longer holds it accepts again is B1's to settle.",
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
    "`expected_roster_version`. `can_propose` is false when active members and open candidates already " +
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
    "server's stable order: the schedule's order from Monday, then members with no day yet in the order " +
    "they joined (FQ26), never a ranking (spec 09). `cover` is the colour of this member's folded cards " +
    "(FQ41). `next_day` is their next day to open, the one an Add for them targets (spec 05); `next_up` " +
    "marks the member whose day opens first.",
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
    "profile name in a revision the server made for it (FQ66). 1 to 40 grapheme clusters, with no space at " +
    "either end, no control, bidirectional-control or line-separator character, and at least one visible " +
    "character (FQ70's default).",
  name(40),
);

export const CandidateLinkState = named(
  "CandidateLinkState",
  "Where the candidate's latest link stands, for its proposer only, never for another member (handoff 1). " +
    "live: it works and hasn't been used. accepted: the candidate has accepted this revision with it " +
    "(Accepted). used: the candidate accepted an earlier revision with it and hasn't accepted this one yet, " +
    "as after a roster change or a new revision for their name (they see G02-changed; no render shows the " +
    "proposer's row yet). revoked: Link revoked, with Create new " +
    "link. expired: it expired before anyone used it (FQ71). A link used to accept can't be revoked or " +
    "replaced, since accepting isn't undone by revoking a link (handoff 4). Whether a live link is Not " +
    "shared or Shared is the app's own record of a completed share activity for that link, a copy included " +
    "(FQ67), kept with the link in its per-account store (FQ77): the server never knows which.",
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
    "says how other members decided, how many have approved, or who hasn't (book p30, T15, T33). " +
    "`proposed_by` is the member who proposed the revision; in one the server made for a name, the " +
    "candidate's proposer, whose link was used (FQ84). B1 " +
    "settles, with FQ51, how a first roster's other candidates go on once its first acceptance has started " +
    "the club (FQ54): handoff 1 says starting adds nobody merely invited, and a broader roster still needs " +
    "its approvals.",
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
    "reaches a server log (T7, T52), and the server keeps only its hash (the contract's choice, FQ77). The " +
    "app keeps the link for Share again, in its per-account store, until it's used, revoked or expired " +
    "(FQ77's default). A retry with the same key returns this same answer without `url`, as an upload's " +
    "replay does once it's complete (TECH-DESIGN section 6), and changes nothing (T19): the app then offers " +
    "Create new link, under a new key. `expires_at` is the server's setting (FQ71).",
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
  "The caller has accepted this roster and waits for the members (G03-waiting), with no progress shown.",
  z.object({ state: tag("waiting"), ...invitationRoster }),
);

export const InvitationExpired = named(
  "InvitationExpired",
  "The link expired before anyone used it (G02-expired): only who to ask for a new one.",
  z.object({ state: tag("expired"), inviter_name: DisplayName }),
);

export const InvitationFull = named(
  "InvitationFull",
  "The club already has six members (G02-full), with no club name, roster or waitlist.",
  z.object({ state: tag("full") }),
);

export const InvitationEnded = named(
  "InvitationEnded",
  "For someone who accepted, the invitation didn't go ahead (G03-declined): a member declined, or the " +
    "revision ended without them. It never says which, or who.",
  z.object({ state: tag("did_not_go_ahead") }),
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
    "revision with one that shows the account's name, and binds the token to the account (FQ66; handoff " +
    "1: a different identity goes through the roster again). The old revision is superseded and its " +
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
  "The schedule in force: each member's weekday or two (spec 05's table), from a local date in the club's " +
    "zone. Read-only in the trial: days change only through a membership change (FQ57).",
  z.object({ effective_from: LocalDate, assignments: z.array(ScheduleAssignment).min(2).max(6) }),
);

export const ScheduleSlotState = named(
  "ScheduleSlotState",
  "One weekday in an open proposal, as the caller sees it: yours (chosen by the caller), taken (confirmed " +
    "by another member, its owner, book p11, FQ78; a day only proposed to someone isn't taken, FQ48), " +
    "available, clash (the caller and one other member chose it, so neither can confirm it until one " +
    "chooses again, FQ55), or no_reveal (two other members chose it: the caller sees only that it has no " +
    "reveal scheduled, FQ46).",
  z.enum(["yours", "taken", "available", "clash", "no_reveal"]),
);

export const ScheduleSlot = named(
  "ScheduleSlot",
  'A weekday of the proposal. `owner` is the member who confirmed a taken day (book p11: "Occupied days ' +
    'identify their owner"; FQ78). `clash_with` is the other member who chose it, shown only to the two of ' +
    "them (FQ46). `first_date` is the first local date it would open. At activation an unconfirmed day's " +
    "moves to its next date as time passes; after a membership change it's fixed for the proposal's life, " +
    "and changes only with a new proposal (FQ49). `suggested` marks the spaced days proposed to the caller " +
    "(spec 05). Never Sunday.",
  z.object({
    weekday: Weekday,
    state: ScheduleSlotState,
    owner: Person.optional(),
    clash_with: Person.optional(),
    first_date: LocalDate,
    suggested: z.boolean(),
  }),
);

export const ScheduleProposal = named(
  "ScheduleProposal",
  "A proposed schedule each member confirms (spec 05; G04). At activation, each day goes ahead once its " +
    "member confirms it, while others are still choosing; a day two members chose has no reveal until one " +
    "of them chooses again, and every confirmed day goes ahead meanwhile (FQ55). After a membership change, " +
    "it starts from the first week after every occurrence already generated, so no announced day changes, " +
    "whether or not anything was added to it (spec 05, FQ61), and drops can still be added to the current " +
    "days meanwhile (FQ62). It applies once every active member has confirmed, the new one included, and " +
    "the current days continue until then, through a clash too (FQ56); if its start date passes first, a " +
    "new proposal from a later date replaces it, and everyone confirms again (FQ49). A taken day names its " +
    "owner (book p11); nothing else says who hasn't confirmed, counts them or waits on anyone (T33). Named " +
    "owners still tell each member, by elimination, who hasn't confirmed, and so who clashed when just two " +
    "others haven't (FQ78, FQ46). `my_days` are the caller's chosen weekdays, one per member in clubs of " +
    "four to six and two in clubs of two or three (spec 05's table).",
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
  "The club's week (G04, G05-schedule): the schedule in force, if any, and the open proposal, if any. The " +
    "same for every active member, except each one's own slots (T55). The schedule-proposal shapes are " +
    "settled in B2's contract PR, with these known gaps: the proposed week naming each member's suggested " +
    'day (G04-one-day, G04-change); the owner a G04 error names ("{weekday} is now {ownerName}\'s day"), ' +
    "which the app reads from the schedule it fetches again (FQ78); which answer refuses a day another member " +
    "confirmed meanwhile, apart from a changed week, or a confirmation after the start date passed (G04's " +
    "chooseTaken, confirmTaken, revision and pastStart; FQ49); how the days confirmed at activation are " +
    "returned while others still choose, since `current` holds at least two (FQ55); how the worker's rolling " +
    "generation meets a pending change's fixed start, whether it holds off generating from `effective_from` " +
    "or a new proposal replaces the old once generation reaches it (FQ49, FQ61, FQ62); whether a member in a " +
    "clash can confirm their other day in a club of two or three (FQ55); and what moves `version`, so that " +
    "nobody learns from it how others are choosing (T33).",
  z.object({
    server_now: Instant,
    club: ClubRef,
    current: CurrentSchedule.optional(),
    proposal: ScheduleProposal.optional(),
  }),
);

export const ChosenWeekdays = named(
  "ChosenWeekdays",
  "One or two weekdays, each only once: the API refuses the same weekday twice (T6).",
  z
    .array(Weekday)
    .min(1)
    .max(2)
    .refine((days) => new Set(days).size === days.length, "each weekday only once"),
);

export const ScheduleChoiceRequest = named(
  "ScheduleChoiceRequest",
  "Choose the caller's own day or days in the proposal they saw, from slots that are yours, clash (their " +
    "own clashed day, which they may keep, since nobody is asked to give way, FQ55) or available. Exactly " +
    "`days_per_member` distinct weekdays; never Sunday (T6).",
  z.strictObject({ expected_version: Version, weekdays: ChosenWeekdays }),
);

export const ScheduleConfirmRequest = named(
  "ScheduleConfirmRequest",
  'Confirm the caller\'s chosen days in the proposal they saw ("Confirm Monday"). Refused with NOT_ALLOWED ' +
    "while a chosen day clashes (FQ55).",
  z.strictObject({ expected_version: Version }),
);

export const Contributions = named(
  "Contributions",
  "What happens to the caller's drops in a club they leave: keep them in the club's days, or withdraw them " +
    "(spec 22, T26). Either way the caller loses the club and its favourites (spec 18).",
  z.enum(["keep", "withdraw"]),
);

export const LeaveClubRequest = named(
  "LeaveClubRequest",
  "Leave a club (G05-leave), choosing explicitly for the caller's drops (spec 22). No push goes to anyone " +
    "(T36). Withdrawing can't be undone. The caller's own days that haven't opened are held, neither " +
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
