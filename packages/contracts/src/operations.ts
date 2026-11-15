// Every endpoint of the v1 API: spec 32's table and TECH-DESIGN section 6's additions. Paths keep
// spec 32's shapes, with each `{id}` named for what it identifies.
import * as z from "zod";

import { Cursor, Id, PageQuery } from "./common.ts";
import type { Operation } from "./operation.ts";
import {
  AccountDeletion,
  ClientEventBatch,
  ClubNotificationPreferences,
  ClubNotificationPreferencesRequest,
  Config,
  DeleteAccountRequest,
  DeviceRegistration,
  Me,
  NotificationPreferences,
  NotificationPreferencesRequest,
  OwnContributionPage,
  RegisterDeviceRequest,
  RemoveDeviceRequest,
  UpdateMeRequest,
} from "./schemas/account.ts";
import {
  CommentPage,
  CommentReceipt,
  CreateCommentRequest,
  CreateReportRequest,
  FavouritePage,
  FavouriteState,
  HiddenDrop,
  MemoryPage,
  MemorySearchPage,
  ReactionState,
  RemovalReason,
  RemovedDrop,
  ReportReceipt,
  SearchMemoriesRequest,
  SetReactionRequest,
  ThreadNotifications,
  ThreadNotificationsRequest,
  UpdateCommentRequest,
} from "./schemas/after.ts";
import {
  CreateDropRequest,
  CreateReservationRequest,
  CreateUploadRequest,
  DropReceipt,
  DropVersion,
  ReleasedReservation,
  Reservation,
  ResolveSourceRequest,
  SetHighlightRequest,
  Source,
  UpdateDropRequest,
  Upload,
  UploadStatus,
} from "./schemas/contributing.ts";
import { Day, DropDetail, Embed, ExternalVideoPreview, Home, HighlightPointer, OwnDay } from "./schemas/days.ts";
import { CLUB_OPERATIONS } from "./operations-clubs.ts";

const ACCOUNT: Operation[] = [
  {
    id: "getMe",
    method: "get",
    path: "/v1/me",
    summary: "The caller's account",
    description: "The signed-in account (spec 23). Sign-in itself is Supabase's, with an email code (FQ12, T53).",
    beforeProfile: true,
    ok: { status: 200, json: Me },
  },
  {
    id: "updateMe",
    method: "patch",
    path: "/v1/me",
    summary: "Change the caller's name or avatar, or confirm their age",
    description: "Profile and the one age confirmation (spec 23, FQ13).",
    beforeProfile: true,
    idempotent: true,
    body: UpdateMeRequest,
    ok: { status: 200, json: Me },
    errors: ["NOT_FOUND", "MEDIA_NOT_READY", "VERSION_CONFLICT"],
  },
  {
    id: "deleteMyAvatar",
    method: "delete",
    path: "/v1/me/avatar",
    summary: "Remove the caller's avatar",
    description: "Back to the initial (spec 23).",
    beforeProfile: true,
    ok: { status: 200, json: Me },
  },
  {
    id: "getMyAvatar",
    method: "get",
    path: "/v1/me/avatar",
    summary: "The caller's own avatar",
    description: "Streamed, never a storage URL (T12); NOT_FOUND when there's none.",
    beforeProfile: true,
    ok: { status: 200, binary: "image/jpeg" },
    errors: ["NOT_FOUND"],
  },
  {
    id: "listMyDrops",
    method: "get",
    path: "/v1/me/drops",
    summary: "The caller's own drops, in every club",
    description: "The authored-contributions route, for later withdrawal without browsing a club again (spec 22, 23).",
    query: PageQuery,
    ok: { status: 200, json: OwnContributionPage },
  },
  {
    id: "deleteAccount",
    method: "post",
    path: "/v1/account/delete",
    summary: "Delete the account",
    description: "Revoke access, then remove authored content everywhere through durable jobs (spec 23, T27).",
    beforeProfile: true,
    idempotent: true,
    body: DeleteAccountRequest,
    ok: { status: 202, json: AccountDeletion },
  },
  {
    id: "registerDevice",
    method: "put",
    path: "/v1/devices/current",
    summary: "Register this sign-in's device for pushes",
    description:
      "One registration per sign-in, replaced by each new token (TECH-DESIGN section 6), once the profile is " +
      "complete: an account stopped at the age step keeps no device (FQ69). B8 finishes the mechanism in its " +
      "own contract PR, with its privacy and security review.",
    body: RegisterDeviceRequest,
    ok: { status: 200, json: DeviceRegistration },
  },
  {
    id: "removeDevice",
    method: "post",
    path: "/v1/device-removals",
    summary: "Remove a logged-out sign-in's device registration",
    description:
      "Authorized by the sign-in's removal secret alone (TECH-DESIGN section 6 (a) to (e)). The neutral " +
      "NOT_FOUND also ends a removal: one already done, or a token that moved to a later sign-in.",
    public: true,
    body: RemoveDeviceRequest,
    ok: { status: 204 },
  },
  {
    id: "getConfig",
    method: "get",
    path: "/v1/config",
    summary: "The provider switches",
    description: "TECH-DESIGN section 6; T60.",
    beforeProfile: true,
    ok: { status: 200, json: Config },
  },
  {
    id: "sendEvents",
    method: "post",
    path: "/v1/events",
    summary: "Send the app's analytics events",
    description:
      "Only spec 36's client-side events, pseudonymous, with no content (T51), and only once the profile is " +
      "complete: nothing is recorded of an account stopped at the age step (FQ69).",
    body: ClientEventBatch,
    ok: { status: 204 },
  },
  {
    id: "getNotificationPreferences",
    method: "get",
    path: "/v1/me/notification-preferences",
    summary: "The account's notification switches",
    description: "S03-notifications (spec 21).",
    ok: { status: 200, json: NotificationPreferences },
  },
  {
    id: "setNotificationPreferences",
    method: "put",
    path: "/v1/me/notification-preferences",
    summary: "Set the account's notification switches",
    description: "S03-notifications (spec 21).",
    idempotent: true,
    body: NotificationPreferencesRequest,
    ok: { status: 200, json: NotificationPreferences },
    errors: ["VERSION_CONFLICT"],
  },
  {
    id: "getClubNotificationPreferences",
    method: "get",
    path: "/v1/clubs/{club_id}/notification-preferences",
    summary: "A club's notification switches",
    description: "G05-notifications (spec 21).",
    ok: { status: 200, json: ClubNotificationPreferences },
  },
  {
    id: "setClubNotificationPreferences",
    method: "put",
    path: "/v1/clubs/{club_id}/notification-preferences",
    summary: "Set a club's notification switches",
    description: "G05-notifications (spec 21).",
    idempotent: true,
    body: ClubNotificationPreferencesRequest,
    ok: { status: 200, json: ClubNotificationPreferences },
    errors: ["VERSION_CONFLICT"],
  },
];

const DAYS: Operation[] = [
  {
    id: "getHome",
    method: "get",
    path: "/v1/clubs/{club_id}/home",
    summary: "Home for a club",
    description:
      "server_now, the open day or the next one with its countdown, and the viewer-filtered day (spec 08, 32; " +
      "T1, T5). It records nothing: no opened, seen or visited mark (T34).",
    ok: { status: 200, json: Home },
  },
  {
    id: "getOccurrence",
    method: "get",
    path: "/v1/occurrences/{occurrence_id}",
    summary: "One day as the caller may see it",
    description:
      "The state, the date and the viewer-allowed drops (spec 09, 15, 32): others' captions only before the " +
      "reveal (T10), the caller's own drops for the caller, everything in the audience after it. A past day " +
      "that closed before the caller joined is NOT_FOUND (Q06). After the reveal the drops come star first, " +
      "then friends', each with its section (T35). The cursor is bound to the caller, the day and its stage: " +
      "a cursor from a day still collecting doesn't page its revealed drops.",
    query: z.object({ cursor: Cursor.optional(), limit: z.int().min(1).max(36).optional() }),
    ok: { status: 200, json: Day },
  },
  {
    id: "getOwnDay",
    method: "get",
    path: "/v1/occurrences/{occurrence_id}/own-drops",
    summary: "The caller's own drops and allowance in a day",
    description:
      "For the composer, the share extension and Your drops (book p13, p15, p17): the caller's own tuple " +
      "only (T15). Asked again whenever the target changes (T31).",
    ok: { status: 200, json: OwnDay },
  },
  {
    id: "getDrop",
    method: "get",
    path: "/v1/drops/{drop_id}",
    summary: "One drop with its day",
    description: "For a link to an exact drop, after rechecking access, with the same per-viewer views (spec 20, T38).",
    ok: { status: 200, json: DropDetail },
  },
];

const CONTRIBUTING: Operation[] = [
  {
    id: "createUpload",
    method: "post",
    path: "/v1/uploads",
    summary: "Start an upload",
    description:
      "A scoped intent and the signed upload URL for one object (spec 32, 33; T12). A replay signs a new URL " +
      "only while the upload is pending (TECH-DESIGN section 6). Only the avatar's purpose works before the " +
      "profile is finished. A conversation photo's purpose answers only the neutral NOT_FOUND for a drop " +
      "the caller can't read now or whose day hasn't opened, never OCCURRENCE_CLOSED or MEMBERSHIP_CHANGED, " +
      "and it has no cutoff, no reservation and no allowance (T3, T14, T63, T64).",
    idempotent: true,
    beforeProfile: true,
    body: CreateUploadRequest,
    ok: { status: 201, json: Upload },
    errors: ["PROFILE_INCOMPLETE", "OCCURRENCE_CLOSED", "MEMBERSHIP_CHANGED", "NOT_FOUND"],
  },
  {
    id: "getUpload",
    method: "get",
    path: "/v1/uploads/{upload_id}",
    summary: "The caller's upload and its state",
    description: "Only its owner; never a URL (T12).",
    beforeProfile: true,
    ok: { status: 200, json: UploadStatus },
  },
  {
    id: "completeUpload",
    method: "post",
    path: "/v1/uploads/{upload_id}/complete",
    summary: "The bytes are in: prepare the upload",
    description:
      "Begin the checks and return the preparing state (spec 32, 33). Repeating it returns the current state. " +
      "MEDIA_NOT_READY while the bytes aren't in storage yet.",
    beforeProfile: true,
    ok: { status: 202, json: UploadStatus },
    errors: ["MEDIA_NOT_READY"],
  },
  {
    id: "resolveSource",
    method: "post",
    path: "/v1/sources/resolve",
    summary: "Resolve an external video link",
    description:
      "Normalize it through the allowlisted adapters, following short links within strict limits " +
      "(TECH-DESIGN section 5; spec 33). The details are the caller's alone (T40).",
    body: ResolveSourceRequest,
    ok: { status: 200, json: Source },
    errors: ["PROVIDER_UNSUPPORTED"],
  },
  {
    id: "createReservation",
    method: "post",
    path: "/v1/occurrences/{occurrence_id}/reservations",
    summary: "Hold a slot in a day",
    description:
      "Reserve one slot before the upload (spec 11, 32; T17, T18), with the cutoff checked under the lock (T3) " +
      "and the caller's limits by role: QUOTA_FULL, EXTERNAL_LIMIT or PHOTO_LIMIT, QUOTA_FULL first.",
    idempotent: true,
    body: CreateReservationRequest,
    ok: { status: 201, json: Reservation },
    errors: ["OCCURRENCE_CLOSED", "QUOTA_FULL", "EXTERNAL_LIMIT", "PHOTO_LIMIT", "MEMBERSHIP_CHANGED"],
  },
  {
    id: "releaseReservation",
    method: "delete",
    path: "/v1/reservations/{reservation_id}",
    summary: "Release a held slot",
    description:
      "The work went back to Drafts, or the target changed (spec 11, T18). Repeating it returns the same state.",
    ok: { status: 200, json: ReleasedReservation },
  },
  {
    id: "createDrop",
    method: "post",
    path: "/v1/occurrences/{occurrence_id}/drops",
    summary: "Add a drop to a day",
    description:
      "Commit ready media, the caption and the immutable audience in one transaction (spec 32; T3, T8, T17, " +
      "T19). Only this response means Added (T20). A missed cutoff answers OCCURRENCE_CLOSED with the same " +
      "person's next day to confirm, and nothing is moved (T4). A reservation that has lapsed counts as none: " +
      "a free slot is taken if there is one, or the refusal of the caller's limits by role: QUOTA_FULL, " +
      "EXTERNAL_LIMIT or PHOTO_LIMIT, QUOTA_FULL first (T17, T18).",
    idempotent: true,
    body: CreateDropRequest,
    ok: { status: 201, json: DropReceipt },
    errors: [
      "OCCURRENCE_CLOSED",
      "MEMBERSHIP_CHANGED",
      "MEDIA_NOT_READY",
      "CAPTION_CONTAINS_SOURCE",
      "DUPLICATE_DROP",
      "QUOTA_FULL",
      "EXTERNAL_LIMIT",
      "PHOTO_LIMIT",
    ],
  },
  {
    id: "updateDrop",
    method: "patch",
    path: "/v1/drops/{drop_id}",
    summary: "Edit the caller's drop",
    description: "Owner edit only while collecting (spec 09, 32; T3).",
    idempotent: true,
    body: UpdateDropRequest,
    ok: { status: 200, json: DropVersion },
    errors: [
      "OCCURRENCE_CLOSED",
      "MEMBERSHIP_CHANGED",
      "VERSION_CONFLICT",
      "MEDIA_NOT_READY",
      "CAPTION_CONTAINS_SOURCE",
      "DUPLICATE_DROP",
    ],
  },
  {
    id: "removeDrop",
    method: "delete",
    path: "/v1/drops/{drop_id}",
    summary: "Withdraw a drop, or remove a photo you're in",
    description:
      "Withdraw or authorized removal with a distinct reason (spec 32). withdraw: the author, before or after " +
      "the reveal, even after leaving the club (spec 22). pictured: a member in the photograph, after the " +
      "reveal, with no approval and no public reason (T25). Either reaches everything at once, the drop's " +
      "conversation, its photo messages and their previews included (T24, T63), and never reopens a closed " +
      "day (T3).",
    idempotent: true,
    query: z.object({ reason: RemovalReason }),
    ok: { status: 200, json: RemovedDrop },
  },
  {
    id: "hideDrop",
    method: "put",
    path: "/v1/drops/{drop_id}/hidden",
    summary: "Hide a drop from your own view",
    description: "For the caller alone, before or after the reveal, never the author's own (spec 22). Nobody is told.",
    ok: { status: 200, json: HiddenDrop },
  },
  {
    id: "createReport",
    method: "post",
    path: "/v1/reports",
    summary: "Report a drop or a comment",
    description:
      "A moderation case without public reason disclosure (spec 32); the operator acts through audited scripts (FQ27).",
    idempotent: true,
    body: CreateReportRequest,
    ok: { status: 202, json: ReportReceipt },
    errors: ["NOT_FOUND"],
  },
  {
    id: "setHighlight",
    method: "put",
    path: "/v1/occurrences/{occurrence_id}/highlight",
    summary: "Make one of the caller's drops their highlight",
    description: "Set the caller's selected drop with the expected version (spec 32; T22). Frozen at the reveal (T3).",
    idempotent: true,
    body: SetHighlightRequest,
    ok: { status: 200, json: HighlightPointer },
    errors: ["OCCURRENCE_CLOSED", "MEMBERSHIP_CHANGED", "VERSION_CONFLICT"],
  },
];

const MEDIA: Operation[] = [
  {
    id: "getDropMedia",
    method: "get",
    path: "/v1/drops/{drop_id}/media",
    summary: "A revealed photo's bytes",
    description:
      "Runs the read predicate on every request and streams the rendition; NOT_FOUND before the reveal (spec " +
      "32, 33; T9, T12). Never a storage URL.",
    query: z.object({ rendition: z.enum(["display", "full"]) }),
    ok: { status: 200, binary: "image/jpeg" },
  },
  {
    id: "getCommentMedia",
    method: "get",
    path: "/v1/comments/{comment_id}/media",
    summary: "A photo message's bytes",
    description:
      "Runs the drop's read predicate, through the drop's own audience, and the photo's own state (ready, its " +
      "message neither deleted nor removed) on every request, and streams the rendition: `thumbnail` for the " +
      "feed's reply preview, `display` in the conversation, `full` when it's opened (addendum 5). The same " +
      "NOT_FOUND otherwise, before the reveal included (T9, T12, T14, T63). One content version serves all " +
      "three. Never a storage URL.",
    query: z.object({ rendition: z.enum(["thumbnail", "display", "full"]) }),
    ok: { status: 200, binary: "image/jpeg" },
  },
  {
    id: "getAuthorPreview",
    method: "get",
    path: "/v1/drops/{drop_id}/author-preview",
    summary: "The author's own preview",
    description:
      "The caller's own photo (JPEG) or link (JSON), before or after the reveal, for the author alone and " +
      "kept in the app's own author cache, never a shared one (spec 14, 32; T11). T23's denials beat it, as " +
      "they beat every grant: a withdrawn drop, one removed by a pictured member or by moderation, or a " +
      "deleted account's is NOT_FOUND, as it is for anyone else (T9, T24). A held drop's media isn't served " +
      "to its author either (FQ76's default). Ask with `Accept: application/json` first: a link answers " +
      "JSON, a photo JPEG.",
    ok: { status: 200, binary: "image/jpeg", json: ExternalVideoPreview },
  },
  {
    id: "getEmbed",
    method: "get",
    path: "/v1/drops/{drop_id}/embed",
    summary: "A revealed video link's player",
    description: "The provider payload only after an authorized reveal (spec 17, 32; T39, T40).",
    ok: { status: 200, json: Embed },
  },
];

const AFTER: Operation[] = [
  {
    id: "setReaction",
    method: "put",
    path: "/v1/drops/{drop_id}/reaction",
    summary: "Set the caller's reaction",
    description:
      "One actual changeable reaction per viewer (spec 32), after the reveal, never on one's own drop (D07, " +
      "spec 16). Only the first ever notifies the author (spec 21).",
    body: SetReactionRequest,
    ok: { status: 200, json: ReactionState },
    errors: ["NOT_ALLOWED"],
  },
  {
    id: "clearReaction",
    method: "delete",
    path: "/v1/drops/{drop_id}/reaction",
    summary: "Remove the caller's reaction",
    description: "D07. The same answer whether or not there was one.",
    ok: { status: 200, json: ReactionState },
  },
  {
    id: "listComments",
    method: "get",
    path: "/v1/drops/{drop_id}/comments",
    summary: "A drop's thread",
    description:
      "In the order written, with replies pointing to their comment (spec 16). Only after the reveal (D07). A " +
      "message's photo is read from `GET /v1/comments/{comment_id}/media` (T12, T63).",
    query: PageQuery,
    ok: { status: 200, json: CommentPage },
  },
  {
    id: "createComment",
    method: "post",
    path: "/v1/drops/{drop_id}/comments",
    summary: "Comment on a revealed drop",
    description:
      "Eligible after the reveal, with active membership and the drop's read predicate (spec 16, 32), checked " +
      "again at the commit, after its locks (T63). With text, a photo or both (addendum 5): the photo is the " +
      "caller's own ready conversation-photo upload for this drop; one still on its way or held is " +
      "MEDIA_NOT_READY, as is a rejected one, which never becomes ready (`GET /v1/uploads/{upload_id}` says " +
      "why), and one that isn't theirs, is for another drop or purpose, or is used or lapsed is " +
      "NOT_FOUND. Nothing about the message reaches anyone, its preview included, until it commits (T65). " +
      "No cutoff, reservation or allowance: it stays possible after the day leaves Home, and in Memories " +
      "(T3, T64). One Idempotency-Key, one message (T19).",
    idempotent: true,
    body: CreateCommentRequest,
    ok: { status: 201, json: CommentReceipt },
    errors: ["MEDIA_NOT_READY"],
  },
  {
    id: "updateComment",
    method: "patch",
    path: "/v1/comments/{comment_id}",
    summary: "Edit the caller's comment",
    description:
      "Its text only: it shows Edited and announces nothing again (spec 16). A photo message's text may be " +
      "emptied; its photo is never replaced (T65, FQ107).",
    idempotent: true,
    body: UpdateCommentRequest,
    ok: { status: 200, json: CommentReceipt },
    errors: ["VERSION_CONFLICT"],
  },
  {
    id: "deleteComment",
    method: "delete",
    path: "/v1/comments/{comment_id}",
    summary: "Delete the caller's comment",
    description:
      "It leaves the thread at once, a photo message's photo and text together; replies to it stay (spec 16; " +
      "addendum 5). Its photo and thumbnail stop being served, and the drop's reply preview is worked out " +
      "again (T24, T65).",
    ok: { status: 204 },
  },
  {
    id: "setThreadNotifications",
    method: "put",
    path: "/v1/drops/{drop_id}/thread-notifications",
    summary: "Mute or unmute a thread",
    description: "Notification settings per thread (spec 16, 21; TECH-DESIGN section 6).",
    body: ThreadNotificationsRequest,
    ok: { status: 200, json: ThreadNotifications },
  },
  {
    id: "saveFavourite",
    method: "put",
    path: "/v1/favourites/{drop_id}",
    summary: "Save a revealed drop to Favourites",
    description: "A private idempotent bookmark (spec 18, 32; T32).",
    ok: { status: 200, json: FavouriteState },
  },
  {
    id: "removeFavourite",
    method: "delete",
    path: "/v1/favourites/{drop_id}",
    summary: "Remove a drop from Favourites",
    description: "The same answer whether or not it was saved, or can still be read (T14).",
    ok: { status: 204 },
  },
  {
    id: "listFavourites",
    method: "get",
    path: "/v1/favourites",
    summary: "The caller's favourites in a club",
    description: "Only those the caller can still read; access is rechecked on every read (spec 18; T32).",
    query: PageQuery.extend({ club_id: Id }),
    ok: { status: 200, json: FavouritePage },
    errors: ["NOT_FOUND"],
  },
  {
    id: "listMemories",
    method: "get",
    path: "/v1/memories",
    summary: "Past days in a club",
    description:
      "Viewer-filtered cursors with member and month filters (spec 18, 32; T14). `star` is a membership id " +
      "from the members list; For me is the caller's own.",
    query: PageQuery.extend({
      club_id: Id,
      star: Id.optional(),
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    }),
    ok: { status: 200, json: MemoryPage },
    errors: ["NOT_FOUND"],
  },
  {
    id: "searchMemories",
    method: "post",
    path: "/v1/memories/search",
    summary: "Search Memories",
    description: "Authorized names, exact dates and caption text only (spec 18; book p22). It changes nothing.",
    body: SearchMemoriesRequest,
    ok: { status: 200, json: MemorySearchPage },
    errors: ["NOT_FOUND"],
  },
];

export const OPERATIONS: Operation[] = [...ACCOUNT, ...CLUB_OPERATIONS, ...DAYS, ...CONTRIBUTING, ...MEDIA, ...AFTER];
