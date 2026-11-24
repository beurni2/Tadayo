// How the privacy matrix fills a request from a cell's world: each Id parameter by its name, in the
// path and the query alike, required or optional, so `club_id` is the cell's club wherever it
// appears. A parameter may name more than one object, each in a request of its own: `drop_id` names
// Ben's photo and Ben's video link, which every role, phase and state meets alike, so neither class of drop
// hides behind the other (the outside audit's A4). What a binding doesn't reach yet: an id in a request's body.
// The matrix's tables send each built route's bodies themselves, and the body ids of branches still to be built are
// each bound to an object of the world by the slice that builds the branch, in its table: createDrop's `source_id`
// (its link branch answers every source NOT_FOUND until B3 builds resolveSource; the table sends a fresh one),
// createUpload's `drop_id` for its replacement and photo-message purposes, and createComment's `reply_to_id`, createReport's target,
// blockMember's, setHighlight's, updateDrop's and searchMemories' ids (docs/plans/api-b2-matrix-built-rows.md,
// section 0.6). createInvitation's cell request sends a fresh `candidate_id` on purpose: a candidate nobody has, never
// a link.

import { randomBytes } from "node:crypto";
import type { ContractOperation } from "./operations.ts";

/** The objects of one cell's world that a request can name. */
export interface Targets {
  club: string;
  /** The drop the cell's state acts on: Ben's photo. */
  drop: string;
  /**
   * Ben's video link to the same day: the same author and audience as the photo, and put in each state as the photo
   * is (privacy/matrix.test.ts `putInState`), so every row the photo's request has is the video's too, but a
   * route's own media class.
   */
  video: string;
  /** Its day, Ana's Saturday. */
  day: string;
  /** Its author's membership interval. */
  author: string;
  /** The day's star's membership interval, Ana's. */
  star: string;
  /** The club's open schedule proposal: the matrix's first days (schedule.ts). */
  proposal: string;
  /** The applied roster revision that brought Ben and Cleo in: it lists Ana alone (roster.ts). */
  revision: string;
  /** The link Ben accepted that revision with, which Ana, who proposed Ben, made. */
  invitation: string;
  /** A slot Ben held in the day and gave back (reservation.ts). */
  reservation: string;
  /** The photo's upload Ben started under that slot before giving it back, still pending (upload.ts). */
  upload: string;
}

/** A fresh id that names nothing, in the contract's `Id` shape (T14: a guessed id). */
export function freshId(): string {
  return `guess_${randomBytes(16).toString("base64url")}`;
}

/**
 * Each Id parameter the contract has, by name: the object, or the objects, of the cell's world it names. "missing"
 * marks one with no object in the matrix's world yet: it gets a fresh id, so its request names nothing and any
 * handler, leaking or not, answers it the neutral not-found. A built route may never take one, nor act on one
 * (`bindingProblems`, ACTS_ON), so the slice that builds a route on one puts the object in the world first.
 * `comment_id` is the last: a comment on the matrix's open day makes Home refuse its page until B6 builds the fields
 * that show it (packages/domain/src/clubs/home.ts), so the comment comes with B6's first comment route, which can't
 * be built without it.
 */
export const BINDINGS: Readonly<
  Record<string, ((targets: Targets) => string | readonly [string, ...string[]]) | "missing">
> = {
  club_id: (targets) => targets.club,
  drop_id: (targets) => [targets.drop, targets.video],
  membership_id: (targets) => targets.author,
  occurrence_id: (targets) => targets.day,
  proposal_id: (targets) => targets.proposal,
  invitation_id: (targets) => targets.invitation,
  revision_id: (targets) => targets.revision,
  star: (targets) => targets.star,
  comment_id: "missing",
  reservation_id: (targets) => targets.reservation,
  upload_id: (targets) => targets.upload,
};

/**
 * Every value of Id parameter `name` in a cell whose world is `targets`: the cell's requests send each (harness.ts
 * `specsFor`), and the guessed-id and signed-out steps guess another club's of the same place (`elsewhereOf`).
 */
export function bindAll(
  name: string,
  targets: Targets,
  bindings: typeof BINDINGS = BINDINGS,
): readonly [string, ...string[]] {
  const binding = bindings[name];
  if (binding === undefined)
    throw new Error(`the privacy matrix has no binding for the parameter ${name} (bindings.ts)`);
  if (binding === "missing") return [freshId()];
  const values = binding(targets);
  return typeof values === "string" ? [values] : values;
}

/**
 * The objects an operation acts on beyond its own Id parameters, by the binding that names them: a drop's comments
 * for the routes that list, write and report them, though they take a drop or nothing in their path. The matrix's world
 * must hold one before any of them is built (`bindingProblems`): a thread asked only while it is empty passes a handler
 * that shows a removed comment or a blocked author's message (T24, T63).
 */
export const ACTS_ON: Readonly<Record<string, readonly string[]>> = {
  listComments: ["comment_id"],
  createComment: ["comment_id"],
  createReport: ["comment_id"],
};

/**
 * The built routes (`built`: the API's BUILT_OPERATIONS) that take an Id parameter still marked "missing", or act on
 * its objects (`actsOn`): a request that names nothing gets the neutral not-found from a leaking handler too, and a
 * list asked while it's empty can't show what it should leave out, so every object a built route names or acts on is
 * one of the world (the outside audit's A4). The matrix checks that each bound value is a row of its table
 * (TABLES).
 */
export function bindingProblems(
  operations: readonly ContractOperation[],
  built: ReadonlySet<string>,
  bindings: typeof BINDINGS = BINDINGS,
  actsOn: typeof ACTS_ON = ACTS_ON,
): string[] {
  return operations
    .filter((operation) => built.has(operation.id))
    .flatMap((operation) => [
      ...operation.parameters
        .filter(
          (parameter) => parameter.schema.$ref === "#/components/schemas/Id" && bindings[parameter.name] === "missing",
        )
        .map(
          (parameter) =>
            `${operation.id} is built and takes ${parameter.name}, which names no object of the matrix's world: the slice that builds it puts one in first`,
        ),
      ...(actsOn[operation.id] ?? [])
        .filter((name) => bindings[name] === "missing")
        .map(
          (name) =>
            `${operation.id} is built and acts on the objects ${name} names, of which the matrix's world has none: the slice that builds it puts one in first`,
        ),
    ]);
}

/**
 * The table, and its column, whose row each binding's values must be in the cell's world: a binding that names a
 * fresh id, or an object of another kind, would pass `bindingProblems` but be asked only for the neutral not-found
 * (the outside audit's A4; the privacy matrix checks every bound value of every built route against it).
 */
export const TABLES: Readonly<Record<string, { table: string; column: string }>> = {
  club_id: { table: "app.clubs", column: "id" },
  drop_id: { table: "app.drops", column: "id" },
  membership_id: { table: "app.memberships", column: "interval_id" },
  occurrence_id: { table: "app.occurrences", column: "id" },
  proposal_id: { table: "app.schedule_proposals", column: "id" },
  invitation_id: { table: "app.invitations", column: "id" },
  revision_id: { table: "app.roster_revisions", column: "id" },
  star: { table: "app.memberships", column: "interval_id" },
  comment_id: { table: "app.comments", column: "id" },
  reservation_id: { table: "app.reservations", column: "id" },
  upload_id: { table: "app.uploads", column: "id" },
};

/** The bindings a built route names or acts on: its Id parameters' and ACTS_ON's, each once, in the contract's order. */
export function boundNames(
  operations: readonly ContractOperation[],
  built: ReadonlySet<string>,
  actsOn: typeof ACTS_ON = ACTS_ON,
): string[] {
  const names = operations
    .filter((operation) => built.has(operation.id))
    .flatMap((operation) => [
      ...operation.parameters
        .filter((parameter) => parameter.schema.$ref === "#/components/schemas/Id")
        .map((parameter) => parameter.name),
      ...(actsOn[operation.id] ?? []),
    ]);
  return [...new Set(names)];
}
