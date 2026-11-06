/// <reference lib="esnext.temporal" />
// How an instant crosses the time module's edges, each at its own precision (T1, T3, T22).
//
// Postgres keeps microseconds, so the clock's samples are whole microseconds, and a command
// stores its sample whole: the database's guards compare a change's instant with the last one and
// with the day's reveal_at, so a sample cut short could tie with an earlier one (the T3 and T22
// rows of docs/JOURNAL.md section 2). postgres.js's own `timestamptz` type goes through a JS
// `Date`, which keeps milliseconds, whatever it's given; so the API's connection and the tests'
// command connections use INSTANT_TYPE instead. The contract's `Instant` is whole seconds
// (packages/contracts/src/common.ts), and is only for responses.

/** Throws unless `instant` is a whole number of microseconds, the most Postgres keeps. */
export function wholeMicroseconds(instant: Temporal.Instant, what: string): Temporal.Instant {
  if (instant.epochNanoseconds % 1000n !== 0n) {
    throw new RangeError(`time: ${what} ${instant.toString()} is finer than a microsecond, which Postgres would round`);
  }
  return instant;
}

/** What a `timestamptz` is given: RFC 3339 with all six digits of microseconds. */
export function databaseInstant(instant: Temporal.Instant): string {
  return wholeMicroseconds(instant, "the instant").toString({ fractionalSecondDigits: 6 });
}

/**
 * postgres.js's custom type for `timestamptz` (oid 1184): a Temporal.Instant both ways, to the
 * microsecond. It takes only an Instant, so every time written comes from the time module (T1).
 * Install it as `postgres(url, { types: { instant: INSTANT_TYPE } })`, on every connection the API
 * and the worker make. postgres.js picks it for a parameter Postgres knows to be a timestamptz, so
 * bind an instant where it is one: into a timestamptz column, against one, or as `${i}::timestamptz`.
 * Anywhere else an Instant fails loudly, since Temporal refuses to turn one into a string unasked.
 */
export const INSTANT_TYPE: {
  readonly to: number;
  readonly from: number[];
  // An Instant in the types, so postgres.js takes one as a parameter; checked again when it runs,
  // since postgres.js hands this every timestamptz parameter, a Date or a string included.
  readonly serialize: (value: Temporal.Instant) => string;
  readonly parse: (text: string) => Temporal.Instant;
} = {
  to: 1184,
  from: [1184],
  serialize: (value: unknown) => {
    if (!(value instanceof Temporal.Instant)) {
      throw new TypeError(`time: a timestamptz takes a Temporal.Instant from the time module, not ${typeof value}`);
    }
    return databaseInstant(value);
  },
  // Postgres's ISO output, such as 2026-11-13 07:00:00.123456+00, which Temporal reads as it is.
  parse: (text) => Temporal.Instant.from(text),
};

/**
 * The contract's `Instant`, for a response: whole seconds and Z, rounded down, so a `server_now`
 * is never ahead of the server's own clock. Never for storing.
 */
export function contractInstant(instant: Temporal.Instant): string {
  return instant.toString({ smallestUnit: "second", roundingMode: "floor" });
}
