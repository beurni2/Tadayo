/// <reference lib="esnext.temporal" />
// The one read predicate (T9; TECH-DESIGN section 5): may this viewer see this drop's caption, its
// media or its reactions now. Every route, job, push, search and widget asks it, through this
// policy or through the SQL that filters reads (./read-sql.ts), which states the same rule for
// lists. It is the members' rule, the author's and the star's included as members of the audience
// (T8). The author's own access to their drop is the one exception (T9), through its own endpoints
// and its own policy here, which come with them: the preview (T11, B4) and their own contributions
// (spec 22, FQ76, B6). No operator reads through it: no route serves a drop's content to the
// operator (FQ32, answered). Still to come here, never in a handler: the per-viewer denial of
// hiding a drop for oneself (B5), and each reaction's own giver passing this rule too (FQ73, B6).
//
// It never says why it refused: a drop the viewer may not read and a drop that doesn't exist get
// the same answer, so a route can only answer the same NOT_FOUND to both (T14). Knowing an id
// grants nothing (T9). It reads no clock: `now` is a `ServerNow`, the server's time, which the
// caller samples through the time module after its locks (T1, T3), so a changed device clock, a
// request or a cursor decides nothing. Each condition is written as the one value that grants
// (`=== "active"`, `=== null`, `=== false`), so a fact that is missing or unknown denies.

import { wholeMicroseconds } from "../time/instant.ts";
import type { ServerNow } from "../time/clock.ts";

export type ReadWhat = "caption" | "media" | "reactions";
export const READS: readonly ReadWhat[] = ["caption", "media", "reactions"];

/** `app.users.state`. */
export type AccountState = "active" | "deleting" | "deleted";
/** `app.memberships.state`. */
export type MembershipState = "active" | "left" | "left_by_block" | "account_deleted";
/** `app.drops.state`. */
export type DropState = "active" | "held" | "withdrawn" | "removed";
/** `app.occurrences.status`, which holds only what denies a day. */
export type DayStatus = "scheduled" | "suspended" | "cancelled";

/**
 * What the predicate reads about one viewer and one drop, as the database holds it. It stays in
 * the package: outside it, a route asks only whether (./read-sql.ts), so no handler re-checks a
 * fact or tells a removed drop from a missing one (T9, T14).
 */
export interface DropReadFacts {
  /** The viewer's account, or null when no account has the viewer's id. */
  readonly viewerAccount: AccountState | null;
  /**
   * The state of the viewer's membership interval in the drop's audience: `active` when one of
   * theirs there is, as the SQL asks; null when none of theirs is in it. An audience is the club's
   * active intervals at the commit (T8), so a member who joined after it, or rejoined, has no
   * active interval there.
   */
  readonly viewerInterval: MembershipState | null;
  readonly drop: DropState;
  readonly day: DayStatus;
  readonly clubSuspendedAt: Temporal.Instant | null;
  readonly revealAt: Temporal.Instant;
  /** When the interval of the day's star ended, or null while it hasn't. */
  readonly starLeftAt: Temporal.Instant | null;
  /**
   * When the day's star asked to delete their account, or null while they haven't. A deletion
   * revokes the memberships first (T27, spec 23), so it is leaving at that instant, whenever the
   * interval itself is ended.
   */
  readonly starDeletionRequestedAt: Temporal.Instant | null;
  /** The account of the drop's author. */
  readonly authorAccount: AccountState;
  /** Whether either of the viewer and the author has blocked the other. */
  readonly blocked: boolean;
}

/**
 * Whether the viewer may see `what` of the drop at `now`. Each condition is a denial that beats
 * every grant (T23); the caption needs all but the last, and anything beyond it the reveal too.
 */
export function mayRead(facts: DropReadFacts | null, what: ReadWhat, now: ServerNow): boolean {
  checkRead(what, now);
  if (facts === null) return false;
  return (
    // The viewer's account is active: a deletion pending denies at once (T9, T27).
    facts.viewerAccount === "active" &&
    // The viewer's interval is in the audience and still active (T8, T9): leaving, a block or a
    // deletion ends it, and a newer interval of theirs was never in the audience.
    facts.viewerInterval === "active" &&
    // Not withdrawn, removed or held (T9, T23, T29).
    facts.drop === "active" &&
    // Neither the day nor the club suspended (T9); a cancelled day denies too.
    facts.day === "scheduled" &&
    facts.clubSuspendedAt === null &&
    // A day whose star left before it opened is held and never opens (FQ63): nothing of it is
    // served, the caption included, until leaving gives a held day its shape (B6). Asking to
    // delete the account is leaving at that instant, so the answer never waits for the worker
    // that ends the interval (T1, T27).
    notBeforeReveal(facts.starLeftAt, facts.revealAt) &&
    notBeforeReveal(facts.starDeletionRequestedAt, facts.revealAt) &&
    // The author's account deletion denies at once, before its purge (T23, T27; spec 23), since
    // no permission waits for the worker (TECH-DESIGN section 5).
    facts.authorAccount === "active" &&
    // A block hides each one's drops from the other, whatever the blocker kept (T23, FQ88).
    // Exactly false: a missing or strange value denies (Object.is, since it is typed boolean).
    Object.is(facts.blocked, false) &&
    // Anything beyond the caption once server time has reached the reveal (T9, T10, D07).
    (what === "caption" ||
      (facts.revealAt instanceof Temporal.Instant && Temporal.Instant.compare(now, facts.revealAt) >= 0))
  );
}

/**
 * Whether the star's leaving, `at`, keeps the day: it hasn't happened (null), or it came at
 * `revealAt` or later, once the day had opened. Anything that isn't an instant denies. Home's day
 * choice (./days.ts) asks it too, so a held day is held alike for its drops and for Home (FQ63).
 */
export function notBeforeReveal(at: unknown, revealAt: unknown): boolean {
  return (
    at === null ||
    (at instanceof Temporal.Instant &&
      revealAt instanceof Temporal.Instant &&
      Temporal.Instant.compare(at, revealAt) >= 0)
  );
}

/** Throws unless `what` is one of the three reads and `now` an instant Postgres keeps exactly. */
export function checkRead(what: unknown, now: unknown): void {
  if (!READS.includes(what as ReadWhat)) {
    throw new TypeError(`authorization: ${String(what)} isn't one of ${READS.join(", ")}`);
  }
  checkNow(now);
}

/** Throws unless `now` is an instant Postgres keeps exactly. */
export function checkNow(now: unknown): void {
  if (!(now instanceof Temporal.Instant)) throw new TypeError("authorization: now is the server's time, a ServerNow");
  wholeMicroseconds(now, "now");
}
