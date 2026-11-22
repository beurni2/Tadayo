/// <reference lib="esnext.temporal" />
// Home's route as the contract has it (the contract's `getHome` and `Home`; T1, T14, T34, T35, T55;
// docs/plans/api-b2-home.md), with no database: the serializer's field list, held against every example the
// contract gives (read from the contract, not copied by hand), the one whose drops carry B6's reactions,
// favourites and reply previews with those parts taken away, and the handler's transaction and answers. The
// read is on Postgres (tests/src/db/home.test.ts), and every role's answers are the privacy matrix's
// (tests/src/privacy/home.ts).

import { Home as HomeSchema } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import type {
  Account,
  Clock,
  HomeRead,
  PageDrop,
  PlacedDay,
  RailEntry,
  RecentDay,
  SchedulePerson,
  ServerNow,
} from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { homeBody } from "./home.ts";

type Body = Record<string, unknown>;

/** A contract example's Occurrence as the domain holds a day Home names. */
function day<P extends PlacedDay["phase"]>(value: unknown, phase: P): PlacedDay & { phase: P } {
  const body = value as Body & { star: { membership_id: string; display_name: string; avatar_version?: string } };
  expect(body["phase"]).toBe(phase);
  return {
    id: body["id"] as string,
    clubId: body["club_id"] as string,
    star: {
      membershipId: body.star.membership_id,
      displayName: body.star.display_name,
      avatarVersion: body.star.avatar_version ?? null,
    },
    localDate: body["local_date"] as string,
    revealAt: Temporal.Instant.from(body["reveal_at"] as string),
    closeAt: Temporal.Instant.from(body["close_at"] as string),
    phase,
  };
}

/** A contract example's Person as the domain holds one. */
function person(value: unknown): SchedulePerson {
  const body = value as { membership_id: string; display_name: string; avatar_version?: string };
  return {
    membershipId: body.membership_id,
    displayName: body.display_name,
    avatarVersion: body.avatar_version ?? null,
  };
}

/** A contract example's RevealedDayDrop as the domain's page holds it: B6's parts are left to the caller. */
function pageDrop(value: unknown): PageDrop {
  const body = value as Body & { photo?: Body; video?: Body };
  return {
    id: body["id"] as string,
    author: person(body["author"]),
    mediaClass: body["media_class"] as PageDrop["mediaClass"],
    caption: (body["caption"] as string | undefined) ?? null,
    highlight: body["highlight"] as boolean,
    photo:
      body.photo === undefined
        ? null
        : {
            width: body.photo["width"] as number,
            height: body.photo["height"] as number,
            mediaVersion: body.photo["media_version"] as string,
          },
    video: body.video === undefined ? null : { provider: body.video["provider"] as "tiktok" | "instagram" },
    section: body["section"] as PageDrop["section"],
  };
}

function railEntry(value: unknown): RailEntry {
  const body = value as Body;
  return { dropId: body["drop_id"] as string, author: person(body["author"]), starPick: body["star_pick"] as boolean };
}

/** B6's parts of a revealed drop: what the domain's read refuses rather than answer (the plan's section 0.1). */
function hasLater(drop: Body): boolean {
  return (
    (drop["reactions"] as unknown[]).length > 0 ||
    "viewer_reaction" in drop ||
    drop["viewer_favourite"] !== false ||
    "reply_preview" in drop
  );
}

/** A revealed drop with B6's parts taken away: no reaction, no favourite, no reply preview. */
function withoutLater(drop: Body): Body {
  const kept = Object.entries(drop).filter(([key]) => key !== "viewer_reaction" && key !== "reply_preview");
  return { ...Object.fromEntries(kept), reactions: [], viewer_favourite: false };
}

function recent(value: unknown): RecentDay {
  const link = value as Body;
  return { day: day(link["occurrence"], "past"), coverDropId: (link["cover_drop_id"] as string | undefined) ?? null };
}

/** A contract example's Home as the domain's read would hold it: the serializer's input. */
function read(value: Body): HomeRead {
  const club = value["club"] as Body;
  const base = {
    club: {
      id: club["id"] as string,
      name: club["name"] as string,
      timezone: club["timezone"] as string,
      membershipId: club["my_membership_id"] as string,
    },
    clubToday: value["club_today"] as string,
  };
  const recentDays = ((value["recent_days"] as unknown[] | undefined) ?? []).map(recent);
  const mode = value["mode"] as HomeRead["mode"];
  switch (mode) {
    case "unavailable":
    case "awaiting_activation":
    case "no_days":
      return { ...base, mode };
    case "paused":
      return { ...base, mode, recentDays };
    case "waiting":
      return { ...base, mode, next: day(value["next"], "collecting"), recentDays };
    case "day": {
      const frame = value["day"] as Body;
      const viewer = frame["viewer"] as Body;
      expect(frame["club"]).toEqual(club);
      expect(frame["server_now"]).toBe(value["server_now"]);
      return {
        ...base,
        mode,
        day: {
          occurrence: day(frame["occurrence"], "open"),
          isStar: viewer["is_star"] as boolean,
          joinedLater: viewer["joined_later"] as boolean,
          addTarget: frame["add_target"] === undefined ? null : day(frame["add_target"], "collecting"),
          drops: (frame["drops"] as unknown[]).map(pageDrop),
          highlights: (frame["highlights"] as unknown[]).map(railEntry),
        },
        next: value["next"] === undefined ? null : day(value["next"], "collecting"),
        recentDays,
      };
    }
  }
}

describe("Home's serializer against the contract's examples (T55)", () => {
  const all = Object.entries(successExamples("getHome") ?? {});
  /** The examples whose open day's drops carry B6's parts, which the domain's read refuses (section 0.1). */
  const withLater = all.filter(([, example]) => {
    const frame = (example.value as Body)["day"] as Body | undefined;
    return frame !== undefined && (frame["drops"] as Body[]).some(hasLater);
  });
  const examples = all.filter((entry) => !withLater.includes(entry));

  it("has the contract's scenes to hold, every mode among them, and only one whose drops carry B6's parts", () => {
    expect(withLater.map(([name]) => name)).toEqual(["open"]);
    expect(examples.map(([name]) => name)).toEqual([
      "waiting",
      "first_drop",
      "after_close",
      "sunday",
      "quiet",
      "your_day",
      "awaiting_activation",
      "no_days",
      "paused",
      "unavailable",
    ]);
    expect(new Set(examples.map(([, example]) => (example.value as Body)["mode"]))).toEqual(
      new Set(["day", "waiting", "paused", "no_days", "awaiting_activation", "unavailable"]),
    );
    // A day with drops from the star and friends, and a highlight rail, is among those held whole.
    const yourDay = (examples.find(([name]) => name === "your_day")?.[1].value as Body)["day"] as Body;
    expect((yourDay["drops"] as unknown[]).length).toBeGreaterThan(0);
    expect((yourDay["highlights"] as unknown[]).length).toBeGreaterThan(0);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = homeBody(Temporal.Instant.from(value["server_now"] as string), read(value));
    expect(made).toEqual(value);
    expect(HomeSchema.safeParse(made).success).toBe(true);
  });

  it("makes open field for field once B6's reactions, favourites and reply previews are taken away", () => {
    const value = withLater[0]?.[1].value as Body;
    const frame = value["day"] as Body;
    const drops = (frame["drops"] as Body[]).map(withoutLater);
    const bare = { ...value, day: { ...frame, drops } };
    expect(drops.some(hasLater)).toBe(false);
    const made = homeBody(Temporal.Instant.from(value["server_now"] as string), read(bare));
    expect(made).toEqual(bare);
    expect(HomeSchema.safeParse(made).success).toBe(true);
    // A video's card: its provider, and no photo frame.
    const video = ((made as Body)["day"] as Body)["drops"] as Body[];
    expect(video.find((drop) => drop["media_class"] === "external_video")).toMatchObject({
      video: { provider: "tiktok" },
    });
    expect(video.find((drop) => drop["media_class"] === "external_video")).not.toHaveProperty("photo");
  });

  it("sends the server's instant in whole seconds, rounded down, in the base and in the day", () => {
    const value = examples.find(([name]) => name === "quiet")?.[1].value as Body;
    const made = homeBody(Temporal.Instant.from("2026-11-06T14:41:00.999999Z"), read(value)) as Body;
    expect(made["server_now"]).toBe("2026-11-06T14:41:00Z");
    expect((made["day"] as Body)["server_now"]).toBe("2026-11-06T14:41:00Z");
  });

  it("leaves out an absent add_target, next and cover rather than sending null", () => {
    const value = examples.find(([name]) => name === "quiet")?.[1].value as Body;
    const home = read(value);
    if (home.mode !== "day") throw new Error("quiet is a day");
    const bare: HomeRead = {
      ...home,
      day: { ...home.day, addTarget: null },
      next: null,
      recentDays: home.recentDays.map((link) => ({ ...link, coverDropId: null })),
    };
    const made = homeBody(Temporal.Instant.from(value["server_now"] as string), bare) as Body;
    expect(Object.keys(made).sort()).toEqual(["club", "club_today", "day", "mode", "recent_days", "server_now"]);
    expect(Object.keys(made["day"] as Body).sort()).toEqual([
      "club",
      "drops",
      "highlights",
      "occurrence",
      "server_now",
      "stage",
      "viewer",
    ]);
    for (const link of made["recent_days"] as Body[]) expect(Object.keys(link)).toEqual(["occurrence"]);
    expect(HomeSchema.safeParse(made).success).toBe(true);
  });
});

const account: Account = {
  id: "acct_ben",
  state: "active",
  displayName: "Ben",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for Ben whose transactions are `begin`: what the route does with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => Promise.resolve(account),
    log: { level: "silent" },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  return async (url: string) => {
    const response = await app.inject({ method: "GET", url });
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
}

describe("the handler (T1, T14, T34)", () => {
  it("reads in one read-only transaction and answers the neutral not-found when the read gives nothing", async () => {
    const modes: unknown[] = [];
    const answer = await appFor((mode) => {
      modes.push(mode);
      return Promise.resolve(null);
    });
    const got = await answer("/v1/clubs/club_nobody/home");
    expect(modes).toEqual(["read only"]);
    expect(got).toEqual({
      status: 404,
      body: '{"code":"NOT_FOUND"}',
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
        "content-length": "20",
      },
    });
  });

  it("samples the server's clock first in that transaction, and reads Home at that instant and no other (T1)", async () => {
    const sample = Temporal.Instant.from("2026-11-14T07:00:00.123456Z") as ServerNow;
    const events: unknown[] = [];
    const bound: unknown[] = [];
    // Each statement and fragment the read writes reaches `tx`; none gives a row, so the read names no club.
    const tx = (_template: TemplateStringsArray, ...values: unknown[]) => {
      events.push("statement");
      bound.push(...values);
      return Promise.resolve([]);
    };
    const sql = {
      end: () => Promise.resolve(),
      begin: async (mode: unknown, body: (t: typeof tx) => Promise<unknown>) => {
        events.push(mode);
        return body(tx);
      },
    } as unknown as ApiSql;
    const clock = {
      sample: (t: unknown) => {
        events.push(t === tx ? "clock in the transaction" : "clock elsewhere");
        return Promise.resolve(sample);
      },
    } as unknown as Clock;
    const app = buildApp({ sql, clock, authenticate: () => Promise.resolve(account), log: { level: "silent" } });
    await app.ready();
    open.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/clubs/club_x/home" });
    expect(response.statusCode).toBe(404);
    expect(events.slice(0, 3)).toEqual(["read only", "clock in the transaction", "statement"]);
    expect(events.filter((event) => event !== "statement")).toEqual(["read only", "clock in the transaction"]);
    const instants = bound.filter((value) => value instanceof Temporal.Instant);
    expect(instants.length).toBeGreaterThan(0);
    for (const instant of instants) expect(instant.equals(sample)).toBe(true);
  });

  it("sends what the read made, private and never stored", async () => {
    const body = { mode: "no_days" };
    const answer = await appFor(() => Promise.resolve(body));
    const got = await answer("/v1/clubs/club_x/home");
    expect(got.status).toBe(200);
    expect(got.body).toBe('{"mode":"no_days"}');
    expect(got.headers["cache-control"]).toBe("private, no-store");
  });

  it("answers a refused read as a server error with nothing in it, never a page that hides a drop", async () => {
    const answer = await appFor(() =>
      Promise.reject(
        new Error("home: the open day's drops have reactions, favourites or comments, which B6's page shows"),
      ),
    );
    const got = await answer("/v1/clubs/club_x/home");
    expect(got.status).toBe(500);
    expect(got.body).toBe("");
    expect(got.headers["cache-control"]).toBe("private, no-store");
  });
});
