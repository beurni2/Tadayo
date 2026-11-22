/// <reference lib="esnext.temporal" />
// Home for one club (the contract's `getHome` and `Home`; spec 06, 08, 22, 32; T1, T5, T9, T14, T15, T33, T34,
// T49; Q18; FQ16, FQ50, FQ54, FQ63, FQ80, FQ84, FQ134; docs/plans/api-b2-home.md). It is derived at read time
// from the server's clock and never stored (T5): one statement, so one snapshot, at the clock's sample the
// caller took first in its transaction (T1), and it writes nothing (T34).
//
// Who: an account that is active with an active interval in the club, whatever the club's state
// (`listedMemberships`): a suspended club's members get `unavailable` and nothing of the club but its name, as
// the club list shows it (FQ80, spec 22). Everyone else gets null, which the route answers with the neutral
// not-found, the same answer as an id nobody has (T14).
//
// The mode is the contract's order (`homeMode`). Its days come from the authorization module, never from a
// check here (T9): the day open now and the next (`daysByClub`), the star's next day for the open day's
// `add_target` (`nextDaysByStar`), and the recent days with their covers (`recentDays`).
//
// The open day is Home itself until 1 AM (Q18), so its first page is built here from the rows, never from a
// worker's manifest (spec 07, T5): every drop of the day the viewer may see the media of (`readableDrops`, the
// read predicate itself), the star's own first and then friends', each section in commit order with the id as
// a tiebreak, byte by byte (T35; addendum 4), each with its author as the club sees them (FQ75), its caption,
// its highlight flag, a photo's frame from its display rendition and its content version (spec 33), or a
// video's provider; and the highlight rail of the highlights the viewer may see, the star's pick first, then
// the day's own schedule from Monday, a member with two days by the earlier, then anyone without a day in the
// order they joined (FQ26). Nothing counts what the viewer can't see (T15).
//
// What later stages own stays theirs (docs/plans/api-b2-home.md section 0.1): reactions, favourites and reply
// previews are B6's, and no route writes their rows until B6, so the read throws rather than answer a page
// whose drops have any (the B6 PR builds them, T49); a day's drops past the first 36 page through
// getOccurrence's cursor, which B5 builds, so the read throws rather than cut a page short. Neither can happen
// on `dev` or `prod` before B6 writes those rows. The second can't before B3 commits drops, and then only far
// from the trial's clubs: six members at once give a day at most 21 drops (six for the star, three for each
// friend, T17), but the allowances are each interval's, so a day passes 36 only when members who leave keep
// their drops and others join or rejoin while it collects, again and again. Until B5's cursor, such a day's
// readers get the server's error rather than a page that leaves drops out (docs/LIMITATIONS.md, 2026-11-22).

import { daysByClub, nextDaysByStar, recentDays, chosenDay, recentDay } from "../authorization/days.ts";
import type { ChosenDay, RecentDay } from "../authorization/days.ts";
import { listedMemberships } from "../authorization/member.ts";
import { readableDrops, type FragmentSql, type QuerySql } from "../authorization/read-sql.ts";
import { person, personOf, type SchedulePerson } from "../schedule/week.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";

/** The contract's six modes. */
export type HomeMode = "unavailable" | "awaiting_activation" | "day" | "waiting" | "paused" | "no_days";

/** What Home's mode is chosen from. */
export interface HomeModeFacts {
  /** The club is suspended (spec 22). */
  readonly suspended: boolean;
  /** The club has started: a roster was accepted (FQ54, FQ84). */
  readonly activated: boolean;
  /** Members with an active interval, the viewer included, so at least one. */
  readonly activeMembers: number;
  /** The day choice has a day open now. */
  readonly open: boolean;
  /** The day choice has a next day. */
  readonly next: boolean;
}

/**
 * The contract's order: unavailable, awaiting_activation, day, waiting, paused, no_days. A paused club's own
 * announced day shows as usual until it closes (FQ50), so `day` and `waiting` come before `paused`; an active
 * club with no day to open is `no_days`, which never invents a date (T49, FQ134).
 */
export function homeMode(facts: HomeModeFacts): HomeMode {
  if (!Number.isInteger(facts.activeMembers) || facts.activeMembers < 1)
    throw new Error("home: a viewer's club has at least one active member, the viewer");
  if (facts.suspended) return "unavailable";
  if (!facts.activated) return "awaiting_activation";
  if (facts.open) return "day";
  if (facts.next) return "waiting";
  if (facts.activeMembers < 2) return "paused";
  return "no_days";
}

/** The contract's ClubRef, and the club's date now. */
export interface HomeBase {
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
    /** The viewer's own interval in it. */
    readonly membershipId: string;
  };
  /** The calendar date in the club's timezone at the server's time (the contract's `club_today`). */
  readonly clubToday: string;
}

/** The most drops one page of a revealed day holds (the contract's RevealedDay). */
export const PAGE_DROPS = 36;

/** One drop of the open day's page, as the viewer may see it after the reveal (the contract's RevealedDayDrop). */
export interface PageDrop {
  readonly id: string;
  /** Its author as the club sees them (FQ75). */
  readonly author: SchedulePerson;
  readonly mediaClass: "photo" | "external_video";
  readonly caption: string | null;
  /** It is its author's highlight on the day (T22). */
  readonly highlight: boolean;
  /** A photo's frame, from its display rendition, and its content version (spec 33); null for a video. */
  readonly photo: { readonly width: number; readonly height: number; readonly mediaVersion: string } | null;
  /** A video's provider; null for a photo. */
  readonly video: { readonly provider: "tiktok" | "instagram" } | null;
  /** The star's own, or a friend's (T35; addendum 4). */
  readonly section: "star" | "friends";
}

/** One entry of the open day's highlight rail (the contract's HighlightEntry). */
export interface RailEntry {
  readonly dropId: string;
  readonly author: SchedulePerson;
  /** It is the star's own pick. */
  readonly starPick: boolean;
}

/** The open day's frame: the day, the viewer's place in it, the star's next day, and its first page. */
export interface HomeDayFrame {
  readonly occurrence: ChosenDay;
  /** The viewer's active interval is the day's star's. */
  readonly isStar: boolean;
  /** The viewer's interval began after the day started collecting (spec 07, F02-joined-later). */
  readonly joinedLater: boolean;
  /** The star's next day, or null when they have none (book p30). */
  readonly addTarget: ChosenDay | null;
  /** The drops the viewer may see, the star's first (T35); empty on a quiet day (T15). */
  readonly drops: readonly PageDrop[];
  /** The highlights the viewer may see, the star's pick first (FQ26). */
  readonly highlights: readonly RailEntry[];
}

export type HomeRead =
  | (HomeBase & { readonly mode: "unavailable" | "awaiting_activation" | "no_days" })
  | (HomeBase & {
      readonly mode: "day";
      readonly day: HomeDayFrame;
      readonly next: ChosenDay | null;
      readonly recentDays: readonly RecentDay[];
    })
  | (HomeBase & { readonly mode: "waiting"; readonly next: ChosenDay; readonly recentDays: readonly RecentDay[] })
  | (HomeBase & { readonly mode: "paused"; readonly recentDays: readonly RecentDay[] });

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function shape(): Error {
  return new Error("home: Home came back in a shape the schema doesn't allow");
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function instant(value: unknown): Temporal.Instant {
  if (!(value instanceof Temporal.Instant)) throw shape();
  return value;
}

// The open day's page, as three columns of readHome's statement: each names readHome's alias `h`, whose
// `open_day` is the day `daysByClub` chose, and is null (or false) when there is none; `laterRows` also names
// its alias `lm`, the viewer's membership in the club.

/**
 * The open day's drops `viewer` may see the media of at `now`, as a jsonb array for `openPage`, the star's own
 * first, then by commit and id byte by byte (T35): each with its author by FQ75's rule (`person`, on `s` and
 * `su`), its highlight flag, a photo's display rendition and content version, and a video's provider.
 */
function pageDrops<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  return bound(sql)`(
    SELECT pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id', x.id, 'author', ${person(sql)}, 'media_class', x.media_class, 'caption', x.caption,
               'highlight', EXISTS (SELECT FROM app.highlights hl WHERE hl.drop_id = x.id),
               'width', r.width, 'height', r.height, 'media_version', up.content_version,
               'provider', so.provider, 'star', x.author_interval_id = o.star_interval_id)
             ORDER BY x.author_interval_id = o.star_interval_id DESC, x.submitted_at, x.id COLLATE "C")
      FROM app.drops x
      JOIN app.occurrences o ON o.id = x.occurrence_id
      JOIN app.memberships s ON s.interval_id = x.author_interval_id
      JOIN app.users su ON su.id = s.user_id
      LEFT JOIN app.uploads up ON up.id = x.upload_id
      LEFT JOIN app.upload_renditions r ON r.upload_id = x.upload_id AND r.kind = 'display'
      LEFT JOIN app.sources so ON so.id = x.source_id
     WHERE x.occurrence_id = (h.open_day OPERATOR(pg_catalog.->>) 'id')
       AND x.id IN (${readableDrops(sql, viewer, now, "media")}))`;
}

/**
 * The open day's highlight rail for `viewer` at `now`, as a jsonb array for `openPage`: each highlight that
 * points to a drop the viewer may see the media of, the star's pick first, then by each contributor's earliest
 * weekday from Monday in the day's own schedule version, then anyone without a day in it in the order they
 * joined, by interval id byte by byte on a tie (FQ26, FQ114). A weekday counts only from its first date on or
 * before the day's own date: a member whose days start later has no day yet (FQ26), and the order stays fixed
 * for the day, since a member who confirms while it is open is given a first date at least a day on (FQ55),
 * though their row joins the first days' version the day was made under.
 */
function pageRail<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  return bound(sql)`(
    SELECT pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'drop_id', hl.drop_id, 'author', ${person(sql)}, 'star_pick', hl.interval_id = o.star_interval_id)
             ORDER BY hl.interval_id = o.star_interval_id DESC,
                      (SELECT pg_catalog.min(pg_catalog.array_position(
                                ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
                                sa.weekday::pg_catalog.text))
                         FROM app.schedule_assignments sa
                        WHERE sa.schedule_version_id = o.schedule_version_id
                          AND sa.star_interval_id = hl.interval_id
                          AND sa.first_date <= o.local_date) NULLS LAST,
                      s.joined_at, s.interval_id COLLATE "C")
      FROM app.highlights hl
      JOIN app.occurrences o ON o.id = hl.occurrence_id
      JOIN app.memberships s ON s.interval_id = hl.interval_id
      JOIN app.users su ON su.id = s.user_id
     WHERE hl.occurrence_id = (h.open_day OPERATOR(pg_catalog.->>) 'id')
       AND hl.drop_id IN (${readableDrops(sql, viewer, now, "media")}))`;
}

/**
 * Whether a drop of the open day that `viewer` may see has a row B6's fields would show them: a reaction or a
 * comment by anyone (the reaction summary and the reply preview are everyone's who can see the drop), or the
 * viewer's own favourite, under their interval in the club (readHome's alias `lm`). Someone else's favourite
 * is private to them (spec 18) and is never asked about, so this can't tell the viewer one exists.
 */
function laterRows<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  return bound(sql)`EXISTS (
    SELECT FROM app.drops x
     WHERE x.occurrence_id = (h.open_day OPERATOR(pg_catalog.->>) 'id')
       AND x.id IN (${readableDrops(sql, viewer, now, "media")})
       AND (EXISTS (SELECT FROM app.reactions re WHERE re.drop_id = x.id)
            OR EXISTS (SELECT FROM app.favourites fa WHERE fa.drop_id = x.id AND fa.interval_id = lm.interval_id)
            OR EXISTS (SELECT FROM app.comments co WHERE co.drop_id = x.id)))`;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function list(value: unknown): readonly unknown[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw shape();
  return value;
}

/** A frame's side: a whole number of pixels, as the renditions table allows. */
function side(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20_000) throw shape();
  return value;
}

function author(value: unknown): SchedulePerson {
  const { person: found } = personOf(value);
  // A drop the viewer may see always has an author with a name to show (FQ75).
  if (found === null) throw shape();
  return found;
}

/**
 * The open day's first page from `pageDrops`' and `pageRail`'s arrays, the day's star being `star`: each drop and
 * entry read whole, a photo with its frame and no provider and a video the other way round, each section the
 * one its author's interval gives, the star's before friends', every entry pointing at a listed drop that is
 * its author's highlight, and the star's pick first. Anything else throws, so a surprise refuses rather than
 * shows; so does a day past one page (`PAGE_DROPS`), whose cursor is B5's (the header).
 */
export function openPage(
  drops: unknown,
  rail: unknown,
  star: string,
): { readonly drops: readonly PageDrop[]; readonly highlights: readonly RailEntry[] } {
  const cards = list(drops).map((value): PageDrop => {
    const row = record(value);
    const mediaClass = row["media_class"];
    if (mediaClass !== "photo" && mediaClass !== "external_video") throw shape();
    const by = author(row["author"]);
    const isStar = flag(row["star"]);
    if (isStar !== (by.membershipId === star)) throw shape();
    const caption = row["caption"] === null ? null : text(row["caption"]);
    const provider = row["provider"];
    const photo =
      mediaClass === "photo"
        ? { width: side(row["width"]), height: side(row["height"]), mediaVersion: text(row["media_version"]) }
        : null;
    if (mediaClass === "photo" ? provider !== null : row["width"] !== null || row["media_version"] !== null)
      throw shape();
    if (mediaClass === "external_video" && provider !== "tiktok" && provider !== "instagram") throw shape();
    return {
      id: text(row["id"]),
      author: by,
      mediaClass,
      caption,
      highlight: flag(row["highlight"]),
      photo,
      video: mediaClass === "external_video" ? { provider: provider as "tiktok" | "instagram" } : null,
      section: isStar ? "star" : "friends",
    };
  });
  if (cards.length > PAGE_DROPS)
    throw new Error(`home: the open day holds more than ${String(PAGE_DROPS)} drops, whose cursor B5 builds`);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw shape();
  const firstFriend = cards.findIndex((card) => card.section === "friends");
  if (firstFriend >= 0 && cards.slice(firstFriend).some((card) => card.section === "star")) throw shape();
  const entries = list(rail).map((value): RailEntry => {
    const row = record(value);
    const dropId = text(row["drop_id"]);
    const by = author(row["author"]);
    const card = cards.find((one) => one.id === dropId);
    // Every entry is a listed drop's, the drop its author's highlight, by the same author (T22).
    if (card === undefined || !card.highlight || card.author.membershipId !== by.membershipId) throw shape();
    const starPick = flag(row["star_pick"]);
    if (starPick !== (by.membershipId === star)) throw shape();
    return { dropId, author: by, starPick };
  });
  // One entry per contributor's interval, every listed highlight on the rail, and the star's pick first.
  if (new Set(entries.map((entry) => entry.author.membershipId)).size !== entries.length) throw shape();
  if (entries.length !== cards.filter((card) => card.highlight).length) throw shape();
  if (entries.some((entry, index) => entry.starPick && index > 0)) throw shape();
  return { drops: cards, highlights: entries };
}

/** Home for `clubId` as the account `userId` gets it at `now`, or null (T14). */
export async function readHome(
  sql: QuerySql,
  userId: string,
  clubId: string,
  now: ServerNow,
): Promise<HomeRead | null> {
  // An id that can't be one names no club, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) return null;
  const rows = await bound(sql)`
    SELECT c.id, c.name, c.timezone, lm.interval_id AS membership_id, lm.joined_at,
           c.suspended_at IS NOT NULL AS suspended, c.activated_at IS NOT NULL AS activated,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.memberships a
             WHERE a.club_id = c.id AND a.state = 'active') AS active_members,
           h.open_day, h.next_day,
           (SELECT ns.next_day FROM (${nextDaysByStar(sql, userId, now)}) ns
             WHERE ns.club_id = c.id
               AND ns.star_interval_id = (h.open_day OPERATOR(pg_catalog.->>) 'star_membership_id')) AS add_target,
           (SELECT o.collecting_from FROM app.occurrences o
             WHERE o.id = (h.open_day OPERATOR(pg_catalog.->>) 'id')) AS open_collecting_from,
           ${pageDrops(sql, userId, now)} AS open_drops,
           ${pageRail(sql, userId, now)} AS open_rail,
           ${laterRows(sql, userId, now)} AS open_page_later,
           rd.recent_days
      FROM app.clubs c
      JOIN (${listedMemberships(sql, userId)}) lm ON lm.club_id = c.id
      LEFT JOIN (${daysByClub(sql, userId, now)}) h ON h.club_id = c.id
      LEFT JOIN (${recentDays(sql, userId, now)}) rd ON rd.club_id = c.id
     WHERE c.id = ${clubId}::pg_catalog.text`;
  const [row] = rows;
  if (row === undefined) return null;
  if (text(row["id"]) !== clubId) throw shape();
  const timezone = text(row["timezone"]);
  const base: HomeBase = {
    club: { id: clubId, name: text(row["name"]), timezone, membershipId: text(row["membership_id"]) },
    clubToday: now.toZonedDateTimeISO(clubTimeZone(timezone)).toPlainDate().toString(),
  };
  const open = ownDay(chosenDay(row["open_day"], "open"), clubId);
  const next = ownDay(chosenDay(row["next_day"], "collecting"), clubId);
  const mode = homeMode({
    suspended: flag(row["suspended"]),
    activated: flag(row["activated"]),
    activeMembers: Number(row["active_members"]),
    open: open !== null,
    next: next !== null,
  });
  switch (mode) {
    case "unavailable":
    case "awaiting_activation":
    case "no_days":
      return { ...base, mode };
    case "paused":
      return { ...base, mode, recentDays: recentOf(row["recent_days"], clubId) };
    case "waiting":
      if (next === null) throw shape();
      return { ...base, mode, next, recentDays: recentOf(row["recent_days"], clubId) };
    case "day": {
      if (open === null) throw shape();
      // Reactions, favourites and reply previews are B6's (the header): a page that left out one would be false.
      if (flag(row["open_page_later"]))
        throw new Error("home: the open day's drops have reactions, favourites or comments, which B6's page shows");
      const page = openPage(row["open_drops"], row["open_rail"], open.star.membershipId);
      const addTarget = ownDay(chosenDay(row["add_target"], "collecting"), clubId);
      if (addTarget !== null && addTarget.star.membershipId !== open.star.membershipId) throw shape();
      return {
        ...base,
        mode,
        day: {
          occurrence: open,
          isStar: open.star.membershipId === base.club.membershipId,
          joinedLater: Temporal.Instant.compare(instant(row["joined_at"]), instant(row["open_collecting_from"])) > 0,
          addTarget,
          ...page,
        },
        next,
        recentDays: recentOf(row["recent_days"], clubId),
      };
    }
  }
}

/** A day of the club's own, or null. */
function ownDay(day: ChosenDay | null, clubId: string): ChosenDay | null {
  if (day !== null && day.clubId !== clubId) throw shape();
  return day;
}

/** The club's recent days, newest first, each its own. A club the fragment didn't list has none. */
function recentOf(value: unknown, clubId: string): readonly RecentDay[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw shape();
  return value.map((entry) => {
    const recent = recentDay(entry);
    if (recent.day.clubId !== clubId) throw shape();
    return recent;
  });
}
