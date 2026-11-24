/// <reference lib="esnext.temporal" />
// `PUT /v1/devices/current` and `POST /v1/device-removals` (the contract's `registerDevice` and `removeDevice`;
// spec 21, 23; T14, T27, T52, T55; TECH-DESIGN section 6, device registration (a) to (e);
// docs/plans/api-b2-spike-push.md, section 1). The rules, the locks and the sign-in's hash are the domain's
// (packages/domain/src/identity/devices.ts): a handler here parses the body by the contract's own schema, runs
// the command in one transaction, and writes what comes back as an explicit field list (T55).
//
// The token and the secret are never in an answer, an error or a log line (T52): a refused body names its first
// bad field and never its value, and the answer is the contract's `DeviceRegistration`, which holds neither.
//
// `removeDevice` is public (`security: []`): the app deleted its session at logout, and the secret alone
// authorizes the removal ((a)). Its answers are 204 when a registration was removed and the neutral NOT_FOUND
// otherwise, which ends the app's removal too ((d)), so it says nothing about anyone else's devices (T14).

import { RegisterDeviceRequest, RemoveDeviceRequest } from "@tadayo/contracts";
import {
  contractInstant,
  Refused,
  registerDevice,
  removeDevice,
  type DeviceRegistration,
  type Json,
} from "@tadayo/domain";
import { noContent, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `DeviceRegistration`: the environment, the zone and when, never the token or the secret (T55). */
export function deviceRegistrationBody(registration: DeviceRegistration): Json {
  return {
    apns_environment: registration.apnsEnvironment,
    timezone: registration.timezone,
    registered_at: contractInstant(registration.registeredAt),
  };
}

const REGISTER_FIELDS: readonly string[] = Object.keys(RegisterDeviceRequest.shape);
const REMOVE_FIELDS: readonly string[] = Object.keys(RemoveDeviceRequest.shape);

/**
 * The first bad field of a body the contract refused, by name, or none: never an unknown key, never a value. The
 * parser puts an unknown key's refusal at no path; the list is a second lock on that.
 */
function firstBadField(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
  fields: readonly string[],
): string | undefined {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && fields.includes(field)) return field;
  }
  return undefined;
}

export function registerDeviceHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const parsed = RegisterDeviceRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(parsed.error.issues, REGISTER_FIELDS);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    let registration: DeviceRegistration;
    try {
      registration = await deps.sql.begin((tx) =>
        registerDevice(tx, deps.clock, {
          userId: account.id,
          apnsToken: parsed.data.apns_token,
          apnsEnvironment: parsed.data.apns_environment,
          timezone: parsed.data.timezone,
          removalSecret: parsed.data.removal_secret,
        }),
      );
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, deviceRegistrationBody(registration));
  };
}

export function removeDeviceHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const parsed = RemoveDeviceRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(parsed.error.issues, REMOVE_FIELDS);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const outcome = await deps.sql.begin((tx) => removeDevice(tx, deps.clock, parsed.data.removal_secret));
    return outcome === "removed" ? noContent(reply) : problem(reply, "NOT_FOUND");
  };
}
