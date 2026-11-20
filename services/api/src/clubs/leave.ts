/// <reference lib="esnext.temporal" />
// Leaving a club over HTTP (the contract's `leaveClub`; spec 22; G05-leave, book p30; T1, T9, T14, T19,
// T26, T36, T55). The rules, the order of the refusals, the lock and who may leave are the domain's
// (packages/domain/src/clubs/leave-club.ts): the handler here parses the request by the contract's own
// schema, runs the command in one transaction, and serializes what comes back as an explicit field list
// (T55).
//
// A caller with nothing of the club gets the neutral not-found, the same answer as an id nobody has (T14).

import { LeaveClubRequest } from "@tadayo/contracts";
import { contractInstant, leaveClub, Refused, type Json, type LeaveClubInput, type LeftClub } from "@tadayo/domain";
import { IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `LeftClub`: the caller's own club, when their interval ended, and their own choice. */
export function leftClubBody(left: LeftClub): { readonly [key: string]: Json } {
  return {
    club_id: left.clubId,
    left_at: contractInstant(left.leftAt),
    contributions: left.contributions,
  };
}

export function leaveClubHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = LeaveClubRequest.safeParse(request.body);
    if (!parsed.success) {
      const named = parsed.error.issues.some((issue) => issue.path[0] === "contributions");
      return problem(reply, "INVALID_REQUEST", named ? { field: "contributions" } : {});
    }
    const club = (request.params as Readonly<Record<string, unknown>> | null)?.["club_id"];
    const input: LeaveClubInput = {
      userId: account.id,
      key,
      clubId: typeof club === "string" ? club : "",
      contributions: parsed.data.contributions,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => leaveClub(tx, deps.clock, input, leftClubBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, response);
  };
}
