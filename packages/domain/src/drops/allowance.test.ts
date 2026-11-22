// The allowances by role on their own (./allowance.ts; addendum 2; T17; spec 11): spec 11's table and the
// addendum's examples, the order of the refusals, and a counter that disagrees with the role.

import { describe, expect, it } from "vitest";
import {
  allowanceOf,
  FRIEND_LIMITS,
  limitRefusal,
  STAR_LIMITS,
  type CounterRow,
  type Limits,
  type MediaClass,
} from "./allowance.ts";

const rowOf = (limits: Limits, counts: Partial<CounterRow> = {}): CounterRow => ({
  committedTotal: 0,
  committedExternal: 0,
  reservedTotal: 0,
  reservedExternal: 0,
  totalLimit: limits.total,
  photoLimit: limits.photos,
  externalLimit: limits.links,
  ...counts,
});

/** Adds `kinds` one by one, each as a reservation, and gives each one's answer: null when it fits, else its refusal. */
function addAll(isStar: boolean, kinds: readonly MediaClass[], start: Partial<CounterRow> = {}) {
  let row = rowOf(isStar ? STAR_LIMITS : FRIEND_LIMITS, start);
  return kinds.map((kind) => {
    const refusal = limitRefusal(allowanceOf(row, isStar), kind);
    if (refusal === null) {
      row = {
        ...row,
        reservedTotal: row.reservedTotal + 1,
        reservedExternal: row.reservedExternal + (kind === "external_video" ? 1 : 0),
      };
    }
    return refusal;
  });
}

const P: MediaClass = "photo";
const L: MediaClass = "external_video";

describe("the star's own day: six drops, at most two of them video links (addendum 2, spec 11, ND01)", () => {
  it("takes six photos and refuses a seventh", () => {
    expect(addAll(true, [P, P, P, P, P, P, P])).toEqual([null, null, null, null, null, null, "QUOTA_FULL"]);
  });

  it("takes four photos and two links, refuses a third link while the total is free, and a seventh of anything", () => {
    expect(addAll(true, [P, P, L, L, L, P, P, P, L])).toEqual([
      null,
      null,
      null,
      null,
      "EXTERNAL_LIMIT",
      null,
      null,
      "QUOTA_FULL",
      "QUOTA_FULL",
    ]);
  });

  it("takes one photo and one link, and never refuses a photo as PHOTO_LIMIT: the star's photos are the whole allowance", () => {
    expect(addAll(true, [P, L])).toEqual([null, null]);
    expect(addAll(true, [L, L, P, P, P, P, P])).toEqual([null, null, null, null, null, null, "QUOTA_FULL"]);
  });
});

describe("anyone else: three drops, at most two photos and one video link (addendum 2, ND02)", () => {
  it("takes two photos and a link, in any order", () => {
    expect(addAll(false, [P, P, L])).toEqual([null, null, null]);
    expect(addAll(false, [L, P, P])).toEqual([null, null, null]);
    expect(addAll(false, [P, L, P])).toEqual([null, null, null]);
  });

  it("refuses a third photo as PHOTO_LIMIT while the link is free, and a second link as EXTERNAL_LIMIT while the total is", () => {
    expect(addAll(false, [P, P, P])).toEqual([null, null, "PHOTO_LIMIT"]);
    expect(addAll(false, [L, L])).toEqual([null, "EXTERNAL_LIMIT"]);
    expect(addAll(false, [P, L, L])).toEqual([null, null, "EXTERNAL_LIMIT"]);
  });

  it("gives QUOTA_FULL first once all three are used, whatever the kind", () => {
    expect(addAll(false, [P, P, L, P, L])).toEqual([null, null, null, "QUOTA_FULL", "QUOTA_FULL"]);
  });

  it("counts committed drops and reservations alike", () => {
    // One committed photo and one reserved: the photos are used, the link is free.
    const start = { committedTotal: 1, reservedTotal: 1 };
    expect(addAll(false, [P], start)).toEqual(["PHOTO_LIMIT"]);
    expect(addAll(false, [L, P], start)).toEqual([null, "QUOTA_FULL"]);
    // A committed link and a reserved one can't both be: the counter refuses it before the rule sees it.
    expect(() =>
      allowanceOf(
        rowOf(FRIEND_LIMITS, { committedTotal: 1, committedExternal: 1, reservedTotal: 1, reservedExternal: 1 }),
        false,
      ),
    ).toThrow(/more than the caller's role allows/);
  });
});

describe("the allowance the caller reads (the contract's Allowance; T15, T17)", () => {
  it("gives the counts, committed and reserved, photos as the drops less the links, and the role's limits", () => {
    const row = rowOf(STAR_LIMITS, { committedTotal: 3, committedExternal: 1, reservedTotal: 2, reservedExternal: 1 });
    expect(allowanceOf(row, true)).toEqual({
      added: 3,
      reserved: 2,
      limit: 6,
      photoAdded: 2,
      photoReserved: 1,
      photoLimit: 6,
      externalAdded: 1,
      externalReserved: 1,
      externalLimit: 2,
      isStar: true,
    });
    expect(allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: 1 }), false)).toEqual({
      added: 1,
      reserved: 0,
      limit: 3,
      photoAdded: 1,
      photoReserved: 0,
      photoLimit: 2,
      externalAdded: 0,
      externalReserved: 0,
      externalLimit: 1,
      isStar: false,
    });
  });

  it("throws when the counter's limits aren't the caller's role's, rather than answer another role's numbers", () => {
    expect(() => allowanceOf(rowOf(STAR_LIMITS), false)).toThrow(/aren't the caller's role's/);
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS), true)).toThrow(/aren't the caller's role's/);
    expect(() => allowanceOf({ ...rowOf(FRIEND_LIMITS), photoLimit: 3 }, false)).toThrow(/aren't the caller's role's/);
  });

  it("throws on counts no counter may hold", () => {
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: -1 }), false)).toThrow(/isn't a count/);
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: 1.5 }), false)).toThrow(/isn't a count/);
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: 1, committedExternal: 2 }), false)).toThrow(
      /more than/,
    );
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: 3, reservedTotal: 1 }), false)).toThrow(
      /more than/,
    );
    expect(() => allowanceOf(rowOf(FRIEND_LIMITS, { committedTotal: 3 }), false)).toThrow(/more than/);
    expect(() => allowanceOf(rowOf(STAR_LIMITS, { committedTotal: 3, committedExternal: 3 }), true)).toThrow(
      /more than/,
    );
  });

  it("refuses a kind that isn't one", () => {
    expect(() => limitRefusal(allowanceOf(rowOf(STAR_LIMITS), true), "video" as MediaClass)).toThrow(TypeError);
  });
});
