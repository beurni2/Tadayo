/// <reference lib="esnext.temporal" />
// Holding a slot and giving it back over HTTP (the contract's `createReservation` and `releaseReservation`;
// spec 11, 32; T3, T4, T9, T14, T15, T17, T18, T19, T20, T55; docs/plans/api-b2-reservations.md). Who may add,
// the caller's role and limits, the locks, the cutoff and the receipt are the domain's
// (packages/domain/src/drops/reserve.ts and release.ts): a handler here parses the request by the contract's
// own schema, runs the command in one transaction, and writes what comes back as an explicit field list (T55).
// The role is never read from the request, whose body is strict (T17).
//
// A caller with nothing of the day or the reservation gets the neutral not-found, the same answer as an id
// nobody has (T14).

import { CreateReservationRequest } from "@tadayo/contracts";
import {
  contractInstant,
  createReservation,
  Refused,
  releaseReservation,
  type CreateReservationInput,
  type Json,
  type ReleasedAnswer,
  type ReleaseReservationInput,
  type ReservationAnswer,
} from "@tadayo/domain";
import type { FastifyRequest } from "fastify";
import { created, IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import { allowanceBody } from "../bodies.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `Reservation`: the caller's own slot, when it lapses, and their own allowance (T15, T18). */
export function reservationBody(reservation: ReservationAnswer): Json {
  return {
    id: reservation.id,
    occurrence_id: reservation.occurrenceId,
    media_class: reservation.mediaClass,
    expires_at: contractInstant(reservation.expiresAt),
    allowance: allowanceBody(reservation.allowance),
  };
}

/**
 * The contract's `ReleasedReservation`: what became of the caller's own slot, the caller's own drop that used it
 * when it was consumed (T20), and the caller's own allowance in its day (T15).
 */
export function releasedBody(released: ReleasedAnswer): Json {
  return {
    id: released.id,
    state: released.state,
    ...(released.state === "consumed" && released.dropId !== null ? { drop_id: released.dropId } : {}),
    allowance: allowanceBody(released.allowance),
  };
}

/** The path's `name`, or "" when it has none, which no command takes for an id. */
function pathParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Readonly<Record<string, unknown>> | null)?.[name];
  return typeof value === "string" ? value : "";
}

export function createReservationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = CreateReservationRequest.safeParse(request.body);
    if (!parsed.success) {
      const named = parsed.error.issues.some((issue) => issue.path[0] === "media_class");
      return problem(reply, "INVALID_REQUEST", named ? { field: "media_class" } : {});
    }
    const input: CreateReservationInput = {
      userId: account.id,
      key,
      occurrenceId: pathParam(request, "occurrence_id"),
      mediaClass: parsed.data.media_class,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => createReservation(tx, deps.clock, input, reservationBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return created(reply, response);
  };
}

export function releaseReservationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const input: ReleaseReservationInput = { userId: account.id, reservationId: pathParam(request, "reservation_id") };
    let answer: ReleasedAnswer;
    try {
      answer = await deps.sql.begin((tx) => releaseReservation(tx, deps.clock, input));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, releasedBody(answer));
  };
}
