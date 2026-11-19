// How the privacy matrix fills a request from a cell's world: each Id parameter by its name, in the
// path and the query alike, required or optional, so `club_id` is the cell's club wherever it
// appears.

import { randomBytes } from "node:crypto";

/** The objects of one cell's world that a request can name. */
export interface Targets {
  club: string;
  /** The drop the cell's state acts on: Ben's photo. */
  drop: string;
  /** Its day, Ana's Saturday. */
  day: string;
  /** Its author's membership interval. */
  author: string;
  /** The day's star's membership interval, Ana's. */
  star: string;
  /** The club's open schedule proposal: the matrix's first days (schedule.ts). */
  proposal: string;
}

/** A fresh id that names nothing, in the contract's `Id` shape (T14: a guessed id). */
export function freshId(): string {
  return `guess_${randomBytes(16).toString("base64url")}`;
}

/**
 * Each Id parameter the contract has, by name. "missing" marks one with no object in the matrix's
 * world yet: it gets a fresh id, so its request names nothing. That's enough while every row is the
 * skeleton's; the slice that builds a route on one puts the object in the world first (rows.ts).
 */
export const BINDINGS: Readonly<Record<string, ((targets: Targets) => string) | "missing">> = {
  club_id: (targets) => targets.club,
  drop_id: (targets) => targets.drop,
  membership_id: (targets) => targets.author,
  occurrence_id: (targets) => targets.day,
  proposal_id: (targets) => targets.proposal,
  star: (targets) => targets.star,
  comment_id: "missing",
  invitation_id: "missing",
  reservation_id: "missing",
  revision_id: "missing",
  upload_id: "missing",
};

/** The value of Id parameter `name` in a cell whose world is `targets`. */
export function bind(name: string, targets: Targets): string {
  const binding = BINDINGS[name];
  if (binding === undefined)
    throw new Error(`the privacy matrix has no binding for the parameter ${name} (bindings.ts)`);
  return binding === "missing" ? freshId() : binding(targets);
}
