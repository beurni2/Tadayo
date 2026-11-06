// The copy lint's exceptions: each the founder's answer to a question in docs/QUESTIONS.md, for
// one value of one key in one string catalog, excused from one rule for one word. Every run of
// `pnpm copy-lint` prints each of them, with how many times it was found, so none is hidden
// (T58: a check is never weakened to get a PR through; these are product decisions).

import type { CopyFinding, CopyRule } from "./rules.ts";
import type { StringEntry } from "./extract.ts";

export interface CopyException {
  /** The string catalog, from the repository's root. */
  readonly path: string;
  /** The catalog key whose value it is. */
  readonly key: string;
  /** The value, exactly. */
  readonly text: string;
  readonly rule: CopyRule;
  /** The word the rule found, exactly. */
  readonly match: string;
  /** The founder's answer that allows it, and why. */
  readonly reason: string;
}

export const EXCEPTIONS: readonly CopyException[] = [
  {
    path: "apps/ios/Tadayo/Localizable.xcstrings",
    key: "auth.code.sentTo",
    text: "Sent to %@",
    rule: "banned-word",
    match: "Sent",
    reason:
      "FQ68 (ADR-029): T41's ban on Sent covers a drop's states, and the sign-in code screen (A02-code) " +
      "says where the code went",
  },
];

/** The exception that excuses `finding` in `entry` of the file at `path`, if any. */
export function exceptionFor(
  path: string,
  entry: StringEntry,
  finding: CopyFinding,
  exceptions: readonly CopyException[] = EXCEPTIONS,
): CopyException | undefined {
  return exceptions.find(
    (e) =>
      e.path === path &&
      entry.key === e.key &&
      entry.text === e.text &&
      finding.rule === e.rule &&
      finding.match === e.match,
  );
}
