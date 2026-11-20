/// <reference lib="esnext.temporal" />
// The club's week and its first days over HTTP (the contract's `getSchedule`, `chooseScheduleDays` and
// `confirmScheduleDays`; spec 05; T1, T9, T14, T19, T33, T55). The rules, the order of the refusals, the
// locks and who is a member are the domain's (packages/domain/src/schedule/; the authorization module's
// `activeMember`): a handler here parses the request by the contract's own schema, runs the read or the
// command in one transaction, and serializes what comes back, each serializer an explicit field list
// (T55). A person is on a slot only where the domain's view put one (`viewFor`): nothing here adds a name.
//
// A caller with nothing of the club gets the neutral not-found from the read (null) and from the commands
// (`Refused` NOT_FOUND), the same answer as an id nobody has (T14).

import { ScheduleChoiceRequest, ScheduleConfirmRequest } from "@tadayo/contracts";
import {
  chooseScheduleDays,
  confirmScheduleDays,
  contractInstant,
  readSchedule,
  Refused,
  type Json,
  type ProposalAnswer,
  type ScheduleCommandInput,
  type SchedulePerson,
  type ScheduleSight,
  type SlotAnswer,
} from "@tadayo/domain";
import { IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `Person`: the avatar's version only when there is one. */
export function personBody(person: SchedulePerson): Json {
  return {
    membership_id: person.membershipId,
    display_name: person.displayName,
    ...(person.avatarVersion === null ? {} : { avatar_version: person.avatarVersion }),
  };
}

/** The contract's `ScheduleSlot`: a person, or a date, only where the caller's view has one. */
export function slotBody(slot: SlotAnswer): Json {
  return {
    weekday: slot.weekday,
    state: slot.state,
    ...(slot.owner === undefined ? {} : { owner: personBody(slot.owner) }),
    ...(slot.holders === undefined ? {} : { holders: slot.holders.map(personBody) }),
    ...(slot.heldBy === undefined ? {} : { held_by: personBody(slot.heldBy) }),
    ...(slot.firstDate === undefined ? {} : { first_date: slot.firstDate }),
    suggested: slot.suggested,
  };
}

/** The contract's `ScheduleProposal`, as the caller sees it. */
export function proposalBody(proposal: ProposalAnswer): Json {
  return {
    id: proposal.id,
    version: proposal.version,
    reason: proposal.reason,
    effective_from: proposal.effectiveFrom,
    days_per_member: proposal.daysPerMember,
    slots: proposal.slots.map(slotBody),
    my_days: [...proposal.myDays],
    my_state: proposal.myState,
    state: proposal.state,
  };
}

/** The contract's `Schedule`: `now` is the clock's sample, whole seconds, rounded down. */
export function scheduleBody(now: Temporal.Instant, sight: ScheduleSight): Json {
  return {
    server_now: contractInstant(now),
    club: {
      id: sight.club.id,
      name: sight.club.name,
      timezone: sight.club.timezone,
      my_membership_id: sight.club.membershipId,
    },
    ...(sight.current === null
      ? {}
      : {
          current: {
            effective_from: sight.current.effectiveFrom,
            assignments: sight.current.assignments.map((assignment) => ({
              weekday: assignment.weekday,
              person: personBody(assignment.person),
            })),
          },
        }),
    ...(sight.proposal === null ? {} : { proposal: proposalBody(sight.proposal) }),
  };
}

/** A path's parameter, as Fastify decoded it; anything that isn't a string names nothing. */
function parameter(params: unknown, name: string): string {
  const value = (params as Readonly<Record<string, unknown>> | null)?.[name];
  return typeof value === "string" ? value : "";
}

export function getScheduleHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const clubId = parameter(request.params, "club_id");
    // Read only, and the server's instant first: the week is one statement, so one snapshot (T1).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      const sight = await readSchedule(tx, account.id, clubId, now);
      return sight === null ? null : scheduleBody(now, sight);
    });
    return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);
  };
}

const FIELDS: readonly string[] = ["expected_version", "weekdays"];

/** The first bad field of a body the contract refused, by name, or none: never an unknown key, never a value. */
function firstBadField(issues: readonly { readonly path: readonly PropertyKey[] }[]): string | undefined {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && FIELDS.includes(field)) return field;
  }
  return undefined;
}

function commandHandler(
  deps: Deps,
  schema: typeof ScheduleChoiceRequest | typeof ScheduleConfirmRequest,
  command: typeof chooseScheduleDays,
): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The parameters come before the body, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: ScheduleCommandInput = {
      userId: account.id,
      key,
      proposalId: parameter(request.params, "proposal_id"),
      expectedVersion: parsed.data.expected_version,
      weekdays: parsed.data.weekdays,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => command(tx, deps.clock, input, proposalBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, response);
  };
}

export const chooseScheduleDaysHandler = (deps: Deps): Handler =>
  commandHandler(deps, ScheduleChoiceRequest, chooseScheduleDays);

export const confirmScheduleDaysHandler = (deps: Deps): Handler =>
  commandHandler(deps, ScheduleConfirmRequest, confirmScheduleDays);
