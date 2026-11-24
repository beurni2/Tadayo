// A command that can't go ahead (TECH-DESIGN section 5: every write is one command, in one transaction).
// It says why with the contract's error code and the few facts that code names, and throws this, which
// rolls its transaction back: a refusal leaves nothing behind, the idempotency receipt it reserved
// included, so the same key can be tried again (T19). The route turns it into the contract's answer.
// The code is a string the route checks against the contract's own list, so a code that isn't one is
// a bug and answers 500, never something a caller can read.

import type { PlacedDay } from "./authorization/days.ts";
import type { Allowance } from "./drops/allowance.ts";

/**
 * The facts an error's body may carry, in the contract's names (packages/contracts/src/errors.ts). The days and
 * the allowance are the domain's values, which the route renders as the contract's Occurrence and Allowance:
 * each the caller's own to see (T4, T15).
 */
export interface RefusalFacts {
  /** The first bad field of the request, by name: never its value. */
  readonly field?: string;
  /** The version a stale edit should have sent. */
  readonly current_version?: number;
  /** The newer revision or proposal that replaced the one the request named. */
  readonly current_id?: string;
  /** The day the request asked for, at the server's time (T4). */
  readonly target?: PlacedDay;
  /** The same person's next day, for the person to confirm; nothing was moved (T4). */
  readonly next_target?: PlacedDay;
  /** The caller's own allowance in `target` (T15, T17). */
  readonly allowance?: Allowance;
  /** The caller's own drop that already holds this photo or link in the day, to offer View existing (T21). */
  readonly existing_drop_id?: string;
}

export class Refused extends Error {
  readonly code: string;
  readonly facts: RefusalFacts;

  constructor(code: string, facts: RefusalFacts = {}) {
    // The code alone: never a value, which a log line or a stack could then carry.
    super(`refused: ${code}`);
    this.name = "Refused";
    this.code = code;
    this.facts = facts;
  }
}
