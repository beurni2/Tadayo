// The health check's row of the privacy matrix (the contract's `getHealth`; the outside audit's A7;
// docs/plans/api-b2-health-check.md, section 2.4): to every role, in every state of the drop and phase of the day,
// with its session and with none (the signed-out callers and every token that isn't a session), 204 with nothing
// in it and nothing for a cache to keep, the same answer whoever asks (T14). The route is public, so the gate reads
// no session for it, and it reads no table: its one statement is `SELECT 1`, which the route's own test holds
// (services/api/src/health.test.ts), so it changes nothing and names nothing. When the database doesn't answer it
// is the bare 503, which no cell provokes; that is the route test's and tests/src/db/health.test.ts's.

import { noContentProblems } from "./device.ts";
import type { Expected } from "./harness.ts";

/** The operations whose rows this file judges. */
export const HEALTH_JUDGED: ReadonlySet<string> = new Set(["getHealth"]);

/** getHealth's answer to every caller: the app's 204, as removeDevice's is judged (device.ts). */
export const healthExpected: Expected = noContentProblems;
