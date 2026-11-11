// `GET /v1/me` and `PATCH /v1/me` (spec 23; FQ13, FQ69; T19, T55): the caller's own account. The serializer
// is an explicit list of the contract's five fields (T55), and the account's id is in no answer but this
// one (the contract's `Me`): never an email address, which the account doesn't keep.

import { UpdateMeRequest, ERRORS, type ErrorCodeName } from "@tadayo/contracts";
import { Refused, updateMe, type Account, type Json, type ProfileEdit } from "@tadayo/domain";
import type { FastifyReply } from "fastify";
import { ok, problem } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `Me` for `account`: the name and the avatar's version only when there are some. */
export function meBody(account: Account): Json {
  return {
    id: account.id,
    ...(account.displayName === null ? {} : { display_name: account.displayName }),
    ...(account.avatarVersion === null ? {} : { avatar_version: account.avatarVersion }),
    age_confirmed: account.ageConfirmed,
    version: account.version,
  };
}

export const getMe: Handler = (request, reply) => ok(reply, meBody(signedIn(request)));

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS: readonly string[] = Object.keys(UpdateMeRequest.shape);

/** The first bad field of a body the contract refused, by the contract's order, or none: never an unknown key. */
function firstBadField(issues: readonly { readonly path: readonly PropertyKey[] }[]): string | undefined {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && FIELDS.includes(field)) return field;
  }
  return undefined;
}

function isErrorCode(code: string): code is ErrorCodeName {
  return Object.hasOwn(ERRORS, code);
}

/** A refusal as the contract's answer; a code that isn't the contract's is a bug, which is a 500. */
function refusal(reply: FastifyReply, refused: Refused): FastifyReply {
  if (!isErrorCode(refused.code)) throw refused;
  return problem(reply, refused.code, refused.facts);
}

export function updateMeHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The parameters come before the body, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !KEY.test(key))
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    const parsed = UpdateMeRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const { expected_version, display_name, age_confirmed, avatar_upload_id } = parsed.data;
    const edit: ProfileEdit = {
      expected_version,
      ...(display_name === undefined ? {} : { display_name }),
      ...(age_confirmed === undefined ? {} : { age_confirmed }),
      ...(avatar_upload_id === undefined ? {} : { avatar_upload_id }),
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => updateMe(tx, deps.clock, { userId: account.id, key, edit }, meBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, response);
  };
}
