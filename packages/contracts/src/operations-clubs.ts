// The club endpoints: clubs, members, roster revisions, invitations, schedules, leaving and blocking
// (spec 04, 05, 22, 32; TECH-DESIGN section 6). Anyone without an active membership in the club gets the
// neutral NOT_FOUND (T14), including a candidate who holds an invitation (spec 04, T7).
import type { Operation } from "./operation.ts";
import {
  AcceptInvitationRequest,
  BlockPreview,
  BlockRequest,
  BlockResult,
  BlockedAccounts,
  ClubDetail,
  ClubList,
  CreateClubRequest,
  CreateInvitationRequest,
  InvitationAcceptance,
  InvitationLink,
  InvitationPreview,
  InvitationTokenRequest,
  LeaveClubRequest,
  LeftClub,
  Members,
  ProposeRosterRequest,
  RevokedInvitation,
  RosterDecisionRequest,
  RosterRevision,
  Schedule,
  ScheduleChoiceRequest,
  ScheduleConfirmRequest,
  ScheduleProposal,
  WebInvitationPreview,
} from "./schemas/clubs.ts";

export const CLUB_OPERATIONS: Operation[] = [
  {
    id: "listClubs",
    method: "get",
    path: "/v1/clubs",
    summary: "The caller's clubs",
    description:
      "The switcher (G06-switcher), the empty state (G06-no-club), the club chosen at launch and the share " +
      "extension's roster cache (TECH-DESIGN section 4), with the invitations the caller has accepted.",
    ok: { status: 200, json: ClubList },
  },
  {
    id: "createClub",
    method: "post",
    path: "/v1/clubs",
    summary: "Create a club",
    description:
      "A proposed club with the creator's membership (spec 32; G01-create). It starts once someone accepts " +
      "its first roster (FQ54), or, if they're named differently, once the creator approves the revision made " +
      "for their name and they accept it (FQ84).",
    idempotent: true,
    body: CreateClubRequest,
    ok: { status: 201, json: ClubDetail },
  },
  {
    id: "getClub",
    method: "get",
    path: "/v1/clubs/{club_id}",
    summary: "Club information",
    description: "G05-club-details (spec 03, book p24).",
    ok: { status: 200, json: ClubDetail },
  },
  {
    id: "listMembers",
    method: "get",
    path: "/v1/clubs/{club_id}/members",
    summary: "The club's roster and next dates",
    description:
      "The current eligible roster and next dates (spec 32): Friends (F01), the composer's picker (C01) and " +
      "G05-members.",
    ok: { status: 200, json: Members },
  },
  {
    id: "getMemberAvatar",
    method: "get",
    path: "/v1/clubs/{club_id}/members/{membership_id}/avatar",
    summary: "A member's avatar",
    description:
      "Streamed through the API on every request, never a storage URL (T12). Only while the caller and the " +
      "member both hold active memberships in the club; anything else, a missing avatar included, is the " +
      "same NOT_FOUND (T14), and the app shows the initial.",
    ok: { status: 200, binary: "image/jpeg" },
  },
  {
    id: "proposeRoster",
    method: "post",
    path: "/v1/clubs/{club_id}/roster",
    summary: "Propose people for the club",
    description: "A new roster revision rather than direct member insertion (spec 32, T7).",
    idempotent: true,
    body: ProposeRosterRequest,
    ok: { status: 201, json: RosterRevision },
    errors: ["VERSION_CONFLICT", "CLUB_FULL"],
  },
  {
    id: "getRosterRevision",
    method: "get",
    path: "/v1/rosters/{revision_id}",
    summary: "A proposed roster",
    description: "G03-approve, and where spec 21's roster-approval push opens.",
    ok: { status: 200, json: RosterRevision },
  },
  {
    id: "approveRoster",
    method: "post",
    path: "/v1/rosters/{revision_id}/approvals",
    summary: "Approve the exact roster",
    description:
      "Accept the exact revision with a concurrency check (spec 32). Candidates who accepted join once every " +
      "member has approved (FQ65).",
    idempotent: true,
    body: RosterDecisionRequest,
    ok: { status: 200, json: RosterRevision },
    errors: ["VERSION_CONFLICT", "ROSTER_CHANGED", "CLUB_FULL"],
  },
  {
    id: "declineRoster",
    method: "post",
    path: "/v1/rosters/{revision_id}/declines",
    summary: "Decline the exact roster",
    description: "The revision ends for every candidate, who sees only that it didn't go ahead (book p30).",
    idempotent: true,
    body: RosterDecisionRequest,
    ok: { status: 200, json: RosterRevision },
    errors: ["VERSION_CONFLICT", "ROSTER_CHANGED"],
  },
  {
    id: "createInvitation",
    method: "post",
    path: "/v1/clubs/{club_id}/invitations",
    summary: "A share link for one candidate",
    description:
      "Only the member who proposed the candidate can make or revoke its link (T7 makes the link " +
      "single-use): during setup from the invitation list (G01-invite-people), which FQ51's default reaches " +
      "only then; for a later addition, such as Leila in Kitchen table (book p30), where the link is shared " +
      "and managed has no render yet. A new link replaces the candidate's earlier one, after a revoke or an " +
      "expiry (Create new link) or when the app no longer holds it (FQ77), and NOT_ALLOWED once the " +
      "candidate has accepted with it (handoff 4). Anyone but the candidate's proposer gets NOT_FOUND, " +
      "whatever the link's state, so the answer never tells another member that the candidate accepted " +
      "(T14, handoff 1). A retry with the same key returns the first answer without its `url`, and makes " +
      "nothing new (InvitationLink, T19, FQ77).",
    idempotent: true,
    body: CreateInvitationRequest,
    ok: { status: 201, json: InvitationLink },
    errors: ["NOT_ALLOWED"],
  },
  {
    id: "revokeInvitation",
    method: "delete",
    path: "/v1/invitations/{invitation_id}",
    summary: "Revoke a link",
    description:
      "The link stops working; the candidate keeps their place, and the proposer can make a new link (Link " +
      "revoked, G01-invite-people-revoked). Repeating the revoke returns the same answer. NOT_ALLOWED once " +
      "the candidate has accepted with it, in this revision or an earlier one, since accepting isn't undone " +
      "by revoking a link (handoff 4). Anyone but the candidate's proposer gets NOT_FOUND, whatever the " +
      "link's state (T14, handoff 1).",
    ok: { status: 200, json: RevokedInvitation },
    errors: ["NOT_ALLOWED"],
  },
  {
    id: "previewInvitationWeb",
    method: "post",
    path: "/v1/invitations/web-preview",
    summary: "The signed-out invitation page",
    description:
      "G02-web on tadayo.app: the inviter's name only (T7), for a live link; the app says the rest after " +
      "sign-in. An expired, revoked, replaced, used or unknown link is the same NOT_FOUND, with no name " +
      "(G02-web-revoked, FQ59). The token travels in the body (TECH-DESIGN section 1).",
    public: true,
    body: InvitationTokenRequest,
    ok: { status: 200, json: WebInvitationPreview },
  },
  {
    id: "previewInvitation",
    method: "post",
    path: "/v1/invitations/preview",
    summary: "An invitation, after sign-in",
    description:
      "G02 and G03-waiting. It grants nothing and doesn't use up the token (spec 04, T7). A revoked or " +
      "replaced link, or one another account has used, is NOT_FOUND, like an unknown one, even once past its " +
      "expiry (G02-revoked, FQ59). Only a link that expired while live is `expired`, with the inviter's name " +
      "(G02-expired, FQ71).",
    body: InvitationTokenRequest,
    ok: { status: 200, json: InvitationPreview },
    errors: ["NOT_FOUND"],
  },
  {
    id: "acceptInvitation",
    method: "post",
    path: "/v1/invitations/accept",
    summary: "Accept the exact roster",
    description:
      "The candidate accepts the revision they saw (spec 04, T7). An account named differently from the " +
      "candidate makes a new revision with its name, which everyone accepts again, that account included: " +
      "the answer is `changed` (FQ66, FQ84, AcceptInvitationRequest). Retried with the same key, it returns " +
      "the first answer, though the token is used.",
    idempotent: true,
    body: AcceptInvitationRequest,
    ok: { status: 200, json: InvitationAcceptance },
    errors: ["NOT_FOUND", "INVITATION_EXPIRED", "ROSTER_CHANGED", "CLUB_FULL"],
  },
  {
    id: "getSchedule",
    method: "get",
    path: "/v1/clubs/{club_id}/schedule",
    summary: "The club's week and any proposal",
    description: "G04 and G05-schedule (spec 05).",
    ok: { status: 200, json: Schedule },
  },
  {
    id: "chooseScheduleDays",
    method: "put",
    path: "/v1/schedule-proposals/{proposal_id}/choice",
    summary: "Choose the caller's days",
    description:
      "From slots whose state is yours, clash or available: a clashed day may be kept, and a clash is shown, " +
      "never swapped (spec 05, T6, FQ55). " +
      "MEMBERSHIP_CHANGED when a newer proposal replaced this one (`current_id`).",
    idempotent: true,
    body: ScheduleChoiceRequest,
    ok: { status: 200, json: ScheduleProposal },
    errors: ["VERSION_CONFLICT", "MEMBERSHIP_CHANGED"],
  },
  {
    id: "confirmScheduleDays",
    method: "post",
    path: "/v1/schedule-proposals/{proposal_id}/confirmation",
    summary: "Confirm the caller's days",
    description:
      "At activation, each confirmed day goes ahead, while a clashed day has no reveal until one of its two " +
      "members chooses again (FQ55). After a membership change, the proposal applies at its boundary once " +
      "every active member has confirmed, and the current days continue until then (spec 05, FQ56).",
    idempotent: true,
    body: ScheduleConfirmRequest,
    ok: { status: 200, json: ScheduleProposal },
    errors: ["NOT_ALLOWED", "VERSION_CONFLICT", "MEMBERSHIP_CHANGED"],
  },
  {
    id: "leaveClub",
    method: "post",
    path: "/v1/clubs/{club_id}/leave",
    summary: "Leave the club",
    description: "With an explicit keep or withdraw (spec 22, T26). B6 builds the withdrawal.",
    idempotent: true,
    body: LeaveClubRequest,
    ok: { status: 200, json: LeftClub },
  },
  {
    id: "previewBlock",
    method: "get",
    path: "/v1/clubs/{club_id}/members/{membership_id}/block-preview",
    summary: "Who a block names and which clubs it leaves",
    description: "S02-block's first step (D11). B6 builds blocking.",
    ok: { status: 200, json: BlockPreview },
  },
  {
    id: "blockMember",
    method: "post",
    path: "/v1/blocks",
    summary: "Block someone and leave the clubs shared with them",
    description: "Spec 22, D11, T26. The blocked person is never told (spec 21).",
    idempotent: true,
    body: BlockRequest,
    ok: { status: 201, json: BlockResult },
    errors: ["NOT_FOUND", "MEMBERSHIP_CHANGED"],
  },
  {
    id: "listBlocks",
    method: "get",
    path: "/v1/blocks",
    summary: "The caller's blocked accounts",
    description: "S02-blocked-list, in account settings (spec 23).",
    ok: { status: 200, json: BlockedAccounts },
  },
];
