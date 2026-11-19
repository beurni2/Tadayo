/// <reference lib="esnext.temporal" />
// The roster's serializer as the contract has it (the contract's `listMembers` and `Members`; T55), with
// no database: its field list, held against every example the contract gives, read from the contract and
// not copied by hand. The read, the order and each member's next day are on Postgres
// (tests/src/db/members.test.ts), and every role's answers are the privacy matrix's.

import { Members } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import type { ChosenDay, MemberRow, Roster } from "@tadayo/domain";
import { describe, expect, it } from "vitest";
import { membersBody } from "./members.ts";

type Body = Record<string, unknown>;

/** A contract example's Occurrence as the domain holds a member's next day. */
function day(value: unknown): ChosenDay {
  const body = value as Body & { star: { membership_id: string; display_name: string; avatar_version?: string } };
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
    phase: body["phase"] as "collecting",
  };
}

/** A contract example's Members as the domain's read would hold it: the serializer's input. */
function roster(value: Body): Roster {
  const club = value["club"] as Record<string, string>;
  return {
    club: {
      id: club["id"] ?? "",
      name: club["name"] ?? "",
      timezone: club["timezone"] ?? "",
      membershipId: club["my_membership_id"] ?? "",
    },
    members: (value["members"] as Body[]).map((member): MemberRow => {
      const person = member["person"] as { membership_id: string; display_name: string; avatar_version?: string };
      return {
        person: {
          membershipId: person.membership_id,
          displayName: person.display_name,
          avatarVersion: person.avatar_version ?? null,
        },
        position: member["position"] as number,
        nextDay: member["next_day"] === undefined ? null : day(member["next_day"]),
        nextUp: member["next_up"] as boolean,
      };
    }),
  };
}

/** The example without what this slice doesn't send yet: each member's `cover` (FQ41) and `open_revision` (B1). */
function sentNow(value: Body): Body {
  const without = (body: Body, field: string): Body =>
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));
  return {
    ...without(value, "open_revision"),
    members: (value["members"] as Body[]).map((member) => without(member, "cover")),
  };
}

describe("the roster's serializer against the contract's examples (T55)", () => {
  const examples = Object.entries(successExamples("listMembers") ?? {});

  it("has the contract's three scenes to hold", () => {
    expect(examples.map(([name]) => name).sort()).toHaveLength(3);
    expect(examples.map(([name]) => name)).toEqual(expect.arrayContaining(["sunday_people", "first_days"]));
  });

  it.each(examples)("makes %s field for field, but for the cover and the open revision", (_name, example) => {
    const value = example.value as Body;
    const made = membersBody(Temporal.Instant.from(value["server_now"] as string), roster(value));
    expect(made).toEqual(sentNow(value));
    expect(Members.safeParse(made).success).toBe(true);
  });

  it("sends the server's instant in whole seconds, rounded down", () => {
    const [, example] = examples[0] ?? [];
    const value = example?.value as Body;
    const made = membersBody(Temporal.Instant.from("2026-11-06T14:41:00.999999Z"), roster(value)) as Body;
    expect(made["server_now"]).toBe("2026-11-06T14:41:00Z");
  });

  it("sends no next day and no avatar where there is none, and nothing else of a member", () => {
    const made = membersBody(Temporal.Instant.from("2026-11-06T14:41:00Z"), {
      club: { id: "club_1", name: "Sunday people", timezone: "America/New_York", membershipId: "mem_1" },
      members: [
        {
          person: { membershipId: "mem_1", displayName: "Ben", avatarVersion: null },
          position: 1,
          nextDay: null,
          nextUp: false,
        },
      ],
    }) as Body & { members: Body[] };
    expect(Object.keys(made).sort()).toEqual(["club", "members", "server_now"]);
    expect(made.members).toEqual([
      { person: { membership_id: "mem_1", display_name: "Ben" }, position: 1, next_up: false },
    ]);
    expect(Members.safeParse(made).success).toBe(true);
  });
});
