import { describe, expect, it } from "vitest";
import { EXCEPTIONS, exceptionFor, type CopyException } from "./exceptions.ts";
import { lintString } from "./rules.ts";

describe("exceptionFor", () => {
  const sample: CopyException = {
    path: "a/L.xcstrings",
    key: "k",
    text: "Sent to her, sent",
    rule: "banned-word",
    match: "Sent",
    reason: "a test",
  };

  it("excuses only the word it names, as written, never another word or another rule's finding in its value", () => {
    const entry = { key: "k", text: sample.text };
    expect(
      lintString(sample.text).map((f) => [
        f.rule,
        f.match,
        exceptionFor("a/L.xcstrings", entry, f, [sample]) === sample,
      ]),
    ).toEqual([
      ["banned-word", "Sent", true],
      ["banned-word", "sent", false],
      ["gendered-pronoun", "her", false],
    ]);
  });
});

describe("EXCEPTIONS", () => {
  it("each names a value in which its rule finds its word, so none excuses nothing", () => {
    for (const e of EXCEPTIONS) {
      expect(
        lintString(e.text).some((f) => f.rule === e.rule && f.match === e.match),
        e.text,
      ).toBe(true);
    }
  });
});
