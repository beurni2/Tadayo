// What a route carries for the hooks and handlers (declarations only; the routes are in app.ts).

import type { Account } from "@tadayo/domain";

declare module "fastify" {
  interface FastifyContextConfig {
    /** The contract's operation id. Set on every contract route, so a hook can tell one from Fastify's own answers. */
    operation?: string;
    /** No session: the gate skips it (the contract's `public`). */
    public?: boolean;
    /** Works before the profile is complete (the contract's `beforeProfile`). */
    beforeProfile?: boolean;
    /** The browser's preflight before a request to this operation, from tadayo.app (web-origin.ts). */
    preflight?: string;
  }
  interface FastifyRequest {
    /** The signed-in account, set by the gate on every route that isn't public; null on one that is. */
    account: Account | null;
  }
}
