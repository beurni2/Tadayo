/// <reference lib="esnext.temporal" />
// The schedule's three routes as the contract has them (spec 05; T14, T19, T33, T55), with no database: each
// serializer's field list, held against every first-days example the contract gives (the mock's scenes,
// packages/contracts/src/fixtures/examples-clubs.ts), and everything a route refuses before its command runs.
// Who sees which name is the domain's view (packages/domain/src/schedule/view.test.ts), which is also held
// here against the same examples, read from the contract and not copied by hand; the commands, their
// refusals' order, their receipts and their races are on Postgres (tests/src/db/schedule-commands.test.ts);
// and every role's answers are the privacy matrix's (tests/src/privacy/schedule.ts).

import { Schedule, ScheduleProposal, ScheduleSlot } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import {
  Refused,
  viewFor,
  type Account,
  type Clock,
  type ProposalAnswer,
  type ProposalMember,
  type SchedulePerson,
  type ScheduleSight,
  type SlotAnswer,
  type WeekFacts,
  type Weekday,
} from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { personBody, proposalBody, scheduleBody, slotBody } from "./routes.ts";

type Body = Record<string, unknown>;

/** A contract example's Person as the domain holds one. */
function person(value: unknown): SchedulePerson {
  const body = value as { membership_id: string; display_name: string; avatar_version?: string };
  return {
    membershipId: body.membership_id,
    displayName: body.display_name,
    avatarVersion: body.avatar_version ?? null,
  };
}

/** A contract example's ScheduleProposal as the domain's view would hold it: the serializer's input. */
function proposal(value: unknown): ProposalAnswer {
  const body = value as Body & { slots: Body[] };
  return {
    id: body["id"] as string,
    version: body["version"] as number,
    reason: body["reason"] as "activation",
    effectiveFrom: body["effective_from"] as string,
    daysPerMember: body["days_per_member"] as 1 | 2,
    slots: body.slots.map((slot): SlotAnswer => ({
      weekday: slot["weekday"] as Weekday,
      state: slot["state"] as SlotAnswer["state"],
      ...(slot["owner"] === undefined ? {} : { owner: person(slot["owner"]) }),
      ...(slot["holders"] === undefined ? {} : { holders: (slot["holders"] as unknown[]).map(person) }),
      ...(slot["held_by"] === undefined ? {} : { heldBy: person(slot["held_by"]) }),
      ...(slot["first_date"] === undefined ? {} : { firstDate: slot["first_date"] as string }),
      suggested: slot["suggested"] as boolean,
    })),
    myDays: body["my_days"] as Weekday[],
    myState: body["my_state"] as "choosing" | "confirmed",
    state: body["state"] as "open",
  };
}

/** A contract example's Schedule as the domain's read would hold it. */
function sight(value: unknown): ScheduleSight {
  const body = value as Body;
  const club = body["club"] as { id: string; name: string; timezone: string; my_membership_id: string };
  const current = body["current"] as { effective_from: string; assignments: { weekday: Weekday; person: unknown }[] };
  return {
    club: { id: club.id, name: club.name, timezone: club.timezone, membershipId: club.my_membership_id },
    current:
      body["current"] === undefined
        ? null
        : {
            effectiveFrom: current.effective_from,
            assignments: current.assignments.map((each) => ({ weekday: each.weekday, person: person(each.person) })),
          },
    proposal: body["proposal"] === undefined ? null : proposal(body["proposal"]),
  };
}

/** The contract's examples of `operation` that are a club's first days, or have no proposal at all. */
function firstDaysExamples(operation: string): [string, Body][] {
  const examples = Object.entries(successExamples(operation) ?? {}).map(([name, example]): [string, Body] => [
    name,
    example.value as Body,
  ]);
  return examples.filter(([, value]) => {
    const found = (operation === "getSchedule" ? value["proposal"] : value) as Body | undefined;
    return found === undefined || found["reason"] === "activation";
  });
}

describe("the serializers against the contract's examples (T55)", () => {
  it("makes each getSchedule scene of the first days, and the week in force alone, field for field", () => {
    const scenes = firstDaysExamples("getSchedule");
    expect(scenes.map(([name]) => name)).toEqual([
      "sunday_people",
      "conflict_three",
      "contested_other",
      "confirm_refused",
      "first_days",
      "first_days_confirmed",
    ]);
    for (const [name, value] of scenes) {
      const now = Temporal.Instant.from(value["server_now"] as string);
      const body = scheduleBody(now, sight(value));
      expect(body, name).toEqual(value);
      expect(Schedule.strict().safeParse(body).success, name).toBe(true);
    }
  });

  it("makes each chooseScheduleDays and confirmScheduleDays scene of the first days, field for field", () => {
    const scenes = [...firstDaysExamples("chooseScheduleDays"), ...firstDaysExamples("confirmScheduleDays")];
    expect(scenes.map(([name]) => name)).toEqual(["chosen", "joined_contest", "first_day_confirmed"]);
    for (const [name, value] of scenes) {
      const body = proposalBody(proposal(value));
      expect(body, name).toEqual(value);
      expect(ScheduleProposal.strict().safeParse(body).success, name).toBe(true);
    }
  });

  it("is what the domain's view makes of each scene's facts: who holds and who confirmed what, read from the scene's own words", () => {
    // Sunday people in the order they joined, each with the day the first days proposed (the fixture's roster).
    const roster = [
      ["Ben", "monday"],
      ["Maya", "tuesday"],
      ["Alex", "wednesday"],
      ["Sam", "thursday"],
      ["Debby", "friday"],
      ["Nina", "saturday"],
    ] as const;
    type Name = (typeof roster)[number][0];
    // Each member's membership id, from the example of the week in force, which names all six.
    const inForce = Object.fromEntries(firstDaysExamples("getSchedule"))["sunday_people"] as {
      current: { assignments: { person: { membership_id: string; display_name: string } }[] };
    };
    const idOf = (name: Name): string => {
      const found = inForce.current.assignments.find((each) => each.person.display_name === name);
      if (found === undefined) throw new Error(`the week in force doesn't name ${name}`);
      return found.person.membership_id;
    };
    const facts = (
      held: Partial<Record<Name, readonly Weekday[]>>,
      confirmed: Partial<Record<Name, string>> = {},
    ): WeekFacts => {
      const firstDates: Partial<Record<Weekday, string>> = {};
      const members = roster.map(([name, proposed]): ProposalMember => {
        const days = held[name] ?? [proposed];
        const date = confirmed[name];
        if (date !== undefined) for (const day of days) firstDates[day] = date;
        return { id: idOf(name), active: true, confirmed: date !== undefined, suggested: [proposed], held: days };
      });
      return { daysPerMember: 1, members, firstDates };
    };
    // Wednesday 4 November, 9 AM: Maya, Alex, Sam and Nina confirmed (the examples' summaries; FQ79's dates).
    const four = { Maya: "2026-11-10", Alex: "2026-11-11", Sam: "2026-11-12", Nina: "2026-11-07" };
    const scenes: readonly (readonly [operation: string, name: string, viewer: Name, WeekFacts])[] = [
      ["getSchedule", "conflict_three", "Ben", facts({ Ben: ["friday"], Alex: ["friday"] })],
      ["getSchedule", "contested_other", "Sam", facts({ Ben: ["friday"], Alex: ["friday"] })],
      ["getSchedule", "confirm_refused", "Debby", facts({ Ben: ["friday"] })],
      ["getSchedule", "first_days", "Ben", facts({}, four)],
      ["getSchedule", "first_days_confirmed", "Maya", facts({}, four)],
      ["chooseScheduleDays", "chosen", "Ben", facts({ Alex: ["friday"] })],
      ["chooseScheduleDays", "joined_contest", "Sam", facts({ Ben: ["friday"], Alex: ["friday"], Sam: ["friday"] })],
      ["confirmScheduleDays", "first_day_confirmed", "Ben", facts({}, { ...four, Ben: "2026-11-09" })],
    ];
    // Every first-days scene the contract gives is one of these.
    const given = ["getSchedule", "chooseScheduleDays", "confirmScheduleDays"].flatMap((operation) =>
      firstDaysExamples(operation)
        .filter(([, value]) => operation !== "getSchedule" || value["proposal"] !== undefined)
        .map(([name]) => `${operation} ${name}`),
    );
    expect(scenes.map(([operation, name]) => `${operation} ${name}`)).toEqual(given);
    for (const [operation, name, viewer, world] of scenes) {
      const value = Object.fromEntries(firstDaysExamples(operation))[name];
      const example = proposal(operation === "getSchedule" ? value?.["proposal"] : value);
      const view = viewFor(idOf(viewer), world);
      expect(
        {
          slots: view.slots,
          myDays: view.myDays,
          myState: view.myState,
        },
        `${operation} ${name}`,
      ).toEqual({
        slots: example.slots.map((slot) => ({
          weekday: slot.weekday,
          state: slot.state,
          ...(slot.owner === undefined ? {} : { owner: slot.owner.membershipId }),
          ...(slot.holders === undefined ? {} : { holders: slot.holders.map((each) => each.membershipId) }),
          ...(slot.heldBy === undefined ? {} : { heldBy: slot.heldBy.membershipId }),
          ...(slot.firstDate === undefined ? {} : { firstDate: slot.firstDate }),
          suggested: slot.suggested,
        })),
        myDays: example.myDays,
        myState: example.myState,
      });
    }
  });

  it("gives the server's instant in whole seconds, rounded down", () => {
    const body = scheduleBody(Temporal.Instant.from("2026-11-03T09:41:07.999999Z"), {
      club: { id: "club_1", name: "Sunday people", timezone: "America/New_York", membershipId: "mem_ben" },
      current: null,
      proposal: null,
    }) as Body;
    expect(body).toEqual({
      server_now: "2026-11-03T09:41:07Z",
      club: { id: "club_1", name: "Sunday people", timezone: "America/New_York", my_membership_id: "mem_ben" },
    });
  });
});

describe("each serializer is an explicit field list (T55)", () => {
  const ben: SchedulePerson = { membershipId: "mem_ben", displayName: "Ben", avatarVersion: "v_ben" };

  it("gives a person their interval, their name and their avatar's version when there is one, and nothing else", () => {
    const rich = { ...ben, account: "acct_ben", email: "ben@example.invalid", confirmedAt: "2026-11-04T09:00:00Z" };
    expect(personBody(rich)).toEqual({ membership_id: "mem_ben", display_name: "Ben", avatar_version: "v_ben" });
    expect(personBody({ ...ben, avatarVersion: null })).toEqual({ membership_id: "mem_ben", display_name: "Ben" });
  });

  it("gives a slot only the keys its view has: no person and no date where the view gave none", () => {
    const bare: SlotAnswer = { weekday: "friday", state: "no_reveal", suggested: false };
    expect(slotBody(bare)).toEqual({ weekday: "friday", state: "no_reveal", suggested: false });
    // Whatever else rides on the object, the holders of a contested day among it, never reaches the answer.
    const rich = { ...bare, holdersCount: 3, everyone: [ben], confirmedAt: "x", chosenBy: "mem_ben" } as SlotAnswer;
    const body = slotBody(rich);
    expect(ScheduleSlot.strict().safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/mem_ben|Ben|3|confirmedAt|chosenBy/);
  });

  it("gives a proposal the contract's nine fields, and never `announced` in the first days", () => {
    const answer = {
      id: "spr_1",
      version: 1,
      reason: "activation",
      effectiveFrom: "2026-11-02",
      daysPerMember: 1,
      slots: [],
      myDays: [],
      myState: "choosing",
      state: "open",
      members: [ben],
      confirmed: ["mem_maya"],
      waitingOn: 2,
    } as unknown as ProposalAnswer;
    expect(Object.keys(proposalBody(answer) as object).sort()).toEqual([
      "days_per_member",
      "effective_from",
      "id",
      "my_days",
      "my_state",
      "reason",
      "slots",
      "state",
      "version",
    ]);
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
const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for Ben whose transactions are `begin`: what the routes do with the database, with no database. */
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
  return async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
}

const COMMANDS = [
  ["PUT", "/v1/schedule-proposals/spr_1/choice", "chooseScheduleDays"],
  ["POST", "/v1/schedule-proposals/spr_1/confirmation", "confirmScheduleDays"],
] as const;

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});

describe("what the two commands refuse before any transaction", () => {
  for (const [method, url, operation] of COMMANDS) {
    it(`${operation} names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong`, async () => {
      let begun = 0;
      const answer = await appFor(() => {
        begun += 1;
        return Promise.reject(new Error("no database"));
      });
      for (const key of [undefined, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
        const headers = { "content-type": "application/json" } as Record<string, string>;
        if (key !== undefined) headers["idempotency-key"] = key;
        const got = await answer({ method, url, headers, payload: '{"weekdays":["sunday"]}' });
        expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
        expect(got.headers["cache-control"]).toBe("private, no-store");
      }
      expect(begun).toBe(0);
    });

    it(`${operation} names the first bad field in the contract's order, never a value, and reads no database for it`, async () => {
      let begun = 0;
      const answer = await appFor(() => {
        begun += 1;
        return Promise.reject(new Error("no database"));
      });
      const none = operation === "confirmScheduleDays" ? "weekdays" : undefined;
      const cases: [unknown, string | undefined][] = [
        [{}, "expected_version"],
        [{ weekdays: ["monday"] }, "expected_version"],
        [{ expected_version: "1", weekdays: ["monday"] }, "expected_version"],
        [{ expected_version: -1, weekdays: ["monday"] }, "expected_version"],
        [{ expected_version: 1.5, weekdays: ["monday"] }, "expected_version"],
        [{ expected_version: 1 }, "weekdays"],
        [{ expected_version: 1, weekdays: "monday" }, "weekdays"],
        [{ expected_version: 1, weekdays: ["sunday"] }, "weekdays"],
        [{ expected_version: 1, weekdays: ["Monday"] }, "weekdays"],
        [{ expected_version: 1, weekdays: ["monday", "monday"] }, "weekdays"],
        [{ expected_version: 1, weekdays: ["monday", "tuesday", "friday"] }, "weekdays"],
        [{ expected_version: 1, weekdays: [1] }, "weekdays"],
        // The contract's order, not the body's.
        [{ weekdays: ["sunday"], expected_version: -1 }, "expected_version"],
        // An unknown key is no field of the contract's: refused, and never named or echoed.
        [{ expected_version: 1, weekdays: ["monday"], member: "mem_maya" }, undefined],
        [{ expected_version: 1, weekdays: ["monday"], club_id: "club_1" }, undefined],
        [[], undefined],
        [null, undefined],
        ["text", undefined],
      ];
      for (const [payload, field] of cases) {
        const got = await answer({
          method,
          url,
          headers: { "content-type": "application/json", "idempotency-key": KEY },
          payload: JSON.stringify(payload),
        });
        expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
        expect(got.body).not.toMatch(/mem_maya|club_1|sunday|Monday|text/);
      }
      // A choice of no day is the contract's (handoff 6); a confirmation of none isn't.
      const empty = await answer({
        method,
        url,
        headers: { "content-type": "application/json", "idempotency-key": KEY },
        payload: '{"expected_version":1,"weekdays":[]}',
      });
      if (none === undefined) expect(empty).toMatchObject({ status: 500, body: "" });
      else expect(empty).toMatchObject(invalid(none));
      expect(begun).toBe(none === undefined ? 1 : 0);
    });

    it(`${operation} reads at most 1 KiB of body, which shuts no valid request out`, async () => {
      let reached = 0;
      const answer = await appFor(() => {
        reached += 1;
        return Promise.reject(new Error("no database"));
      });
      const send = (payload: string) =>
        answer({ method, url, headers: { "content-type": "application/json", "idempotency-key": KEY }, payload });
      expect(bodyLimitOf(operation)).toBe(1024);
      // The largest body the contract allows, every key and character written as an escape.
      const escape = (text: string): string =>
        `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
      const largest =
        `{${escape("expected_version")}:2147483647,` +
        `${escape("weekdays")}:[${escape("wednesday")},${escape("saturday")}]}`;
      expect(Buffer.byteLength(largest)).toBeLessThan(bodyLimitOf(operation) / 2);
      expect(await send(largest)).toMatchObject({ status: 500, body: "" });
      expect(reached).toBe(1);
      // Past the limit it is refused unread, from its Content-Length: no field, which a parse would have named.
      const padded = `{"expected_version":1,"weekdays":["sunday"]${" ".repeat(1024)}}`;
      expect(await send(padded)).toMatchObject(invalid());
      expect(reached).toBe(1);
    });
  }
});

describe("a refused command is the contract's answer", () => {
  for (const [method, url, operation] of COMMANDS) {
    const refused = async (error: Error) => {
      const answer = await appFor(() => Promise.reject(error));
      return answer({
        method,
        url,
        headers: { "content-type": "application/json", "idempotency-key": KEY },
        payload: '{"expected_version":1,"weekdays":["monday"]}',
      });
    };

    it.each([
      [new Refused("NOT_FOUND"), 404, '{"code":"NOT_FOUND"}'],
      [
        new Refused("MEMBERSHIP_CHANGED", { current_id: "spr_2" }),
        409,
        '{"code":"MEMBERSHIP_CHANGED","current_id":"spr_2"}',
      ],
      [new Refused("VERSION_CONFLICT", { current_version: 2 }), 409, '{"code":"VERSION_CONFLICT","current_version":2}'],
      [new Refused("NOT_ALLOWED"), 403, '{"code":"NOT_ALLOWED"}'],
      [new Refused("IDEMPOTENCY_CONFLICT"), 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
    ])(`${operation} answers %s as %i %s`, async (error, status, text) => {
      const got = await refused(error);
      expect(got.status).toBe(status);
      expect(got.body).toBe(text);
      expect(got.headers["cache-control"]).toBe("private, no-store");
      expect(got.headers["content-type"]).toBe("application/json; charset=utf-8");
    });

    it(`${operation} answers a failing database with a bare 500 and nothing of the error`, async () => {
      const got = await refused(new Error("deadlock detected: mem_maya holds monday"));
      expect(got).toMatchObject({ status: 500, body: "" });
    });

    it(`${operation} answers what the command returns, as it is: the receipt's own bytes (T19)`, async () => {
      const stored = { state: "open", id: "spr_1", version: 1 };
      const answer = await appFor(() => Promise.resolve(stored));
      const got = await answer({
        method,
        url,
        headers: { "content-type": "application/json", "idempotency-key": KEY },
        payload: '{"expected_version":1,"weekdays":["monday"]}',
      });
      expect(got).toMatchObject({ status: 200, body: JSON.stringify(stored) });
      expect(got.headers["cache-control"]).toBe("private, no-store");
    });
  }
});

describe("GET /v1/clubs/{club_id}/schedule", () => {
  it("answers the neutral not-found when the read gives nothing: no club, or not the caller's (T14)", async () => {
    const answer = await appFor(() => Promise.resolve(null));
    const got = await answer({ method: "GET", url: "/v1/clubs/club_1/schedule" });
    expect(got).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}' });
    expect(got.headers["cache-control"]).toBe("private, no-store");
  });

  it("reads in a read-only transaction, and answers what it made for the caller alone", async () => {
    const modes: unknown[] = [];
    const answer = await appFor((mode: unknown) => {
      modes.push(mode);
      return Promise.resolve({ server_now: "2026-11-03T09:41:07Z" });
    });
    const got = await answer({ method: "GET", url: "/v1/clubs/club_1/schedule" });
    expect(got).toMatchObject({ status: 200, body: '{"server_now":"2026-11-03T09:41:07Z"}' });
    expect(got.headers["cache-control"]).toBe("private, no-store");
    expect(modes).toEqual(["read only"]);
  });
});
