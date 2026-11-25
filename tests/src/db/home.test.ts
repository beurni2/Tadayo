/// <reference lib="esnext.temporal" />
// Home on real rows (packages/domain/src/clubs/home.ts `readHome`; spec 06, 08, 15, 18, 22; T1, T5, T9, T14, T15,
// T22, T23, T29, T35, T49; Q18; D08; addendum 4; FQ16, FQ26, FQ50, FQ63, FQ75, FQ80, FQ134;
// docs/plans/api-b2-home.md section 3). The server's time is the
// tests' fake clock at each edge, and no worker runs: nothing but the rows and the clock decides (Q18's API
// half). The world is db/world.ts': Ana's Saturday, 7 November 2026, in Europe/London (on UTC in November),
// Ben and Cleo with her, Dan in no club; each test adds the days and drops it needs, as the commands will write
// them.

import { dayInstants, readHome, recentDay, recentDays, type HomeRead, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { block, invite, removeByModeration, STATE_AT, withdraw } from "../matrix.ts";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import {
  AT,
  commitDrop,
  intervalElsewhere,
  joinByRoster,
  leave,
  newAvatar,
  newId,
  newUser,
  newWorld,
  PHOTO_FRAMES,
  type DropOptions,
  type Member,
  type World,
} from "./world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);
const µs = (instant: Temporal.Instant, n: number) => instant.add({ microseconds: n });
const date = (instant: Temporal.Instant) => new Date(instant.epochMilliseconds);

const REVEAL = at("2026-11-07T07:00:00Z");
const CLOSE = at("2026-11-08T01:00:00Z");

/** Home for `user` in `club` at `instant`, the clock's sample taken first in `tx` (T1). */
async function home(tx: WorldTx, user: string, club: string, instant: Temporal.Instant): Promise<HomeRead | null> {
  const now: ServerNow = await fakeClock(instant).sample(tx);
  return readHome(tx, user, club, now);
}

/** A day of `star`'s on `day` (their weekday in the world's schedule), collecting since the world's generation. */
async function addDay(tx: WorldTx, w: World, star: Member, day: string): Promise<string> {
  const { revealAt, closeAt } = dayInstants(Temporal.PlainDate.from(day), "Europe/London");
  const id = newId("occ");
  await tx`
    INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                 collecting_from)
    VALUES (${id}, ${w.club}, ${star.interval}, ${w.version}, ${day}, ${revealAt}, ${closeAt}, ${AT.generated})`;
  return id;
}

/** A drop of `author`'s committed to `day`, as createDrop will commit it (world.ts' `commitDrop`). */
function commitTo(tx: WorldTx, w: World, day: string, author: Member, options: DropOptions = {}): Promise<string> {
  return commitDrop(plain(tx), { ...w, day }, author, options);
}

/** `star`'s highlight on `day`, pointed at their own `drop` before the reveal (T22). */
async function highlight(tx: WorldTx, day: string, star: Member, drop: string): Promise<void> {
  await tx`
    INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
    VALUES (${day}, ${star.interval}, ${drop}, 1, ${AT.edited})`;
}

const ids = (read: HomeRead | null) => {
  if (read === null || !("recentDays" in read)) throw new Error(`no recent days in ${JSON.stringify(read?.mode)}`);
  return read.recentDays.map((recent) => [recent.day.localDate, recent.coverDropId]);
};

describe("Home's mode at each edge of a day, with no worker running (T5, Q18, spec 06)", () => {
  it("waits for Ana's Saturday, opens it at 7 AM, keeps it past midnight and lets it go at 1 AM", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const before = await home(tx, w.ben.user, w.club, µs(REVEAL, -1));
      expect(before).toMatchObject({
        mode: "waiting",
        club: { id: w.club, timezone: "Europe/London", membershipId: w.ben.interval },
        clubToday: "2026-11-07",
        next: { id: w.day, phase: "collecting", localDate: "2026-11-07", star: { membershipId: w.ana.interval } },
        recentDays: [],
      });
      const opened = await home(tx, w.ben.user, w.club, REVEAL);
      expect(opened).toMatchObject({
        mode: "day",
        day: { occurrence: { id: w.day, phase: "open" }, isStar: false, joinedLater: false, addTarget: null },
        next: null,
        recentDays: [],
      });
      expect(await home(tx, w.ana.user, w.club, REVEAL)).toMatchObject({ mode: "day", day: { isStar: true } });
      // Past midnight the day is still Home's, and the club's date is Sunday's (section 0.3).
      expect(await home(tx, w.ben.user, w.club, at("2026-11-08T00:30:00Z"))).toMatchObject({
        mode: "day",
        clubToday: "2026-11-08",
        day: { occurrence: { id: w.day } },
      });
      expect(await home(tx, w.ben.user, w.club, µs(CLOSE, -1))).toMatchObject({ mode: "day" });
      // No later day exists, and Home never invents one (T49, FQ134).
      expect(await home(tx, w.ben.user, w.club, CLOSE)).toEqual({
        mode: "no_days",
        club: expect.objectContaining({ id: w.club }) as unknown,
        clubToday: "2026-11-08",
      });
    });
  });

  it("names the next day while one is open, and the star's own next day as the place to add (book p30)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const friday = await addDay(tx, w, w.ben, "2026-11-13");
      const saturday = await addDay(tx, w, w.ana, "2026-11-14");
      const opened = await home(tx, w.cleo.user, w.club, REVEAL);
      expect(opened).toMatchObject({
        mode: "day",
        day: { addTarget: { id: saturday, phase: "collecting", star: { membershipId: w.ana.interval } } },
        next: { id: friday, phase: "collecting" },
      });
      expect(await home(tx, w.cleo.user, w.club, CLOSE)).toMatchObject({ mode: "waiting", next: { id: friday } });
    });
  });
});

describe("who gets Home (T9, T14, FQ80)", () => {
  it("gives nothing to a stranger, a former member, an account being deleted, an invited person or a bad id", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await invite(tx, w, AT.added);
      expect(await home(tx, w.dan.user, w.club, REVEAL)).toBeNull();
      expect(await home(tx, mo, w.club, REVEAL)).toBeNull();
      for (const club of [newId("club"), "", "../club", "a".repeat(65), "club\u0000x"])
        expect(await home(tx, w.ana.user, club, REVEAL)).toBeNull();
      await leave(plain(tx), w.cleo, "Cleo", AT.added);
      expect(await home(tx, w.cleo.user, w.club, REVEAL)).toBeNull();
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.added} WHERE id = ${w.ben.user}`;
      expect(await home(tx, w.ben.user, w.club, REVEAL)).toBeNull();
    });
  });

  it("gives a rejoined member Home on the new interval", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.cleo, "Cleo", AT.added);
      const [again] = await joinByRoster(plain(tx), w.club, w.ana, [{ user: w.cleo.user, label: "Cleo" }], AT.edited);
      expect(await home(tx, w.cleo.user, w.club, REVEAL)).toMatchObject({
        mode: "day",
        club: { membershipId: again },
        day: { joinedLater: true },
      });
    });
  });

  it("says only unavailable to a suspended club's members, and nothing to anyone else (spec 22, FQ80)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await tx`UPDATE app.clubs SET suspended_at = ${AT.added} WHERE id = ${w.club}`;
      expect(await home(tx, w.ana.user, w.club, REVEAL)).toEqual({
        mode: "unavailable",
        club: {
          id: w.club,
          name: expect.any(String) as unknown,
          timezone: "Europe/London",
          membershipId: w.ana.interval,
        },
        clubToday: "2026-11-07",
      });
      expect(await home(tx, w.dan.user, w.club, REVEAL)).toBeNull();
    });
  });

  it("waits for a club that hasn't started (FQ54, FQ84)", async () => {
    await rolledBack(db, async (tx) => {
      const ana = await newUser(plain(tx), "Ana");
      const club = newId("club");
      const interval = newId("mem");
      await tx`
        INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
        VALUES (${club}, 'Not started', 'Europe/London', ${interval}, ${AT.created})`;
      await tx`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
        VALUES (${interval}, ${club}, ${ana}, 'creator', ${AT.created})`;
      expect(await home(tx, ana, club, REVEAL)).toMatchObject({ mode: "awaiting_activation", club: { id: club } });
    });
  });
});

describe("a paused club (FQ16, FQ50)", () => {
  it("shows the remaining member's own announced day until it closes, then the pause", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.ben, "Ben", AT.added);
      await leave(plain(tx), w.cleo, "Cleo", AT.added);
      expect(await home(tx, w.ana.user, w.club, µs(REVEAL, -1))).toMatchObject({
        mode: "waiting",
        next: { id: w.day },
      });
      expect(await home(tx, w.ana.user, w.club, REVEAL)).toMatchObject({ mode: "day", day: { isStar: true } });
      expect(await home(tx, w.ana.user, w.club, CLOSE)).toMatchObject({ mode: "paused", recentDays: [] });
    });
  });

  it("keeps the club's recent days readable while paused", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await commitDrop(plain(tx), w, w.ben, { at: AT.added });
      await leave(plain(tx), w.ben, "Ben", date(at("2026-11-07T09:00:00Z")));
      await leave(plain(tx), w.cleo, "Cleo", date(at("2026-11-07T09:00:00Z")));
      expect(ids(await home(tx, w.ana.user, w.club, CLOSE))).toEqual([["2026-11-07", drop]]);
    });
  });
});

describe("a day that never opens is never Home's (FQ63, T5)", () => {
  it("passes over a day whose star left, or asked to delete their account, before it opened", async () => {
    for (const how of ["leave", "delete"] as const) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const friday = await addDay(tx, w, w.ben, "2026-11-13");
        if (how === "leave") await leave(plain(tx), w.ana, "Ana", AT.added);
        else
          await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.added} WHERE id = ${w.ana.user}`;
        expect(await home(tx, w.ben.user, w.club, µs(REVEAL, -1))).toMatchObject({
          mode: "waiting",
          next: { id: friday },
        });
        expect(await home(tx, w.ben.user, w.club, REVEAL)).toMatchObject({ mode: "waiting", next: { id: friday } });
      });
    }
  });

  it("passes over a cancelled day, and a star's next day that is held or cancelled is no place to add", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const anaNext = await addDay(tx, w, w.ana, "2026-11-14");
      await tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${anaNext}`;
      expect(await home(tx, w.ben.user, w.club, REVEAL)).toMatchObject({
        mode: "day",
        day: { addTarget: null },
        next: null,
      });
      await tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${w.day}`;
      expect(await home(tx, w.ben.user, w.club, REVEAL)).toMatchObject({ mode: "no_days" });
    });
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await addDay(tx, w, w.ana, "2026-11-14");
      // Ana leaves once her Saturday has opened: it stays open to its close, and her next is held.
      await leave(plain(tx), w.ana, "Ana", date(at("2026-11-07T09:00:00Z")));
      expect(await home(tx, w.ben.user, w.club, at("2026-11-07T10:00:00Z"))).toMatchObject({
        mode: "day",
        day: { occurrence: { id: w.day, star: { displayName: "Ana", avatarVersion: null } }, addTarget: null },
        next: null,
      });
    });
  });
});

describe("the viewer's place in the open day (spec 07, T15)", () => {
  it("says a member who joined after the day started collecting joined later, from their own membership", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await newUser(plain(tx), "Mo");
      const [interval] = await joinByRoster(plain(tx), w.club, w.ana, [{ user: mo, label: "Mo" }], AT.added);
      expect(await home(tx, mo, w.club, REVEAL)).toMatchObject({
        mode: "day",
        club: { membershipId: interval },
        day: { isStar: false, joinedLater: true },
      });
      expect(await home(tx, w.cleo.user, w.club, REVEAL)).toMatchObject({ day: { joinedLater: false } });
    });
  });

  it("says a member who joined at the instant the day started collecting didn't join later", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await newUser(plain(tx), "Mo");
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: mo, label: "Mo" }], AT.generated);
      expect(await home(tx, mo, w.club, REVEAL)).toMatchObject({ day: { joinedLater: false } });
    });
  });
});

/** The open day's frame for `user` at `instant`: a throw when Home isn't a day. */
async function page(tx: WorldTx, user: string, club: string, instant: Temporal.Instant = REVEAL) {
  const read = await home(tx, user, club, instant);
  if (read?.mode !== "day") throw new Error(`Home is ${JSON.stringify(read?.mode)}, not a day`);
  return read.day;
}

/** A photo drop's media version: its upload's random content version (T21). */
async function versionOf(tx: WorldTx, drop: string): Promise<string> {
  const [row] = await tx<{ version: string }[]>`
    SELECT u.content_version AS version FROM app.drops d JOIN app.uploads u ON u.id = d.upload_id WHERE d.id = ${drop}`;
  if (row === undefined) throw new Error(`${drop} has no photo`);
  return row.version;
}

/** Ids byte by byte, as the database orders them under COLLATE "C". */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const minutes = (n: number) => new Date(AT.added.getTime() + n * 60_000);
const OPENED = at("2026-11-07T09:00:00Z");

describe("the open day's page: the star's own drops, then friends' (spec 15; T9, T35; addendum 4; Q18)", () => {
  it("lists every drop the viewer may see, the star's first, each section in commit order with the id as a tiebreak", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const ben1 = await commitDrop(plain(tx), w, w.ben, { caption: "From Ben", at: minutes(0) });
      const cleo1 = await commitDrop(plain(tx), w, w.cleo, {
        media: "external_video",
        caption: "Cleo's pick",
        at: minutes(1),
      });
      const ana1 = await commitDrop(plain(tx), w, w.ana, { at: minutes(2) });
      const ben2 = await commitDrop(plain(tx), w, w.ben, { at: minutes(3) });
      const ana2 = await commitDrop(plain(tx), w, w.ana, { media: "external_video", at: minutes(4) });
      // Two friends' drops at one instant: in the order of their ids, byte by byte.
      const tied = [
        await commitDrop(plain(tx), w, w.cleo, { at: minutes(5) }),
        await commitDrop(plain(tx), w, w.ben, { media: "external_video", at: minutes(5) }),
      ].sort(byBytes);
      const order = [ana1, ana2, ben1, cleo1, ben2, ...tied];
      for (const viewer of [w.ana, w.ben, w.cleo]) {
        const day = await page(tx, viewer.user, w.club);
        expect(day.drops.map((drop) => drop.id)).toEqual(order);
        expect(day.drops.map((drop) => drop.section)).toEqual([
          "star",
          "star",
          "friends",
          "friends",
          "friends",
          "friends",
          "friends",
        ]);
        expect(day.highlights).toEqual([]);
      }
      const day = await page(tx, w.cleo.user, w.club, µs(CLOSE, -1));
      const card = (id: string) => day.drops.find((drop) => drop.id === id);
      expect(card(ben1)).toEqual({
        id: ben1,
        author: { membershipId: w.ben.interval, displayName: "Ben", avatarVersion: null },
        mediaClass: "photo",
        caption: "From Ben",
        highlight: false,
        photo: {
          width: PHOTO_FRAMES.display.width,
          height: PHOTO_FRAMES.display.height,
          mediaVersion: await versionOf(tx, ben1),
        },
        video: null,
        section: "friends",
      });
      expect(card(cleo1)).toEqual({
        id: cleo1,
        author: { membershipId: w.cleo.interval, displayName: "Cleo", avatarVersion: null },
        mediaClass: "external_video",
        caption: "Cleo's pick",
        highlight: false,
        photo: null,
        video: { provider: "tiktok" },
        section: "friends",
      });
      expect(card(ana1)).toMatchObject({
        author: { membershipId: w.ana.interval, displayName: "Ana" },
        caption: null,
        section: "star",
      });
      // Before the reveal Home waits for the day, and nothing of its page is read (T10).
      expect(await home(tx, w.ben.user, w.club, µs(REVEAL, -1))).toMatchObject({ mode: "waiting" });
    });
  });

  it("names each author as the club sees them: the avatar while both are active, then the name the interval ended with (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await commitDrop(plain(tx), w, w.ben, { at: AT.added });
      const avatar = await newAvatar(plain(tx), w.ben.user, "ready");
      await tx`UPDATE app.users SET avatar_upload_id = ${avatar.id} WHERE id = ${w.ben.user}`;
      expect((await page(tx, w.ana.user, w.club)).drops[0]?.author).toEqual({
        membershipId: w.ben.interval,
        displayName: "Ben",
        avatarVersion: avatar.version,
      });
      // Ben leaves after the reveal, keeping the drop (spec 22): it stays, under the name the interval ended with.
      await leave(plain(tx), w.ben, "Ben then", AT.opened);
      expect((await page(tx, w.ana.user, w.club, OPENED.add({ hours: 1 }))).drops[0]?.author).toEqual({
        membershipId: w.ben.interval,
        displayName: "Ben then",
        avatarVersion: null,
      });
    });
  });

  it("leaves out what the viewer may not see, so a day with nothing they may see is a quiet day (T9, T15, T24, T27, T29)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await commitDrop(plain(tx), w, w.ben, { at: AT.added });
      const mo = await newUser(plain(tx), "Mo");
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: mo, label: "Mo" }], AT.edited);
      expect(await page(tx, mo, w.club)).toMatchObject({ joinedLater: true, drops: [], highlights: [] });
    });
    // Ben's deletion begins while the day is open: his drop leaves at once, before any job has run (T27).
    for (const end of ["withdrawn", "removed", "held", "author's deletion"] as const) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await commitDrop(plain(tx), w, w.ben, { at: AT.added });
        const video = await commitDrop(plain(tx), w, w.cleo, { media: "external_video", at: AT.added });
        if (end === "withdrawn") await withdraw(tx, w, drop, STATE_AT);
        else if (end === "removed") await removeByModeration(tx, drop, STATE_AT);
        else if (end === "held")
          await tx`UPDATE app.drops SET state = 'held', updated_at = ${STATE_AT} WHERE id = ${drop}`;
        else
          await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.opened} WHERE id = ${w.ben.user}`;
        const read = await page(tx, w.ana.user, w.club, at("2026-11-07T09:30:00Z"));
        expect(
          read.drops.map((card) => card.id),
          end,
        ).toEqual([video]);
      });
    }
  });

  it("leaves out a drop a block keeps from the viewer (T23)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await commitDrop(plain(tx), w, w.ben, { at: AT.added });
      const video = await commitDrop(plain(tx), w, w.cleo, { media: "external_video", at: AT.added });
      // Ben blocks Ana and leaves by it, keeping the drop: Ana, still a member, may no longer see it; Cleo may.
      await block(tx, w.ben, "Ben", w.ana, "Ana", STATE_AT);
      expect((await page(tx, w.ana.user, w.club)).drops.map((card) => card.id)).toEqual([video]);
      expect((await page(tx, w.cleo.user, w.club)).drops).toHaveLength(2);
    });
  });

  // A block row with both still members. No command makes this today: a block ends every club the two shared (D11),
  // and whether a block can be undone is FQ72's. But the schema allows it, a block made in another club stands in
  // every club after it (FQ88), and the predicate denies it either way. The outside audit's A14 rewrote this page
  // with a one-way block, and Cleo, who had blocked Ben, got Ben's drop. The block names the blocked person's
  // interval here and, in turn, in another club, so a block keyed by this club's interval rather than by the
  // account misses the second.
  it("leaves out each other's drops when one of two members blocked the other, either way, made here or in another club (T9, T23, FQ88)", async () => {
    for (const blocker of ["Cleo", "Ben"] as const) {
      for (const where of ["here", "in another club"] as const) {
        await rolledBack(db, async (tx) => {
          const w = await newWorld(plain(tx));
          const bens = await commitDrop(plain(tx), w, w.ben, { at: AT.added });
          const cleos = await commitDrop(plain(tx), w, w.cleo, { media: "external_video", at: AT.added });
          const [from, to, name] = blocker === "Cleo" ? [w.cleo, w.ben, "Ben"] : [w.ben, w.cleo, "Cleo"];
          const interval = where === "here" ? to.interval : await intervalElsewhere(plain(tx), w, to.user);
          await tx`
            INSERT INTO app.blocks (id, blocker_user_id, blocked_user_id, blocked_interval_id, blocked_name, created_at)
            VALUES (${newId("blk")}, ${from.user}, ${to.user}, ${interval}, ${name}, ${STATE_AT})`;
          const label = `${blocker} blocked, ${where}`;
          expect(
            (await page(tx, w.cleo.user, w.club)).drops.map((card) => card.id),
            label,
          ).toEqual([cleos]);
          expect(
            (await page(tx, w.ben.user, w.club)).drops.map((card) => card.id),
            label,
          ).toEqual([bens]);
          expect((await page(tx, w.ana.user, w.club)).drops.map((card) => card.id).sort(), label).toEqual(
            [bens, cleos].sort(),
          );
        });
      }
    }
  });
});

describe("the open day's highlight rail (T22; FQ26)", () => {
  /**
   * Pat, then Mo, join while Ana's Saturday is collecting, with no day in its schedule; then Mo, Pat, Ben, Cleo
   * and Ana each add a photo, in that order, and point their highlight at it. Ben adds a second photo too.
   * Mo's interval id sorts before Pat's, byte by byte, so an order by id instead of by joining would show.
   */
  async function fiveHighlights(tx: WorldTx) {
    const w = await newWorld(plain(tx));
    const [pat, mo] = [await newUser(plain(tx), "Pat"), await newUser(plain(tx), "Mo")];
    const [patInterval] = await joinByRoster(
      plain(tx),
      w.club,
      w.ana,
      [{ user: pat, label: "Pat" }],
      new Date("2026-11-03T10:00:00Z"),
      [newId("mem").replace("mem_", "mem_z")],
    );
    const [moInterval] = await joinByRoster(
      plain(tx),
      w.club,
      w.ana,
      [{ user: mo, label: "Mo" }],
      new Date("2026-11-04T10:00:00Z"),
      [newId("mem").replace("mem_", "mem_A")],
    );
    if (patInterval === undefined || moInterval === undefined) throw new Error("the roster added nobody");
    const members = { mo: { user: mo, interval: moInterval }, pat: { user: pat, interval: patInterval } };
    const drops: Record<string, string> = {};
    for (const [name, member, minute] of [
      ["mo", members.mo, 0],
      ["pat", members.pat, 1],
      ["ben", w.ben, 2],
      ["cleo", w.cleo, 3],
      ["ana", w.ana, 4],
    ] as const) {
      const drop = await commitDrop(plain(tx), w, member, { at: minutes(minute) });
      await highlight(tx, w.day, member, drop);
      drops[name] = drop;
    }
    drops["ben2"] = await commitDrop(plain(tx), w, w.ben, { at: minutes(5) });
    return { w, ...members, drops };
  }
  const entry = (drop: string | undefined, member: Member, name: string, starPick = false) => ({
    dropId: drop,
    author: { membershipId: member.interval, displayName: name, avatarVersion: null },
    starPick,
  });

  it("puts the star's pick first, then the day's schedule from Monday, then anyone without a day in the order they joined", async () => {
    await rolledBack(db, async (tx) => {
      const s = await fiveHighlights(tx);
      const day = await page(tx, s.w.ana.user, s.w.club);
      // Ana's pick, then Cleo (Thursday), Ben (Friday), and Pat and Mo, who have no day, as they joined.
      expect(day.highlights).toEqual([
        entry(s.drops["ana"], s.w.ana, "Ana", true),
        entry(s.drops["cleo"], s.w.cleo, "Cleo"),
        entry(s.drops["ben"], s.w.ben, "Ben"),
        entry(s.drops["pat"], s.pat, "Pat"),
        entry(s.drops["mo"], s.mo, "Mo"),
      ]);
      const flags = Object.fromEntries(day.drops.map((card) => [card.id, card.highlight]));
      expect(flags).toEqual({
        [s.drops["ana"] ?? ""]: true,
        [s.drops["mo"] ?? ""]: true,
        [s.drops["pat"] ?? ""]: true,
        [s.drops["ben"] ?? ""]: true,
        [s.drops["cleo"] ?? ""]: true,
        [s.drops["ben2"] ?? ""]: false,
      });
    });
  });

  it("places a member with two days by the earlier, in the day's own schedule and no later one", async () => {
    await rolledBack(db, async (tx) => {
      const s = await fiveHighlights(tx);
      // Ben's Monday in the day's own week puts Ben before Cleo.
      await tx`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${s.w.version}, ${s.w.club}, 'monday', ${s.w.ben.interval}, '2026-11-02', ${AT.generated})`;
      // A week written later, from Tuesday 3 November, in force on the day's date and now, and the club's
      // latest (as a new member's week can start before days already made, migration 0015): its Tuesday for
      // Pat and Monday for Cleo change nothing, since Ana's Saturday was made under the first.
      const later = newId("sched");
      await tx`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${later}, ${s.w.club}, '2026-11-03', ${AT.edited})`;
      for (const [weekday, member, first] of [
        ["tuesday", s.pat, "2026-11-03"],
        ["monday", s.w.cleo, "2026-11-09"],
      ] as const)
        await tx`
          INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
          VALUES (${later}, ${s.w.club}, ${weekday}, ${member.interval}, ${first}, ${AT.edited})`;
      const day = await page(tx, s.w.ana.user, s.w.club);
      expect(day.highlights.map((one) => one.author.displayName)).toEqual(["Ana", "Ben", "Cleo", "Pat", "Mo"]);
    });
  });

  it("counts a member's day that first opens later the same week, not one that starts the week after, nor one confirmed while the day is open (FQ26, FQ55, FQ79)", async () => {
    await rolledBack(db, async (tx) => {
      // The club's first days, from Monday 2 November: Cleo's Thursday 5, Ben's Friday 6 and Ana's Saturday 7
      // (the world's), and Mo's Tuesday 3, Mo, Pat and Lu having joined the first days on 1 November.
      const w = await newWorld(plain(tx));
      const [mo, pat, lu] = [
        await newUser(plain(tx), "Mo"),
        await newUser(plain(tx), "Pat"),
        await newUser(plain(tx), "Lu"),
      ];
      const joined: Member[] = [];
      for (const [user, label, hour] of [
        [mo, "Mo", 13],
        [pat, "Pat", 14],
        [lu, "Lu", 15],
      ] as const) {
        const at = new Date(`2026-11-01T${String(hour)}:00:00Z`);
        const [interval] = await joinByRoster(plain(tx), w.club, w.ana, [{ user, label }], at);
        if (interval === undefined) throw new Error("the roster added nobody");
        joined.push({ user, interval });
      }
      const [moMember, patMember, luMember] = joined as [Member, Member, Member];
      const confirm = (weekday: string, member: Member, first: string, at: Date) => tx`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${w.version}, ${w.club}, ${weekday}, ${member.interval}, ${first}, ${at})`;
      await confirm("tuesday", moMember, "2026-11-03", AT.generated);
      // Pat confirms Monday on Monday 2 November after its 7 AM: less than 24 hours before a Monday 7 AM until
      // the next, so the first is 9 November (FQ79), the week after Mo's Tuesday.
      await confirm("monday", patMember, "2026-11-09", new Date("2026-11-02T09:00:00Z"));
      const tuesday = await addDay(tx, w, moMember, "2026-11-03");
      // Each adds a video link to Mo's Tuesday on Monday evening (world.ts' photos hold their slot until the
      // world's Saturday, past this day's reveal) and points their highlight at it.
      const authors: [Member, string][] = [
        [luMember, "Lu"],
        [patMember, "Pat"],
        [w.ana, "Ana"],
        [w.ben, "Ben"],
        [w.cleo, "Cleo"],
        [moMember, "Mo"],
      ];
      for (const [index, [member]] of authors.entries()) {
        const at = new Date(Date.UTC(2026, 10, 2, 18, index));
        const drop = await commitTo(tx, w, tuesday, member, { media: "external_video", at });
        await tx`
          INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
          VALUES (${tuesday}, ${member.interval}, ${drop}, 1, ${new Date(Date.UTC(2026, 10, 2, 20, index))})`;
      }
      const order = async (instant: string) =>
        (await page(tx, w.ana.user, w.club, at(instant))).highlights.map((one) => one.author.displayName);
      // Mo's pick, then Cleo (Thursday), Ben (Friday) and Ana (Saturday), whose days first open later that
      // week; then Pat, whose Monday starts the week after, and Lu, with no day, as they joined.
      expect(await order("2026-11-03T09:00:00Z")).toEqual(["Mo", "Cleo", "Ben", "Ana", "Pat", "Lu"]);
      // Lu confirms Wednesday while Mo's day is open: its first date is Wednesday 4 November, that week (the
      // row joins the version the day was made under, FQ55). The rail doesn't move until the next day.
      await confirm("wednesday", luMember, "2026-11-04", new Date("2026-11-03T09:00:00Z"));
      expect(await order("2026-11-03T10:00:00Z")).toEqual(["Mo", "Cleo", "Ben", "Ana", "Pat", "Lu"]);
    });
  });

  it("orders contributors who joined at one instant by their interval ids, byte by byte (FQ114)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const [lu, kai] = [await newUser(plain(tx), "Lu"), await newUser(plain(tx), "Kai")];
      // One roster, one instant. Kai's "mem_B…" sorts before Lu's "mem_a…" byte by byte, though not in a
      // locale's order; their drops' ids, and the order they were added, sort the other way.
      const [luInterval, kaiInterval] = await joinByRoster(
        plain(tx),
        w.club,
        w.ana,
        [
          { user: lu, label: "Lu" },
          { user: kai, label: "Kai" },
        ],
        new Date("2026-11-03T10:00:00Z"),
        [newId("mem").replace("mem_", "mem_a"), newId("mem").replace("mem_", "mem_B")],
      );
      if (luInterval === undefined || kaiInterval === undefined) throw new Error("the roster added nobody");
      for (const [interval, minute, prefix] of [
        [luInterval, 0, "drp_A"],
        [kaiInterval, 1, "drp_z"],
      ] as const) {
        const member = { user: interval === luInterval ? lu : kai, interval };
        const id = newId("drp").replace("drp_", prefix);
        await highlight(tx, w.day, member, await commitDrop(plain(tx), w, member, { at: minutes(minute), id }));
      }
      const day = await page(tx, w.ana.user, w.club);
      expect(day.highlights.map((one) => one.author.displayName)).toEqual(["Kai", "Lu"]);
    });
  });

  it("leaves out a highlight the viewer may not see: a held drop's, and one added before the viewer joined", async () => {
    await rolledBack(db, async (tx) => {
      const s = await fiveHighlights(tx);
      // A hold keeps the pointer, and the read never shows a held drop (T29).
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${STATE_AT} WHERE id = ${s.drops["cleo"] ?? ""}`;
      const day = await page(tx, s.w.ana.user, s.w.club);
      expect(day.highlights.map((one) => one.author.displayName)).toEqual(["Ana", "Ben", "Pat", "Mo"]);
      // Zoe joins after every drop was added, so none has Zoe in its audience (T8): no highlight to show.
      const zoe = await newUser(plain(tx), "Zoe");
      await joinByRoster(plain(tx), s.w.club, s.w.ana, [{ user: zoe, label: "Zoe" }], AT.edited);
      expect(await page(tx, zoe, s.w.club)).toMatchObject({ drops: [], highlights: [] });
    });
  });
});

describe("what B6 builds on the page: reactions, favourites and replies (section 0.1)", () => {
  it("refuses a page whose drops have a reaction, a favourite or a comment, which only B6's routes write", async () => {
    for (const write of ["reaction", "favourite", "comment"] as const) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await commitDrop(plain(tx), w, w.ben, { at: AT.added });
        expect(await page(tx, w.ana.user, w.club, OPENED)).toMatchObject({ drops: [{ id: drop }] });
        if (write === "reaction")
          await tx`
            INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at)
            VALUES (${drop}, ${w.cleo.interval}, 'heart', ${AT.opened})`;
        else if (write === "favourite")
          await tx`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.ana.interval}, ${drop}, ${AT.opened})`;
        else
          await tx`
            INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
            VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, 'Lovely', ${AT.opened}, ${AT.opened})`;
        // Cleo's reaction or comment is shown to everyone who sees the drop, and Ana's favourite to Ana: the
        // page is not B2's to answer.
        await expect(home(tx, w.ana.user, w.club, OPENED)).rejects.toThrow(/B6/);
      });
    }
  });

  it("never asks about someone else's favourite, which is private to them (spec 18)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await commitDrop(plain(tx), w, w.ben, { at: AT.added });
      await tx`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.cleo.interval}, ${drop}, ${AT.opened})`;
      // Ana's page is as before Cleo saved it; Cleo's own page is B6's.
      expect(await page(tx, w.ana.user, w.club, OPENED)).toMatchObject({ drops: [{ id: drop }] });
      await expect(home(tx, w.cleo.user, w.club, OPENED)).rejects.toThrow(/B6/);
    });
  });
});

describe("the recent days, with their covers (spec 08, 18; D08; T9, T15)", () => {
  /**
   * Seven days with something readable and one without, all committed on Friday 6 November at 20:00 or
   * later, before any of them opened:
   * - Thursday 5: Ana's video alone, committed the day before (the newest six leave it out);
   * - Saturday 7: Ben's photo;
   * - Thursday 12: Ana's photo;
   * - Friday 13: Ben's photo, withdrawn: nothing readable, so never listed;
   * - Saturday 14: Cleo's video alone: listed, with no cover;
   * - Thursday 19 (Cleo's): Ana's photo, then Ben's photo earlier: no star photo, so the earliest, Ben's;
   * - Friday 20 (Ben's): Ana's photo first, then two of Ben's: the star's earliest;
   * - Saturday 21 (Ana's): Ben's photo first, then two of Ana's, the later her highlight: the highlight.
   * Friday 27 is the next day, so Home waits for it, with its recent days.
   */
  async function sixWeeks(tx: WorldTx) {
    const w = await newWorld(plain(tx));
    const t = (minutes: number) => new Date(AT.added.getTime() + minutes * 60_000);
    const thursday5 = await addDay(tx, w, w.cleo, "2026-11-05");
    await commitTo(tx, w, thursday5, w.ana, { media: "external_video", at: new Date("2026-11-04T20:00:00Z") });
    const saturday7 = w.day;
    const ben7 = await commitTo(tx, w, saturday7, w.ben, { at: t(0) });
    const thursday12 = await addDay(tx, w, w.cleo, "2026-11-12");
    const ana12 = await commitTo(tx, w, thursday12, w.ana, { at: t(1) });
    const friday13 = await addDay(tx, w, w.ben, "2026-11-13");
    const ben13 = await commitTo(tx, w, friday13, w.ben, { at: t(2) });
    await withdraw(tx, w, ben13, STATE_AT);
    const saturday14 = await addDay(tx, w, w.ana, "2026-11-14");
    await commitTo(tx, w, saturday14, w.cleo, { media: "external_video", at: t(3) });
    const thursday19 = await addDay(tx, w, w.cleo, "2026-11-19");
    const ben19 = await commitTo(tx, w, thursday19, w.ben, { at: t(4) });
    await commitTo(tx, w, thursday19, w.ana, { at: t(5) });
    const friday20 = await addDay(tx, w, w.ben, "2026-11-20");
    await commitTo(tx, w, friday20, w.ana, { at: t(6) });
    const ben20 = await commitTo(tx, w, friday20, w.ben, { at: t(7) });
    await commitTo(tx, w, friday20, w.ben, { at: t(8) });
    const saturday21 = await addDay(tx, w, w.ana, "2026-11-21");
    await commitTo(tx, w, saturday21, w.ben, { at: t(9) });
    await commitTo(tx, w, saturday21, w.ana, { at: t(10) });
    const ana21 = await commitTo(tx, w, saturday21, w.ana, { at: t(11) });
    await highlight(tx, saturday21, w.ana, ana21);
    const friday27 = await addDay(tx, w, w.ben, "2026-11-27");
    return { w, ben7, ana12, ben19, ben20, ana21, friday27, thursday19, saturday14 };
  }
  const SUNDAY_22 = at("2026-11-22T10:00:00Z");

  it("lists the newest six closed days the viewer can read something in, each with D08's cover", async () => {
    await rolledBack(db, async (tx) => {
      const s = await sixWeeks(tx);
      const read = await home(tx, s.w.ana.user, s.w.club, SUNDAY_22);
      expect(read).toMatchObject({ mode: "waiting", next: { id: s.friday27 } });
      expect(ids(read)).toEqual([
        ["2026-11-21", s.ana21],
        ["2026-11-20", s.ben20],
        ["2026-11-19", s.ben19],
        ["2026-11-14", null],
        ["2026-11-12", s.ana12],
        ["2026-11-07", s.ben7],
      ]);
      if (read?.mode !== "waiting") throw new Error("not waiting");
      expect(new Set(read.recentDays.map((recent) => recent.day.phase))).toEqual(new Set(["past"]));
      expect(read.recentDays[0]?.day.star).toEqual({
        membershipId: s.w.ana.interval,
        displayName: "Ana",
        avatarVersion: null,
      });
    });
  });

  it("covers a day with the star's own highlighted photo only: a friend's highlight, or the star's highlighted video, gives way to the star's earliest photo, or with none of the star's to the earliest (D08)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const t = (minutes: number) => new Date(AT.added.getTime() + minutes * 60_000);
      // Ana's Saturday 14: Ben's photo first, his highlight; then Ana's photo, her video, her highlight, and a
      // second photo of hers.
      const saturday14 = await addDay(tx, w, w.ana, "2026-11-14");
      const ben14 = await commitTo(tx, w, saturday14, w.ben, { at: t(0) });
      await highlight(tx, saturday14, w.ben, ben14);
      const ana14 = await commitTo(tx, w, saturday14, w.ana, { at: t(1) });
      const video14 = await commitTo(tx, w, saturday14, w.ana, { media: "external_video", at: t(2) });
      await highlight(tx, saturday14, w.ana, video14);
      await commitTo(tx, w, saturday14, w.ana, { at: t(3) });
      // Ben's Friday 20: Ana's photo first, her highlight; then Ben's photo, and Ben's second, his highlight.
      const friday20 = await addDay(tx, w, w.ben, "2026-11-20");
      const ana20 = await commitTo(tx, w, friday20, w.ana, { at: t(4) });
      await highlight(tx, friday20, w.ana, ana20);
      await commitTo(tx, w, friday20, w.ben, { at: t(5) });
      const ben20 = await commitTo(tx, w, friday20, w.ben, { at: t(6) });
      await highlight(tx, friday20, w.ben, ben20);
      // Cleo's Thursday 19, with no photo of Cleo's: Ana's photo first, then Ben's, his highlight.
      const thursday19 = await addDay(tx, w, w.cleo, "2026-11-19");
      const ana19 = await commitTo(tx, w, thursday19, w.ana, { at: t(7) });
      const ben19 = await commitTo(tx, w, thursday19, w.ben, { at: t(8) });
      await highlight(tx, thursday19, w.ben, ben19);
      await addDay(tx, w, w.ben, "2026-11-27");
      expect(ids(await home(tx, w.ana.user, w.club, SUNDAY_22))).toEqual([
        ["2026-11-20", ben20],
        ["2026-11-19", ana19],
        ["2026-11-14", ana14],
      ]);
    });
  });

  it("lists a day only once it has closed", async () => {
    await rolledBack(db, async (tx) => {
      const s = await sixWeeks(tx);
      const fridayCloses = at("2026-11-21T01:00:00Z");
      // A microsecond before, Friday 20 is still Home's day, with its page.
      expect(await home(tx, s.w.ana.user, s.w.club, µs(fridayCloses, -1))).toMatchObject({
        mode: "day",
        day: { occurrence: { localDate: "2026-11-20" }, drops: [{}, {}, {}] },
      });
      const read = await home(tx, s.w.ana.user, s.w.club, fridayCloses);
      expect(read).toMatchObject({ mode: "waiting", next: { localDate: "2026-11-21" } });
      expect(ids(read)[0]).toEqual(["2026-11-20", s.ben20]);
    });
  });

  it("never lists a day still open, even one with drops the viewer may see (the fragment itself)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await sixWeeks(tx);
      const listed = async (instant: Temporal.Instant) => {
        const now: ServerNow = await fakeClock(instant).sample(tx);
        const rows = await tx<{ recent_days: unknown[] }[]>`
          SELECT r.recent_days FROM (${recentDays(tx, s.w.ana.user, now)}) r WHERE r.club_id = ${s.w.club}`;
        return (rows[0]?.recent_days ?? []).map((value) => recentDay(value).day.localDate);
      };
      const fridayCloses = at("2026-11-21T01:00:00Z");
      expect(await listed(µs(fridayCloses, -1))).toEqual([
        "2026-11-19",
        "2026-11-14",
        "2026-11-12",
        "2026-11-07",
        "2026-11-05",
      ]);
      expect((await listed(fridayCloses))[0]).toBe("2026-11-20");
    });
  });

  it("leaves out what the viewer can't read: a held day, a cancelled day, a late joiner's and a rejoined member's", async () => {
    await rolledBack(db, async (tx) => {
      const s = await sixWeeks(tx);
      // Cleo leaves before her Thursdays 12 and 19 open: both are held, and never open (FQ63); her Thursday 5
      // had opened, so it stays. Saturday 14 is cancelled.
      await leave(plain(tx), s.w.cleo, "Cleo", AT.edited);
      await tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${s.saturday14}`;
      expect(ids(await home(tx, s.w.ana.user, s.w.club, SUNDAY_22)).map(([day]) => day)).toEqual([
        "2026-11-21",
        "2026-11-20",
        "2026-11-07",
        "2026-11-05",
      ]);
      // Cleo rejoins: the new interval was in no audience (T8, Q06).
      await joinByRoster(plain(tx), s.w.club, s.w.ana, [{ user: s.w.cleo.user, label: "Cleo" }], AT.edited);
      expect(ids(await home(tx, s.w.cleo.user, s.w.club, SUNDAY_22))).toEqual([]);
      const mo = await newUser(plain(tx), "Mo");
      await joinByRoster(plain(tx), s.w.club, s.w.ana, [{ user: mo, label: "Mo" }], AT.edited);
      expect(ids(await home(tx, mo, s.w.club, SUNDAY_22))).toEqual([]);
    });
  });
});

describe("the club's date (section 0.3)", () => {
  /** An active club of two in `zone` with no day. */
  async function zoneClub(tx: WorldTx, zone: string): Promise<{ club: string; ana: string }> {
    const ana = await newUser(plain(tx), "Ana");
    const ben = await newUser(plain(tx), "Ben");
    const club = newId("club");
    const interval = newId("mem");
    await tx`
      INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
      VALUES (${club}, 'Far away', ${zone}, ${interval}, ${AT.created})`;
    await tx`
      INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
      VALUES (${interval}, ${club}, ${ana}, 'creator', ${AT.created})`;
    await joinByRoster(plain(tx), club, { user: ana, interval }, [{ user: ben, label: "Ben" }], AT.joined);
    await tx`UPDATE app.clubs SET activated_at = ${AT.joined} WHERE id = ${club}`;
    return { club, ana };
  }

  it("is the calendar date in the club's timezone, on both sides of its midnight", async () => {
    await rolledBack(db, async (tx) => {
      const east = await zoneClub(tx, "Pacific/Kiritimati");
      expect(await home(tx, east.ana, east.club, at("2026-11-07T09:59:59Z"))).toMatchObject({
        mode: "no_days",
        clubToday: "2026-11-07",
      });
      expect(await home(tx, east.ana, east.club, at("2026-11-07T10:00:00Z"))).toMatchObject({
        clubToday: "2026-11-08",
      });
      const west = await zoneClub(tx, "Pacific/Pago_Pago");
      expect(await home(tx, west.ana, west.club, at("2026-11-07T10:59:59Z"))).toMatchObject({
        clubToday: "2026-11-06",
      });
      expect(await home(tx, west.ana, west.club, at("2026-11-07T11:00:00Z"))).toMatchObject({
        clubToday: "2026-11-07",
      });
    });
  });
});
