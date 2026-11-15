// Days and drops as each viewer may see them (T9, T10, T55): one DTO per viewer role, never a shared
// object with fields left empty. Home, the upcoming day, the revealed feed and Memories all use these.
// Nothing here counts what the viewer can't see (T15): no totals, no "who hasn't", no empty slots.
import * as z from "zod";

import {
  Allowance,
  Caption,
  ClubRef,
  ContentVersion,
  Cursor,
  Id,
  Instant,
  LocalDate,
  MediaClass,
  Occurrence,
  Person,
  Provider,
  Reaction,
  Version,
} from "../common.ts";
import { named, tag, tagged } from "../registry.ts";

// The pre-reveal whitelist (T10, spec 14): the caption, the author's display identity and the media
// class, with the target person and date in the enclosing day. Nothing else, ever: no thumbnail, size,
// colour, URL, provider, alt text, dates, version, state or highlight flag. `id` is opaque and random,
// grants nothing (T9, spec 07) and carries no time; it keys the list and a deep link (spec 20).
export const DropCaption = named(
  "DropCaption",
  "Someone else's drop before the reveal, exactly the pre-reveal whitelist (T10, spec 14): its caption, " +
    'its sender, and its media class for "Photo opens Friday at 7 AM".',
  z.object({
    view: tag("caption"),
    id: Id,
    author: Person,
    media_class: MediaClass,
    caption: Caption.optional(),
  }),
);

export const OwnDropState = named(
  "OwnDropState",
  "The author's own drop before the reveal: added (committed, T20); preparing (a replacement is being " +
    "checked, and the committed version stays until it's ready, spec 09); held (on a moderation hold, so " +
    "it won't open with the day; neutral, with no reason, T29). Nobody else ever sees these states.",
  z.enum(["added", "preparing", "held"]),
);

export const DropOwn = named(
  "DropOwn",
  "The caller's own drop before the reveal, for the author alone (spec 07, 09): its caption, whether it's " +
    "the caller's highlight (FQ21), its state, and its version for edits. The photo or link itself comes " +
    "only from `GET /v1/drops/{drop_id}/author-preview` (T11).",
  z.object({
    view: tag("own"),
    id: Id,
    author: Person,
    media_class: MediaClass,
    caption: Caption.optional(),
    highlight: z.boolean(),
    state: OwnDropState,
    version: Version,
  }),
);

export const RevealedPhoto = named(
  "RevealedPhoto",
  "A revealed photo's frame, for a stable layout before the bytes arrive, and its content version, the " +
    "ETag of `GET /v1/drops/{drop_id}/media` (spec 15, 33).",
  z.object({
    width: z.int().min(1).max(20_000),
    height: z.int().min(1).max(20_000),
    media_version: ContentVersion,
  }),
);

export const RevealedVideo = named(
  "RevealedVideo",
  "A revealed external video's provider. The player and Open original come from " +
    "`GET /v1/drops/{drop_id}/embed` (spec 17, T39).",
  z.object({ provider: Provider }),
);

export const ReactionSummary = named(
  "ReactionSummary",
  "A reaction a revealed drop has received, for its compact summary (spec 16, D07), with no count. " +
    "`people`, the members who gave it in the club's roster order (FQ26), is present only for the drop's " +
    "author; everyone else sees the reaction alone, and their own in `viewer_reaction` (FQ73's default). " +
    "Never ranked or totalled across drops or people.",
  z.object({ reaction: Reaction, people: z.array(Person).min(1).max(5).optional() }),
);

export const DropRevealed = named(
  "DropRevealed",
  "A drop after the reveal, for everyone in its audience, its author included (spec 07, 15). `photo` or " +
    "`video` matches the media class. `viewer_reaction` and `viewer_favourite` are the caller's own.",
  z.object({
    view: tag("revealed"),
    id: Id,
    author: Person,
    media_class: MediaClass,
    caption: Caption.optional(),
    highlight: z.boolean(),
    photo: RevealedPhoto.optional(),
    video: RevealedVideo.optional(),
    reactions: z.array(ReactionSummary).max(1),
    viewer_reaction: Reaction.optional(),
    viewer_favourite: z.boolean(),
  }),
);

export const DaySection = named(
  "DaySection",
  "Which of a revealed day's two sections a drop is in (T35; addendum 4): `star`, From {starName}, the " +
    "star's own drops; `friends`, From friends, everyone else's. The server reads it from the author's " +
    "membership interval and the day's star interval, so a card never moves.",
  z.enum(["star", "friends"]),
);

export const ReplyPreview = named(
  "ReplyPreview",
  "The latest photo message on this drop that this viewer may read now, for the feed card's one compact " +
    'preview: its id, to open the conversation there, its author, for "{authorName} added a photo", and ' +
    "the content version of `GET /v1/comments/{comment_id}/media`'s thumbnail (T65; addendum 5). Worked out " +
    "for each viewer and never cached across viewers (T12), again after any withdrawal, removal or loss of " +
    "access, and absent when none remains. No text, time, count or URL.",
  z.object({ comment_id: Id, author: Person, media_version: ContentVersion }),
);

export const RevealedDayDrop = named(
  "RevealedDayDrop",
  "A revealed drop as a revealed day's feed shows it (spec 15; addendum 4, 5): the revealed drop, its " +
    "section, and the reply preview when this viewer may read a photo message on it. Only in a RevealedDay: " +
    "Home's day, a day from Memories or a linked day. A drop on its own, a favourite or a search result is " +
    "a DropRevealed.",
  DropRevealed.extend({ section: DaySection, reply_preview: ReplyPreview.optional() }),
);

export const DropCard = tagged(
  "DropCard",
  "A drop as this viewer may see it now: someone else's caption before the reveal, the caller's own drop " +
    "before it, or any drop after it (T55).",
  "view",
  [DropCaption, DropOwn, DropRevealed],
);

export const UpcomingDropCard = tagged(
  "UpcomingDropCard",
  "A drop in a day that hasn't opened: someone else's caption (T10), or the caller's own drop (spec 09). " +
    "Never a revealed drop.",
  "view",
  [DropCaption, DropOwn],
);

export const HighlightEntry = named(
  "HighlightEntry",
  "One entry of a revealed day's highlight rail: a pointer to a drop this viewer can read (T22). The " +
    "star's pick comes first, then the club's schedule order (FQ26). A contributor without a highlight has " +
    "no entry. Only in a RevealedDay, never before the reveal (T10, FQ21). One entry per contributor's " +
    "membership interval (T22): no more than six at once, but a day can have more when members left, keeping " +
    "their drops, and others joined while it was collecting (spec 07, 22), so the rail has no fixed bound.",
  z.object({ drop_id: Id, author: Person, star_pick: z.boolean() }),
);

export const ViewerDay = named(
  "ViewerDay",
  'The caller\'s own place in this day: whether it\'s their day ("It\'s your Monday", "Your pick"), and ' +
    "whether their membership began after the day started collecting, so the app can say the day may be " +
    "partly visible to them without any number (spec 07, F02-joined-later). It comes from the caller's own " +
    "membership, never from whether hidden drops exist (T15).",
  z.object({ is_star: z.boolean(), joined_later: z.boolean() }),
);

const dayBase = {
  server_now: Instant,
  occurrence: Occurrence,
  club: ClubRef,
  viewer: ViewerDay,
};

export const UpcomingDay = named(
  "UpcomingDay",
  "A day that hasn't opened (phase collecting), for this viewer (spec 08, 09, 32): others' captions and " +
    "the caller's own drops, in commit order with the id as a tiebreak (T35), a page at a time. Nothing " +
    "else, ever: no revealed card, no highlight rail, nothing that counts what's hidden (T10, T15). " +
    "Removed, withdrawn and held drops are simply absent (T24, T29). `add_target` is the day itself (spec 08).",
  z.object({
    stage: tag("upcoming"),
    ...dayBase,
    add_target: Occurrence.optional(),
    drops: z.array(UpcomingDropCard).max(36),
    next_cursor: Cursor.optional(),
  }),
);

export const RevealedDay = named(
  "RevealedDay",
  "A day that has opened (phase open or past), for this viewer (spec 08, 15, 18, 32): the drops whose " +
    "audience includes them, the star's own first and then friends', each section in commit order with the " +
    "id as a tiebreak (T35; addendum 4), a page at a time, and the highlight rail. A section with no drops " +
    "is simply absent, and nothing says it's empty (T33). Removed, withdrawn and held drops are simply " +
    "absent (T24, T29). A day with no drops is a quiet day; nothing says how many drops are hidden (T15). " +
    "`add_target` is the star's next day while it's open (book p30), and absent after; the app never works " +
    "it out (T4).",
  z.object({
    stage: tag("revealed"),
    ...dayBase,
    add_target: Occurrence.optional(),
    drops: z.array(RevealedDayDrop).max(36),
    next_cursor: Cursor.optional(),
    highlights: z.array(HighlightEntry),
  }),
);

export const UnavailableDay = named(
  "UnavailableDay",
  "A cancelled or suspended day (phase unavailable, spec 06, 22): its date and nothing in it, with no " +
    "reason (T9).",
  z.object({ stage: tag("unavailable"), ...dayBase }),
);

export const Day = tagged(
  "Day",
  "One day as this viewer may see it, told apart by `stage` (T55): before the reveal, after it, or " +
    "unavailable. The server picks the stage from its own clock (T1).",
  "stage",
  [UpcomingDay, RevealedDay, UnavailableDay],
);

export const DropDetail = named(
  "DropDetail",
  "One drop with its day, for a link to an exact drop, after rechecking access (spec 20, T38).",
  z.object({ server_now: Instant, occurrence: Occurrence, club: ClubRef, drop: DropCard }),
);

export const DayLink = named(
  "DayLink",
  "A closed day the caller can read something in, for Home's secondary links and Memories (spec 08, " +
    "18). `cover_drop_id` is the photo that covers it, chosen for this viewer in D08's order and never a " +
    "video; its bytes come from the media route (T12).",
  z.object({ occurrence: Occurrence, cover_drop_id: Id.optional() }),
);

export const HighlightPointer = named(
  "HighlightPointer",
  "The caller's own highlight in one day, and its version for `expected_version` (0 before the first).",
  z.object({ drop_id: Id.optional(), version: Version }),
);

export const OwnDay = named(
  "OwnDay",
  "The caller's own part of one day, for the composer, the share extension and Your drops " +
    "(F02-your-drops, C08): their allowance, their highlight and their drops, and nobody else's (T15, " +
    "T55). It holds no other member's caption, so the share extension never fetches one.",
  z.object({
    server_now: Instant,
    occurrence: Occurrence,
    club: ClubRef,
    allowance: Allowance,
    highlight: HighlightPointer,
    drops: z.array(DropOwn).max(6),
  }),
);

const homeBase = {
  server_now: Instant,
  club: ClubRef,
  club_today: LocalDate,
};

export const HomeDay = named(
  "HomeDay",
  "A day is open (reveal_at <= server_now < close_at): Home is that day's first page, with no card to open " +
    "first (spec 08, T5). `next` is the club's next day to open (H01-quiet's \"Next: Nina\"), never one " +
    "held because its star left (FQ63). `recent_days` are " +
    "secondary links, newest first. H01-first-drop's prompt is the app's own, once, right after joining; " +
    "here it targets `day.add_target`.",
  z.object({
    mode: tag("day"),
    ...homeBase,
    day: RevealedDay,
    next: Occurrence.optional(),
    recent_days: z.array(DayLink).max(6),
  }),
);

export const HomeWaiting = named(
  "HomeWaiting",
  "No day is open: the next person, the exact date and the countdown from `server_now` (spec 08, T5), " +
    "never a day held because its star left (FQ63), with " +
    "recent days as secondary links; after 1 AM and on Sunday too (book p29). Nothing here says whether " +
    "anyone has added, the caller included (T15, T33). H01-first-drop's prompt is the app's own, once, " +
    "right after joining; here it targets `next`.",
  z.object({
    mode: tag("waiting"),
    ...homeBase,
    next: Occurrence,
    recent_days: z.array(DayLink).max(6),
  }),
);

export const HomeNoDays = named(
  "HomeNoDays",
  "The club is active but has no confirmed day yet (spec 04, 05). It never invents a date (T49) and never " +
    "says who hasn't confirmed (T15).",
  z.object({ mode: tag("no_days"), ...homeBase }),
);

export const HomeAwaitingActivation = named(
  "HomeAwaitingActivation",
  "The club hasn't started: nobody has accepted its roster yet, or the first acceptance came under another " +
    "name and the revision made for it waits for the creator's approval and a candidate's acceptance " +
    "(spec 04, 08; FQ54, FQ84).",
  z.object({ mode: tag("awaiting_activation"), ...homeBase }),
);

export const HomePaused = named(
  "HomePaused",
  "Fewer than two members: no new days until someone joins, and Memories stays readable (FQ16). A " +
    "remaining member's day already announced still shows as usual until it passes (FQ50); a day held " +
    "because its star left never opens, so it's never Home's `day` or `next` and never keeps Home waiting " +
    "(FQ63).",
  z.object({ mode: tag("paused"), ...homeBase, recent_days: z.array(DayLink).max(6) }),
);

export const HomeUnavailable = named(
  "HomeUnavailable",
  "The club is suspended (spec 22): neutral, with no reason.",
  z.object({ mode: tag("unavailable"), ...homeBase }),
);

export const Home = tagged(
  "Home",
  "Home for one club, derived at read time from the server's clock and never stored (T1, T5). The mode is " +
    "chosen in this order: unavailable, awaiting_activation, day, waiting, paused, no_days. Lost access is " +
    "NOT_FOUND, not a mode.",
  "mode",
  [HomeDay, HomeWaiting, HomeNoDays, HomeAwaitingActivation, HomePaused, HomeUnavailable],
);

export const ExternalVideoPreview = named(
  "ExternalVideoPreview",
  "The author's own view of their external video (T11, T40): only `author-preview` returns it, and only to " +
    "its author.",
  z.object({ provider: Provider, original_url: z.url({ protocol: /^https$/ }).max(2048) }),
);

export const Embed = named(
  "Embed",
  "The official player for a revealed external video, after the reveal only (spec 17, T39, T40), and its " +
    "original. `player_url` is absent when the provider's switch is off or it has no player (FQ11): then " +
    "the app offers Open original.",
  z.object({
    provider: Provider,
    original_url: z.url({ protocol: /^https$/ }).max(2048),
    player_url: z
      .url({ protocol: /^https$/ })
      .max(2048)
      .optional(),
  }),
);
