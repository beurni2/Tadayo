/// <reference lib="esnext.temporal" />
// The building blocks every module shares: ids, instants, dates, text, people, clubs, occurrences.
import * as z from "zod";

import { named } from "./registry.ts";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Grapheme clusters, the way the app counts them (Swift's `String.count`), never UTF-16 units (T13). */
export function graphemes(text: string): number {
  return [...segmenter.segment(text)].length;
}

/** Text of at most `max` grapheme clusters, and no more than 16 code units per cluster on the wire. */
export function text(min: number, max: number): z.ZodString {
  return z
    .string()
    .min(min)
    .max(max * 16)
    .refine(
      (value) => {
        const count = graphemes(value);
        return count >= min && count <= max;
      },
      `between ${String(min)} and ${String(max)} grapheme clusters`,
    );
}

// What a name may never hold (FQ70): a control character (Cc); a bidirectional control, which can make
// one name render as another (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069); or a line
// or paragraph separator (U+2028, U+2029). Written as escaped ranges, so the document's `pattern` reads
// the same in every regex engine; nor may a name start or end with a space.
const NOT_IN_A_NAME = "\\u0000-\\u001F\\u007F-\\u009F\\u061C\\u200E\\u200F\\u2028-\\u202E\\u2066-\\u2069";
export const NAME_PATTERN = new RegExp(`^(?!\\s)(?!.*\\s$)[^${NOT_IN_A_NAME}]+$`);

// A name that shows nothing can't say who someone is (FQ70): one made only of spaces, format characters
// such as U+200B ZERO WIDTH SPACE, combining marks with nothing to sit on, other characters Unicode says
// to draw as nothing (Default_Ignorable_Code_Point, such as U+034F or U+FE0F), or the blank fillers
// (U+115F, U+1160, U+2800, U+3164, U+FFA0).
const VISIBLE = /[^\p{Cc}\p{Cf}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}\u115F\u1160\u2800\u3164\uFFA0]/u;

/** A name: 1 to `max` grapheme clusters, trimmed, with something to see and nothing that can disguise it (FQ70). */
export function name(max: number): z.ZodString {
  return text(1, max)
    .regex(NAME_PATTERN)
    .refine((value) => VISIBLE.test(value), "at least one visible character");
}

export const Id = named(
  "Id",
  "An opaque random identifier, at least 128 bits of randomness: never a UUIDv7, a ULID, a sequence or " +
    "anything else that carries a time, an order or a count, so it can't tell anyone when or how many " +
    "things were made (T10, T15). Knowing one grants nothing (T9, T14).",
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
);

export const Instant = named(
  "Instant",
  "A UTC instant, RFC 3339 with whole seconds and Z, such as 2026-11-13T12:00:00Z (spec 31).",
  z.iso.datetime({ precision: 0 }),
);

export const LocalDate = named(
  "LocalDate",
  "A calendar date in the club's timezone, such as 2026-11-13 (spec 05, 31).",
  z.iso.date(),
);

// The check the server's clubTimeZone makes (packages/domain/src/time/civil.ts): a name Temporal resolves
// back to itself, apart from case, and not to an offset. Temporal reads a string that starts with T as an
// ISO time and takes its offset, or UTC for Z ("T07+05" gives +05:00), so the name must come back as
// given. The pattern below refuses a leading sign too; the offset test keeps this clubTimeZone's whole
// rule. Intl takes old abbreviations Temporal refuses (BST, PST, SystemV/AST4), so it isn't the check
// (docs/LIMITATIONS.md).
function resolvable(zone: string): boolean {
  try {
    const id = Temporal.PlainDate.from("2026-01-01").toZonedDateTime(zone).timeZoneId;
    return id.toLowerCase() === zone.toLowerCase() && !/^[+-]/.test(id);
  } catch {
    return false;
  }
}

export const Timezone = named(
  "Timezone",
  "An IANA timezone, such as America/New_York: a club's (spec 05, T2), fixed once the club is made " +
    "(FQ19), or a device's, for its quiet hours (T37). Only an IANA time zone the server can resolve, " +
    "named, starting with a letter, and taken in any case, so never a bare offset such as +05, an ISO " +
    "time such as T07+05, or an old abbreviation such as BST or PST; refused otherwise.",
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/)
    .refine(resolvable, "an IANA time zone the server can resolve"),
);

export const Weekday = named(
  "Weekday",
  "A day that can be someone's day. Sunday never is (spec 05, T6).",
  z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]),
);

export const Version = named(
  "Version",
  "A row's version for optimistic concurrency: send the one you read as `expected_version` (T19).",
  z.int().min(0).max(2_147_483_647),
);

export const Cursor = named(
  "Cursor",
  "An opaque page cursor, bound to the viewer and the list it came from (T14): a random handle the server " +
    "keeps, or an encrypted and authenticated value only the server can read, in base64url. Never a readable " +
    "key, so it carries no time, order key or count (T10, T15).",
  z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
);

export const MediaClass = named(
  "MediaClass",
  "What a drop holds: a photo (a still only in the trial, FQ10), or an external video link (spec 10, 17). " +
    "Before the reveal, others see this and nothing more about the media (T10).",
  z.enum(["photo", "external_video"]),
);

export const Provider = named(
  "Provider",
  "An external video provider with an allowlisted adapter (TECH-DESIGN section 5).",
  z.enum(["tiktok", "instagram"]),
);

export const Reaction = named(
  "Reaction",
  "The reactions on offer: the heart alone until Claude Design's palette arrives (FQ22).",
  z.enum(["heart"]),
);

export const DisplayName = named(
  "DisplayName",
  "A person's name as they gave it, the same in every club (spec 23): 1 to 40 grapheme clusters, with no " +
    "space at either end, no control, bidirectional-control or line-separator character, and at least one " +
    "visible character (FQ70's default). The app trims before sending; the API refuses a name rather than changing it. Names " +
    "aren't unique.",
  name(40),
);

export const ClubName = named(
  "ClubName",
  "A club's name: 1 to 40 grapheme clusters, with no space at either end, no control, " +
    "bidirectional-control or line-separator character, and at least one visible character (FQ70's default).",
  name(40),
);

export const ContentVersion = named(
  "ContentVersion",
  "An opaque value that changes whenever an image's bytes do: the ETag its route sends, for caching per " +
    "account and content version (TECH-DESIGN section 4), and never a URL (T12). An avatar's version is " +
    "part of a person's display identity, so it can appear before the reveal (FQ74); a photo's " +
    "`media_version` never does (T10).",
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
);

export const Caption = named(
  "Caption",
  "A caption: at most 140 grapheme clusters, counted as the app counts them (T13, D09). It can't " +
    "contain the drop's own source URL (CAPTION_CONTAINS_SOURCE).",
  text(0, 140),
);

export const CommentText = named("CommentText", "A comment: 1 to 500 grapheme clusters (T13, D09).", text(1, 500));

export const Person = named(
  "Person",
  "A person in a club, as its members see them (the author's display identity of T10): their membership " +
    "interval's id, their current name and, when they have one, their avatar's version for " +
    "`GET /v1/clubs/{club_id}/members/{membership_id}/avatar`. People are always addressed by the interval, " +
    "never by an account id that works across clubs, so a rejoin is a new id (spec 31, Q06). Never an email " +
    "address (spec 23). Once that interval has ended (they left, blocked, were blocked out or deleted their " +
    "account), or once the caller's own interval in the club has, the person appears with the name they " +
    "had when it ended and no avatar version (FQ75's default).",
  z.object({
    membership_id: Id,
    display_name: DisplayName,
    avatar_version: ContentVersion.optional(),
  }),
);

export const ClubState = named(
  "ClubState",
  "proposed: waiting for two people to approve the same roster (spec 04, 32, T7); the creator's proposal " +
    "counts as theirs, so the first acceptance starts it (FQ54), unless it came under another name: then " +
    "the revision made for that name starts it once the creator has approved it and a candidate has " +
    "accepted it, that account or another (FQ84). active: it has started, though its days " +
    "may not be confirmed yet (HomeNoDays). " +
    "paused: fewer than two members, so no new days (FQ16). suspended: stopped by moderation (spec 22).",
  z.enum(["proposed", "active", "paused", "suspended"]),
);

export const ClubRef = named(
  "ClubRef",
  "A club by name, with its timezone for exact dates and times (spec 05), and the caller's own membership " +
    "interval in it, so the app knows which person is You without a field on every person.",
  z.object({ id: Id, name: ClubName, timezone: Timezone, my_membership_id: Id }),
);

export const OccurrencePhase = named(
  "OccurrencePhase",
  "Where a day is, from the server's clock at the time of the response (T1, T5): collecting before " +
    "reveal_at, open until close_at, past after it. unavailable: cancelled or suspended (spec 06, 22), " +
    "with no reason and nothing in it (T9). A day held because its star left the club never opens (FQ63), " +
    "and gets its stage with leaving, in B6, which also settles a deleted account's days. The app never " +
    "computes this from its own clock, and counts " +
    "down from `server_now`.",
  z.enum(["collecting", "open", "past", "unavailable"]),
);

export const Occurrence = named(
  "Occurrence",
  "One person's day: the star, the exact local date, and the two instants resolved in the club's " +
    "timezone (T2). Clients target its id, never a weekday (spec 05).",
  z.object({
    id: Id,
    club_id: Id,
    star: Person,
    local_date: LocalDate,
    reveal_at: Instant,
    close_at: Instant,
    phase: OccurrencePhase,
  }),
);

export const Allowance = named(
  "Allowance",
  "The caller's own allowance in one day, never anyone else's (T15): six drops, at most two of them " +
    "external videos (spec 10, 11; T17). `added` counts committed drops, the only ones that are Added " +
    "(T20); `reserved` counts the caller's live reservations, which the limits also count (T18).",
  z.object({
    added: z.int().min(0).max(6),
    reserved: z.int().min(0).max(6),
    limit: z.int().min(6).max(6),
    external_added: z.int().min(0).max(2),
    external_reserved: z.int().min(0).max(2),
    external_limit: z.int().min(2).max(2),
  }),
);

/** A page of `item`, newest or chronological as each list says, with the next page's cursor. */
export function page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item).max(100), next_cursor: Cursor.optional() });
}

/** The query of a paged list. */
export const PageQuery = z.object({
  cursor: Cursor.optional(),
  limit: z.int().min(1).max(50).optional(),
});
