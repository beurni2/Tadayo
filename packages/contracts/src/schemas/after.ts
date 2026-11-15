// After the reveal: reactions, comments, favourites, Memories, and the safety actions on a drop (spec 16,
// 18, 22). Each list is filtered for the viewer, item by item and membership interval by membership
// interval (spec 18, T14). Nothing here is counted (T15, T33): no totals, no "seen", no ranking.
import * as z from "zod";

import {
  Allowance,
  CommentText,
  ContentVersion,
  Cursor,
  Id,
  Occurrence,
  Person,
  Reaction,
  Version,
  page,
  text,
} from "../common.ts";
import { named } from "../registry.ts";
import { DayLink, DropRevealed, HighlightPointer, ReactionSummary } from "./days.ts";

export const SetReactionRequest = named(
  "SetReactionRequest",
  "The caller's one reaction to a revealed drop, set or changed (D07). Never on their own drop (spec 16).",
  z.strictObject({ reaction: Reaction }),
);

export const ReactionState = named(
  "ReactionState",
  "The caller's reaction now, if any, and the drop's summary.",
  z.object({ drop_id: Id, viewer_reaction: Reaction.optional(), reactions: z.array(ReactionSummary).max(1) }),
);

export const ReplyTo = named(
  "ReplyTo",
  "The comment a reply answers, by its id and author: any message, whatever it holds, text, a photo or both " +
    "(FQ110). Absent once that comment is deleted or removed.",
  z.object({ comment_id: Id, author: Person }),
);

export const CommentPhoto = named(
  "CommentPhoto",
  "A photo message's photo: its frame, for a stable layout before the bytes arrive, and its content " +
    "version, the ETag of `GET /v1/comments/{comment_id}/media`, the one route that serves it (T12, T63). " +
    "Never a URL.",
  z.object({
    width: z.int().min(1).max(20_000),
    height: z.int().min(1).max(20_000),
    media_version: ContentVersion,
  }),
);

export const Comment = named(
  "Comment",
  "A message in a revealed drop's conversation, seen by the drop's audience (spec 16; addendum 5): text, " +
    "a photo, or both, never neither, and never an empty text. A photo is here only once it's ready and " +
    "its message has committed, so nobody sees a message still preparing (T65). `edited` shows the Edited " +
    "label; earlier text is never served (spec 31). No time and no seen state. `version` is only on the " +
    "caller's own messages, for editing them: nobody else learns how often a message changed. A deleted or " +
    "removed message isn't in the thread at all: no text, no photo, no author (T24, T25).",
  z.object({
    id: Id,
    author: Person,
    text: CommentText.optional(),
    photo: CommentPhoto.optional(),
    reply_to: ReplyTo.optional(),
    edited: z.boolean(),
    version: Version.optional(),
  }),
);

export const CommentPage = named(
  "CommentPage",
  "A drop's thread in the order it was written, and whether the caller muted its notifications (spec 16, " +
    "21). Never a count.",
  page(Comment).extend({ thread_muted: z.boolean() }),
);

export const CreateCommentRequest = named(
  "CreateCommentRequest",
  "A message, optionally answering another on the same drop (spec 16; addendum 5): at least one of `text` " +
    "and `photo_upload_id`, the caller's own ready conversation-photo upload for this drop. One photo at " +
    "most, no video. It uses no reservation and no allowance (T64), and commits only after the reveal, " +
    "checked again at the commit (T63).",
  z
    .strictObject({ text: CommentText.optional(), photo_upload_id: Id.optional(), reply_to_id: Id.optional() })
    .refine((body) => body.text !== undefined || body.photo_upload_id !== undefined, "text, a photo or both"),
);

export const CommentEditText = named(
  "CommentEditText",
  "A message's edited text: 0 to 500 grapheme clusters, well formed (no lone surrogate) (T13, D09). Empty " +
    "removes the text of a message with a photo, which keeps its photo (FQ107); a message with no photo " +
    "can't be left empty (INVALID_REQUEST, `field` `text`).",
  text(0, 500),
);

export const UpdateCommentRequest = named(
  "UpdateCommentRequest",
  "The author's edit of their message's text, the only thing an edit changes: a photo is never replaced, " +
    "only the whole message deleted (T65, FQ107). It announces nothing again (spec 16).",
  z.strictObject({ text: CommentEditText, expected_version: Version }),
);

export const CommentReceipt = named(
  "CommentReceipt",
  "A comment's identity and version after it's added or edited, never its text (TECH-DESIGN section 6).",
  z.object({ comment_id: Id, drop_id: Id, edited: z.boolean(), version: Version }),
);

export const ThreadNotificationsRequest = named(
  "ThreadNotificationsRequest",
  "Mute or unmute comment notifications from one drop's thread, for the caller alone (spec 16, 21).",
  z.strictObject({ muted: z.boolean() }),
);

export const ThreadNotifications = named(
  "ThreadNotifications",
  "Whether the caller muted this thread. Nobody else ever learns it.",
  z.object({ drop_id: Id, muted: z.boolean() }),
);

export const Favourite = named(
  "Favourite",
  "A private pointer to a revealed drop the caller can still read, checked again on every read (spec 18, " +
    "T32), with its day.",
  z.object({ drop: DropRevealed, occurrence: Occurrence }),
);

export const FavouritePage = named(
  "FavouritePage",
  "The caller's favourites in one club, newest saved first.",
  page(Favourite),
);

export const FavouriteState = named(
  "FavouriteState",
  "The pointer after a save. Saving tells nobody and counts nothing (T32).",
  z.object({ drop_id: Id, favourite: z.boolean() }),
);

export const MemoryPage = named(
  "MemoryPage",
  "Past days the caller can read something in, newest first (spec 18). A quiet day, or one before the " +
    "caller joined, isn't listed, so the archive is truthful when it's empty (book p23); M01-empty's next " +
    "date comes from Home's `next`.",
  page(DayLink),
);

export const SearchText = named(
  "SearchText",
  "What to search for: 1 to 100 grapheme clusters, well formed (no lone surrogate) (spec 18).",
  text(1, 100),
);

export const SearchMemoriesRequest = named(
  "SearchMemoriesRequest",
  "Search one club's Memories. In a body, so the words never sit in a URL or a request log (T52).",
  z.strictObject({
    club_id: Id,
    q: SearchText,
    cursor: Cursor.optional(),
    limit: z.int().min(1).max(50).optional(),
  }),
);

export const MemorySearchResult = named(
  "MemorySearchResult",
  "A match in Memories on a name, an exact date or a caption (spec 18, book p22): the day, and the drop " +
    "when an author's name or a caption matched. Only past days and drops the caller can read now (T14).",
  z.object({ occurrence: Occurrence, drop: DropRevealed.optional() }),
);

export const MemorySearchPage = named(
  "MemorySearchPage",
  "Search results, newest day first, with no total.",
  page(MemorySearchResult),
);

export const RemovalReason = named(
  "RemovalReason",
  "Why a drop leaves the club (spec 32's distinct reason): withdraw, by its author at any time, even " +
    "after leaving (spec 22); pictured, by a member in the photograph, after the reveal, with no approval " +
    "and no public reason (T25).",
  z.enum(["withdraw", "pictured"]),
);

export const RemovedDrop = named(
  "RemovedDrop",
  "The drop is gone from every view at once (T24). A withdrawal before the reveal frees its slot and clears " +
    "the author's highlight on it; after the reveal no slot reopens (T3). The star is told neutrally, " +
    "without who or why (spec 21).",
  z.object({
    drop_id: Id,
    state: z.enum(["withdrawn", "removed"]),
    allowance: Allowance.optional(),
    highlight: HighlightPointer.optional(),
  }),
);

export const HiddenDrop = named(
  "HiddenDrop",
  "The drop is hidden from the caller's own view, everywhere (spec 22). Nobody is told; it isn't a removal.",
  z.object({ drop_id: Id, hidden: z.boolean() }),
);

export const ReportTarget = named(
  "ReportTarget",
  "What a report is about: a drop the caller can read (its caption before the reveal) or a comment, never " +
    "the caller's own.",
  z.strictObject({ kind: z.enum(["drop", "comment"]), id: Id }),
);

export const ReportNote = named(
  "ReportNote",
  "A report's optional note: 1 to 500 grapheme clusters, well formed (no lone surrogate), never logged or " +
    "sent to analytics (T51, T52).",
  text(1, 500),
);

export const CreateReportRequest = named(
  "CreateReportRequest",
  "A report to moderation (spec 22, 32). The optional note is never logged or sent to analytics (T51, T52). " +
    "Reasons to choose from wait for S01-report's design.",
  z.strictObject({ target: ReportTarget, note: ReportNote.optional() }),
);

export const ReportReceipt = named(
  "ReportReceipt",
  "The report is received. Nothing changes visibly for anyone, and nobody is told (spec 22).",
  z.object({ report_id: Id, state: z.enum(["received"]) }),
);
