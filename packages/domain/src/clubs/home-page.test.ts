// The open day's first page as readHome reads it from its statement (`openPage`; spec 15; T15, T22, T35;
// addendum 4; FQ26, FQ75; docs/plans/api-b2-home.md section 0.1): every drop and rail entry read whole, and any
// surprise refused rather than shown. The rows themselves are judged on Postgres (tests/src/db/home.test.ts).

import { describe, expect, it } from "vitest";
import { openPage, PAGE_DROPS } from "./home.ts";

const STAR = "mem_ana";
const person = (id: string, name: string, avatar: string | null = null) => ({
  membership_id: id,
  name,
  avatar_version: avatar,
});

/** A row as `pageDrops` builds it: a photo of `author`'s unless `extra` says otherwise. */
function drop(id: string, author: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    author: person(author, name),
    media_class: "photo",
    caption: null,
    highlight: false,
    width: 1200,
    height: 1600,
    media_version: `v_${id}`,
    provider: null,
    star: author === STAR,
    ...extra,
  };
}

const video = (id: string, author: string, name: string, extra: Record<string, unknown> = {}) =>
  drop(id, author, name, {
    media_class: "external_video",
    width: null,
    height: null,
    media_version: null,
    provider: "tiktok",
    ...extra,
  });

const drops = () => [
  drop("drp_a", STAR, "Ana", { highlight: true, caption: "Mine" }),
  drop("drp_b", "mem_ben", "Ben", { highlight: true }),
  video("drp_c", "mem_cleo", "Cleo"),
];
const rail = () => [
  { drop_id: "drp_a", author: person(STAR, "Ana"), star_pick: true },
  { drop_id: "drp_b", author: person("mem_ben", "Ben"), star_pick: false },
];

describe("the open day's page as read (openPage)", () => {
  it("reads each drop and entry whole, the star's section first", () => {
    expect(openPage(drops(), rail(), STAR)).toEqual({
      drops: [
        {
          id: "drp_a",
          author: { membershipId: STAR, displayName: "Ana", avatarVersion: null },
          mediaClass: "photo",
          caption: "Mine",
          highlight: true,
          photo: { width: 1200, height: 1600, mediaVersion: "v_drp_a" },
          video: null,
          section: "star",
        },
        {
          id: "drp_b",
          author: { membershipId: "mem_ben", displayName: "Ben", avatarVersion: null },
          mediaClass: "photo",
          caption: null,
          highlight: true,
          photo: { width: 1200, height: 1600, mediaVersion: "v_drp_b" },
          video: null,
          section: "friends",
        },
        {
          id: "drp_c",
          author: { membershipId: "mem_cleo", displayName: "Cleo", avatarVersion: null },
          mediaClass: "external_video",
          caption: null,
          highlight: false,
          photo: null,
          video: { provider: "tiktok" },
          section: "friends",
        },
      ],
      highlights: [
        { dropId: "drp_a", author: { membershipId: STAR, displayName: "Ana", avatarVersion: null }, starPick: true },
        {
          dropId: "drp_b",
          author: { membershipId: "mem_ben", displayName: "Ben", avatarVersion: null },
          starPick: false,
        },
      ],
    });
  });

  it("reads no drops as a quiet day, with no rail (T15)", () => {
    expect(openPage(null, null, STAR)).toEqual({ drops: [], highlights: [] });
  });

  it("refuses a drop outside the shape: a photo with no frame, a video with one, an unknown provider or media", () => {
    const refusals: unknown[][] = [
      [drop("drp_x", "mem_ben", "Ben", { width: null })],
      [drop("drp_x", "mem_ben", "Ben", { height: 0 })],
      [drop("drp_x", "mem_ben", "Ben", { width: 1.5 })],
      [drop("drp_x", "mem_ben", "Ben", { media_version: null })],
      [drop("drp_x", "mem_ben", "Ben", { provider: "tiktok" })],
      [video("drp_x", "mem_ben", "Ben", { media_version: "v" })],
      [video("drp_x", "mem_ben", "Ben", { width: 10 })],
      [video("drp_x", "mem_ben", "Ben", { provider: "youtube" })],
      [drop("drp_x", "mem_ben", "Ben", { media_class: "video" })],
      [drop("drp_x", "mem_ben", "Ben", { caption: "" })],
      [drop("drp_x", "mem_ben", "Ben", { highlight: "yes" })],
      [drop("", "mem_ben", "Ben")],
      // An author with no name to show (FQ75).
      [drop("drp_x", "mem_ben", "Ben", { author: { membership_id: "mem_ben", name: null, avatar_version: null } })],
      ["drp_x"],
    ];
    for (const page of refusals) expect(() => openPage(page, null, STAR), JSON.stringify(page)).toThrow(/shape/);
    expect(() => openPage({}, null, STAR)).toThrow(/shape/);
  });

  it("refuses a section its author's interval doesn't give, a star's drop after a friend's, or one drop twice (T35)", () => {
    expect(() => openPage([drop("drp_x", "mem_ben", "Ben", { star: true })], null, STAR)).toThrow(/shape/);
    expect(() => openPage([drop("drp_x", STAR, "Ana", { star: false })], null, STAR)).toThrow(/shape/);
    expect(() => openPage([drop("drp_b", "mem_ben", "Ben"), drop("drp_a", STAR, "Ana")], null, STAR)).toThrow(/shape/);
    expect(() => openPage([drop("drp_b", "mem_ben", "Ben"), drop("drp_b", "mem_ben", "Ben")], null, STAR)).toThrow(
      /shape/,
    );
  });

  it("refuses a rail that isn't the listed highlights, one each, the star's pick first (T22, FQ26)", () => {
    const [ana, ben] = rail();
    const bad: unknown[][] = [
      // A drop not on the page, a drop that isn't a highlight, another author's.
      [ana, { ...ben, drop_id: "drp_z" }],
      [ana, ben, { drop_id: "drp_c", author: person("mem_cleo", "Cleo"), star_pick: false }],
      [ana, { ...ben, author: person("mem_cleo", "Cleo") }],
      // A listed highlight missing, a contributor twice, a pick the star's flag doesn't match, the star's pick later.
      [ana],
      [ana, ben, ben],
      [ana, { ...ben, star_pick: true }],
      [{ ...ana, star_pick: false }, ben],
      [ben, ana],
    ];
    for (const entries of bad) expect(() => openPage(drops(), entries, STAR), JSON.stringify(entries)).toThrow(/shape/);
  });

  it("refuses a day past one page, whose cursor B5 builds, and takes one of exactly a page", () => {
    const full = Array.from({ length: PAGE_DROPS }, (_, index) =>
      drop(`drp_${String(index).padStart(2, "0")}`, "mem_ben", "Ben"),
    );
    expect(openPage(full, null, STAR).drops).toHaveLength(36);
    expect(() => openPage([...full, drop("drp_more", "mem_ben", "Ben")], null, STAR)).toThrow(/more than 36 drops/);
  });
});
