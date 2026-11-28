import { expect } from "vitest";

// Vitest 5.0.5's toMatchObject sees no own fields on a Temporal value, so it passes whichever
// instant or date a row holds, or null where one was expected (PR #159's first review: a breakage
// that kept a push's sent_at was missed this way); toEqual and expect.objectContaining compare
// them (PR #159's second review, R2-5, checked in the session). This tester makes every matcher
// compare Temporal values by kind and by their ISO string, so a wrong instant fails.

function kindOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const tag = Object.prototype.toString.call(value);
  return tag.startsWith("[object Temporal.") ? tag : null;
}

expect.addEqualityTesters([
  function temporal(a: unknown, b: unknown): boolean | undefined {
    const kindA = kindOf(a);
    const kindB = kindOf(b);
    if (kindA === null && kindB === null) {
      return undefined;
    }
    return kindA === kindB && String(a) === String(b);
  },
]);
