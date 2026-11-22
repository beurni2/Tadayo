// The allowances by role (addendum 2; T17; A06, A07, spec 11), pure: what each role may add to one day, the
// caller's own counts as the contract's Allowance gives them (T15), and which limit, if any, refuses one more
// drop of a kind. The counter's row holds the counts and its limits (db/migrations/0006_contributions.sql,
// 0010_allowance_by_role.sql); the command that holds its lock decides with these (./counter.ts), and the
// row's CHECKs are only the last guard behind it.
//
// - The star, adding to their own day: six drops, any of them photos, at most two of them video links.
// - Anyone else: three drops, at most two photos and at most one video link, so a friend's third drop can
//   only be a link.
// Committed drops and live reservations count alike. Per occurrence and membership interval, never per
// week (ND04). Drafts and photos in conversations count for nothing.

/** A drop's kind (the contract's MediaClass). */
export type MediaClass = "photo" | "external_video";

export const MEDIA_CLASSES: readonly MediaClass[] = ["photo", "external_video"];

/** One role's limits: the drops in all, the photos among them and the video links among them. */
export interface Limits {
  readonly total: number;
  readonly photos: number;
  readonly links: number;
}

/** The star's own day (addendum 2). */
export const STAR_LIMITS: Limits = Object.freeze({ total: 6, photos: 6, links: 2 });
/** Anyone else's (addendum 2). */
export const FRIEND_LIMITS: Limits = Object.freeze({ total: 3, photos: 2, links: 1 });

/** A counter's row as the database holds it: the counts, committed and reserved, and the row's own limits. */
export interface CounterRow {
  readonly committedTotal: number;
  readonly committedExternal: number;
  readonly reservedTotal: number;
  readonly reservedExternal: number;
  readonly totalLimit: number;
  readonly photoLimit: number;
  readonly externalLimit: number;
}

/** The caller's own allowance in one day (the contract's Allowance), never anyone else's (T15). */
export interface Allowance {
  readonly added: number;
  readonly reserved: number;
  readonly limit: number;
  readonly photoAdded: number;
  readonly photoReserved: number;
  readonly photoLimit: number;
  readonly externalAdded: number;
  readonly externalReserved: number;
  readonly externalLimit: number;
  readonly isStar: boolean;
}

/** The refusals of a full allowance, in the contract's order: QUOTA_FULL first (packages/contracts/src/errors.ts). */
export type LimitCode = "QUOTA_FULL" | "EXTERNAL_LIMIT" | "PHOTO_LIMIT";

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`allowance: ${what} isn't a count`);
  }
  return value;
}

/**
 * The caller's allowance from their counter's row and their role in the day, which the command read from the
 * two membership intervals (T17). The row's limits were written from the same two intervals by its own trigger
 * (0010); if the two ever disagree, or a count is out of its bounds, this throws: a bug, never a refusal.
 */
export function allowanceOf(row: CounterRow, isStar: boolean): Allowance {
  const limits = isStar ? STAR_LIMITS : FRIEND_LIMITS;
  if (
    row.totalLimit !== limits.total ||
    row.photoLimit !== limits.photos ||
    row.externalLimit !== limits.links ||
    typeof isStar !== "boolean"
  ) {
    throw new Error("allowance: the counter's limits aren't the caller's role's");
  }
  const committedTotal = count(row.committedTotal, "committed_total");
  const committedExternal = count(row.committedExternal, "committed_external");
  const reservedTotal = count(row.reservedTotal, "reserved_total");
  const reservedExternal = count(row.reservedExternal, "reserved_external");
  if (
    committedExternal > committedTotal ||
    reservedExternal > reservedTotal ||
    committedTotal + reservedTotal > limits.total ||
    committedTotal - committedExternal + (reservedTotal - reservedExternal) > limits.photos ||
    committedExternal + reservedExternal > limits.links
  ) {
    throw new Error("allowance: the counter holds more than the caller's role allows");
  }
  return {
    added: committedTotal,
    reserved: reservedTotal,
    limit: limits.total,
    photoAdded: committedTotal - committedExternal,
    photoReserved: reservedTotal - reservedExternal,
    photoLimit: limits.photos,
    externalAdded: committedExternal,
    externalReserved: reservedExternal,
    externalLimit: limits.links,
    isStar,
  };
}

/**
 * Which limit refuses one more drop of `media`, or null when it fits: QUOTA_FULL when the whole allowance is
 * used; then, for a video link, EXTERNAL_LIMIT when the role's links are; for a photo, PHOTO_LIMIT when the
 * role's photos are, which only a friend meets, since the star's photos are the star's whole allowance.
 */
export function limitRefusal(allowance: Allowance, media: MediaClass): LimitCode | null {
  if (!MEDIA_CLASSES.includes(media)) throw new TypeError("allowance: not a media class");
  if (allowance.added + allowance.reserved >= allowance.limit) return "QUOTA_FULL";
  if (media === "external_video" && allowance.externalAdded + allowance.externalReserved >= allowance.externalLimit) {
    return "EXTERNAL_LIMIT";
  }
  if (media === "photo" && allowance.photoAdded + allowance.photoReserved >= allowance.photoLimit) {
    return "PHOTO_LIMIT";
  }
  return null;
}
