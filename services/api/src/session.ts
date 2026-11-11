// The gate: who is calling (spec 23; T14, T27, T53; docs/plans/B0.md, slice 8). Supabase Auth owns
// sign-in; the API believes a token only when `identity/token.ts` verifies it against Supabase's public
// keys, maps its subject to the account (made on the first request), and refuses it at once when the
// account's deletion has begun (T27). One hook decides, for every contract route, before the request's
// body is read:
// - a `public` operation skips it: no header is read and no account is made;
// - no session (no header, a bad token, an account that isn't active): the one 401, whatever the cause,
//   so a caller learns nothing about which it was (T14);
// - an account that hasn't confirmed its age or has no name, on a route that isn't `beforeProfile`: 403
//   PROFILE_INCOMPLETE (FQ13, FQ69);
// - the keys that check tokens can't be read: 503 with nothing in it, never a 401, which the app answers
//   by ending the session (FQ89): a hiccup at Supabase must not sign anyone out.
// Fastify's own answers (an unknown path, another method, an id past its limit, a body it can't read)
// stay neutral for every caller, because they carry no contract operation.

import { createAccount, findAccount, type Account, type Clock } from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { problem, unauthenticated, unavailable } from "./answers.ts";
import type { ApiSql } from "./connection.ts";
import { KeysUnavailable, type Verifier } from "./identity/token.ts";
import "./context.ts";

/**
 * The account behind an `Authorization` header: null when there is no session, and a throw of
 * `KeysUnavailable` when that can't be told. Anything else it throws is a bug, and is a 500.
 */
export type Authenticate = (authorization: string | undefined) => Promise<Account | null>;

/** `Bearer`, in any case, one space and the token: anything else is no session. */
const BEARER = /^bearer ([^ ]+)$/i;

export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  return BEARER.exec(header)?.[1] ?? null;
}

/** The real `authenticate`: a verified token's subject, its account made on the first request, active only. */
export function sessions(deps: { verifier: Verifier; sql: ApiSql; clock: Clock }): Authenticate {
  return async (header) => {
    const token = bearerToken(header);
    if (token === null) return null;
    const subject = await deps.verifier(token);
    if (subject === null) return null;
    const known = await findAccount(deps.sql, subject);
    const account = known ?? (await deps.sql.begin((tx) => createAccount(tx, deps.clock, subject)));
    // A deletion ends access at once (T27), read on every request: only an active account has a session.
    return account !== null && account.state === "active" ? account : null;
  };
}

/** Whether the profile is finished: the 18-or-older confirmation and a name (FQ13, FQ69). */
export function profileFinished(account: Account): boolean {
  return account.ageConfirmed && account.displayName !== null;
}

/** Installs the gate on `app`: one `onRequest` hook, driven by each contract route's `config`. */
export function installGate(app: FastifyInstance, authenticate: Authenticate): void {
  app.decorateRequest("account", null);
  app.addHook("onRequest", async (request, reply) => {
    const config = request.routeOptions.config;
    // Not a contract route (Fastify's own answers), or one with no session: nothing to decide.
    if (config.operation === undefined || config.public === true) return;
    let account: Account | null;
    try {
      account = await authenticate(request.headers.authorization);
    } catch (error) {
      if (error instanceof KeysUnavailable) {
        // The reason is one of five fixed words, never what the keys' server said.
        request.log.error({ trouble: error.trouble }, "sign-in keys unavailable");
        return unavailable(reply);
      }
      throw error;
    }
    if (account === null) return unauthenticated(reply);
    if (config.beforeProfile !== true && !profileFinished(account)) return problem(reply, "PROFILE_INCOMPLETE");
    request.account = account;
    return undefined;
  });
}
