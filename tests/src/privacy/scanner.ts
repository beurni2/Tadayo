/// <reference lib="esnext.temporal" />
// The leak scanner (TECH-DESIGN section 8; T10, T12, T14, T16; Q07): it checks every answer the
// privacy matrix produces, the author's included, against the contract and against the world the
// matrix built. Its facts about the world come from the world's rows, never from the authorization
// module it tests.
//
// It runs on every answer in every phase, not only on those before the reveal, as TECH-DESIGN
// section 8 asks: what opens at 7 AM is allowed by the phase (an opened card or day, a drop's own
// content version or link once its day has opened, to a viewer who may read it), so the same checks
// hold an answer before, during and after the day.
//
// Five checks, each named in its findings, all run on every answer, so a test can show that a check
// it plants against is the one that catches it:
// - shape: the status, its standard reason phrase, the headers and the body are what the operation
//   declares: Cache-Control on every answer with a body, Retry-After on a 429, the transport's
//   headers in their own forms (Connection, Transfer-Encoding, Fastify's own Keep-Alive, a Date that
//   is a real instant written as Node writes it and is the answer's time: inside the clock the
//   harness gives each answer, from the second it was asked less how far Node's cached Date may
//   lag, or from an earlier answer's Date if that is later, to the moment the answer came; a
//   Content-Length that is the body's, only JSON's Content-Type), an error with only its code's
//   fields, every 404 the neutral one (T14), no key the contract doesn't name at any depth (a
//   planted field), and every cursor in base64url as the server writes it (decoded and encoded
//   again, it is the same string), decoding to 12 bytes or more with no readable key among them:
//   not text from end to end (printable bytes, and the tab, newline and CR that JSON and lines put
//   between parts), and no run of 24 bytes of text, date, long number, id of the world or text
//   people wrote (the contract's Cursor: "never a readable key"), so a random handle goes out as
//   its own bytes, not as their text; nor, in the cursor's own text before it is decoded, a date
//   (`2026-11-06`, `2026_11_06` or `20261106T2000`, its T in either case), a run of 16 digits or an
//   id of the world (ownTextKey); nor, in the bytes it decodes to from its second, third or fourth
//   character (a key encoded behind a prefix, `c` or a handle of 22 characters, say: shiftedBytes),
//   a date of those forms, long number, id or text people wrote, a storage path or provider host,
//   or a value the world keeps back. An id is looked for whole and without its type tag, as its 22
//   characters or the 16 bytes they spell, in a cursor's own text and in its bytes (untaggedOf).
//   These checks catch a cursor's common readable forms; they can't prove it random. A key that
//   shows none of their marks passes, among others: one packed in binary; one in runs of text
//   shorter than 24 bytes among other bytes (a longer key split by a NUL, another control byte or a
//   non-ASCII byte); one written in base64url's own letters (`hidden_1_of_2_xx`, a count; a time in
//   milliseconds); one with a date in another writing than those above, in its own text or its
//   bytes: with no separator and no T after it (`20261106`), with its day or month first
//   (`06-11-2026`), or with a month or day of one digit (`2026-11-6`), or, in its bytes, with `/`,
//   `.` or a space between its parts (`2026/11/06`); one with an id written another way (as hex
//   text, say); and one encoded behind a prefix that is only text or a URL (`c` and
//   `offset=20&order=desc`, or `https://h.io/k`), which would fail random handles too often to look
//   for (shiftedBytes). A cursor is base64url as the server writes it as a whole, so a prefix of
//   text before a key's encoding gets it so only at some lengths (`c` before
//   `offset=20&order=desc` does; `v1` makes 29 characters, which no bytes encode to), and a cursor
//   that isn't is refused as such. The pager's row is to check its cursors, to hold its random
//   handles to 24 to 32 bytes, and to put a version tag inside the encoded bytes or in whole groups
//   of 4 characters (rows.ts);
// - whitelist: a caption card is exactly T10's list, as FQ74's answer reads it (this file's own
//   copy, so a contract change alone can't widen it);
// - world: each of these an answer names is the world's and the viewer's to see:
//   - a card's drop, in an audience holding an active interval of the viewer, or the viewer's own
//     for an own card, with the drop's own author and caption;
//   - each other drop reference (REFERENCES), in the form its schema gives it: the viewer's own,
//     from any interval of theirs (Your drops covers a club they've left); the viewer's own or in an
//     audience holding an active interval of theirs (a removal's receipt); in such an audience (a
//     hidden drop); or that and opened (reactions, favourites, comments, highlights, a day's cover),
//     and of its object's day;
//   - a day or a club (an Occurrence, a ClubRef, and the bare ids of BARE) only from a club the
//     viewer has an interval in, active or not; a ClubSummary only from one they are an active
//     member of, with their active interval;
//   - a person only from such a club, under the name members see, with no avatar version once the
//     person's interval or the viewer's in the club has ended, and never one who joined after the
//     viewer's last interval there ended (FQ75);
//   - an allowance that counts no more than the viewer's own drops in its day, photos and video links
//     alike, but those withdrawn before its reveal, and the viewer's reservations in it still live at
//     the answer's instant, with the limits of the viewer's own role in that day, the star's or anyone
//     else's (T17), and a day's ViewerDay from the viewer's own membership and the day's star (T15);
//   - a day link only to a closed day the viewer can read a drop in, its cover a photo;
//   - an account only as the viewer's own `Me`, with the id, name, avatar version, age confirmation and
//     version of the viewer's own row (spec 23: the only place an account id appears; none for a
//     caller with no session), and an invitation only as one the viewer accepted, with the club's name
//     and the inviter's name it holds (T7, T33);
//   - nothing opened before its day opens, and who reacted only for the drop's author while their
//     interval is active (FQ73);
// - keys: no key that names a URL, a token, a provider, dimensions, colours, a highlight or another
//   of T10's never-list, but inside what has opened, the viewer's own card and the viewer's own
//   highlight pointer;
// - values: text people wrote must be text the viewer may read (a person's name only if the viewer
//   may know the person, a roster label of a club they are in, or, of one they left, only from a
//   revision made before they left), as the world stored it, and is then served as written (T13
//   lets a caption hold a link, even another drop's), but a caption holding its own drop's
//   kept-back values (its post id, say: T13 refuses only its source URL at write) before that drop
//   opens to the viewer, its author included, as every kept-back value fails to its author until B3
//   serves an author their own (the author preview, T40's source details: below); in every other
//   value and header, no URL, storage path or provider host, and in the bytes a cursor decodes to no
//   storage path or provider host anywhere (from its first character, or from its second, third or
//   fourth: shiftedBytes), and, from its first, no URL in a run of text of 12 bytes or more,
//   whatever byte comes before each mark (LINK_MARKS, PATH_MARKS; a URL's marks, which random bytes
//   make now and then, only in such runs: URL_RUN; a URL in a shorter run among other bytes, such as
//   `s3://b/k`, passes, beyond what the scanner can see, like the short runs of text of the shape
//   check; the marks are literal, so an escaped or percent-encoded mark, a scheme not followed by
//   `//` (`mailto:`), a host with no scheme and no `www.` or `data:` before it (`//cdn.h.io/k`) and
//   the providers' other hosts aren't looked for, in a value, a header or a cursor, while `www.` and
//   `data:` are); in every other value, header
//   and decoded cursor, no value the world keeps back (a storage key, a content
//   version, a source's link or post id) but a drop's own once its day has opened to a viewer in its
//   audience, and no id of a drop, day, club, person, reservation, account or invitation the viewer may
//   not see, outside the positions the world check judges (an account's id is the viewer's `Me.id` and
//   nowhere else, their own included); and in every other string of the body, no text people
//   wrote that the viewer may not read, of 6 characters or more (an error's field, say). A header
//   holds no such text in a form the shape check allows.
//
// The facts are read from the world each answer was given in. A route that changes the world (a
// commit, a reservation, a leave or a block) is scanned against the world after its answer, by the
// slice that builds it: its row says how.
//
// Which drops a route may serve each role, in each state of the drop and phase of the day, is not
// the scanner's to judge: it knows the audience and the reveal, not T9's denials (a withdrawn, held
// or removed drop, a suspended or cancelled day, a suspended club, a deleting account, a block).
// Each route's row does that, for every drop id its answers hold (rows.ts).
//
// The answers TECH-DESIGN section 8 excepts, and the others that open at the reveal, are each
// allowed by the slice that first returns them, with its rule and its tests. Until then any URL,
// image, header or key of the never-list in them fails here:
// - the signed upload URL, which must name its intent's own object with overwriting off, and the
//   replays of that intent (spike S1's server part, then B3);
// - the invitation's preview to the person holding it, before they are in the club (B1, api/b1-accept):
//   a caller who presents a link's own token, in `previewInvitationWeb`, `previewInvitation` or
//   `acceptInvitation` (the context's `presented`, held to the SHA-256 the link's row keeps), may read
//   through it, while the link isn't revoked or replaced and its club isn't suspended (FQ59, FQ80):
//   signed out, the inviter's name alone, of a link nobody has used, before its expiry, whose candidate
//   is still open (T7); signed in, only when no other account accepted with the link and while the
//   candidate is on the club's open revision, the inviter's name, and, when the link is the account's
//   own or not yet expired, the club's name and that revision's names: its members' and its candidates'
//   labels (FQ47). The link's id is shown only in such an answer, as the link the caller presented: in
//   an acceptance only once it is the account's own. Nothing else of the club: no person's id, no
//   avatar, and no other revision's label (heldLink, Reader.texts);
// - the proposer's invitation link (B1, api/b1-propose): a link's id, in a revision's candidate
//   (CandidateInvitation), in createInvitation's answer (InvitationLink) and in revokeInvitation's
//   (RevokedInvitation), only to a viewer whose active interval proposed the link's candidate, whose
//   account is active and whose club isn't suspended, and only beside the candidate it is for (T14,
//   handoff 1); and createInvitation's `url`, only in its 201, only as `https://tadayo.app/i#` and
//   the token whose SHA-256 the link's row holds (T7, T52, FQ77). The matrix scans that one answer
//   before the world keeps the token back, and every later answer after, so a replay that carried
//   it would fail as any kept-back value does;
// - listClubs' invitations to the person who accepted one, before they are in the club: the club's
//   name and the inviter's name of an invitation bound to their account, read from the world's
//   invitations into their own text, and nothing else of that club (slice 8: Reader.texts);
// - the avatars' images (B1);
// - the author preview to its author, the media route's image and ETag after the reveal to the
//   drop's readers, and T40's source details to their resolver (B3);
// - the embed's provider and links after the reveal to the drop's readers, and the config's
//   provider switches (B7).

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { STATUS_CODES } from "node:http";
import { ApiError, OPERATIONS, standardErrors, statusOf, type Operation } from "@tadayo/contracts";
import { isObject, resolve, type ContractOperation, type Json, type JsonObject } from "./operations.ts";

export interface Answer {
  status: number;
  /** The reason phrase, as Node gives it. */
  reason: string;
  /** Lower-case names, as Node gives them, in the order they came. */
  headers: Readonly<Record<string, string>>;
  body: string;
  /**
   * The Dates it may carry, in wall-clock milliseconds, from the harness that asked for it
   * (answerOf): no later than the moment it came, and no earlier than the app's last answer's Date,
   * nor than the start of the second it was asked in less how far Node's cached Date may lag. A
   * planted answer without them may carry a Date within DATE_SLACK_MS of the wall clock.
   */
  clock?: { earliest: number; latest: number };
}

export type Check = "shape" | "whitelist" | "world" | "keys" | "values";

export interface Finding {
  check: Check;
  at: string;
  what: string;
}

export type MediaClass = "photo" | "external_video";

export interface WorldDrop {
  /** The author's membership interval. */
  author: string;
  day: string;
  media: MediaClass;
  /** Its state: a withdrawal before its day's reveal releases its slot (spec 11, T18). */
  state: "active" | "held" | "withdrawn" | "removed";
  /** When it was withdrawn or removed, or null while it is neither. */
  endedAt: Temporal.Instant | null;
  /** Its caption now. */
  caption: string | null;
  /** The intervals in its audience that are still active. */
  audience: ReadonlySet<string>;
  /** The text of its comments that are still there. */
  comments: readonly string[];
}

export interface WorldDay {
  club: string;
  /** The star's membership interval. */
  star: string;
  /** Its date in the club's timezone, such as 2026-11-07. */
  localDate: string;
  revealAt: Temporal.Instant;
  closeAt: Temporal.Instant;
  /** When it started collecting: a member who joined after it joined later (T15). */
  collectingFrom: Temporal.Instant;
  /** What denies it, if anything (T9): suspended or cancelled. */
  status: "scheduled" | "suspended" | "cancelled";
}

export interface WorldMember {
  club: string;
  /** Whose interval it is: an account of the world's. */
  account: string;
  /** The name members see (FQ75: the name it ended with, once ended), or null while it has none. */
  name: string | null;
  joinedAt: Temporal.Instant;
  /** When it ended, or null while it is active. */
  leftAt: Temporal.Instant | null;
}

export interface WorldReservation {
  /** Whose slot it holds. */
  interval: string;
  day: string;
  media: MediaClass;
  state: "live" | "released" | "expired" | "consumed";
  /** When it lapses, if it is still live (T18). */
  expiresAt: Temporal.Instant;
  /** The holder's own drop that used it, once consumed (T20); null otherwise. */
  drop: string | null;
}

export interface WorldClub {
  name: string;
  /** When moderation suspended it, or null while it isn't (spec 22). */
  suspendedAt: Temporal.Instant | null;
  /**
   * The labels of its roster revisions' candidates, each with when the first revision holding it was
   * made: a member saw it from then, so someone who left before then never did (FQ75).
   */
  labels: ReadonlyMap<string, Temporal.Instant>;
}

/** An account, as its row says (spec 23): what `Me` shows its owner, and no one else. */
export interface WorldAccount {
  /** Its state: a deletion begun makes it `deleting` (spec 23, T27). */
  state: "active" | "deleting" | "deleted";
  /** When its deletion was asked for, or null while it hasn't been. */
  deletionRequestedAt: Temporal.Instant | null;
  /** The profile name now, or null while it has none. */
  name: string | null;
  /** The content version of its avatar, or null while it has none. */
  avatar: string | null;
  ageConfirmed: boolean;
  version: number;
}

/** An invitation, as its rows say: the link, the candidate it is for and the club that candidate is to join. */
export interface WorldInvitation {
  /** The account that accepted it with its own link (T7), or null while no one has. */
  boundTo: string | null;
  club: string;
  /** Its candidate has joined the club: it is a membership now, and listClubs no longer lists the invitation. */
  joined: boolean;
  /** What listClubs shows of it: the club's name, and the name members see of whoever proposed the person (FQ75). */
  clubName: string;
  inviterName: string | null;
  /** Its candidate, by id. */
  candidate: string;
  /** The membership interval that proposed its candidate: the only one its link is shown to (T14, handoff 1). */
  proposedBy: string;
  /** The SHA-256 of its token, in hex, as its row keeps it: the token itself is in no row (T52, FQ77). */
  tokenSha256: string;
  /** It was revoked, or a newer link replaced it: it names nothing to anyone holding it (FQ59). */
  dead: boolean;
  expiresAt: Temporal.Instant;
  /**
   * What the club's open revision shows the link's candidate, while that candidate is still open on it:
   * the names of its members who are still members and the labels of its candidates (FQ47). Null when
   * the candidate is on no open revision.
   */
  roster: readonly string[] | null;
}

export interface WorldFacts {
  drops: ReadonlyMap<string, WorldDrop>;
  days: ReadonlyMap<string, WorldDay>;
  /** Each membership interval, active or not. */
  members: ReadonlyMap<string, WorldMember>;
  clubs: ReadonlyMap<string, WorldClub>;
  /** Each reservation, in any state. */
  reservations: ReadonlyMap<string, WorldReservation>;
  /**
   * What the world keeps back, each with the drops whose media it is: a photo's content version and
   * a video's link and post id are their drop's; storage keys, and the versions and links of uploads
   * and sources no drop holds, are no drop's. An avatar's version isn't kept back: it is part of a
   * person's display identity, shown before the reveal (FQ74, ADR-031).
   */
  canaries: ReadonlyMap<string, readonly string[]>;
  /** Each account of the world, by id. */
  accounts: ReadonlyMap<string, WorldAccount>;
  /** Each invitation of the world, by id. */
  invitations: ReadonlyMap<string, WorldInvitation>;
}

export interface Viewer {
  /** The viewer's account, which a caller without a session has none of. */
  account: string | null;
  /** The viewer's membership intervals, active or not; none for a caller without a session. */
  intervals: ReadonlySet<string>;
  /** Text that is the viewer's own: their profile's name, and the names they gave the people they blocked. */
  texts: ReadonlySet<string>;
}

export interface ScanContext {
  document: JsonObject;
  operation: ContractOperation;
  /** Whether the operation's row is the skeleton's NONE (rows.ts). */
  skeleton: boolean;
  viewer: Viewer;
  world: WorldFacts;
  /** The server's time of the answer, the cell's instant. */
  now: Temporal.Instant;
  /** The invitation token the request presented in its body, if it did (T7): what a link's holder holds. */
  presented?: string;
}

const NEUTRAL_BODY = '{"code":"NOT_FOUND"}';
const NO_STORE = "private, no-store";

const JSON_TYPE = "application/json; charset=utf-8";

/**
 * The transport's headers, which any answer may carry, each with the form its value must have.
 * Content-Type, Content-Length, Cache-Control and a 429's Retry-After are checked apart. Keep-Alive
 * is Node's for Fastify's own keepAliveTimeout, 72 seconds, which the API keeps
 * (services/api/src/app.test.ts pins it), so its value carries nothing; Connection is one of Node's
 * two, which the harness holds to the neutral answer's for every id; and a Date must also be the
 * answer's own time (transportProblem).
 */
export const TRANSPORT: Readonly<Record<string, RegExp>> = {
  date: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-3][0-9] (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-2][0-9]:[0-5][0-9]:[0-5][0-9] GMT$/,
  connection: /^(keep-alive|close)$/,
  "keep-alive": /^timeout=72$/,
  "transfer-encoding": /^chunked$/,
};

/** How far a planted answer's Date may be from the wall clock, with no clock of its own (Answer). */
const DATE_SLACK_MS = 30_000;

/** Whether `value` is the form the transport's header `name` must have (TRANSPORT). */
export function transportForm(name: string, value: string): boolean {
  return TRANSPORT[name]?.test(value) ?? false;
}

/**
 * How the transport's header `name` breaks its rule, or undefined when it keeps it: its form, and for
 * a Date, a real instant written exactly as Node writes it (its weekday that day's, no day 36 or hour
 * 29), inside the answer's clock (Answer). Node writes the wall clock, which the fake clock never
 * moves, and never sets it back, so any other Date carries something (a hidden instant, an existence
 * bit).
 */
export function transportProblem(name: string, value: string, clock?: Answer["clock"]): string | undefined {
  if (!transportForm(name, value)) return "a transport header whose value isn't its form";
  if (name !== "date") return undefined;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || new Date(at).toUTCString() !== value)
    return "a Date that isn't a real instant written as Node writes it";
  const now = Date.now();
  const { earliest, latest } = clock ?? { earliest: now - DATE_SLACK_MS, latest: now + DATE_SLACK_MS };
  if (at < earliest || at > latest) return "a Date that isn't the time of the answer: Node writes the clock's own";
  return undefined;
}

/** T10's list for a caption card, with the two ids FQ74's answer keeps; `caption` is optional. */
const CAPTION_CARD = { required: ["view", "id", "author", "media_class"], optional: ["caption"] };
const CARD_AUTHOR = { required: ["membership_id", "display_name"], optional: ["avatar_version"] };
const MEDIA_CLASSES = new Set(["photo", "external_video"]);

/** A key that names one of T10's never-list or a way to reach media, as a word of the key. */
export const NEVER_KEY = new RegExp(
  "(^|_)(url|uri|href|src|link|token|thumbnail|thumb|poster|blur|blurhash|hash|colour|color|width|height|" +
    "dimension|aspect|ratio|embed|html|source|provider|alt|exif|captured|capture|duration|size|bytes|highlight|" +
    "title|waveform|original|media_version)s?(_|$)",
  "i",
);

/** A value that is a URL, a storage path or a provider's host. */
export const NEVER_VALUE = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /(^|[^a-z0-9])www\./i,
  /(^|[^a-z0-9])data:/i,
  /(^|[^a-z0-9])(uploads|renditions)\//i,
  /(tiktok|instagram)\.com/i,
];

/**
 * NEVER_VALUE's marks as the scanner looks for them in the bytes a cursor decodes to, where the byte
 * before a mark may be the last of another field, a letter or a digit about one time in four (62 of
 * 256 byte values): so no byte is asked for before `www.`, `data:` or a storage path. A URL's marks
 * (a scheme, `www.`, `data:`), which random bytes make now and then, are looked for in a cursor's
 * runs of text of 12 bytes or more (URL_RUN).
 */
/** A proposer's link as createInvitation answers it: the web page, and the token in the fragment (T52). */
const LINK_URL = /^https:\/\/tadayo\.app\/i#([A-Za-z0-9_-]{43})$/;
const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\/\//i, /www\./i, /data:/i];

/**
 * A storage path's and a provider host's marks in a cursor's bytes, looked for in all of them, since
 * random bytes don't make them at the matrix's scale: `uploads/` turns up in 384 random bytes about
 * once in 380 trillion handles, the others less often.
 */
const PATH_MARKS = [/(uploads|renditions)\//i, /(tiktok|instagram)\.com/i];

/** The schemas whose values are text people wrote. */
const PEOPLE_TEXT = new Set(["Caption", "CommentText", "DisplayName", "ClubName", "CandidateLabel"]);

/**
 * The fewest bytes a cursor decodes to: 12, the length of the contract's own example cursor
 * (listMemories' `q8ZrT2vLm5XcW0nB`), the shortest random handle the contract shows, and less than
 * any sealed value's nonce and tag. Fewer bytes are a key too short to be either (the contract's
 * Cursor).
 */
const CURSOR_BYTES = 12;

/**
 * A run of text in a cursor that is readable: 24 bytes or more, each printable or the tab, newline
 * or CR that JSON and lines of key=value put between parts, so random bytes never make one at the
 * matrix's scale. Random bytes are text 98 times in 256: a place in them starts a run of 24 with a
 * chance of about 1e-10, and one of 16 with about 2e-7, so 32 random bytes hold a run of 24 about
 * once in 1.7 billion, and one of 16 about once in 430,000, which the sealed cursors of every paged
 * answer in a run would meet. Runs of text shorter than 24 bytes among other bytes, with no date,
 * long number, id, text people wrote, value the world keeps back, storage path or provider host in
 * them, and no URL in those of 12 bytes or more (URL_RUN), pass, like a key packed in binary, and so does a longer key split by a
 * NUL, another control byte or a non-ASCII byte among them: the pager's row judges all of these.
 */
const READABLE_TEXT = /[\t\n\r\x20-\x7e]{24,}/;

/** A cursor whose bytes are all text, READABLE_TEXT's bytes: a readable key, whatever it holds. */
const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;

/**
 * A date in a cursor's own text, before it is decoded, in this century: `2026-11-06` or
 * `2026_11_06` (base64url's two separators), or `20261106T2000` (or `t2000`) without them. Random
 * base64url text makes one about once in 100 billion handles of 32 bytes. A date with no separator
 * and no T after it, `20261106`, it would make about once in 100 million, too often to fail; one with
 * its day or month first (`06-11-2026`), which it makes about as rarely as these, isn't looked for,
 * nor is one with a month or day of one digit (`2026-11-6`), which it makes about once in 170 million
 * handles of 32 bytes (245 million of 24), too often to fail. No form is looked for that has a `/`,
 * a `.` or a space: base64url has none of them, so a cursor holding one is refused as not base64url.
 */
const OWN_DATE = /20[0-9]{2}([-_][01][0-9][-_][0-3][0-9]|[01][0-9][0-3][0-9][Tt][0-9]{4})/;

/**
 * A date as a key's bytes spell it: `2026-11-06` or `2026_11_06`, or `20261106T2000` (its T either
 * case). Random bytes make one about once in 130 trillion handles of 32 bytes (and once in 8
 * trillion of 384), so no digit's range is asked for beyond the form's own. A date in another writing
 * (`2026/11/06`, `2026.11.06`, `2026 11 06`, `2026-11-6`, `06-11-2026`, `20261106`) isn't looked for.
 */
const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;

/**
 * A run of 16 digits or more in a cursor's own text: a time to the microsecond, such as a commit time
 * (`1793995200000000`). Random base64url text makes one about once in 330 billion handles of 32
 * bytes; a shorter run, such as a time in milliseconds, it makes too often to fail (a run of 13 about
 * once in a billion). A handle written as hex text, not as its bytes, makes one often (about once in
 * 140 of 24 bytes): a random handle goes out as its bytes in base64url (the contract's Cursor).
 */
const OWN_NUMBER = /[0-9]{16,}/;

/**
 * A run of text in a cursor's bytes long enough to read a URL in: 12 bytes or more, where the
 * scanner looks for a URL's marks (LINK_MARKS). Random bytes hold a letter and `://` about once in
 * 3.7 million handles of 24 bytes and once in 2.7 million of 32, which the matrix's runs would meet;
 * inside a run of text of 12 bytes or more, about once in 2 billion and once in 1.2 billion, and
 * `www.` about once in 15 billion and once in 9 billion. A URL in a shorter run among other bytes,
 * such as `s3://b/k`, passes, as the scanner's header says.
 * A storage path's or a provider host's marks (PATH_MARKS), which random bytes don't make, are
 * looked for in all of a cursor's bytes.
 */
const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;

/** Text people wrote this short isn't looked for inside other values, where it could occur by chance. */
const SHORTEST_TEXT = 6;

/**
 * The ids of days and clubs outside Occurrence, ClubRef and ClubSummary objects, by the schema that
 * holds them and its field (a string, or a list of them): each must be the world's, and of a club
 * the viewer has an interval in.
 */
const BARE: Readonly<Record<string, readonly { field: string; kind: "day" | "club" }[]>> = {
  Reservation: [{ field: "occurrence_id", kind: "day" }],
  LeftClub: [{ field: "club_id", kind: "club" }],
  BlockResult: [{ field: "left_club_ids", kind: "club" }],
};

/** The fields each error code carries beside `code` (errors.ts), this file's own copy: no others. */
const ERROR_FIELDS: Readonly<Record<string, readonly string[]>> = {
  INVALID_REQUEST: ["field"],
  OCCURRENCE_CLOSED: ["target", "next_target"],
  QUOTA_FULL: ["target", "allowance", "next_target"],
  EXTERNAL_LIMIT: ["target", "allowance", "next_target"],
  PHOTO_LIMIT: ["target", "allowance", "next_target"],
  VERSION_CONFLICT: ["current_version"],
  MEMBERSHIP_CHANGED: ["target", "current_id"],
  ROSTER_CHANGED: ["current_id"],
  DUPLICATE_DROP: ["existing_drop_id"],
  RATE_LIMITED: ["retry_after_seconds"],
};

/**
 * The drop references outside cards, by the schema that holds them and its field, each with whose
 * the drop must be, from the schema's own description: the viewer's own, from any interval of
 * theirs; the viewer's own or in an audience holding an active interval of theirs (a removal's
 * receipt: an author may withdraw after leaving); in such an audience; or that, and opened.
 */
const REFERENCES: Readonly<Record<string, { field: string; form: "own" | "readable" | "audience" | "opened" }>> = {
  OwnContribution: { field: "drop_id", form: "own" },
  DropReceipt: { field: "drop_id", form: "own" },
  DropVersion: { field: "drop_id", form: "own" },
  ReleasedReservation: { field: "drop_id", form: "own" },
  HighlightPointer: { field: "drop_id", form: "own" },
  Error: { field: "existing_drop_id", form: "own" },
  RemovedDrop: { field: "drop_id", form: "readable" },
  HiddenDrop: { field: "drop_id", form: "audience" },
  ReactionState: { field: "drop_id", form: "opened" },
  FavouriteState: { field: "drop_id", form: "opened" },
  CommentReceipt: { field: "drop_id", form: "opened" },
  ThreadNotifications: { field: "drop_id", form: "opened" },
  HighlightEntry: { field: "drop_id", form: "opened" },
  DayLink: { field: "cover_drop_id", form: "opened" },
};

function contractOperation(id: string): Operation {
  const operation = OPERATIONS.find((candidate) => candidate.id === id);
  if (!operation) throw new Error(`the contract has no operation ${id}`);
  return operation;
}

const before = (one: Temporal.Instant, other: Temporal.Instant) => Temporal.Instant.compare(one, other) < 0;

/** What the viewer may see of the world, from its rows and the cell's instant. */
interface Reader {
  /** The clubs the viewer has an interval in, active or not. */
  clubs: ReadonlySet<string>;
  /** The clubs the viewer has an active interval in. */
  activeClubs: ReadonlySet<string>;
  /** The viewer's intervals in `club`, active or not. */
  intervalsIn(club: string): string[];
  drop(id: unknown): WorldDrop | undefined;
  /** The drop's author is the viewer, from any interval of theirs. */
  own(drop: WorldDrop): boolean;
  /** The drop's author is the viewer, from an interval still active. */
  ownActive(drop: WorldDrop): boolean;
  /** The drop's audience holds an active interval of the viewer. */
  inAudience(drop: WorldDrop): boolean;
  /** The viewer may know the drop and its caption: their own, or in its audience. */
  readable(drop: WorldDrop): boolean;
  opened(day: unknown): boolean;
  /** Whether a value kept back for `drops` may be shown: one of them in the viewer's audience, and opened. */
  shown(drops: readonly string[]): boolean;
  /**
   * The viewer may know the person (a membership interval): of a club the viewer is an active member
   * of, or of one they have left and who joined before the viewer's last interval there ended (FQ75).
   */
  knows(member: string): boolean;
  /**
   * The text people wrote that the viewer may read: their own; captions of their drops and of drops
   * in their audience, and comments once those have opened; the names of the people they may know;
   * their clubs' names; the roster labels of a club they are in, or of one they left from the
   * revisions made before they left; and the club's name and the inviter's name of an invitation they
   * accepted, which they read before they are in the club (T7).
   */
  texts: ReadonlySet<string>;
  /** The text people wrote, in the world or as the viewer's own, that the viewer may not read. */
  hidden: ReadonlySet<string>;
  /** Every text people wrote, in the world or as the viewer's own. */
  written: ReadonlySet<string>;
  /**
   * The ids of the world's drops, days, clubs, people, reservations, accounts and invitations the viewer
   * may not see: an account's and an invitation's id is no one's to see but where the world check
   * judges it, the viewer's own `Me.id` and the invitation they accepted.
   */
  unseen: ReadonlySet<string>;
  /** Every id of the world's drops, days, clubs, people, reservations, accounts and invitations, seen or not. */
  ids: ReadonlySet<string>;
  /** The ids' forms without their type tags (untaggedOf), of those that have them. */
  untagged(): readonly Untagged[];
}

/**
 * An id's forms other than the whole of it, which a key built from a row's id might take: the text
 * after its type tag (`drp_`, `occ_`), when that is 16 characters or more, as it is in every id of
 * the matrix's world (`newId`, tests/src/db/world.ts: a tag, `_` and 22 characters), and the bytes
 * it spells in base64url (16), when it is base64url as the server writes it. The contract's `Id` has
 * no tag, so an id of another shape has no such form, and its whole text is looked for as before. A
 * given 22 characters or 16 bytes turn up in random text or bytes about once in 2^128 places, so no
 * rate here moves. An id that is short after its tag (a test's own, `drp_ben`) has no such forms: a
 * few characters would turn up everywhere. An id written another way (as hex text, reversed, masked)
 * passes, as the header says.
 */
interface Untagged {
  text: string;
  bytes: Buffer | undefined;
}

const SHORTEST_UNTAGGED = 16;

function untaggedOf(id: string): Untagged | undefined {
  const cut = id.indexOf("_");
  const text = id.slice(cut + 1);
  if (cut < 0 || text.length < SHORTEST_UNTAGGED) return undefined;
  const bytes = Buffer.from(text, "base64url");
  return { text, bytes: bytes.toString("base64url") === text ? bytes : undefined };
}

/** The operations that take a link's token: what its holder may read comes through them alone. */
const HOLDER_OPERATIONS = new Set(["previewInvitationWeb", "previewInvitation", "acceptInvitation"]);

/**
 * The link the request presented the token of, with what its holder may read through it (the header's
 * rule): `shown`, the link's own id in an acceptance; `inviter`, the inviter's name; `roster`, the club's
 * name and the open revision's names too.
 * Undefined when the request presented no token of the world's, or isn't one of the holder's operations.
 */
function heldLink(
  context: ScanContext,
): { id: string; invitation: WorldInvitation; shown: boolean; inviter: boolean; roster: boolean } | undefined {
  const { world, viewer, now, presented } = context;
  if (presented === undefined || !HOLDER_OPERATIONS.has(context.operation.id)) return undefined;
  const hash = createHash("sha256").update(presented).digest("hex");
  const found = [...world.invitations].find(([, invitation]) => invitation.tokenSha256 === hash);
  if (found === undefined) return undefined;
  const [id, invitation] = found;
  const names = !invitation.dead && world.clubs.get(invitation.club)?.suspendedAt === null;
  const unexpired = before(now, invitation.expiresAt);
  if (context.operation.id === "previewInvitationWeb" || viewer.account === null) {
    const live = names && invitation.boundTo === null && unexpired && invitation.roster !== null;
    return { id, invitation, shown: live, inviter: live, roster: false };
  }
  const theirs = invitation.boundTo === viewer.account;
  // The link shows something to this account: its id in an acceptance, as when the account has joined by it.
  const shown = names && (invitation.boundTo === null || theirs);
  // Signed in too, a name is read through the link only while the candidate is on an open revision: once
  // the proposal has ended the answer is nothing, or `did_not_go_ahead` to the account that accepted with
  // it, whose inviter's name that account already reads as its own invitation's (Reader.texts, listClubs').
  const readable = shown && invitation.roster !== null;
  return { id, invitation, shown, inviter: readable, roster: readable && (theirs || unexpired) };
}

function readerOf(context: ScanContext): Reader {
  const { world, viewer, now } = context;
  const clubs = new Set<string>();
  const activeClubs = new Set<string>();
  for (const interval of viewer.intervals) {
    const member = world.members.get(interval);
    if (!member) continue;
    clubs.add(member.club);
    if (member.leftAt === null) activeClubs.add(member.club);
  }
  const intervalsIn = (club: string) =>
    [...viewer.intervals].filter((interval) => world.members.get(interval)?.club === club);
  const drop = (id: unknown) => (typeof id === "string" ? world.drops.get(id) : undefined);
  const own = (found: WorldDrop) => viewer.intervals.has(found.author);
  const ownActive = (found: WorldDrop) => own(found) && world.members.get(found.author)?.leftAt === null;
  const inAudience = (found: WorldDrop) => [...found.audience].some((interval) => viewer.intervals.has(interval));
  const readable = (found: WorldDrop) => own(found) || inAudience(found);
  const opened = (day: unknown) => {
    const found = typeof day === "string" ? world.days.get(day) : undefined;
    return found !== undefined && Temporal.Instant.compare(found.revealAt, now) <= 0;
  };
  const shown = (drops: readonly string[]) =>
    drops.some((id) => {
      const found = drop(id);
      return found !== undefined && inAudience(found) && opened(found.day);
    });
  // Whether the viewer was in `club` at `at` or later: an active member, or one whose interval there
  // ended no earlier than `at` (FQ75: a former member knows what was there while they were).
  const inClubSince = (club: string, at: Temporal.Instant) =>
    activeClubs.has(club) ||
    intervalsIn(club).some((interval) => {
      const end = world.members.get(interval)?.leftAt ?? null;
      return end !== null && !before(end, at);
    });
  const knows = (id: string) => {
    const member = world.members.get(id);
    return member !== undefined && clubs.has(member.club) && inClubSince(member.club, member.joinedAt);
  };
  const texts = new Set(viewer.texts);
  const written = new Set(viewer.texts);
  for (const found of world.drops.values()) {
    if (found.caption !== null) written.add(found.caption);
    for (const comment of found.comments) written.add(comment);
    if (readable(found) && found.caption !== null) texts.add(found.caption);
    if (inAudience(found) && opened(found.day)) for (const comment of found.comments) texts.add(comment);
  }
  for (const [id, member] of world.members) {
    if (member.name === null) continue;
    written.add(member.name);
    if (knows(id)) texts.add(member.name);
  }
  for (const [id, club] of world.clubs) {
    written.add(club.name);
    for (const label of club.labels.keys()) written.add(label);
    if (!clubs.has(id)) continue;
    texts.add(club.name);
    for (const [label, since] of club.labels) if (inClubSince(id, since)) texts.add(label);
  }
  for (const found of world.invitations.values()) {
    written.add(found.clubName);
    if (found.inviterName !== null) written.add(found.inviterName);
    if (viewer.account === null || found.boundTo !== viewer.account) continue;
    texts.add(found.clubName);
    if (found.inviterName !== null) texts.add(found.inviterName);
  }
  // What a link's holder reads through it: the inviter's name, and the exact roster's names (T7, FQ47).
  const held = heldLink(context);
  if (held?.inviter === true && held.invitation.inviterName !== null) texts.add(held.invitation.inviterName);
  if (held?.roster === true) {
    texts.add(held.invitation.clubName);
    for (const name of held.invitation.roster ?? []) texts.add(name);
  }
  const hidden = new Set([...written].filter((text) => !texts.has(text)));
  const unseen = new Set<string>();
  for (const [id, found] of world.drops) if (!readable(found)) unseen.add(id);
  for (const [id, day] of world.days) if (!clubs.has(day.club)) unseen.add(id);
  for (const id of world.members.keys()) if (!knows(id)) unseen.add(id);
  for (const id of world.clubs.keys()) if (!clubs.has(id)) unseen.add(id);
  for (const [id, reservation] of world.reservations) if (!viewer.intervals.has(reservation.interval)) unseen.add(id);
  for (const id of world.accounts.keys()) unseen.add(id);
  for (const id of world.invitations.keys()) unseen.add(id);
  const ids = new Set([
    ...world.drops.keys(),
    ...world.days.keys(),
    ...world.members.keys(),
    ...world.clubs.keys(),
    ...world.reservations.keys(),
    ...world.accounts.keys(),
    ...world.invitations.keys(),
  ]);
  // Only a cursor's checks ask for these, so they are made when one does.
  let untagged: Untagged[] | undefined;
  const untaggedIds = () => (untagged ??= [...ids].flatMap((id) => untaggedOf(id) ?? []));
  return {
    clubs,
    activeClubs,
    intervalsIn,
    drop,
    own,
    ownActive,
    inAudience,
    readable,
    opened,
    shown,
    knows,
    texts,
    hidden,
    written,
    unseen,
    ids,
    untagged: untaggedIds,
  };
}

/** Every object in `value`, with its path. */
function* objects(value: unknown, at = "$"): Generator<[JsonObject, string]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* objects(item, `${at}[${String(index)}]`);
  } else if (isObject(value)) {
    yield [value, at];
    for (const [key, child] of Object.entries(value)) yield* objects(child, `${at}.${key}`);
  }
}

/** Every string in `value`, with its path. */
function* strings(value: unknown, at = "$"): Generator<[string, string]> {
  if (typeof value === "string") yield [value, at];
  else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, `${at}[${String(index)}]`);
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) yield* strings(child, `${at}.${key}`);
  }
}

/**
 * Walks `value` along `schema`, resolving references and tagged unions: reports each key the schema
 * doesn't name, and the named schema each value has, by its path.
 */
function walk(
  document: JsonObject,
  schema: Json,
  value: unknown,
  at: string,
  name: string | undefined,
  out: { unknown: string[]; names: Map<string, string> },
): void {
  if (isObject(schema) && typeof schema.$ref === "string") {
    walk(document, resolve(document, schema), value, at, schema.$ref.split("/").pop(), out);
    return;
  }
  if (!isObject(schema)) return;
  if (Array.isArray(schema.oneOf)) {
    const discriminator = schema.discriminator;
    const property =
      isObject(discriminator) && typeof discriminator.propertyName === "string"
        ? discriminator.propertyName
        : undefined;
    const tag = property !== undefined && isObject(value) ? value[property] : undefined;
    const mapping = isObject(discriminator) && isObject(discriminator.mapping) ? discriminator.mapping : {};
    const chosen = typeof tag === "string" ? mapping[tag] : undefined;
    if (typeof chosen !== "string") out.unknown.push(`${at}: no member of the union for ${JSON.stringify(tag)}`);
    else walk(document, { $ref: chosen }, value, at, undefined, out);
    return;
  }
  if (name !== undefined && !Array.isArray(value)) out.names.set(at, name);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      walk(document, schema.items ?? null, item, `${at}[${String(index)}]`, undefined, out);
  } else if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key))
        walk(document, properties[key] ?? null, child, `${at}.${key}`, undefined, out);
      else if (isObject(schema.additionalProperties))
        walk(document, schema.additionalProperties, child, `${at}.${key}`, undefined, out);
      else out.unknown.push(`${at}.${key}`);
    }
  }
}

function exactKeys(node: JsonObject, list: { required: string[]; optional: string[] }): string[] {
  const allowed = new Set([...list.required, ...list.optional]);
  return [
    ...Object.keys(node)
      .filter((key) => !allowed.has(key))
      .map((key) => `has ${key}`),
    ...list.required.filter((key) => !Object.hasOwn(node, key)).map((key) => `lacks ${key}`),
  ];
}

/** The drop ids inside an object that holds one day (`occurrence`), each with its path. */
function dayReferences(node: JsonObject, at: string): [unknown, string][] {
  const found: [unknown, string][] = [];
  if (isObject(node.drop)) found.push([node.drop.id, `${at}.drop`]);
  for (const [field, key] of [
    ["drops", "id"],
    ["highlights", "drop_id"],
  ] as const) {
    const items = node[field];
    if (!Array.isArray(items)) continue;
    for (const [index, item] of items.entries()) {
      if (isObject(item)) found.push([item[key], `${at}.${field}[${String(index)}]`]);
    }
  }
  for (const field of ["drop_id", "cover_drop_id"]) {
    if (node[field] !== undefined) found.push([node[field], `${at}.${field}`]);
  }
  return found;
}

/** The bytes `cursor` decodes to as base64url, and whether it is base64url as the server writes it. */
function decodeCursor(cursor: string): { bytes: Buffer; canonical: boolean } {
  const bytes = Buffer.from(cursor, "base64url");
  return { bytes, canonical: bytes.toString("base64url") === cursor };
}

/**
 * What in the bytes a cursor decodes to makes it a readable key, not a random handle or a sealed
 * value (the contract's Cursor: "never a readable key, so it carries no time, order key or count"):
 * too few bytes to be either, text from end to end (ALL_TEXT), a run of readable text
 * (READABLE_TEXT), a date, a long number (a time or a count), an id of the world, or text people
 * wrote. Random handles are text from end to end about once in 100,000 of 12 bytes and once in 4.7
 * million of 16, and from 24 bytes READABLE_TEXT catches them anyway, about once in 10 billion of 24:
 * the pager's row is to hold its random handles to 24 to 32 bytes (rows.ts). A key packed in binary
 * with none of these, or runs of text shorter than 24 bytes among other bytes (a longer key split by
 * a NUL, another control byte or a non-ASCII byte among them), looks like random bytes to the
 * scanner: how the pager makes its cursors is the row of the slice that builds it. A key written in
 * base64url's own letters is read in the cursor's own text (ownTextKey), and one encoded behind a
 * prefix from the cursor's later characters (shiftedBytes).
 */
function readableKey(bytes: Buffer, reader: Reader): string[] {
  const text = bytes.toString("latin1");
  const reasons: string[] = [];
  if (bytes.length < CURSOR_BYTES) reasons.push(`decodes to fewer than ${String(CURSOR_BYTES)} bytes`);
  if (ALL_TEXT.test(text)) reasons.push("is text from end to end");
  if (READABLE_TEXT.test(text)) reasons.push("holds readable text");
  return [...reasons, ...marksIn(bytes, reader)];
}

/**
 * The marks of a readable key in a cursor's bytes, which random bytes don't make at the matrix's
 * scale: a date, a long number (a time or a count), an id of the world, or text people wrote. A long
 * number is 10 digits or more, which a time in seconds is. An id is looked for whole, as its text
 * without its type tag, and as the 16 bytes that text spells (untaggedOf). Text people wrote counts
 * from 4 characters: a name of 3 (Ben) would turn up in 24 random bytes, over the four decodings
 * that run this, about once in 200,000 handles, for each such name in a world.
 */
function marksIn(bytes: Buffer, reader: Reader): string[] {
  const text = bytes.toString("latin1");
  const reasons: string[] = [];
  if (BYTES_DATE.test(text)) reasons.push("holds a date");
  if (/[0-9]{10,}/.test(text)) reasons.push("holds a long number, such as a time or a count");
  if (
    [...reader.ids].some((id) => text.includes(id)) ||
    reader
      .untagged()
      .some((form) => text.includes(form.text) || (form.bytes !== undefined && bytes.includes(form.bytes)))
  )
    reasons.push("holds an id");
  if ([...reader.written].some((written) => written.length >= 4 && bytes.includes(Buffer.from(written))))
    reasons.push("holds text people wrote");
  return reasons;
}

/**
 * The bytes a cursor decodes to from its second, third and fourth characters. A key encoded in
 * base64url behind a prefix (`c`, say, or a random handle of 16 bytes, 22 characters) decodes from
 * the first character to bytes that look random unless the prefix is a whole number of groups of 4
 * characters, and from one of these three characters to its own: only the prefix's length in
 * characters, modulo 4, matters. The cursor as a whole must be base64url as the server writes it
 * (decodeCursor), which a text prefix before a key's encoding is only at some lengths: one character
 * before a key of 2 mod 3 bytes, two before 1 mod 3, three before a multiple of 3 whose last byte is
 * a multiple of 4; a cursor that isn't is refused, whatever its key. Only checks random bytes don't
 * trip are run on these bytes: marksIn, the storage paths and provider hosts (PATH_MARKS) and the
 * values kept back. Text from end to end in them would fail random handles of 24 bytes about once in
 * 370 million, four times as often as every other check together, and a URL's scheme in a run of
 * text would add to that: so a key behind a prefix that is only text, or a URL with a scheme, passes,
 * as the header says.
 */
function shiftedBytes(cursor: string): Buffer[] {
  return [1, 2, 3].map((shift) => Buffer.from(cursor.slice(shift), "base64url"));
}

/**
 * What in a cursor's own text, before it is decoded, makes it a readable key: a key written in
 * base64url's own letters decodes to bytes that look random (`1793995200000000` decodes to 12 bytes
 * with no text in them), so the checks of readableKey can't see it. A date (OWN_DATE), a run of 16
 * digits (OWN_NUMBER), or an id of the world (an order key: the matrix's ids are 26 characters or
 * more, which random text never makes), whole or without its type tag (untaggedOf). Together the
 * date and the number fail random handles about once in 120 billion of 24 bytes and once in 80
 * billion of 32. A key in base64url's letters with none of these (`hidden_1_of_2_xx`, a count) looks
 * like a random handle to the scanner: the pager's row is to check its cursors (rows.ts).
 */
function ownTextKey(cursor: string, reader: Reader): string[] {
  const reasons: string[] = [];
  if (OWN_DATE.test(cursor)) reasons.push("holds a date in its own text");
  if (OWN_NUMBER.test(cursor)) reasons.push("holds a long number, such as a time, in its own text");
  if ([...reader.ids].some((id) => cursor.includes(id)) || reader.untagged().some((form) => cursor.includes(form.text)))
    reasons.push("holds an id in its own text");
  return reasons;
}

/** What the leak scanner finds in `answer`. An empty list is a clean answer. */
export function scan(answer: Answer, context: ScanContext): Finding[] {
  const findings: Finding[] = [];
  const find = (check: Check, at: string, what: string) => findings.push({ check, at, what });
  const operation = contractOperation(context.operation.id);
  const declared = context.operation.responses.get(answer.status);
  const reader = readerOf(context);
  const world = context.world;
  // B0's skeleton answers the neutral NOT_FOUND on every path (docs/plans/B0.md, slice 7), 13 of
  // which declare no 404: allowed while the operation's row is NONE, and only that answer.
  const skeleton404 = context.skeleton && answer.status === 404 && declared === undefined;

  /** Nothing kept back, and no id the viewer may not see, in `value` (a header's, a string's or a cursor's bytes). */
  const keptBack = (value: string, at: string) => {
    for (const [canary, drops] of world.canaries) {
      if (value.includes(canary) && !reader.shown(drops)) find("values", at, "a value the world keeps back (Q07)");
    }
    for (const id of reader.unseen) {
      if (value.includes(id))
        find(
          "values",
          at,
          "an id of a drop, day, club, person, reservation, account or invitation the viewer may not see (T14)",
        );
    }
  };
  const noLinks = (value: string, at: string, patterns = NEVER_VALUE) => {
    for (const pattern of patterns) {
      if (pattern.test(value)) find("values", at, `a URL, storage path or provider host: ${pattern.source}`);
    }
  };

  // shape: the status, the reason, the headers, the body.
  if (!declared && !skeleton404)
    find("shape", "status", `${String(answer.status)} isn't an answer ${operation.id} declares`);
  if (answer.reason !== STATUS_CODES[answer.status])
    find(
      "shape",
      "reason",
      `${JSON.stringify(answer.reason)} isn't the standard reason phrase for ${String(answer.status)}`,
    );
  if (answer.status === 404 && answer.body !== NEUTRAL_BODY)
    find("shape", "body", "a not-found that isn't the neutral one (T14)");
  for (const [header, value] of Object.entries(answer.headers)) {
    const where = `header ${header}`;
    if (Object.hasOwn(TRANSPORT, header)) {
      const problem = transportProblem(header, value, answer.clock);
      if (problem !== undefined) find("shape", where, problem);
    } else if (header === "content-length") {
      if (value !== String(Buffer.byteLength(answer.body))) find("shape", where, "not the body's length in bytes");
    } else if (header === "content-type") {
      if (value !== JSON_TYPE)
        find("shape", where, "a type that isn't JSON: no answer may carry an image or other bytes yet");
    } else if (header !== "cache-control" && !(header === "retry-after" && answer.status === 429)) {
      find("shape", where, "a header no answer may carry before its slice allows it");
    }
    noLinks(value, where);
    keptBack(value, where);
  }
  // The contract's CacheControl: on every answer with a body; an empty one may leave it out.
  const cacheControl = answer.headers["cache-control"];
  if (answer.body === "" ? cacheControl !== undefined && cacheControl !== NO_STORE : cacheControl !== NO_STORE) {
    find(
      "shape",
      "header cache-control",
      "an answer with a body says private, no-store, and an empty one says that or nothing (T11, T12)",
    );
  }
  if (answer.status === 429) {
    const after = answer.headers["retry-after"] ?? "";
    if (!/^[1-9][0-9]{0,4}$/.test(after) || Number(after) > 86_400)
      find("shape", "header retry-after", "a 429 says the seconds to wait, 1 to 86400 (the contract's RetryAfter)");
  }
  let body: unknown;
  if (answer.body === "") {
    if (declared && declared.media.length > 0) find("shape", "body", "empty, where the operation declares a body");
  } else {
    if (answer.headers["content-type"] === undefined) {
      find("shape", "header content-type", "a body that isn't JSON: no answer may carry an image or other bytes yet");
    }
    try {
      body = JSON.parse(answer.body);
    } catch {
      find("shape", "body", "not JSON: no answer may carry an image or other bytes yet");
    }
  }
  if (body !== undefined) {
    if (answer.status >= 400) {
      const error = ApiError.safeParse(body);
      if (!error.success || !isObject(body)) find("shape", "$", "not the contract's Error");
      else {
        const code = error.data.code;
        const declaredCodes: string[] = [...standardErrors(operation), ...(operation.errors ?? [])];
        if (statusOf(code) !== answer.status) find("shape", "$.code", `${code} isn't a ${String(answer.status)}`);
        if (!declaredCodes.includes(code) && !(skeleton404 && code === "NOT_FOUND")) {
          find("shape", "$.code", `${code} isn't a code ${operation.id} declares`);
        }
        const fields = ERROR_FIELDS[code] ?? [];
        for (const key of Object.keys(body)) {
          if (key !== "code" && !fields.includes(key))
            find("shape", `$.${key}`, `a field ${code} doesn't carry (errors.ts)`);
        }
      }
    } else if (operation.ok.status === answer.status && "json" in operation.ok) {
      if (!operation.ok.json.safeParse(body).success) find("shape", "$", `not ${operation.id}'s declared answer`);
    } else {
      find("shape", "$", `a JSON body where ${operation.id} declares none`);
    }
  }
  const schema: Json = declared?.json ?? (skeleton404 ? { $ref: "#/components/schemas/Error" } : null);
  const walked = { unknown: [] as string[], names: new Map<string, string>() };
  if (body !== undefined) walk(context.document, schema, body, "$", undefined, walked);
  for (const at of walked.unknown) find("shape", at, "a key the contract doesn't name");

  // whitelist: T10's caption card, this file's own copy.
  for (const [node, at] of objects(body)) {
    if (node.view !== "caption") continue;
    for (const problem of exactKeys(node, CAPTION_CARD)) find("whitelist", at, `a caption card ${problem} (T10)`);
    if (typeof node.media_class !== "string" || !MEDIA_CLASSES.has(node.media_class)) {
      find("whitelist", `${at}.media_class`, "neither photo nor external_video (T10)");
    }
    if (!isObject(node.author)) find("whitelist", `${at}.author`, "not a person (T10)");
    else
      for (const problem of exactKeys(node.author, CARD_AUTHOR))
        find("whitelist", `${at}.author`, `${problem} (T10, FQ74)`);
  }

  // world: every card, drop reference, person, day, club, allowance and day link against the
  // world's rows. Each id it judges is recorded, so the values check looks for unseen ids elsewhere.
  const judged = new Set<string>();
  const ownCards = new Set<JsonObject>();
  // The paths of a link's `url` the world check allowed: createInvitation's, to the link's proposer.
  const ownLinkUrls = new Set<string>();
  /** A proposer's link, by its id at `at`: only to a viewer whose active interval proposed its candidate. */
  const proposersLink = (id: unknown, at: string): WorldInvitation | undefined => {
    judged.add(at);
    const invitation = typeof id === "string" ? world.invitations.get(id) : undefined;
    if (!invitation) {
      find("world", at, "a link this world doesn't have");
      return undefined;
    }
    const proposer = world.members.get(invitation.proposedBy);
    if (!context.viewer.intervals.has(invitation.proposedBy) || proposer?.leftAt !== null) {
      find("world", at, "a link whose candidate no active interval of the viewer proposed (T14, handoff 1)");
      return undefined;
    }
    // As the routes' own rule has it (authorization/member.ts): nothing of a suspended club, and nothing
    // to an account that isn't active.
    const account = context.viewer.account === null ? undefined : world.accounts.get(context.viewer.account);
    if (world.clubs.get(invitation.club)?.suspendedAt !== null || account?.state !== "active") {
      find("world", at, "a link of a suspended club, or to an account that isn't active (FQ80)");
      return undefined;
    }
    return invitation;
  };
  const whoReacted = (node: JsonObject, at: string, drop: WorldDrop) => {
    if (!Array.isArray(node.reactions) || reader.ownActive(drop)) return;
    for (const [index, reaction] of node.reactions.entries()) {
      if (isObject(reaction) && reaction.people !== undefined)
        find(
          "world",
          `${at}.reactions[${String(index)}].people`,
          "who reacted, to someone but the drop's author while their interval is active (FQ73)",
        );
    }
  };
  const mine = (interval: string) => context.viewer.intervals.has(interval);
  for (const [node, at] of objects(body)) {
    const kind = walked.names.get(at);
    if (Object.hasOwn(node, "view")) {
      judged.add(`${at}.id`);
      const drop = reader.drop(node.id);
      if (node.view !== "caption" && node.view !== "own" && node.view !== "revealed") {
        find("world", at, `a card whose view is ${JSON.stringify(node.view)}`);
      } else if (!drop) {
        find("world", at, "a card for a drop this world doesn't have");
      } else {
        if (node.view === "own") {
          if (reader.own(drop)) ownCards.add(node);
          else find("world", at, "someone else's drop as the viewer's own");
        } else if (!reader.inAudience(drop)) {
          find("world", at, "a drop whose audience holds no active interval of the viewer (T8, T9)");
        }
        if (node.view === "revealed" && !reader.opened(drop.day)) {
          find("world", at, "a revealed card before its day opens (T10)");
        }
        const author = isObject(node.author) ? node.author : {};
        if (author.membership_id !== drop.author) find("world", `${at}.author`, "not the drop's author");
        if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop's own caption");
        whoReacted(node, at, drop);
      }
    }
    const reference = kind === undefined ? undefined : REFERENCES[kind];
    if (reference !== undefined && node[reference.field] !== undefined) {
      const where = `${at}.${reference.field}`;
      judged.add(where);
      const drop = reader.drop(node[reference.field]);
      if (!drop) find("world", where, "a drop this world doesn't have");
      else if (reference.form === "own") {
        if (!reader.own(drop)) find("world", where, `someone else's drop in the viewer's own ${String(kind)}`);
        if (kind === "OwnContribution" && (node.caption ?? null) !== drop.caption)
          find("world", `${at}.caption`, "not the drop's own caption");
      } else if (reference.form === "readable") {
        if (!reader.readable(drop))
          find(
            "world",
            where,
            "neither the viewer's own drop nor one whose audience holds their active interval (T8, T9)",
          );
      } else {
        if (!reader.inAudience(drop))
          find("world", where, "a drop whose audience holds no active interval of the viewer (T8, T9)");
        if (reference.form === "opened" && !reader.opened(drop.day))
          find("world", where, `a drop in a ${String(kind)} before its day opens (T10, FQ21)`);
        if (kind === "HighlightEntry" && isObject(node.author) && node.author.membership_id !== drop.author)
          find("world", `${at}.author`, "not the drop's author");
        if (kind === "ReactionState") whoReacted(node, at, drop);
      }
    }
    for (const { field, kind: bare } of kind === undefined ? [] : (BARE[kind] ?? [])) {
      const value = node[field];
      const items: [unknown, string][] = Array.isArray(value)
        ? value.map((item, index) => [item, `${at}.${field}[${String(index)}]`])
        : value === undefined
          ? []
          : [[value, `${at}.${field}`]];
      for (const [id, where] of items) {
        judged.add(where);
        const club =
          typeof id !== "string"
            ? undefined
            : bare === "day"
              ? world.days.get(id)?.club
              : world.clubs.has(id)
                ? id
                : undefined;
        if (club === undefined) find("world", where, `a ${bare} this world doesn't have`);
        else if (!reader.clubs.has(club))
          find("world", where, `a ${bare} of a club the viewer has no interval in (T14)`);
      }
    }
    if (kind === "Person") {
      judged.add(`${at}.membership_id`);
      const membership = typeof node.membership_id === "string" ? node.membership_id : "";
      const member = world.members.get(membership);
      if (!member) find("world", at, "a person this world doesn't have");
      else if (!reader.clubs.has(member.club))
        find("world", at, "a person of a club the viewer has no interval in (T14)");
      else {
        if (node.display_name !== member.name) find("world", `${at}.display_name`, "not the name members see (FQ75)");
        const active = reader.activeClubs.has(member.club);
        if ((member.leftAt !== null || !active) && node.avatar_version !== undefined)
          find(
            "world",
            `${at}.avatar_version`,
            "an avatar version once the person's or the viewer's interval has ended (FQ75)",
          );
        if (!reader.knows(membership))
          find("world", at, "a person who joined after the viewer's last interval in the club ended (T14)");
      }
    }
    if (kind === "Me") {
      // The only place an account id appears (spec 23): the viewer's own, with the viewer's own row's fields.
      judged.add(`${at}.id`);
      const account = context.viewer.account;
      const row = account === null ? undefined : world.accounts.get(account);
      if (account === null) find("world", at, "an account shown to a caller with no session (spec 23)");
      else if (row === undefined) find("world", at, "an account this world doesn't have");
      else {
        if (node.id !== account)
          find("world", `${at}.id`, "not the viewer's own account id, which no one else's appears beside (spec 23)");
        if ((node.display_name ?? null) !== row.name) find("world", `${at}.display_name`, "not the viewer's own name");
        if ((node.avatar_version ?? null) !== row.avatar)
          find("world", `${at}.avatar_version`, "not the viewer's own avatar's version");
        if (node.age_confirmed !== row.ageConfirmed)
          find("world", `${at}.age_confirmed`, "not whether the viewer's age is confirmed (FQ13)");
        if (node.version !== row.version) find("world", `${at}.version`, "not the viewer's own account's version");
      }
    }
    if (kind === "CandidateInvitation") proposersLink(node.id, `${at}.id`);
    if (kind === "Candidate" && isObject(node.invitation)) {
      // The link is this candidate's own, never another's shown under it.
      const invitation = typeof node.invitation.id === "string" ? world.invitations.get(node.invitation.id) : undefined;
      if (invitation !== undefined && invitation.candidate !== node.id)
        find("world", `${at}.invitation.id`, "a link shown under a candidate it isn't for");
    }
    if (kind === "RevokedInvitation") proposersLink(node.invitation_id, `${at}.invitation_id`);
    if (kind === "InvitationLink") {
      const invitation = proposersLink(node.invitation_id, `${at}.invitation_id`);
      if (invitation !== undefined && node.candidate_id !== invitation.candidate)
        find("world", `${at}.candidate_id`, "not the candidate the link is for");
      if (node.url !== undefined && invitation !== undefined) {
        // The token, once: in createInvitation's 201 alone, and only this link's own (T7, T52, FQ77).
        const token = typeof node.url === "string" ? LINK_URL.exec(node.url)?.[1] : undefined;
        if (operation.id !== "createInvitation" || answer.status !== 201)
          find("world", `${at}.url`, "a link's URL outside the answer that made the link (FQ77)");
        else if (token === undefined)
          find("world", `${at}.url`, "a link's URL that isn't https://tadayo.app/i# and a token (T52)");
        else if (createHash("sha256").update(token).digest("hex") !== invitation.tokenSha256)
          find("world", `${at}.url`, "a link's URL whose token isn't this link's own (T7)");
        else ownLinkUrls.add(`${at}.url`);
      }
    }
    if (
      kind === "InvitationOpen" ||
      kind === "InvitationChanged" ||
      kind === "InvitationWaiting" ||
      kind === "InvitationAcceptance"
    ) {
      // Only the link whose token the caller presented, while it reads the roster through it; an
      // acceptance, a roster waited for and a changed one only as the account's own link (T7, T14).
      judged.add(`${at}.invitation_id`);
      const held = heldLink(context);
      if (held === undefined || node.invitation_id !== held.id)
        find("world", `${at}.invitation_id`, "an invitation whose token the caller didn't present (T7, T14)");
      else if (!(kind === "InvitationAcceptance" ? held.shown : held.roster))
        find("world", `${at}.invitation_id`, "an invitation its link no longer shows to this caller (FQ59, FQ80)");
      else if (kind === "InvitationOpen" && held.invitation.boundTo !== null)
        find("world", `${at}.invitation_id`, "an open invitation whose link an account has accepted with (T7)");
      else if (kind !== "InvitationOpen" && held.invitation.boundTo !== context.viewer.account)
        find("world", `${at}.invitation_id`, "an invitation the account didn't accept with this link (T7)");
    }
    if (kind === "MyInvitation") {
      // Only an invitation the viewer accepted, with the club's name and the inviter's it holds (T7, T33).
      judged.add(`${at}.invitation_id`);
      const invitation = typeof node.invitation_id === "string" ? world.invitations.get(node.invitation_id) : undefined;
      if (!invitation) find("world", at, "an invitation this world doesn't have");
      else if (context.viewer.account === null || invitation.boundTo !== context.viewer.account)
        find("world", at, "an invitation the viewer didn't accept (T7, T14)");
      else if (invitation.joined)
        find(
          "world",
          at,
          "an invitation whose person has joined the club: it is a membership now (the contract's ClubList)",
        );
      else {
        if (node.club_name !== invitation.clubName)
          find("world", `${at}.club_name`, "not the invitation's club's name");
        if (node.inviter_name !== invitation.inviterName)
          find("world", `${at}.inviter_name`, "not the name members see of the invitation's inviter (FQ75)");
      }
    }
    if (kind === "Occurrence") {
      judged.add(`${at}.id`).add(`${at}.club_id`);
      const day = typeof node.id === "string" ? world.days.get(node.id) : undefined;
      if (!day) find("world", at, "a day this world doesn't have");
      else {
        if (!reader.clubs.has(day.club)) find("world", at, "a day of a club the viewer has no interval in (T14)");
        if (node.club_id !== day.club) find("world", `${at}.club_id`, "not the day's club");
        const star = isObject(node.star) && typeof node.star.membership_id === "string" ? node.star.membership_id : "";
        if (star !== day.star) find("world", `${at}.star`, "not the day's star");
      }
    }
    if (kind === "ClubRef" || kind === "ClubSummary") {
      judged.add(`${at}.id`).add(`${at}.my_membership_id`);
      const id = typeof node.id === "string" ? node.id : "";
      const club = world.clubs.get(id);
      const summary = kind === "ClubSummary";
      if (!club) find("world", at, "a club this world doesn't have");
      else {
        if (!reader.clubs.has(id)) find("world", at, "a club the viewer has no interval in (T14)");
        else if (summary && !reader.activeClubs.has(id))
          find("world", at, "a club the viewer is no longer an active member of, as one of their clubs (ClubSummary)");
        if (node.name !== club.name) find("world", `${at}.name`, "not the club's name");
        const membership = typeof node.my_membership_id === "string" ? node.my_membership_id : "";
        const theirs = world.members.get(membership);
        if (!mine(membership) || theirs?.club !== id || (summary && theirs.leftAt !== null))
          find(
            "world",
            `${at}.my_membership_id`,
            summary ? "not the viewer's active interval in this club" : "not the viewer's own interval in this club",
          );
      }
    }
    if (kind === "DayLink") {
      const id = isObject(node.occurrence) ? node.occurrence.id : undefined;
      const day = typeof id === "string" ? world.days.get(id) : undefined;
      if (!reader.opened(id)) find("world", at, "a day link before the day opens");
      if (day !== undefined && before(context.now, day.closeAt))
        find("world", at, "a day link to a day that hasn't closed");
      if (![...world.drops.values()].some((drop) => drop.day === id && reader.inAudience(drop)))
        find("world", at, "a day link to a day the viewer can read nothing in (T15)");
      const cover = reader.drop(node.cover_drop_id);
      if (cover !== undefined && cover.media !== "photo")
        find("world", `${at}.cover_drop_id`, "a cover that isn't a photo");
    }
    // An object that holds one day holds that day's drops, its club, the viewer's own allowance in
    // it and the viewer's own place in it.
    const target = isObject(node.target) ? node.target.id : undefined;
    const day = isObject(node.occurrence) && typeof node.occurrence.id === "string" ? node.occurrence.id : undefined;
    if (day !== undefined) {
      for (const [id, where] of dayReferences(node, at)) {
        const drop = reader.drop(id);
        if (drop && drop.day !== day) find("world", where, "a drop of another day than its object's");
      }
      const club = world.days.get(day)?.club;
      if (isObject(node.club) && club !== undefined && node.club.id !== club)
        find("world", `${at}.club`, "not the day's club");
    }
    if (isObject(node.allowance) && walked.names.get(`${at}.allowance`) === "Allowance") {
      const where = `${at}.allowance`;
      const of =
        day ??
        (typeof target === "string" ? target : undefined) ??
        (typeof node.occurrence_id === "string" ? node.occurrence_id : undefined) ??
        reader.drop(node.drop_id)?.day ??
        (typeof node.id === "string" ? world.reservations.get(node.id)?.day : undefined);
      if (of === undefined || !world.days.has(of))
        find("world", where, "an allowance this scanner can't tie to a day of the world");
      else {
        // A withdrawal before the reveal releases the drop's slot, one after it doesn't (spec 11,
        // T18); a removed drop may still count until removal's propagation says (B6).
        const revealAt = world.days.get(of)?.revealAt;
        const released = (drop: WorldDrop) =>
          drop.state === "withdrawn" &&
          drop.endedAt !== null &&
          revealAt !== undefined &&
          before(drop.endedAt, revealAt);
        const drops = [...world.drops.values()].filter(
          (drop) => drop.day === of && mine(drop.author) && !released(drop),
        );
        const held = [...world.reservations.values()].filter(
          (slot) =>
            slot.day === of && mine(slot.interval) && slot.state === "live" && before(context.now, slot.expiresAt),
        );
        const allowance = node.allowance;
        for (const [field, most] of [
          ["added", drops.length],
          ["photo_added", drops.filter((drop) => drop.media === "photo").length],
          ["external_added", drops.filter((drop) => drop.media === "external_video").length],
          ["reserved", held.length],
          ["photo_reserved", held.filter((slot) => slot.media === "photo").length],
          ["external_reserved", held.filter((slot) => slot.media === "external_video").length],
        ] as const) {
          const count = allowance[field];
          if (typeof count === "number" && count > most)
            find(
              "world",
              `${where}.${field}`,
              `more than the viewer's own ${field.replace("_", " ")} in the day (T15)`,
            );
        }
        // The role, and so the limits, are the viewer's own in that day: the star's six, six and two, or
        // anyone else's three, two and one (T17; addendum 2).
        const theDay = world.days.get(of);
        if (theDay !== undefined) {
          const star = mine(theDay.star);
          if (allowance.is_star !== star)
            find("world", `${where}.is_star`, "not whether the day is the viewer's own (T17)");
          const limits = [allowance.limit, allowance.photo_limit, allowance.external_limit];
          const role = star ? [6, 6, 2] : [3, 2, 1];
          if (limits.some((limit, index) => limit !== role[index]))
            find("world", where, "not the limits of the viewer's own role in the day (T17)");
        }
      }
    }
    if (isObject(node.viewer) && walked.names.get(`${at}.viewer`) === "ViewerDay" && day !== undefined) {
      const theDay = world.days.get(day);
      if (theDay !== undefined) {
        if (node.viewer.is_star !== mine(theDay.star))
          find("world", `${at}.viewer.is_star`, "not whether the day is the viewer's own");
        const current = reader
          .intervalsIn(theDay.club)
          .map((interval) => world.members.get(interval))
          .find((member) => member?.leftAt === null);
        if (current !== undefined && node.viewer.joined_later !== before(theDay.collectingFrom, current.joinedAt))
          find(
            "world",
            `${at}.viewer.joined_later`,
            "not whether the viewer's membership began after the day started collecting (T15)",
          );
      }
    }
    if (node.stage === "revealed" && !reader.opened(day)) find("world", at, "a revealed day before it opens (T10)");
  }

  // keys: nothing that names media, but inside what has opened, the viewer's own card, and the
  // viewer's own highlight pointer (HighlightPointer, held to the viewer's own drop above).
  const opened = (node: JsonObject) =>
    (node.view === "revealed" && reader.opened(reader.drop(node.id)?.day)) ||
    (node.stage === "revealed" && isObject(node.occurrence) && reader.opened(node.occurrence.id));
  const keys = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) keys(item, `${at}[${String(index)}]`);
    } else if (isObject(value) && !opened(value) && !ownCards.has(value)) {
      for (const [key, child] of Object.entries(value)) {
        const path = `${at}.${key}`;
        if (NEVER_KEY.test(key) && walked.names.get(path) !== "HighlightPointer" && !ownLinkUrls.has(path))
          find("keys", path, "a key that names a URL, token, provider, dimension, colour or highlight (T10)");
        keys(child, path);
      }
    }
  };
  keys(body, "$");

  // values: text people wrote is the viewer's to read, as the world stored it, and is served as
  // written, but a caption holding its own drop's kept-back values before it opens; anything else
  // holds no URL or storage path and no text people wrote that the viewer may not read; nothing the
  // world keeps back but a drop's own once it has opened to this viewer, and no id the viewer may
  // not see outside what the world check judged; a cursor is base64url and decodes to no readable key.
  for (const [value, at] of strings(body)) {
    const name = walked.names.get(at);
    if (name !== undefined && PEOPLE_TEXT.has(name)) {
      if (reader.texts.has(value)) {
        // T13 refuses only a caption holding its own drop's source URL, at write: a caption served as
        // stored still fails holding its own drop's kept-back values (its post id, say) until that
        // drop has opened to the viewer, its author included, as every kept-back value does.
        if (name === "Caption")
          for (const [canary, drops] of world.canaries) {
            if (!value.includes(canary)) continue;
            for (const id of drops) {
              if (world.drops.get(id)?.caption === value && !reader.shown([id]))
                find("values", at, "a caption holding its own drop's kept-back value (T13, Q07)");
            }
          }
        continue;
      }
      find("values", at, "text people wrote that isn't the viewer's to read");
    } else {
      if (!ownLinkUrls.has(at)) noLinks(value, at);
      for (const text of reader.hidden) {
        if (text.length >= SHORTEST_TEXT && value.includes(text))
          find("values", at, "text people wrote that the viewer may not read, inside another value");
      }
    }
    if (judged.has(at)) {
      for (const [canary, drops] of world.canaries) {
        if (value.includes(canary) && !reader.shown(drops)) find("values", at, "a value the world keeps back (Q07)");
      }
    } else keptBack(value, at);
    if (name === "Cursor") {
      const { bytes, canonical } = decodeCursor(value);
      if (!canonical) find("shape", at, "a cursor that isn't base64url (the contract's Cursor)");
      for (const reason of [...readableKey(bytes, reader), ...ownTextKey(value, reader)])
        find("shape", at, `a cursor that ${reason}: a readable key (the contract's Cursor; T10, T15)`);
      const decoded = bytes.toString("latin1");
      for (const run of decoded.match(URL_RUN) ?? []) noLinks(run, `${at} (decoded)`, LINK_MARKS);
      noLinks(decoded, `${at} (decoded)`, PATH_MARKS);
      keptBack(decoded, `${at} (decoded)`);
      for (const [index, shifted] of shiftedBytes(value).entries()) {
        const from = `from its character ${String(index + 2)}`;
        const shiftedText = shifted.toString("latin1");
        for (const reason of marksIn(shifted, reader))
          find(
            "shape",
            at,
            `a cursor that ${reason}, decoded ${from}: a readable key (the contract's Cursor; T10, T15)`,
          );
        noLinks(shiftedText, `${at} (decoded ${from})`, PATH_MARKS);
        keptBack(shiftedText, `${at} (decoded ${from})`);
      }
    }
  }
  return findings;
}
