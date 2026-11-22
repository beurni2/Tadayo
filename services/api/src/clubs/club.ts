/// <reference lib="esnext.temporal" />
// `POST /v1/clubs` and `GET /v1/clubs/{club_id}` (the contract's `createClub`, `getClub` and `ClubDetail`;
// spec 03, 04, 32; G01-create, G05-club-details; T1, T9, T14, T19, T33, T55). The rules are the domain's
// (packages/domain/src/clubs/create-club.ts and club.ts): a handler here parses the request by the
// contract's own schema, runs the command or the read in one transaction, and serializes what comes back
// by an explicit field list (T55).
//
// A club's information goes to its members only: anyone else gets the neutral not-found from the read,
// the same answer as an id nobody has (T14). `server_now` is the clock's sample of the request's own
// transaction, for a replayed `createClub` too, whose every other field is the first answer's (T1, T19).

import { CreateClubRequest } from "@tadayo/contracts";
import {
  contractInstant,
  createClub,
  readClub,
  Refused,
  type ClubDetail,
  type CreateClubInput,
  type CreatedClub,
  type Json,
} from "@tadayo/domain";
import { created, IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";
import { occurrenceBody } from "../bodies.ts";

/** The contract's `ClubDetail` without `server_now`: what `createClub`'s receipt keeps. */
export function clubDetailBody(detail: ClubDetail): { readonly [key: string]: Json } {
  const { club } = detail;
  return {
    club: {
      id: club.id,
      name: club.name,
      timezone: club.timezone,
      my_membership_id: club.membershipId,
      state: club.state,
      member_count: club.memberCount,
      ...(club.openDay === null ? {} : { open_day: occurrenceBody(club.openDay) }),
      ...(club.nextDay === null ? {} : { next_day: occurrenceBody(club.nextDay) }),
    },
    roster_version: detail.rosterVersion,
    can_propose: detail.canPropose,
    ...(detail.openRevisionId === null ? {} : { open_revision_id: detail.openRevisionId }),
  };
}

/** The whole `ClubDetail`: `now` is the clock's sample, whole seconds, rounded down. */
export function withServerNow(now: Temporal.Instant, body: Json): Json {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("clubs: a club's stored answer isn't an object");
  }
  return { server_now: contractInstant(now), ...(body as { readonly [key: string]: Json }) };
}

export function getClubHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const params = request.params as Readonly<Record<string, unknown>> | null;
    const clubId = typeof params?.["club_id"] === "string" ? params["club_id"] : "";
    // Read only, and the server's instant first: the club is one statement, so one snapshot (T1).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      const detail = await readClub(tx, account.id, clubId, now);
      return detail === null ? null : withServerNow(now, clubDetailBody(detail));
    });
    return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);
  };
}

const FIELDS: readonly string[] = ["name", "timezone"];

/** The first bad field of a body the contract refused, by name, or none: never an unknown key, never a value. */
function firstBadField(issues: readonly { readonly path: readonly PropertyKey[] }[]): string | undefined {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && FIELDS.includes(field)) return field;
  }
  return undefined;
}

export function createClubHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order (a body the app couldn't read or
    // that passed its limit was refused before this handler); nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = CreateClubRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: CreateClubInput = {
      userId: account.id,
      key,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    };
    let made: CreatedClub;
    try {
      made = await deps.sql.begin((tx) => createClub(tx, deps.clock, input, clubDetailBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return created(reply, withServerNow(made.at, made.answer));
  };
}
