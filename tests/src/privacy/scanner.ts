/// <reference lib="esnext.temporal" />
// The leak scanner (TECH-DESIGN section 8; T10, T12, T16; Q07): over every answer the privacy matrix
// produces, the author's included, it checks everything but the viewer's own, against the contract
// and against the world the matrix built. Its facts about the world come from the world's rows,
// never from the authorization module it tests.
//
// Five checks, each named in its findings, all run on every answer, so a test can show that a check
// it plants against is the one that catches it:
// - shape: the status, code, headers and body are what the operation declares, with no key the
//   contract doesn't name at any depth (a planted field);
// - whitelist: a caption card is exactly T10's list, as FQ74's answer reads it (this file's own
//   copy, so a contract change alone can't widen it);
// - world: each card, revealed day, highlight entry and day link agrees with the world: a drop the
//   world has, an audience the viewer is in, nothing revealed before its day opens, the viewer's own
//   only for the viewer, captions and names as the world stored them;
// - keys: no key that names a URL, a token, a provider, dimensions, colours, a highlight or another
//   of T10's never-list, but inside what has opened and the viewer's own card;
// - values: no URL, storage path or provider host in any value or header, no value the world keeps
//   back (a source's link or post id, a storage key, a content version), and text people wrote only
//   as the world stored it (T13 lets a caption hold a link of its own).
//
// The viewer's own answers that TECH-DESIGN section 8 excepts (the signed upload URL, which must name
// its intent's own object with overwriting off, and the replays of that intent; T40's source details
// to their resolver; the author preview to its author; the proposer's invitation link; the author's
// highlight pointer; the avatars' images; the config's provider switches) are each excepted by the
// slice that first returns them, with its rule and its tests. Until then any URL, image or key of
// the never-list in them fails here. Only the author's own drop card is excepted now.

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
  caption: string | null;
  /** The intervals in its audience that are still active. */
  audience: ReadonlySet<string>;
}

export interface WorldFacts {
  drops: ReadonlyMap<string, WorldDrop>;
  /** Each day's `reveal_at`. */
  days: ReadonlyMap<string, Temporal.Instant>;
  /** Each membership interval's name, as members see it (FQ75: the name it ended with, once ended). */
  names: ReadonlyMap<string, string>;
  /** Every text people wrote that the world stored: captions, names, club names, candidates' labels. */
  texts: ReadonlySet<string>;
  /** What no answer may hold while it's hidden: sources' links and post ids, storage keys, content versions. */
  canaries: ReadonlySet<string>;
}

export interface ScanContext {
  document: JsonObject;
  operation: ContractOperation;
  /** Whether the operation's row is the skeleton's NONE (rows.ts). */
  skeleton: boolean;
  /** The viewer's membership intervals, active or not. */
  viewer: ReadonlySet<string>;
  world: WorldFacts;
  /** The server's time of the answer, the cell's instant. */
  now: Temporal.Instant;
}

const NEUTRAL_BODY = '{"code":"NOT_FOUND"}';

/** Headers an answer may carry: the transport's, and the one every answer has (the contract). */
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

function contractOperation(id: string): Operation {
  const operation = OPERATIONS.find((candidate) => candidate.id === id);
  if (!operation) throw new Error(`the contract has no operation ${id}`);
  return operation;
}

function revealed(context: ScanContext, day: string | undefined): boolean {
  const revealAt = day === undefined ? undefined : context.world.days.get(day);
  return revealAt !== undefined && Temporal.Instant.compare(revealAt, context.now) <= 0;
}

function dropRevealed(context: ScanContext, drop: unknown): boolean {
  return typeof drop === "string" && revealed(context, context.world.drops.get(drop)?.day);
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

/** Every string in `value`, with its path, leaving out the subtrees `skip` names. */
function* strings(value: unknown, skip: (node: JsonObject) => boolean, at = "$"): Generator<[string, string]> {
  if (typeof value === "string") yield [value, at];
  else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, skip, `${at}[${String(index)}]`);
  } else if (isObject(value) && !skip(value)) {
    for (const [key, child] of Object.entries(value)) yield* strings(child, skip, `${at}.${key}`);
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

/** What the leak scanner finds in `answer`. An empty list is a clean answer. */
export function scan(answer: Answer, context: ScanContext): Finding[] {
  const findings: Finding[] = [];
  const find = (check: Check, at: string, what: string) => findings.push({ check, at, what });
  const operation = contractOperation(context.operation.id);
  const declared = context.operation.responses.get(answer.status);
  // B0's skeleton answers the neutral NOT_FOUND on every path (docs/plans/B0.md, slice 7), 13 of
  // which declare no 404: allowed while the operation's row is NONE, and only that answer.
  const skeleton404 = context.skeleton && answer.status === 404 && declared === undefined;

  // shape: the status, the headers, the body.
  if (!declared && !skeleton404)
    find("shape", "status", `${String(answer.status)} isn't an answer ${operation.id} declares`);
  if (skeleton404 && answer.body !== NEUTRAL_BODY)
    find("shape", "body", "a 404 the operation doesn't declare, and not the neutral one");
  for (const [header, value] of Object.entries(answer.headers)) {
    const allowed =
      HEADERS.has(header) || header === "cache-control" || (header === "retry-after" && answer.status === 429);
    if (!allowed) find("shape", `header ${header}`, "a header no answer may carry before its slice allows it");
    for (const pattern of NEVER_VALUE) {
      if (pattern.test(value))
        find("values", `header ${header}`, `a URL, storage path or provider host: ${pattern.source}`);
    }
    for (const canary of context.world.canaries) {
      if (value.includes(canary)) find("values", `header ${header}`, "a value the world keeps back");
    }
  }
  if (answer.headers["cache-control"] !== "private, no-store") {
    find("shape", "header cache-control", "every answer says private, no-store (T11, T12)");
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
      if (!error.success) find("shape", "$", "not the contract's Error");
      else {
        const declaredCodes: string[] = [...standardErrors(operation), ...(operation.errors ?? [])];
        if (statusOf(error.data.code) !== answer.status)
          find("shape", "$.code", `${error.data.code} isn't a ${String(answer.status)}`);
        if (!declaredCodes.includes(error.data.code) && !(skeleton404 && error.data.code === "NOT_FOUND")) {
          find("shape", "$.code", `${error.data.code} isn't a code ${operation.id} declares`);
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

  // world: cards, revealed days, highlight entries and day links against the world's rows.
  const ownCards = new Set<JsonObject>();
  for (const [node, at] of objects(body)) {
    if (Object.hasOwn(node, "view")) {
      const drop = typeof node.id === "string" ? context.world.drops.get(node.id) : undefined;
      if (node.view !== "caption" && node.view !== "own" && node.view !== "revealed") {
        find("world", at, `a card whose view is ${JSON.stringify(node.view)}`);
      } else if (!drop) {
        find("world", at, "a card for a drop this world doesn't have");
      } else if (node.view === "own") {
        if (context.viewer.has(drop.author)) ownCards.add(node);
        else find("world", at, "someone else's drop as the viewer's own");
      } else {
        if (![...drop.audience].some((interval) => context.viewer.has(interval))) {
          find("world", at, "a drop whose audience holds no active interval of the viewer (T8, T9)");
        }
        if (node.view === "revealed" && !revealed(context, drop.day)) {
          find("world", at, "a revealed card before its day opens (T10)");
        }
        if (node.view === "caption") {
          const author = isObject(node.author) ? node.author : {};
          if (author.membership_id !== drop.author) find("world", `${at}.author`, "not the drop's author");
          if (author.display_name !== context.world.names.get(drop.author))
            find("world", `${at}.author`, "not the author's name");
          if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop's own caption");
        }
      }
    }
    if (node.stage === "revealed") {
      const occurrence = isObject(node.occurrence) ? node.occurrence.id : undefined;
      if (typeof occurrence !== "string" || !revealed(context, occurrence)) {
        find("world", at, "a revealed day before it opens (T10)");
      }
    }
  }
  for (const [node, at] of objects(body)) {
    const kind = walked.names.get(at);
    if (kind === "HighlightEntry" && !dropRevealed(context, node.drop_id)) {
      find("world", at, "a highlight before its drop's day opens (T10, FQ21)");
    }
    if (kind === "DayLink") {
      const occurrence = isObject(node.occurrence) ? node.occurrence.id : undefined;
      if (typeof occurrence !== "string" || !revealed(context, occurrence))
        find("world", at, "a day link before the day opens");
      if (node.cover_drop_id !== undefined && !dropRevealed(context, node.cover_drop_id)) {
        find("world", `${at}.cover_drop_id`, "a cover before its drop's day opens (T10)");
      }
    }
  }

  // keys: nothing that names media, but inside what has opened and the viewer's own card.
  const opened = (node: JsonObject) =>
    (node.view === "revealed" && dropRevealed(context, node.id)) ||
    (node.stage === "revealed" &&
      isObject(node.occurrence) &&
      typeof node.occurrence.id === "string" &&
      revealed(context, node.occurrence.id));
  const skip = (node: JsonObject) => opened(node) || ownCards.has(node);
  const keys = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) keys(item, `${at}[${String(index)}]`);
    } else if (isObject(value) && !skip(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (NEVER_KEY.test(key))
          find("keys", `${at}.${key}`, "a key that names a URL, token, provider, dimension, colour or highlight (T10)");
        keys(child, `${at}.${key}`);
      }
    }
  };
  keys(body, "$");

  // values: no URL or storage path but in text people wrote, which must be the world's own.
  for (const [value, at] of strings(body, () => false)) {
    const name = walked.names.get(at);
    if (name !== undefined && PEOPLE_TEXT.has(name)) {
      if (!context.world.texts.has(value)) find("values", at, "text people wrote that the world didn't store");
      continue;
    }
    for (const pattern of NEVER_VALUE) {
      if (pattern.test(value)) find("values", at, `a URL, storage path or provider host: ${pattern.source}`);
    }
  }
  for (const [value, at] of strings(body, opened)) {
    for (const canary of context.world.canaries) {
      if (value.includes(canary)) find("values", at, "a value the world keeps back (Q07)");
    }
  }
  return findings;
}
