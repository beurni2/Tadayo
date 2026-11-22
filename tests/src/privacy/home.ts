/// <reference lib="esnext.temporal" />
// Home's row of the privacy matrix (B2's Home slice: `getHome`, the contract's `Home`; spec 06, 08, 15, 18, 22,
// 32; T1, T5, T9, T14, T15, T22, T23, T35, T49, T55; D08; addendum 4; FQ16, FQ26, FQ50, FQ63, FQ75, FQ80, FQ134;
// docs/plans/api-b2-home.md): what each
// role must get, judged from the world's rows apart from the statement the route runs.
//
// - Who: an account that is active with an active interval in the club, the club suspended or not (FQ80).
//   Everyone else the gate lets through gets the neutral not-found, byte for byte (T14).
// - The mode, in the contract's order: unavailable (suspended), awaiting_activation (not started), day (a day
//   open), waiting (a next day), paused (under two active members), no_days. The days are account.ts's
//   `daysOf`, the rule listClubs is judged by; the star's next day, for `add_target`, is `daysOf` among that
//   star's days.
// - The open day's page: every drop of the open day the viewer may see the media of, the star's own first, then
//   friends', each section in commit order with the id as a tiebreak, byte by byte (T35; addendum 4), each as
//   the contract's RevealedDayDrop: its author as the club sees them (FQ75), its caption, whether it's its
//   author's highlight, a photo's display frame and content version or a video's provider, and no reaction or
//   favourite; and the highlight rail of those drops, the star's pick first, then the day's own schedule from
//   Monday by each author's earliest weekday that first opens in the day's week or before and was confirmed
//   before the day opened, then anyone with no day that week as they joined (FQ26). A page whose drops have a reaction or a comment, or the viewer's own favourite
//   (B6's), or more than 36 drops (B5's cursor), must be the server's empty 500 (the plan's section 0.1): no
//   world of the matrix has either.
// - `recent_days`: the club's closed days that `daysOf`'s rule keeps and that hold a drop the viewer may see
//   the media of, newest first, at most six, each with D08's cover among the photos the viewer may see: the
//   star's highlighted photo, then the star's earliest, then the earliest, by commit time and id.
//
// Whether the viewer may see a drop's media is this file's own statement of the read predicate (T9), from the
// world's rows: the viewer's account active, one of their active intervals in the drop's audience, the drop
// active, its day scheduled, the club not suspended, the day's star not gone before its reveal, the author's
// account active, no block either way, and the reveal reached. The leak scanner checks the same answers for
// ids and names the viewer may not see, and a cover that isn't a photo; it can't judge a mode, an order or a
// choice, so this row does.

import type { WorldTx } from "../db/harness.ts";
import { daysOf } from "./account.ts";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinnedProblems, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import type { Answer, WorldFacts } from "./scanner.ts";
import { canonical, WEEK, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const HOME_JUDGED: ReadonlySet<string> = new Set(["getHome"]);

/** The most recent days Home links to. */
const RECENT = 6;
/** The most drops one page of a revealed day holds. */
const PAGE = 36;

/** What the judge reads beyond the scanner's facts: drops' commit times and media, highlights, blocks, days' weeks. */
export interface HomeRows {
  /** Each drop's commit instant, by id. */
  submitted: ReadonlyMap<string, Temporal.Instant>;
  /** The drops that are their author's highlight. */
  highlighted: ReadonlySet<string>;
  /** Each block, as its two accounts. */
  blocks: readonly (readonly [string, string])[];
  /** Each photo drop's display rendition and its upload's content version, by drop id. */
  frames: ReadonlyMap<string, { width: number; height: number; version: string }>;
  /** Each video drop's provider, by drop id. */
  providers: ReadonlyMap<string, string>;
  /** The drops with a reaction or a comment, which B6's fields show to everyone who can see the drop. */
  shared: ReadonlySet<string>;
  /** Each drop's favourites, as the intervals that saved it: each one private to its interval (spec 18). */
  favoured: ReadonlyMap<string, ReadonlySet<string>>;
  /** Each day's schedule version, by day id. */
  weeks: ReadonlyMap<string, string>;
  /** When each confirmed day of each week was confirmed, by `${version} ${weekday}`. */
  confirmed: ReadonlyMap<string, Temporal.Instant>;
}

/** Reads those rows of `clubs` on `db`, a connection of the test's own. */
export async function homeRowsOf(db: WorldTx, clubs: readonly string[]): Promise<HomeRows> {
  const drops = await db<
    {
      id: string;
      submitted_at: Temporal.Instant;
      highlighted: boolean;
      width: number | null;
      height: number | null;
      version: string | null;
      provider: string | null;
      shared: boolean;
      favoured: string[];
    }[]
  >`
    SELECT d.id, d.submitted_at, EXISTS (SELECT FROM app.highlights h WHERE h.drop_id = d.id) AS highlighted,
           r.width, r.height, u.content_version AS version, s.provider,
           EXISTS (SELECT FROM app.reactions x WHERE x.drop_id = d.id)
             OR EXISTS (SELECT FROM app.comments x WHERE x.drop_id = d.id) AS shared,
           ARRAY(SELECT x.interval_id FROM app.favourites x WHERE x.drop_id = d.id) AS favoured
      FROM app.drops d
      LEFT JOIN app.uploads u ON u.id = d.upload_id
      LEFT JOIN app.upload_renditions r ON r.upload_id = d.upload_id AND r.kind = 'display'
      LEFT JOIN app.sources s ON s.id = d.source_id
     WHERE d.club_id IN ${db(clubs)}`;
  const blocks = await db<{ blocker: string; blocked: string }[]>`
    SELECT blocker_user_id AS blocker, blocked_user_id AS blocked FROM app.blocks`;
  const days = await db<{ id: string; week: string }[]>`
    SELECT id, schedule_version_id AS week FROM app.occurrences WHERE club_id IN ${db(clubs)}`;
  const confirmations = await db<{ week: string; weekday: string; confirmed_at: Temporal.Instant }[]>`
    SELECT schedule_version_id AS week, weekday::text AS weekday, confirmed_at
      FROM app.schedule_assignments WHERE club_id IN ${db(clubs)}`;
  const frames = new Map<string, { width: number; height: number; version: string }>();
  const providers = new Map<string, string>();
  for (const row of drops) {
    if (row.width !== null && row.height !== null && row.version !== null)
      frames.set(row.id, { width: row.width, height: row.height, version: row.version });
    if (row.provider !== null) providers.set(row.id, row.provider);
  }
  return {
    submitted: new Map(drops.map((row) => [row.id, row.submitted_at])),
    highlighted: new Set(drops.filter((row) => row.highlighted).map((row) => row.id)),
    blocks: blocks.map((row) => [row.blocker, row.blocked] as const),
    frames,
    providers,
    shared: new Set(drops.filter((row) => row.shared).map((row) => row.id)),
    favoured: new Map(drops.map((row) => [row.id, new Set(row.favoured)])),
    weeks: new Map(days.map((row) => [row.id, row.week])),
    confirmed: new Map(confirmations.map((row) => [`${row.week} ${row.weekday}`, row.confirmed_at])),
  };
}

/** What the judge knows of a cell. */
export interface HomeSeen {
  world: WorldFacts;
  /** The schedule's rows, for each club's timezone. */
  schedule: ScheduleWorld;
  /** The clubs' own rows, for whether each has started. */
  rows: ClubRows;
  home: HomeRows;
  /** The viewer's account, or null for a caller without a session. */
  account: string | null;
  now: Temporal.Instant;
}

const before = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b) < 0;
const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/** Whether the account `account` may see the media of `drop` at `now`: this file's statement of T9. */
export function mayView(seen: HomeSeen, drop: string): boolean {
  const { world, home, account, now } = seen;
  const found = world.drops.get(drop);
  if (account === null || found === undefined || world.accounts.get(account)?.state !== "active") return false;
  const day = world.days.get(found.day);
  const star = day === undefined ? undefined : world.members.get(day.star);
  const author = world.members.get(found.author);
  if (day === undefined || star === undefined || author === undefined) return false;
  const mine = [...found.audience].some((interval) => {
    const member = world.members.get(interval);
    return member?.account === account && member.leftAt === null;
  });
  const starAsked = world.accounts.get(star.account)?.deletionRequestedAt ?? null;
  const blocked = home.blocks.some(
    ([a, b]) => (a === account && b === author.account) || (a === author.account && b === account),
  );
  return (
    mine &&
    found.state === "active" &&
    day.status === "scheduled" &&
    world.clubs.get(day.club)?.suspendedAt === null &&
    (star.leftAt === null || !before(star.leftAt, day.revealAt)) &&
    (starAsked === null || !before(starAsked, day.revealAt)) &&
    world.accounts.get(author.account)?.state === "active" &&
    !blocked &&
    !before(now, day.revealAt)
  );
}

/** Ids byte by byte, as Postgres orders them under COLLATE "C". */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A membership interval as the contract's Person (FQ75): the name members see, the avatar while both are active. */
function personOf(world: WorldFacts, interval: string): Record<string, unknown> {
  const member = world.members.get(interval);
  if (member === undefined || member.name === null) throw new Error(`the world's ${interval} has no name to show`);
  const account = world.accounts.get(member.account);
  const avatar = member.leftAt === null && account?.state === "active" ? account.avatar : null;
  return { membership_id: interval, display_name: member.name, ...(avatar === null ? {} : { avatar_version: avatar }) };
}

/**
 * The open day `day`'s first page for the viewer: its drops as the contract's RevealedDayDrop, star first, and its
 * highlight rail; or "refused" when its drops have B6's rows or more than a page (the header).
 */
export function pageFor(
  seen: HomeSeen,
  day: string,
  viewer: string,
): { drops: Record<string, unknown>[]; highlights: Record<string, unknown>[] } | "refused" {
  const { world, home, schedule } = seen;
  const found = world.days.get(day);
  if (found === undefined) throw new Error("the open day isn't the world's");
  const at = (drop: string) => {
    const instant = home.submitted.get(drop);
    if (instant === undefined) throw new Error("a drop with no commit time");
    return instant;
  };
  const visible = [...world.drops]
    .filter(([id, drop]) => drop.day === day && mayView(seen, id))
    .sort(
      ([a, x], [b, y]) =>
        Number(y.author === found.star) - Number(x.author === found.star) ||
        Temporal.Instant.compare(at(a), at(b)) ||
        byBytes(a, b),
    );
  // B6's rows the page would show this viewer: anyone's reaction or comment, and the viewer's own favourite.
  const later = (id: string) => home.shared.has(id) || (home.favoured.get(id)?.has(viewer) ?? false);
  if (visible.length > PAGE || visible.some(([id]) => later(id))) return "refused";
  const drops = visible.map(([id, drop]) => {
    const frame = home.frames.get(id);
    const provider = home.providers.get(id);
    if (drop.media === "photo" ? frame === undefined : provider === undefined)
      throw new Error(
        `the world's ${drop.media} ${id} has no ${drop.media === "photo" ? "display rendition" : "provider"}`,
      );
    return {
      view: "revealed",
      id,
      author: personOf(world, drop.author),
      media_class: drop.media,
      ...(drop.caption === null ? {} : { caption: drop.caption }),
      highlight: home.highlighted.has(id),
      ...(drop.media === "photo" && frame !== undefined
        ? { photo: { width: frame.width, height: frame.height, media_version: frame.version } }
        : { video: { provider } }),
      reactions: [],
      viewer_favourite: false,
      section: drop.author === found.star ? "star" : "friends",
    };
  });
  // The rail: the day's own week from Monday, by each author's earliest weekday in it that first opens in the
  // day's calendar week or before (a member whose days start in a later week has no day that week) and was
  // confirmed before the day opened (so nothing moves while it is open); no day, after, as they joined.
  const week = schedule.versions.find((version) => version.id === home.weeks.get(day));
  if (week === undefined) throw new Error("the open day's week isn't the world's");
  const monday = (date: string) => {
    const plain = Temporal.PlainDate.from(date);
    return plain.subtract({ days: plain.dayOfWeek - 1 });
  };
  const hasThatWeek = (one: { weekday: string; firstDate: string }) => {
    const confirmedAt = home.confirmed.get(`${week.id} ${one.weekday}`);
    if (confirmedAt === undefined) throw new Error("a confirmed day with no confirmation");
    return (
      Temporal.PlainDate.compare(monday(one.firstDate), monday(found.localDate)) <= 0 &&
      Temporal.Instant.compare(confirmedAt, found.revealAt) < 0
    );
  };
  const earliest = (interval: string) =>
    Math.min(
      ...week.assignments
        .filter((one) => one.star === interval && hasThatWeek(one))
        .map((one) => WEEK.indexOf(one.weekday)),
      WEEK.length,
    );
  const joined = (interval: string) => {
    const member = world.members.get(interval);
    if (member === undefined) throw new Error(`the world's ${interval} isn't a member`);
    return member.joinedAt;
  };
  const highlights = visible
    .filter(([id]) => home.highlighted.has(id))
    .map(([id, drop]) => ({ id, author: drop.author }))
    .sort(
      (x, y) =>
        Number(y.author === found.star) - Number(x.author === found.star) ||
        earliest(x.author) - earliest(y.author) ||
        Temporal.Instant.compare(joined(x.author), joined(y.author)) ||
        byBytes(x.author, y.author),
    )
    .map(({ id, author }) => ({ drop_id: id, author: personOf(world, author), star_pick: author === found.star }));
  return { drops, highlights };
}

/** A past day as the contract's Occurrence: the star by the name members see, the avatar while both are active. */
function pastOccurrence(world: WorldFacts, id: string): Record<string, unknown> | undefined {
  const day = world.days.get(id);
  const star = day === undefined ? undefined : world.members.get(day.star);
  if (day === undefined || star === undefined || star.name === null) return undefined;
  const account = world.accounts.get(star.account);
  const avatar = star.leftAt === null && account?.state === "active" ? account.avatar : null;
  return {
    id,
    club_id: day.club,
    star: { membership_id: day.star, display_name: star.name, ...(avatar === null ? {} : { avatar_version: avatar }) },
    local_date: day.localDate,
    reveal_at: second(day.revealAt),
    close_at: second(day.closeAt),
    phase: "past",
  };
}

/** The club's recent days for the viewer: the contract's DayLinks, newest first. */
export function recentFor(seen: HomeSeen, club: string): Record<string, unknown>[] {
  const { world, home, now } = seen;
  const readable = (day: string) => [...world.drops].filter(([id, drop]) => drop.day === day && mayView(seen, id));
  const days = [...world.days]
    .filter(([id, day]) => day.club === club && !before(now, day.closeAt) && readable(id).length > 0)
    .flatMap(([id, day]) => {
      // A day whose star has no name to show is never given (daysOf's rule).
      const occurrence = pastOccurrence(world, id);
      return occurrence === undefined ? [] : [{ id, day, occurrence }];
    })
    .sort(
      (x, y) => Temporal.Instant.compare(y.day.revealAt, x.day.revealAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    )
    .slice(0, RECENT);
  return days.map(({ id, day, occurrence }) => {
    const photos = readable(id)
      .filter(([, drop]) => drop.media === "photo")
      .map(([drop, found]) => ({ drop, star: found.author === day.star, at: home.submitted.get(drop) }))
      .sort((a, b) => {
        const lead = (x: typeof a) => (x.star && home.highlighted.has(x.drop) ? 2 : x.star ? 1 : 0);
        if (a.at === undefined || b.at === undefined) throw new Error("a drop with no commit time");
        return lead(b) - lead(a) || Temporal.Instant.compare(a.at, b.at) || (a.drop < b.drop ? -1 : 1);
      });
    const cover = photos[0]?.drop;
    return { occurrence, ...(cover === undefined ? {} : { cover_drop_id: cover }) };
  });
}

/**
 * What the viewer must get from getHome for `club`: undefined, the neutral not-found; "refused", the server's
 * empty 500 (a page whose drops have B6's rows, or more than one page); or Home's body.
 */
export function homeFor(seen: HomeSeen, club: string): Record<string, unknown> | "refused" | undefined {
  const { world, schedule, rows, account, now } = seen;
  if (account === null || world.accounts.get(account)?.state !== "active") return undefined;
  const mine = [...world.members].find(
    ([, member]) => member.club === club && member.account === account && member.leftAt === null,
  );
  const row = world.clubs.get(club);
  const timezone = schedule.clubs.get(club)?.timezone;
  const roster = rows.get(club);
  if (mine === undefined || row === undefined || timezone === undefined || roster === undefined) return undefined;
  const [interval, member] = mine;
  const ref = { id: club, name: row.name, timezone, my_membership_id: interval };
  const base = {
    server_now: second(now),
    club: ref,
    club_today: now.toZonedDateTimeISO(timezone).toPlainDate().toString(),
  };
  if (row.suspendedAt !== null) return { mode: "unavailable", ...base };
  if (!roster.activated) return { mode: "awaiting_activation", ...base };
  const days = daysOf(world, club, now);
  const open = days.open as { id: string; star: { membership_id: string } } | undefined;
  if (open !== undefined) {
    const page = pageFor(seen, open.id, interval);
    if (page === "refused") return "refused";
    const day = world.days.get(open.id);
    if (day === undefined) throw new Error("the open day isn't the world's");
    const addTarget = daysOf(world, club, now, open.star.membership_id).next;
    return {
      mode: "day",
      ...base,
      day: {
        stage: "revealed",
        server_now: base.server_now,
        occurrence: open,
        club: ref,
        viewer: {
          is_star: open.star.membership_id === interval,
          joined_later: Temporal.Instant.compare(member.joinedAt, day.collectingFrom) > 0,
        },
        ...(addTarget === undefined ? {} : { add_target: addTarget }),
        drops: page.drops,
        highlights: page.highlights,
      },
      ...(days.next === undefined ? {} : { next: days.next }),
      recent_days: recentFor(seen, club),
    };
  }
  if (days.next !== undefined) return { mode: "waiting", ...base, next: days.next, recent_days: recentFor(seen, club) };
  const active = [...world.members.values()].filter((one) => one.club === club && one.leftAt === null).length;
  if (active < 2) return { mode: "paused", ...base, recent_days: recentFor(seen, club) };
  return { mode: "no_days", ...base };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body);
  } catch {
    return undefined;
  }
}

/** Each way `answer` differs from Home's `want`: the status, the caching, and each field that differs. */
export function homeProblems(answer: Answer, want: Record<string, unknown> | "refused"): string[] {
  if (answer.headers["cache-control"] !== "private, no-store") return ["Home's answer without private, no-store"];
  if (want === "refused") {
    return answer.status === 500 && answer.body === ""
      ? []
      : [`status ${String(answer.status)}, not the server's empty 500 for a page later stages build`];
  }
  if (answer.status !== 200) return [`status ${String(answer.status)}, not 200 with Home`];
  const body = parsed(answer);
  if (!isObject(body)) return ["not Home"];
  if (canonical(body) === canonical(want)) return [];
  const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
  return keys
    .filter((key) => canonical(body[key]) !== canonical(want[key]))
    .map((key) => `Home's ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`);
}

export function homeExpected(seen: () => HomeSeen, club: string): Expected {
  return (answer) => {
    const want = homeFor(seen(), club);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : homeProblems(answer, want);
  };
}
