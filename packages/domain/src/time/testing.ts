/// <reference lib="esnext.temporal" />
// The tests' clock (TECH-DESIGN section 8), at `@tadayo/domain/testing`, never the package's main
// entry: a fake clock set ahead would reveal every drop early wherever it ran, and one standing
// still would reveal none. The one-clock scan (./one-clock.test.ts) fails if product code names it.

import type { Clock } from "./clock.ts";
import { wholeMicroseconds } from "./instant.ts";

export interface FakeClock extends Clock {
  set(instant: Temporal.Instant): void;
  advance(duration: Temporal.DurationLike): void;
}

/**
 * A clock that stands still until told to move, never queries, and keeps Postgres's precision.
 * Only a test passes it in; no configuration can select it.
 */
export function fakeClock(start: Temporal.Instant | string): FakeClock {
  let now = wholeMicroseconds(Temporal.Instant.from(start), "the fake clock's time");
  return {
    sample: () => Promise.resolve(now),
    set(instant) {
      now = wholeMicroseconds(instant, "the fake clock's time");
    },
    advance(duration) {
      now = wholeMicroseconds(now.add(duration), "the fake clock's time");
    },
  };
}
