// Adding to a day: uploads, sources, reservations, the commit, edits, withdrawal and highlights (spec 09
// to 11, 33). A mutation's response carries identities, versions, the target and the status, never a
// caption's text or a URL: the app already holds what it sent, and the stored receipt keeps no secret
// (TECH-DESIGN section 6). The server never moves work to another day (T4).
import * as z from "zod";

import { Allowance, Caption, Id, Instant, MediaClass, Occurrence, Provider, Version } from "../common.ts";
import { named, tag, tagged } from "../registry.ts";
import { HighlightPointer } from "./days.ts";

export const UploadContentType = named(
  "UploadContentType",
  "The formats the pipeline accepts, checked against the real bytes (ADR-014, TECH-DESIGN section 5).",
  z.enum(["image/jpeg", "image/png", "image/webp"]),
);

const uploadBase = {
  content_type: UploadContentType,
  byte_size: z.int().min(1).max(20_971_520),
};

export const DropPhotoUploadRequest = named(
  "DropPhotoUploadRequest",
  "An upload for a new photo drop, under one of the caller's live reservations: only a member with a held " +
    "slot can write to storage (spec 11, 32).",
  z.strictObject({ purpose: tag("drop_photo"), reservation_id: Id, ...uploadBase }),
);

export const ReplacementUploadRequest = named(
  "ReplacementUploadRequest",
  "An upload to replace the photo of the caller's own drop while its day is collecting (spec 09).",
  z.strictObject({ purpose: tag("replacement"), drop_id: Id, ...uploadBase }),
);

export const AvatarUploadRequest = named(
  "AvatarUploadRequest",
  "An upload for the caller's avatar, once their age is confirmed (spec 23, FQ13).",
  z.strictObject({ purpose: tag("avatar"), ...uploadBase }),
);

export const ConversationPhotoUploadRequest = named(
  "ConversationPhotoUploadRequest",
  "An upload for a photo message in the conversation of a revealed drop the caller can read, named by " +
    "`drop_id`: the same types and size as a drop's photo, and no reservation or allowance (T63, T64). For " +
    "a drop the caller can't read now, or whose day hasn't opened, it's the neutral NOT_FOUND and nothing " +
    "is made (T14). It can only become a message in that drop's conversation, never a drop, a replacement " +
    "or an avatar.",
  z.strictObject({ purpose: tag("conversation_photo"), drop_id: Id, ...uploadBase }),
);

export const CreateUploadRequest = tagged(
  "CreateUploadRequest",
  "An upload intent with its scope, type and size (spec 32, 33): at most 20 MiB. The purpose fixes what " +
    "it can become, so a drop's upload never becomes an avatar or a photo message, or the reverse (T64). " +
    "No filename, capture date, location, dimensions or hash.",
  "purpose",
  [DropPhotoUploadRequest, ReplacementUploadRequest, AvatarUploadRequest, ConversationPhotoUploadRequest],
);

export const UploadPurpose = named(
  "UploadPurpose",
  "What an upload is for.",
  z.enum(["drop_photo", "replacement", "avatar", "conversation_photo"]),
);

export const UploadState = named(
  "UploadState",
  "pending: waiting for the bytes. preparing: being checked, decoded, stripped of metadata and scanned " +
    "(spec 33). ready: can be committed. held: on a moderation hold, with no reason (T29). rejected: can't " +
    "be used; `rejection` says why.",
  z.enum(["pending", "preparing", "ready", "held", "rejected"]),
);

export const UploadRejection = named(
  "UploadRejection",
  "Why an upload can't be used: not a supported image, over 20 MiB, over 64 megapixels, or unreadable " +
    "(D09, spec 33).",
  z.enum(["unsupported_type", "too_large", "too_many_pixels", "unreadable"]),
);

export const SignedUpload = named(
  "SignedUpload",
  "Where to put the bytes: the one storage URL a client ever gets, for its own pending upload, write-only, " +
    "for one random object, with overwriting off (T12). Send the method with exactly these headers before " +
    "`expires_at`. Never in a stored receipt, and never after `complete` (TECH-DESIGN section 6).",
  z.object({
    url: z.url({ protocol: /^https$/ }).max(4096),
    method: z.enum(["PUT"]),
    headers: z.record(z.string().min(1).max(100), z.string().max(4096)),
    expires_at: Instant,
  }),
);

const uploadFields = {
  id: Id,
  purpose: UploadPurpose,
  state: UploadState,
  rejection: UploadRejection.optional(),
  expires_at: Instant,
};

export const Upload = named(
  "Upload",
  "The caller's own upload, which nobody else can see (T12), as `createUpload` answers it. `signed_upload` " +
    "is present only while it's pending, in the response that created it or its replay. An upload nobody " +
    "commits lapses at `expires_at` and is purged; for a drop's photo the device's draft keeps it (FQ15), " +
    "and for a photo message the app keeps its own attachment until the message commits, never in Drafts " +
    "(T64). It never names the drop it's for.",
  z.object({ ...uploadFields, signed_upload: SignedUpload.optional() }),
);

export const UploadStatus = named(
  "UploadStatus",
  "The caller's own upload and its state, as reading it or completing it answers: never a URL (T12; " +
    "TECH-DESIGN section 6).",
  z.object(uploadFields),
);

export const ResolveSourceRequest = named(
  "ResolveSourceRequest",
  "A link pasted in the composer or passed by the share extension (spec 10; TECH-DESIGN section 5). Never " +
    "logged (T52).",
  z.strictObject({ url: z.string().min(1).max(2048) }),
);

export const Source = named(
  "Source",
  "A resolved external video link, for the caller who resolved it alone (T40): its provider and its " +
    "normalized original. The same caller and link get the same source until it's used or lapses.",
  z.object({
    id: Id,
    provider: Provider,
    original_url: z.url({ protocol: /^https$/ }).max(2048),
    expires_at: Instant,
  }),
);

export const CreateReservationRequest = named(
  "CreateReservationRequest",
  "Hold one of the caller's slots in this day while a photo uploads and prepares (spec 11, T18). The " +
    "caller's role, and so their limits, come from the server, never from the request (T17).",
  z.strictObject({ media_class: MediaClass }),
);

export const Reservation = named(
  "Reservation",
  "A held slot, counted with committed drops (T17). It lapses at `expires_at`, never after the day's " +
    "reveal, or when released (T18).",
  z.object({
    id: Id,
    occurrence_id: Id,
    media_class: MediaClass,
    expires_at: Instant,
    allowance: Allowance,
  }),
);

export const ReleasedReservation = named(
  "ReleasedReservation",
  "What became of a reservation: released, lapsed, or used by the caller's own commit, whose `drop_id` " +
    "it gives so a commit whose answer was lost isn't shown as not added (T20).",
  z.object({
    id: Id,
    state: z.enum(["released", "expired", "consumed"]),
    drop_id: Id.optional(),
    allowance: Allowance.optional(),
  }),
);

export const PhotoMedia = named(
  "PhotoMedia",
  "A ready photo upload of the caller's.",
  z.strictObject({ kind: tag("photo"), upload_id: Id }),
);

export const ExternalVideoMedia = named(
  "ExternalVideoMedia",
  "A resolved external video link of the caller's.",
  z.strictObject({ kind: tag("external_video"), source_id: Id }),
);

export const DropMedia = tagged("DropMedia", "What the drop holds.", "kind", [PhotoMedia, ExternalVideoMedia]);

export const CreateDropRequest = named(
  "CreateDropRequest",
  "Commit one drop to the day in the path (spec 32; T3, T8, T17, T19). `reservation_id` uses a held " +
    "slot; without one, a free slot is taken at commit. A caption is optional (spec 10). No audience, " +
    "time, highlight, role or other target: the server decides the audience and the caller's role at " +
    "commit and never moves the drop (T4, T8, T17).",
  z.strictObject({ reservation_id: Id.optional(), media: DropMedia, caption: Caption.optional() }),
);

export const DropReceipt = named(
  "DropReceipt",
  "The commit's receipt: the drop is in this day, and only now is it Added (T20). A replay with the same " +
    "Idempotency-Key returns this same receipt, even after the cutoff or midnight (T19, Q12), but for the " +
    "day's star, named as members see them at the replay (FQ75, FQ139); one with no name left to show " +
    "answers MEMBERSHIP_CHANGED.",
  z.object({
    drop_id: Id,
    occurrence: Occurrence,
    media_class: MediaClass,
    state: tag("added"),
    version: Version,
    allowance: Allowance,
    highlight: HighlightPointer,
  }),
);

export const UpdateDropRequest = named(
  "UpdateDropRequest",
  "The author's edit while the day is collecting (spec 09, T3): a new caption (empty removes it), or a " +
    "replacement in the same media class, ready and keeping the slot, the order and the highlight. Only " +
    "the fields sent change.",
  z.strictObject({ expected_version: Version, caption: Caption.optional(), media: DropMedia.optional() }),
);

export const DropVersion = named(
  "DropVersion",
  "A drop's identity, state and new version after an edit.",
  z.object({ drop_id: Id, state: z.enum(["added", "preparing"]), version: Version }),
);

export const SetHighlightRequest = named(
  "SetHighlightRequest",
  "Make one of the caller's own drops in this day their highlight, or move it to another: a pointer, never " +
    "an extra drop (T17, T22). Set or replace only; it clears only when that drop is withdrawn.",
  z.strictObject({ drop_id: Id, expected_version: Version }),
);
