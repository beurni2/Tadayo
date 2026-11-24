/// <reference lib="esnext.temporal" />
// The commit's own checks before it asks the database anything (./commit.ts; docs/plans/api-b2-spike-commit.md,
// sections 0.9 and 3): the input the route hands it, the caption's empty-is-none, and a day id that can't be one.
// The command itself, its locks, refusals, receipt and audience, is on Postgres (tests/src/db/create-drop.test.ts).

import { describe, expect, it } from "vitest";
import { Refused } from "../refused.ts";
import { fakeClock } from "../time/testing.ts";
import { createDrop, keptCaption, type CreateDropInput } from "./commit.ts";

const clock = fakeClock("2026-11-06T21:00:00Z");

/** A transaction that fails the test if the command asks it anything. */
const untouched = new Proxy(() => undefined, {
  apply() {
    throw new Error("the command asked the database before checking its input");
  },
  get() {
    throw new Error("the command asked the database before checking its input");
  },
}) as unknown as Parameters<typeof createDrop>[0];

const VALID: CreateDropInput = {
  userId: "usr_ben",
  key: "6f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e",
  occurrenceId: "occ_saturday",
  reservationId: undefined,
  media: { kind: "photo", uploadId: "upl_ferry" },
  caption: undefined,
};

const run = (input: unknown) =>
  createDrop(untouched, clock, input as CreateDropInput, { receipt: () => ({}), star: () => ({}) });

describe("the commit checks what the route hands it before anything else", () => {
  it.each([
    ["an account id that can't be one", { ...VALID, userId: "usr ben" }, /account id/],
    ["no account", { ...VALID, userId: undefined }, /account id/],
    ["a key that isn't a UUID", { ...VALID, key: "retry-1" }, /UUID/],
    ["a day that isn't text", { ...VALID, occurrenceId: 7 }, /day/],
    ["a reservation that isn't text", { ...VALID, reservationId: 7 }, /reservation/],
    ["a photo with no upload", { ...VALID, media: { kind: "photo" } }, /media/],
    ["a photo naming a source", { ...VALID, media: { kind: "photo", sourceId: "src_x" } }, /media/],
    ["a link with no source", { ...VALID, media: { kind: "external_video", uploadId: "upl_x" } }, /media/],
    ["media of another kind", { ...VALID, media: { kind: "audio", uploadId: "upl_x" } }, /media/],
    ["a caption that isn't text", { ...VALID, caption: 7 }, /caption/],
  ])("throws for %s, asking the database nothing", async (_name, input, message) => {
    await expect(run(input)).rejects.toThrow(TypeError);
    await expect(run(input)).rejects.toThrow(message);
  });

  it("names no day for an id that can't be one, the neutral not-found, asking the database nothing", async () => {
    for (const occurrenceId of ["occ.saturday", "", "x".repeat(65)]) {
      const refused = await run({ ...VALID, occurrenceId }).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Refused);
      expect(refused).toMatchObject({ code: "NOT_FOUND", facts: {} });
    }
  });
});

describe("an empty caption is none (the plan's section 0.9)", () => {
  it("keeps none for an absent or empty caption, and any other caption as it came", () => {
    expect(keptCaption(undefined)).toBeNull();
    expect(keptCaption("")).toBeNull();
    expect(keptCaption(" ")).toBe(" ");
    expect(keptCaption("The ferry at dawn 🌅")).toBe("The ferry at dawn 🌅");
  });
});
