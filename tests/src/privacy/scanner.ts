/// <reference lib="esnext.temporal" />
// The leak scanner (TECH-DESIGN section 8; T10, T12, T14, T16; Q07): it checks every answer the
// privacy matrix produces, the author's included, against the contract and against the world the
// matrix built. Its facts about the world come from the world's rows, never from the authorization
// module it tests.
//
// It runs on every answer in every phase, not only on those before the reveal, as TECH-DESIGN
// section 8 asks: what opens at 7 AM is allowed by the phase (an opened card or day, a drop's own
// content version or link once its day has opened, to a viewer who may read it), so the same checks
// hold an answer before, during and after the day.
//
// Five checks, each named in its findings, all run on every answer, so a test can show that a check
// it plants against is the one that catches it:
// - shape: the status, the headers and the body are what the operation declares: Cache-Control on
//   every answer with a body, Retry-After on a 429, an error with only its code's fields, every 404
//   the neutral one (T14), and no key the contract doesn't name at any depth (a planted field);
// - whitelist: a caption card is exactly T10's list, as FQ74's answer reads it (this file's own
//   copy, so a contract change alone can't widen it);
// - world: every drop, person, day and club an answer names is the world's and the viewer's to see:
//   a card's drop in an audience holding an active interval of the viewer, or the viewer's own for
//   an own card, with the drop's own author and caption; every other drop reference in the form its
//   schema gives it (the viewer's own, the viewer's to read, or that and opened), and of its day; a
//   person, a day or a club only from a club the viewer has an interval in, active or not, a person
//   under the name members see; nothing opened before its day opens; who reacted only for the
//   drop's author (FQ73);
// - keys: no key that names a URL, a token, a provider, dimensions, colours, a highlight or another
//   of T10's never-list, but inside what has opened, the viewer's own card and the viewer's own
//   highlight pointer;
// - values: no URL, storage path or provider host in any value or header but in text people wrote,
//   which must be text the viewer may read, as the world stored it (T13 lets a caption hold a link
//   of its own); and no value the world keeps back (a storage key, a content version, a source's link
//   or post id), but a drop's own once its day has opened, to a viewer who may read it.
//
// Which drops a route may serve each role, in each state of the drop and phase of the day, is not
// the scanner's to judge: it knows the audience and the reveal, not T9's denials (a withdrawn, held
// or removed drop, a suspended or cancelled day, a suspended club, a deleting account, a block).
// Each route's row does that, for every drop id its answers hold (rows.ts).
//
// The answers TECH-DESIGN section 8 excepts, and the others that open at the reveal, are each
// allowed by the slice that first returns them, with its rule and its tests. Until then any URL,
// image, header or key of the never-list in them fails here:
// - the signed upload URL, which must name its intent's own object with overwriting off, and the
//   replays of that intent (spike S1's server part, then B3);
// - the invitation's preview to the person holding it, before they are in the club, and the
//   proposer's invitation link (B1);
// - the avatars' images (B1);
// - the author preview to its author, the media route's image and ETag after the reveal to the
//   drop's readers, and T40's source details to their resolver (B3);
// - the embed's provider and links after the reveal to the drop's readers, and the config's
//   provider switches (B7).

import { ApiError, OPERATIONS, standardErrors, statusOf, type Operation } from "@tadayo/contracts";
import { isObject, resolve, type ContractOperation, type Json, type JsonObject } from "./operations.ts";

export interface Answer {
  status: number;
  /** Lower-case names, as Node gives them. */
  headers: Readonly<Record<string, string>>;
  body: string;
}

export type Check = "shape" | "whitelist" | "world" | "keys" | "values";

export interface Finding {
  check: Check;
  at: string;
  what: string;
}

export interface WorldDrop {
  /** The author's membership interval. */
  author: string;
  day: string;
  /** Its caption now. */
  caption: string | null;
  /** The intervals in its audience that are still active. */
  audience: ReadonlySet<string>;
  /** The text of its comments that are still there. */
  comments: readonly string[];
}

export interface WorldDay {
  club: string;
  revealAt: Temporal.Instant;
}

export interface WorldMember {
  club: string;
  /** The name members see (FQ75: the name it ended with, once ended), or null while it has none. */
  name: string | null;
}

export interface WorldClub {
  name: string;
  /** The labels of its roster revisions' candidates. */
  labels: ReadonlySet<string>;
}

export interface WorldFacts {
  drops: ReadonlyMap<string, WorldDrop>;
  days: ReadonlyMap<string, WorldDay>;
  /** Each membership interval, active or not. */
  members: ReadonlyMap<string, WorldMember>;
  clubs: ReadonlyMap<string, WorldClub>;
  /**
   * What the world keeps back, each with the drops whose media it is: a photo's content version and
   * a video's link and post id are their drop's; storage keys, and the versions and links of uploads
   * and sources no drop holds, are no drop's. An avatar's version isn't kept back: it is part of a
   * person's display identity, shown before the reveal (FQ74, ADR-031).
   */
  canaries: ReadonlyMap<string, readonly string[]>;
}

export interface Viewer {
  /** The viewer's membership intervals, active or not; none for a caller without a session. */
  intervals: ReadonlySet<string>;
  /** Text that is the viewer's own: their profile's name, and the names they gave the people they blocked. */
  texts: ReadonlySet<string>;
}

export interface ScanContext {
  document: JsonObject;
  operation: ContractOperation;
  /** Whether the operation's row is the skeleton's NONE (rows.ts). */
  skeleton: boolean;
  viewer: Viewer;
  world: WorldFacts;
  /** The server's time of the answer, the cell's instant. */
  now: Temporal.Instant;
}

const NEUTRAL_BODY = '{"code":"NOT_FOUND"}';
const NO_STORE = "private, no-store";

/** Headers any answer may carry: the transport's. Cache-Control and a 429's Retry-After are checked apart. */
const HEADERS = new Set(["content-type", "content-length", "transfer-encoding", "date", "connection", "keep-alive"]);

/** T10's list for a caption card, with the two ids FQ74's answer keeps; `caption` is optional. */
const CAPTION_CARD = { required: ["view", "id", "author", "media_class"], optional: ["caption"] };
const CARD_AUTHOR = { required: ["membership_id", "display_name"], optional: ["avatar_version"] };
const MEDIA_CLASSES = new Set(["photo", "external_video"]);

/** A key that names one of T10's never-list or a way to reach media, as a word of the key. */
export const NEVER_KEY = new RegExp(
  "(^|_)(url|uri|href|src|link|token|thumbnail|thumb|poster|blur|blurhash|hash|colour|color|width|height|" +
    "dimension|aspect|ratio|embed|html|source|provider|alt|exif|captured|capture|duration|size|bytes|highlight|" +
    "title|waveform|original|media_version)s?(_|$)",
  "i",
);

/** A value that is a URL, a storage path or a provider's host. */
export const NEVER_VALUE = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /(^|[^a-z0-9])www\./i,
  /(^|[^a-z0-9])data:/i,
  /(^|[^a-z0-9])(uploads|renditions)\//i,
  /(tiktok|instagram)\.com/i,
];

/** The schemas whose values are text people wrote. */
const PEOPLE_TEXT = new Set(["Caption", "CommentText", "DisplayName", "ClubName", "CandidateLabel"]);

/** The fields each error code carries beside `code` (errors.ts), this file's own copy: no others. */
const ERROR_FIELDS: Readonly<Record<string, readonly string[]>> = {
  INVALID_REQUEST: ["field"],
  OCCURRENCE_CLOSED: ["target", "next_target"],
  QUOTA_FULL: ["target", "allowance", "next_target"],
  EXTERNAL_LIMIT: ["target", "allowance", "next_target"],
  VERSION_CONFLICT: ["current_version"],
  MEMBERSHIP_CHANGED: ["target", "current_id"],
  ROSTER_CHANGED: ["current_id"],
  DUPLICATE_DROP: ["existing_drop_id"],
  RATE_LIMITED: ["retry_after_seconds"],
};

/**
 * The drop references outside cards, by the schema that holds them and its field, each with whose
 * the drop must be, from the schema's own description: the viewer's own; the viewer's to read (their
 * own, or in an audience holding an active interval of theirs); or that, and opened.
 */
const REFERENCES: Readonly<Record<string, { field: string; form: "own" | "readable" | "opened" }>> = {
  OwnContribution: { field: "drop_id", form: "own" },
  DropReceipt: { field: "drop_id", form: "own" },
  DropVersion: { field: "drop_id", form: "own" },
  ReleasedReservation: { field: "drop_id", form: "own" },
  HighlightPointer: { field: "drop_id", form: "own" },
  Error: { field: "existing_drop_id", form: "own" },
  RemovedDrop: { field: "drop_id", form: "readable" },
  HiddenDrop: { field: "drop_id", form: "readable" },
  ReactionState: { field: "drop_id", form: "opened" },
  FavouriteState: { field: "drop_id", form: "opened" },
  CommentReceipt: { field: "drop_id", form: "opened" },
  ThreadNotifications: { field: "drop_id", form: "opened" },
  HighlightEntry: { field: "drop_id", form: "opened" },
  DayLink: { field: "cover_drop_id", form: "opened" },
};

function contractOperation(id: string): Operation {
  const operation = OPERATIONS.find((candidate) => candidate.id === id);
  if (!operation) throw new Error(`the contract has no operation ${id}`);
  return operation;
}

/** What the viewer may see of the world, from its rows and the cell's instant. */
interface Reader {
  /** The clubs the viewer has an interval in, active or not. */
  clubs: ReadonlySet<string>;
  drop(id: unknown): WorldDrop | undefined;
  own(drop: WorldDrop): boolean;
  inAudience(drop: WorldDrop): boolean;
  readable(drop: WorldDrop): boolean;
  opened(day: unknown): boolean;
  /** Whether a value kept back for `drops` may be shown: one of them readable, and opened. */
  shown(drops: readonly string[]): boolean;
  /** The text people wrote that the viewer may read. */
  texts: ReadonlySet<string>;
}

function readerOf(context: ScanContext): Reader {
  const { world, viewer, now } = context;
  const clubs = new Set<string>();
  for (const interval of viewer.intervals) {
    const member = world.members.get(interval);
    if (member) clubs.add(member.club);
  }
  const drop = (id: unknown) => (typeof id === "string" ? world.drops.get(id) : undefined);
  const own = (found: WorldDrop) => viewer.intervals.has(found.author);
  const inAudience = (found: WorldDrop) => [...found.audience].some((interval) => viewer.intervals.has(interval));
  const readable = (found: WorldDrop) => own(found) || inAudience(found);
  const opened = (day: unknown) => {
    const found = typeof day === "string" ? world.days.get(day) : undefined;
    return found !== undefined && Temporal.Instant.compare(found.revealAt, now) <= 0;
  };
  const shown = (drops: readonly string[]) =>
    drops.some((id) => {
      const found = drop(id);
      return found !== undefined && readable(found) && opened(found.day);
    });
  const texts = new Set(viewer.texts);
  for (const found of world.drops.values()) {
    if (!readable(found)) continue;
    if (found.caption !== null) texts.add(found.caption);
    if (opened(found.day)) for (const comment of found.comments) texts.add(comment);
  }
  for (const member of world.members.values()) {
    if (member.name !== null && clubs.has(member.club)) texts.add(member.name);
  }
  for (const [id, club] of world.clubs) {
    if (!clubs.has(id)) continue;
    texts.add(club.name);
    for (const label of club.labels) texts.add(label);
  }
  return { clubs, drop, own, inAudience, readable, opened, shown, texts };
}

/** Every object in `value`, with its path. */
function* objects(value: unknown, at = "$"): Generator<[JsonObject, string]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* objects(item, `${at}[${String(index)}]`);
  } else if (isObject(value)) {
    yield [value, at];
    for (const [key, child] of Object.entries(value)) yield* objects(child, `${at}.${key}`);
  }
}

/** Every string in `value`, with its path. */
function* strings(value: unknown, at = "$"): Generator<[string, string]> {
  if (typeof value === "string") yield [value, at];
  else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, `${at}[${String(index)}]`);
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) yield* strings(child, `${at}.${key}`);
  }
}

/**
 * Walks `value` along `schema`, resolving references and tagged unions: reports each key the schema
 * doesn't name, and the named schema each value has, by its path.
 */
function walk(
  document: JsonObject,
  schema: Json,
  value: unknown,
  at: string,
  name: string | undefined,
  out: { unknown: string[]; names: Map<string, string> },
): void {
  if (isObject(schema) && typeof schema.$ref === "string") {
    walk(document, resolve(document, schema), value, at, schema.$ref.split("/").pop(), out);
    return;
  }
  if (!isObject(schema)) return;
  if (Array.isArray(schema.oneOf)) {
    const discriminator = schema.discriminator;
    const property =
      isObject(discriminator) && typeof discriminator.propertyName === "string"
        ? discriminator.propertyName
        : undefined;
    const tag = property !== undefined && isObject(value) ? value[property] : undefined;
    const mapping = isObject(discriminator) && isObject(discriminator.mapping) ? discriminator.mapping : {};
    const chosen = typeof tag === "string" ? mapping[tag] : undefined;
    if (typeof chosen !== "string") out.unknown.push(`${at}: no member of the union for ${JSON.stringify(tag)}`);
    else walk(document, { $ref: chosen }, value, at, undefined, out);
    return;
  }
  if (name !== undefined && !Array.isArray(value)) out.names.set(at, name);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      walk(document, schema.items ?? null, item, `${at}[${String(index)}]`, undefined, out);
  } else if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key))
        walk(document, properties[key] ?? null, child, `${at}.${key}`, undefined, out);
      else if (isObject(schema.additionalProperties))
        walk(document, schema.additionalProperties, child, `${at}.${key}`, undefined, out);
      else out.unknown.push(`${at}.${key}`);
    }
  }
}

function exactKeys(node: JsonObject, list: { required: string[]; optional: string[] }): string[] {
  const allowed = new Set([...list.required, ...list.optional]);
  return [
    ...Object.keys(node)
      .filter((key) => !allowed.has(key))
      .map((key) => `has ${key}`),
    ...list.required.filter((key) => !Object.hasOwn(node, key)).map((key) => `lacks ${key}`),
  ];
}

/** The drop ids inside an object that holds one day (`occurrence`), each with its path. */
function dayReferences(node: JsonObject, at: string): [unknown, string][] {
  const found: [unknown, string][] = [];
  if (isObject(node.drop)) found.push([node.drop.id, `${at}.drop`]);
  for (const [field, key] of [
    ["drops", "id"],
    ["highlights", "drop_id"],
  ] as const) {
    const items = node[field];
    if (!Array.isArray(items)) continue;
    for (const [index, item] of items.entries()) {
      if (isObject(item)) found.push([item[key], `${at}.${field}[${String(index)}]`]);
    }
  }
  for (const field of ["drop_id", "cover_drop_id"]) {
    if (node[field] !== undefined) found.push([node[field], `${at}.${field}`]);
  }
  return found;
}

/** What the leak scanner finds in `answer`. An empty list is a clean answer. */
export function scan(answer: Answer, context: ScanContext): Finding[] {
  const findings: Finding[] = [];
  const find = (check: Check, at: string, what: string) => findings.push({ check, at, what });
  const operation = contractOperation(context.operation.id);
  const declared = context.operation.responses.get(answer.status);
  const reader = readerOf(context);
  // B0's skeleton answers the neutral NOT_FOUND on every path (docs/plans/B0.md, slice 7), 13 of
  // which declare no 404: allowed while the operation's row is NONE, and only that answer.
  const skeleton404 = context.skeleton && answer.status === 404 && declared === undefined;

  // shape: the status, the headers, the body.
  if (!declared && !skeleton404)
    find("shape", "status", `${String(answer.status)} isn't an answer ${operation.id} declares`);
  if (answer.status === 404 && answer.body !== NEUTRAL_BODY)
    find("shape", "body", "a not-found that isn't the neutral one (T14)");
  for (const [header, value] of Object.entries(answer.headers)) {
    const allowed =
      HEADERS.has(header) || header === "cache-control" || (header === "retry-after" && answer.status === 429);
    if (!allowed) find("shape", `header ${header}`, "a header no answer may carry before its slice allows it");
    for (const pattern of NEVER_VALUE) {
      if (pattern.test(value))
        find("values", `header ${header}`, `a URL, storage path or provider host: ${pattern.source}`);
    }
    for (const [canary, drops] of context.world.canaries) {
      if (value.includes(canary) && !reader.shown(drops))
        find("values", `header ${header}`, "a value the world keeps back (Q07)");
    }
  }
  // The contract's CacheControl: on every answer with a body; an empty one may leave it out.
  const cacheControl = answer.headers["cache-control"];
  if (answer.body === "" ? cacheControl !== undefined && cacheControl !== NO_STORE : cacheControl !== NO_STORE) {
    find(
      "shape",
      "header cache-control",
      "an answer with a body says private, no-store, and an empty one says that or nothing (T11, T12)",
    );
  }
  if (answer.status === 429) {
    const after = answer.headers["retry-after"] ?? "";
    if (!/^[1-9][0-9]{0,4}$/.test(after) || Number(after) > 86_400)
      find("shape", "header retry-after", "a 429 says the seconds to wait, 1 to 86400 (the contract's RetryAfter)");
  }
  let body: unknown;
  if (answer.body === "") {
    if (declared && declared.media.length > 0) find("shape", "body", "empty, where the operation declares a body");
  } else {
    if (answer.headers["content-type"] !== "application/json; charset=utf-8") {
      find("shape", "header content-type", "a body that isn't JSON: no answer may carry an image or other bytes yet");
    }
    try {
      body = JSON.parse(answer.body);
    } catch {
      find("shape", "body", "not JSON: no answer may carry an image or other bytes yet");
    }
  }
  if (body !== undefined) {
    if (answer.status >= 400) {
      const error = ApiError.safeParse(body);
      if (!error.success || !isObject(body)) find("shape", "$", "not the contract's Error");
      else {
        const code = error.data.code;
        const declaredCodes: string[] = [...standardErrors(operation), ...(operation.errors ?? [])];
        if (statusOf(code) !== answer.status) find("shape", "$.code", `${code} isn't a ${String(answer.status)}`);
        if (!declaredCodes.includes(code) && !(skeleton404 && code === "NOT_FOUND")) {
          find("shape", "$.code", `${code} isn't a code ${operation.id} declares`);
        }
        const fields = ERROR_FIELDS[code] ?? [];
        for (const key of Object.keys(body)) {
          if (key !== "code" && !fields.includes(key))
            find("shape", `$.${key}`, `a field ${code} doesn't carry (errors.ts)`);
        }
      }
    } else if (operation.ok.status === answer.status && "json" in operation.ok) {
      if (!operation.ok.json.safeParse(body).success) find("shape", "$", `not ${operation.id}'s declared answer`);
    } else {
      find("shape", "$", `a JSON body where ${operation.id} declares none`);
    }
  }
  const schema: Json = declared?.json ?? (skeleton404 ? { $ref: "#/components/schemas/Error" } : null);
  const walked = { unknown: [] as string[], names: new Map<string, string>() };
  if (body !== undefined) walk(context.document, schema, body, "$", undefined, walked);
  for (const at of walked.unknown) find("shape", at, "a key the contract doesn't name");

  // whitelist: T10's caption card, this file's own copy.
  for (const [node, at] of objects(body)) {
    if (node.view !== "caption") continue;
    for (const problem of exactKeys(node, CAPTION_CARD)) find("whitelist", at, `a caption card ${problem} (T10)`);
    if (typeof node.media_class !== "string" || !MEDIA_CLASSES.has(node.media_class)) {
      find("whitelist", `${at}.media_class`, "neither photo nor external_video (T10)");
    }
    if (!isObject(node.author)) find("whitelist", `${at}.author`, "not a person (T10)");
    else
      for (const problem of exactKeys(node.author, CARD_AUTHOR))
        find("whitelist", `${at}.author`, `${problem} (T10, FQ74)`);
  }

  // world: every card, drop reference, person, day and club against the world's rows.
  const world = context.world;
  const ownCards = new Set<JsonObject>();
  const whoReacted = (node: JsonObject, at: string, drop: WorldDrop) => {
    if (!Array.isArray(node.reactions) || reader.own(drop)) return;
    for (const [index, reaction] of node.reactions.entries()) {
      if (isObject(reaction) && reaction.people !== undefined)
        find(
          "world",
          `${at}.reactions[${String(index)}].people`,
          "who reacted, to someone but the drop's author (FQ73)",
        );
    }
  };
  for (const [node, at] of objects(body)) {
    const kind = walked.names.get(at);
    if (Object.hasOwn(node, "view")) {
      const drop = reader.drop(node.id);
      if (node.view !== "caption" && node.view !== "own" && node.view !== "revealed") {
        find("world", at, `a card whose view is ${JSON.stringify(node.view)}`);
      } else if (!drop) {
        find("world", at, "a card for a drop this world doesn't have");
      } else {
        if (node.view === "own") {
          if (reader.own(drop)) ownCards.add(node);
          else find("world", at, "someone else's drop as the viewer's own");
        } else if (!reader.inAudience(drop)) {
          find("world", at, "a drop whose audience holds no active interval of the viewer (T8, T9)");
        }
        if (node.view === "revealed" && !reader.opened(drop.day)) {
          find("world", at, "a revealed card before its day opens (T10)");
        }
        const author = isObject(node.author) ? node.author : {};
        if (author.membership_id !== drop.author) find("world", `${at}.author`, "not the drop's author");
        if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop's own caption");
        whoReacted(node, at, drop);
      }
    }
    const reference = kind === undefined ? undefined : REFERENCES[kind];
    if (reference !== undefined && node[reference.field] !== undefined) {
      const where = `${at}.${reference.field}`;
      const drop = reader.drop(node[reference.field]);
      if (!drop) find("world", where, "a drop this world doesn't have");
      else if (reference.form === "own") {
        if (!reader.own(drop)) find("world", where, `someone else's drop in the viewer's own ${String(kind)}`);
        if (kind === "OwnContribution" && (node.caption ?? null) !== drop.caption)
          find("world", `${at}.caption`, "not the drop's own caption");
      } else {
        if (!reader.readable(drop))
          find("world", where, "a drop whose audience holds no active interval of the viewer (T8, T9)");
        if (reference.form === "opened" && !reader.opened(drop.day))
          find("world", where, `a drop in a ${String(kind)} before its day opens (T10, FQ21)`);
        if (kind === "HighlightEntry" && isObject(node.author) && node.author.membership_id !== drop.author)
          find("world", `${at}.author`, "not the drop's author");
        if (kind === "ReactionState") whoReacted(node, at, drop);
      }
    }
    if (kind === "Person") {
      const member = typeof node.membership_id === "string" ? world.members.get(node.membership_id) : undefined;
      if (!member) find("world", at, "a person this world doesn't have");
      else {
        if (!reader.clubs.has(member.club)) find("world", at, "a person of a club the viewer has no interval in (T14)");
        if (node.display_name !== member.name) find("world", `${at}.display_name`, "not the name members see (FQ75)");
      }
    }
    if (kind === "Occurrence") {
      const day = typeof node.id === "string" ? world.days.get(node.id) : undefined;
      if (!day) find("world", at, "a day this world doesn't have");
      else {
        if (!reader.clubs.has(day.club)) find("world", at, "a day of a club the viewer has no interval in (T14)");
        if (node.club_id !== day.club) find("world", `${at}.club_id`, "not the day's club");
        const star = isObject(node.star) && typeof node.star.membership_id === "string" ? node.star.membership_id : "";
        if (world.members.get(star)?.club !== day.club) find("world", `${at}.star`, "not a member of the day's club");
      }
    }
    if (kind === "ClubRef" || kind === "ClubSummary") {
      const id = typeof node.id === "string" ? node.id : "";
      const club = world.clubs.get(id);
      if (!club) find("world", at, "a club this world doesn't have");
      else {
        if (!reader.clubs.has(id)) find("world", at, "a club the viewer has no interval in (T14)");
        if (node.name !== club.name) find("world", `${at}.name`, "not the club's name");
        const mine = typeof node.my_membership_id === "string" ? node.my_membership_id : "";
        if (!context.viewer.intervals.has(mine) || world.members.get(mine)?.club !== id)
          find("world", `${at}.my_membership_id`, "not the viewer's own interval in this club");
      }
    }
    if (kind === "DayLink") {
      const occurrence = isObject(node.occurrence) ? node.occurrence.id : undefined;
      if (!reader.opened(occurrence)) find("world", at, "a day link before the day opens");
    }
    // An object that holds one day holds that day's drops, and its club.
    const day = isObject(node.occurrence) && typeof node.occurrence.id === "string" ? node.occurrence.id : undefined;
    if (day !== undefined) {
      for (const [id, where] of dayReferences(node, at)) {
        const drop = reader.drop(id);
        if (drop && drop.day !== day) find("world", where, "a drop of another day than its object's");
      }
      const club = world.days.get(day)?.club;
      if (isObject(node.club) && club !== undefined && node.club.id !== club)
        find("world", `${at}.club`, "not the day's club");
    }
    if (node.stage === "revealed" && !reader.opened(day)) find("world", at, "a revealed day before it opens (T10)");
  }

  // keys: nothing that names media, but inside what has opened, the viewer's own card, and the
  // viewer's own highlight pointer (HighlightPointer, held to the viewer's own drop above).
  const opened = (node: JsonObject) =>
    (node.view === "revealed" && reader.opened(reader.drop(node.id)?.day)) ||
    (node.stage === "revealed" && isObject(node.occurrence) && reader.opened(node.occurrence.id));
  const keys = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) keys(item, `${at}[${String(index)}]`);
    } else if (isObject(value) && !opened(value) && !ownCards.has(value)) {
      for (const [key, child] of Object.entries(value)) {
        const path = `${at}.${key}`;
        if (NEVER_KEY.test(key) && walked.names.get(path) !== "HighlightPointer")
          find("keys", path, "a key that names a URL, token, provider, dimension, colour or highlight (T10)");
        keys(child, path);
      }
    }
  };
  keys(body, "$");

  // values: no URL or storage path but in text people wrote, which must be the viewer's to read;
  // nothing the world keeps back, but a drop's own once it has opened to this viewer.
  for (const [value, at] of strings(body)) {
    const name = walked.names.get(at);
    if (name !== undefined && PEOPLE_TEXT.has(name)) {
      if (!reader.texts.has(value)) find("values", at, "text people wrote that isn't the viewer's to read");
    } else {
      for (const pattern of NEVER_VALUE) {
        if (pattern.test(value)) find("values", at, `a URL, storage path or provider host: ${pattern.source}`);
      }
    }
    for (const [canary, drops] of world.canaries) {
      if (value.includes(canary) && !reader.shown(drops)) find("values", at, "a value the world keeps back (Q07)");
    }
  }
  return findings;
}
