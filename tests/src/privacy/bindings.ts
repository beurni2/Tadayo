// How the privacy matrix fills a request from a cell's world: each Id parameter by its name, in the
// path and the query alike, required or optional, so `club_id` is the cell's club wherever it
// appears. A path parameter may name more than one object, each in a request of its own: `drop_id` names
// Ben's photo and Cleo's video link, so neither class of drop hides behind the other (the outside audit's A4).

import { randomBytes } from "node:crypto";
import type { ContractOperation } from "./operations.ts";

/** The objects of one cell's world that a request can name. */
export interface Targets {
  club: string;
  /** The drop the cell's state acts on: Ben's photo. */
  drop: string;
  /** Cleo's video link to the same day, which no state ends. */
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
 * handler, leaking or not, answers it the neutral not-found. A built route may never take one (`bindingProblems`),
 * so the slice that builds a route on one puts the object in the world first. `comment_id` is the last: a comment
 * on the matrix's open day makes Home refuse its page until B6 builds the fields that show it
 * (packages/domain/src/clubs/home.ts), so the comment comes with B6's first comment route, which can't be built
 * without it.
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

/** Every value of Id parameter `name` in a cell whose world is `targets`, the first being `bind`'s. */
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

/** The value of Id parameter `name` in a cell whose world is `targets`: its first, where it names several. */
export function bind(name: string, targets: Targets): string {
  return bindAll(name, targets)[0];
}

/**
 * The built routes (`built`: the API's BUILT_OPERATIONS) that take an Id parameter still marked "missing": a request
 * that names nothing gets the neutral not-found from a leaking handler too, so a built route's every Id parameter
 * names an object of the world (the outside audit's A4).
 */
export function bindingProblems(
  operations: readonly ContractOperation[],
  built: ReadonlySet<string>,
  bindings: typeof BINDINGS = BINDINGS,
): string[] {
  return operations
    .filter((operation) => built.has(operation.id))
    .flatMap((operation) =>
      operation.parameters
        .filter(
          (parameter) => parameter.schema.$ref === "#/components/schemas/Id" && bindings[parameter.name] === "missing",
        )
        .map(
          (parameter) =>
            `${operation.id} is built and takes ${parameter.name}, which names no object of the matrix's world: the slice that builds it puts one in first`,
        ),
    );
}
