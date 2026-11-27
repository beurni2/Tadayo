// The safety provider of the photo pipeline (spec 33: "Quarantine media until decoding, safety checks and rendition
// generation complete"; TECH-DESIGN section 1, "Image safety"; docs/plans/api-b2-spike-prepare.md section 2.8). FQ8's
// default: "the pipeline has a provider interface, with the provider set to `none` for the closed trial of invited
// friends". A provider is required before anyone outside the trial joins (Gate D), with a lawyer's review of its
// reporting duties; the founder accepts the trial's risk in writing before Gate E. Until then nothing is held, and a
// held upload's way out (a moderator's ready or rejected, db/migrations/0006_contributions.sql) waits for both.
//
// Which provider screens an environment's photos is a setting each environment names, TADAYO_SAFETY_PROVIDER, never a
// value fixed in code or the image (the outside audit's B7): fly.toml names `none` for `dev`, and `prod`'s
// configuration must name one, or its worker doesn't start. The worker's start line says which (main.ts).

import { Fault } from "@tadayo/domain/fault";

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

/** The providers the worker knows, by the name TADAYO_SAFETY_PROVIDER gives: FQ8's `none` alone, until Gate D adds one. */
const PROVIDERS: Readonly<Record<string, SafetyProvider>> = { none: noSafetyProvider };

/** The provider TADAYO_SAFETY_PROVIDER names, or a fault: unset, empty or a name the worker doesn't know (never echoed). */
export function safetyProviderFor(name: string | undefined): SafetyProvider {
  if (name === undefined || name === "") {
    throw new Fault(
      "worker_safety_1",
      "worker: TADAYO_SAFETY_PROVIDER isn't set: each environment names its photo safety provider (none for the closed trial, FQ8)",
    );
  }
  const provider = Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : undefined;
  if (provider === undefined) {
    throw new Fault("worker_safety_2", "worker: TADAYO_SAFETY_PROVIDER names no provider the worker knows");
  }
  return provider;
}
