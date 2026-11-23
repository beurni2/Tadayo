// The safety provider of the photo pipeline (spec 33: "Quarantine media until decoding, safety checks and rendition
// generation complete"; TECH-DESIGN section 1, "Image safety"; docs/plans/api-b2-spike-prepare.md section 2.8). FQ8's
// default: "the pipeline has a provider interface, with the provider set to `none` for the closed trial of invited
// friends". A provider is required before anyone outside the trial joins (Gate D), with a lawyer's review of its
// reporting duties; the founder accepts the trial's risk in writing before Gate E. Until then nothing is held, and a
// held upload's way out (a moderator's ready or rejected, db/migrations/0006_contributions.sql) waits for both.

/** What a provider says of a photo that passed the checks: let it through, or hold it for a person to look at. */
export type SafetyVerdict = "clear" | "hold";

/** A provider is given the original's bytes, which it must keep no copy of past its answer. */
export interface SafetyProvider {
  readonly name: string;
  screen(bytes: Uint8Array): Promise<SafetyVerdict>;
}

/** FQ8's `none`: no provider, so every photo that passed the checks is clear. */
export const noSafetyProvider: SafetyProvider = {
  name: "none",
  screen: () => Promise.resolve("clear"),
};
