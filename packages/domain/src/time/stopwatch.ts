// A stopwatch, for measuring how long work took and nothing else (docs/plans/api-b2-spike-prepare.md section 6:
// spike S2's times). It reads the process's monotonic clock, which only the time module may read (TECH-DESIGN
// section 5; ./one-clock.test.ts), and it decides nothing: no access, cutoff, day, lease or due date reads it, as
// those come from the server's clock (./clock.ts; T1). The dev clock doesn't move it, and needn't: a duration is
// the same on every clock.

/** Starts a stopwatch: each call of the function it returns gives the whole milliseconds since it started. */
export function stopwatch(): () => number {
  const started = performance.now();
  return () => Math.round(performance.now() - started);
}
