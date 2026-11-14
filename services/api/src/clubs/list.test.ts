/// <reference lib="esnext.temporal" />
// `GET /v1/clubs` as the contract has it (spec 04, 05; T1, T5, T55), with no database: the serializer's
// field list, each club's `open_day` and `next_day` as the contract's Occurrence and nothing more, and the
// clock's one sample reaching both `server_now` and the day choice. Which day is chosen is the
// authorization module's, on Postgres (tests/src/db/home-days.test.ts, club-list.test.ts), and every role,
// state and phase of the privacy matrix judges the route's answers (tests/src/privacy/account.ts).

import { ClubList, Occurrence } from "@tadayo/contracts";
import type { Account, ChosenDay, ClubRow, ServerNow } from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { clubListBody, occurrenceBody } from "./list.ts";

const now = Temporal.Instant.from("2026-11-07T07:00:00.987654Z");

const saturday: ChosenDay = {
  id: "occ_sat",
  clubId: "club_1",
  star: { membershipId: "mem_ana", displayName: "Ana", avatarVersion: "v_ana" },
  localDate: "2026-11-07",
  revealAt: Temporal.Instant.from("2026-11-07T07:00:00Z"),
  closeAt: Temporal.Instant.from("2026-11-08T01:00:00Z"),
  phase: "open",
};

const monday: ChosenDay = {
  ...saturday,
  id: "occ_mon",
  star: { membershipId: "mem_ben", displayName: "Ben", avatarVersion: null },
  localDate: "2026-11-09",
  revealAt: Temporal.Instant.from("2026-11-09T07:00:00Z"),
  closeAt: Temporal.Instant.from("2026-11-10T01:00:00Z"),
  phase: "collecting",
};

const club = (over: Partial<ClubRow> = {}): ClubRow => ({
  id: "club_1",
  name: "Saturday people",
  timezone: "Europe/London",
  membershipId: "mem_1",
  state: "active",
  memberCount: 3,
  openDay: null,
  nextDay: null,
  ...over,
});

describe("GET /v1/clubs: the answer's field list (T55)", () => {
  it("is two empty lists and the server's instant, whole seconds rounded down, for an account with nothing", () => {
    const body = clubListBody(now, { clubs: [], invitations: [] });
    expect(body).toEqual({ server_now: "2026-11-07T07:00:00Z", clubs: [], invitations: [] });
    expect(ClubList.safeParse(body).success).toBe(true);
  });

  it("lists a club and an invitation by the contract's names alone, with no day key when there is no day", () => {
    const body = clubListBody(now, {
      clubs: [club()],
      invitations: [{ id: "inv_1", clubName: "Tuesday people", inviterName: "Ana", state: "waiting" }],
    });
    expect(body).toEqual({
      server_now: "2026-11-07T07:00:00Z",
      clubs: [
        {
          id: "club_1",
          name: "Saturday people",
          timezone: "Europe/London",
          my_membership_id: "mem_1",
          state: "active",
          member_count: 3,
        },
      ],
      invitations: [{ invitation_id: "inv_1", club_name: "Tuesday people", inviter_name: "Ana", state: "waiting" }],
    });
    expect(ClubList.safeParse(body).success).toBe(true);
  });

  it("gives each day as the contract's Occurrence and nothing else of it: instants in whole seconds, the avatar only when there is one (T5, T15, T33)", () => {
    const body = clubListBody(now, { clubs: [club({ openDay: saturday, nextDay: monday })], invitations: [] });
    expect(ClubList.safeParse(body).success).toBe(true);
    const [listed] = (body as { clubs: Record<string, unknown>[] }).clubs;
    expect(listed?.["open_day"]).toEqual({
      id: "occ_sat",
      club_id: "club_1",
      star: { membership_id: "mem_ana", display_name: "Ana", avatar_version: "v_ana" },
      local_date: "2026-11-07",
      reveal_at: "2026-11-07T07:00:00Z",
      close_at: "2026-11-08T01:00:00Z",
      phase: "open",
    });
    expect(listed?.["next_day"]).toEqual({
      id: "occ_mon",
      club_id: "club_1",
      star: { membership_id: "mem_ben", display_name: "Ben" },
      local_date: "2026-11-09",
      reveal_at: "2026-11-09T07:00:00Z",
      close_at: "2026-11-10T01:00:00Z",
      phase: "collecting",
    });
    // Each club is open and next only when it has them: a next day alone has no open_day key.
    const onlyNext = clubListBody(now, { clubs: [club({ nextDay: monday })], invitations: [] });
    expect(Object.keys((onlyNext as { clubs: Record<string, unknown>[] }).clubs[0] ?? {}).sort()).toEqual([
      "id",
      "member_count",
      "my_membership_id",
      "name",
      "next_day",
      "state",
      "timezone",
    ]);
  });

  it("is an explicit field list: whatever else a day object carries never reaches the answer (T55)", () => {
    const rich = {
      ...saturday,
      drops: ["drp_1"],
      count: 4,
      star: { ...saturday.star, account: "acct_ana", email: "ana@example.invalid" },
    } as unknown as ChosenDay;
    const body = occurrenceBody(rich);
    expect(Occurrence.strict().safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/drp_1|acct_ana|example\.invalid|count/);
  });

  it("cuts an instant to whole seconds downwards, never up: a day isn't announced as opening before it does", () => {
    const fraction = { ...saturday, revealAt: Temporal.Instant.from("2026-11-07T06:59:59.999999Z") };
    expect((occurrenceBody(fraction) as { reveal_at: string }).reveal_at).toBe("2026-11-07T06:59:59Z");
  });
});

describe("GET /v1/clubs: one sample of the clock for the instant and the days (T1)", () => {
  const open: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).map((app) => app.close()));
  });

  it("chooses the days at the instant it answers with, read first in the same read-only transaction", async () => {
    const bound: unknown[] = [];
    const modes: unknown[] = [];
    const statement = Promise.resolve([
      {
        clubs: [
          {
            id: "club_1",
            name: "Saturday people",
            timezone: "Europe/London",
            membership_id: "mem_1",
            suspended: false,
            activated: true,
            member_count: 3,
            open_day: {
              id: "occ_sat",
              club_id: "club_1",
              local_date: "2026-11-07",
              reveal_at: "2026-11-07T07:00:00+00:00",
              close_at: "2026-11-08T01:00:00+00:00",
              star_membership_id: "mem_ana",
              star_name: "Ana",
              star_avatar_version: null,
            },
            next_day: null,
          },
        ],
        invitations: [],
      },
    ]);
    const tx = (_template: TemplateStringsArray, ...values: unknown[]) => {
      bound.push(...values);
      return statement;
    };
    const begin = async (mode: unknown, body: (t: typeof tx) => Promise<unknown>) => {
      modes.push(mode);
      return body(tx);
    };
    const sampled: unknown[] = [];
    const caller: Account = {
      id: "acct_ana",
      state: "active",
      displayName: "Ana",
      ageConfirmed: true,
      version: 3,
      avatarVersion: null,
    };
    const deps: Deps = {
      sql: { end: () => Promise.resolve(), begin } as unknown as ApiSql,
      clock: {
        sample: (t) => {
          sampled.push(t);
          return Promise.resolve(now as ServerNow);
        },
      },
      authenticate: () => Promise.resolve(caller),
      log: { level: "silent" },
    };
    const app = buildApp(deps);
    await app.ready();
    open.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/clubs", headers: { authorization: "Bearer x" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(modes).toEqual(["read only"]);
    expect(sampled).toEqual([tx]);
    // The instant bound into the day choice is the clock's own sample, to the microsecond.
    const instants = bound.filter((value) => value instanceof Temporal.Instant);
    expect(instants.length).toBeGreaterThan(0);
    for (const instant of instants) expect(instant.equals(now)).toBe(true);
    const body = response.json<{ server_now: string; clubs: { open_day?: { phase: string } }[] }>();
    expect(body.server_now).toBe("2026-11-07T07:00:00Z");
    expect(body.clubs[0]?.open_day?.phase).toBe("open");
    expect(ClubList.safeParse(body).success).toBe(true);
  });
});
