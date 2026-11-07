/// <reference lib="esnext.temporal" />
// The tests' clock (TECH-DESIGN section 8), at `@tadayo/domain/testing`, never the package's main
// entry: a fake clock set ahead would reveal every drop early wherever it ran, and one standing
// still would reveal none. The one-clock scan (./one-clock.test.ts) fails if product code names it.

import { requireReadCommitted, type Clock, type ClockSql, type ServerNow } from "./clock.ts";
import { wholeMicroseconds } from "./instant.ts";

export interface FakeClock extends Clock {
  set(instant: Temporal.Instant): void;
  advance(duration: Temporal.DurationLike): void;
}

/**
 * A clock that stands still until told to move and keeps Postgres's precision. Its one query asks
 * the transaction it's given for its isolation, and it refuses anything but READ COMMITTED, as the
 * real clocks do, so a command tested with it meets the same rule. Only a test passes it in; no
 * configuration can select it.
 */
export function fakeClock(start: Temporal.Instant | string): FakeClock {
  let now = wholeMicroseconds(Temporal.Instant.from(start), "the fake clock's time");
  return {
    async sample(tx: ClockSql) {
      const rows = await tx`SELECT pg_catalog.current_setting('transaction_isolation') AS isolation`;
      requireReadCommitted(rows[0]?.["isolation"]);
      return now as ServerNow;
    },
    set(instant) {
      now = wholeMicroseconds(instant, "the fake clock's time");
    },
    advance(duration) {
      now = wholeMicroseconds(now.add(duration), "the fake clock's time");
    },
  };
}
