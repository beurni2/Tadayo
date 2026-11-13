// The contract's own tests: openapi.yaml is what the zod schemas say, every example is valid, the
// pre-reveal whitelist is exactly T10's, and the document keeps to what the Swift generator and Prism read.
import { readFileSync } from "node:fs";

import * as z from "zod";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { buildDocument } from "./document.ts";
import { ERRORS, ERROR_CODES, ApiError } from "./errors.ts";
import { standardErrors } from "./operation.ts";
import { OPERATIONS } from "./operations.ts";
import { registry } from "./registry.ts";
import { renderOpenApi } from "./render.ts";
import {
  CandidateLabel,
  CandidateLinkState,
  ChosenWeekdays,
  ConfirmedWeekdays,
  CurrentSchedule,
  InvitationAcceptance,
  RosterRevision,
} from "./schemas/clubs.ts";
import { Caption, ClubName, CommentText, DisplayName, NAME_PATTERN, Person, Timezone } from "./common.ts";
import { ReportNote, SearchText } from "./schemas/after.ts";
import { DropCaption } from "./schemas/days.ts";
import { unknownKeys } from "./strict.ts";
import { allSuccessExamples, errorExample } from "./fixtures/examples.ts";
import { member, rosters } from "./fixtures/world.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const document = buildDocument();
const schemas = (document.components as JsonObject).schemas as JsonObject;

function walk(node: Json, visit: (node: JsonObject, path: string) => void, path = "#"): void {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) walk(child, visit, `${path}/${String(index)}`);
  } else if (node !== null && typeof node === "object") {
    visit(node, path);
    for (const [key, child] of Object.entries(node)) walk(child, visit, `${path}/${key}`);
  }
}

/** The names of every schema reachable from `roots`, following $refs. */
function reachable(roots: Json[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const node = queue.pop() ?? null;
    walk(node, (object) => {
      const target = object.$ref;
      if (typeof target === "string" && target.startsWith("#/components/schemas/")) {
        const name = target.slice("#/components/schemas/".length);
        if (!seen.has(name)) {
          seen.add(name);
          queue.push(schemas[name] ?? null);
        }
      }
    });
  }
  return seen;
}

const operations: JsonObject[] = [];
for (const item of Object.values(document.paths as JsonObject)) {
  for (const operation of Object.values(item as JsonObject)) operations.push(operation as JsonObject);
}
const requestSchemas = reachable(operations.map((operation) => operation.requestBody ?? null));
const responseSchemas = reachable(operations.map((operation) => operation.responses ?? null));

describe("openapi.yaml", () => {
  it("is what the zod schemas generate (run `pnpm --filter @tadayo/contracts openapi:write`)", () => {
    const file = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");
    expect(file).toBe(renderOpenApi());
  });

  it("parses back to the same document, with no YAML anchors", () => {
    const text = renderOpenApi();
    expect(text).not.toMatch(/^\s*[^#\n]*[&*][A-Za-z0-9]+\s*$/m);
    expect(parse(text)).toEqual(document);
  });
});

describe("the document", () => {
  it("is OpenAPI 3.1 and every path is under /v1", () => {
    expect(document.openapi).toBe("3.1.0");
    for (const path of Object.keys(document.paths as JsonObject)) expect(path).toMatch(/^\/v1\//);
  });

  it("has no `const` and no `null` type, which the Swift generator doesn't read", () => {
    walk(document, (node, path) => {
      expect(node, path).not.toHaveProperty("const");
      const type = node.type;
      if (type === "null" || (Array.isArray(type) && type.includes("null"))) throw new Error(`${path}: a null type`);
    });
  });

  it("refuses unknown keys in requests only: a response may gain a field without breaking an older app", () => {
    for (const name of responseSchemas) {
      walk(schemas[name] ?? null, (node, path) => {
        if (node.additionalProperties === false)
          throw new Error(`${name}${path.slice(1)}: response refuses unknown keys`);
      });
    }
    for (const name of requestSchemas) {
      walk(schemas[name] ?? null, (node, path) => {
        // Every object in a request, nested ones included, refuses unknown keys; a record names its values.
        if (node.type === "object" && typeof node.additionalProperties !== "object") {
          expect(node.additionalProperties, `${name}${path.slice(1)}`).toBe(false);
        }
      });
    }
  });

  it("bounds a highlight rail by its contributors, not by six: members can leave and join while a day collects (T22)", () => {
    const day = schemas.RevealedDay as JsonObject;
    const rail = (day.properties as JsonObject).highlights as JsonObject;
    expect(rail.type).toBe("array");
    expect(rail.maxItems).toBeUndefined();
  });

  it("lists its schemas in code-unit order, the same in every locale", () => {
    const names = Object.keys(schemas);
    expect(names).toEqual([...names].sort());
  });

  it("names every oneOf member and maps every discriminator value to one", () => {
    walk(document, (node, path) => {
      const members = node.oneOf;
      if (!Array.isArray(members)) return;
      const refs = members.map((member) => (member as JsonObject).$ref);
      for (const ref of refs) expect(typeof ref, `${path}: a oneOf member must be a $ref`).toBe("string");
      const discriminator = node.discriminator as JsonObject | undefined;
      expect(discriminator, `${path}: a oneOf needs a discriminator`).toBeDefined();
      expect(Object.values((discriminator?.mapping ?? {}) as JsonObject).sort()).toEqual([...refs].sort());
    });
  });

  it("declares every query parameter its operation reads, each required exactly when it is", () => {
    for (const op of OPERATIONS) {
      const operation = ((document.paths as JsonObject)[op.path] as JsonObject)[op.method] as JsonObject;
      const declared = ((operation.parameters ?? []) as JsonObject[])
        .filter((parameter) => parameter.in === "query")
        .map((parameter) => [parameter.name, parameter.required]);
      const expected = Object.entries(op.query?.shape ?? {}).map(([name, field]) => [
        name,
        !(field as z.ZodType).safeParse(undefined).success,
      ]);
      expect(declared, op.id).toEqual(expected);
    }
  });

  it("puts every Id path parameter through the Id schema and every edit behind an Idempotency-Key", () => {
    for (const op of OPERATIONS) {
      const operation = ((document.paths as JsonObject)[op.path] as JsonObject)[op.method] as JsonObject;
      const parameters = (operation.parameters ?? []) as JsonObject[];
      for (const parameter of parameters.filter((p) => p.in === "path")) {
        expect(parameter.schema, `${op.id} ${JSON.stringify(parameter.name)}`).toEqual({
          $ref: "#/components/schemas/Id",
        });
      }
      const bodyName = nameOfBody(op.id);
      const body = bodyName ? schemas[bodyName] : undefined;
      if (body && JSON.stringify(body).includes("expected_version")) {
        expect(op.idempotent, `${op.id} carries an expected version, so a retry needs its key (T19)`).toBe(true);
      }
    }
  });

  it("answers a request it can't read with 400 INVALID_REQUEST, in the mock as in the API", () => {
    // Prism answers a request that fails validation with the operation's 422 if it has one, else its 400,
    // using that response's first example. So no operation has a 422, and every 400 starts with INVALID_REQUEST.
    for (const operation of operations) {
      const id = JSON.stringify(operation.operationId);
      const responses = operation.responses as JsonObject;
      expect(responses, id).not.toHaveProperty("422");
      const bad = responses["400"] as JsonObject;
      const examples = ((bad.content as JsonObject)["application/json"] as JsonObject).examples as JsonObject;
      expect(Object.keys(examples)[0], id).toBe("INVALID_REQUEST");
    }
  });

  it("uses every error code somewhere", () => {
    const used = new Set(OPERATIONS.flatMap((op) => [...standardErrors(op), ...(op.errors ?? [])]));
    for (const code of ERROR_CODES) expect(used.has(code), code).toBe(true);
  });

  it("says Cache-Control: private, no-store on every answer with a body, and an ETag on every image", () => {
    const headers = (document.components as JsonObject).headers as JsonObject;
    expect(((headers.CacheControl as JsonObject).schema as JsonObject).enum).toEqual(["private, no-store"]);
    for (const operation of operations) {
      for (const [status, response] of Object.entries(operation.responses as JsonObject)) {
        const where = `${JSON.stringify(operation.operationId)} ${status}`;
        const answer = response as JsonObject;
        if (!answer.content) continue;
        const declared = (answer.headers ?? {}) as JsonObject;
        expect(declared["Cache-Control"], where).toEqual({ $ref: "#/components/headers/CacheControl" });
        const types = Object.keys(answer.content as JsonObject);
        if (types.includes("image/jpeg")) {
          // A required ETag on an answer that may be a link's JSON would make the generated client refuse
          // the link, which has no image version to send.
          const etag = types.includes("application/json") ? "ImageETag" : "ETag";
          expect(declared.ETag, where).toEqual({ $ref: `#/components/headers/${etag}` });
          expect((headers[etag] as JsonObject).required, where).toBe(etag === "ETag");
          expect(types[0], `${where}: JSON comes before the image`).toBe(
            types.includes("application/json") ? "application/json" : "image/jpeg",
          );
        }
        if (status === "429")
          expect(declared["Retry-After"], where).toEqual({ $ref: "#/components/headers/RetryAfter" });
      }
    }
  });

  it("names no URL, token or secret in a response, at any depth, except the few the rules allow (T7, T12, T40)", () => {
    const allowed = new Set([
      "Upload.signed_upload", // the caller's own pending upload (T12)
      "SignedUpload.url",
      "InvitationLink.url", // to its proposer, once (T7)
      "Source.original_url", // to the caller who resolved it (T40)
      "ExternalVideoPreview.original_url", // to the author (T11, T40)
      "Embed.original_url", // after the reveal (spec 17)
      "Embed.player_url",
    ]);
    const pattern = /(^|_)(url|uri|href|src|link|download|token|secret|signed|storage|bucket|path|key)(_|$)/i;
    for (const name of responseSchemas) {
      walk(schemas[name] ?? null, (node, path) => {
        for (const key of Object.keys((node.properties ?? {}) as JsonObject)) {
          if (!pattern.test(key)) continue;
          // A top-level property is named by its schema; a nested one by where it sits.
          const where = path === "#" ? `${name}.${key}` : `${name}${path.slice(1)}.${key}`;
          expect(allowed.has(where), where).toBe(true);
        }
      });
    }
  });

  // Each set is pinned, so that changing one is a deliberate edit of this table.
  it("takes an Idempotency-Key exactly where a retry could repeat a change (T19)", () => {
    expect(
      OPERATIONS.filter((op) => op.idempotent)
        .map((op) => op.id)
        .sort(),
    ).toEqual([
      "acceptInvitation",
      "approveRoster",
      "blockMember",
      "chooseScheduleDays",
      "confirmScheduleDays",
      "createClub",
      "createComment",
      "createDrop",
      "createInvitation",
      "createReport",
      "createReservation",
      "createUpload",
      "declineRoster",
      "deleteAccount",
      "leaveClub",
      "proposeRoster",
      "removeDrop",
      "setClubNotificationPreferences",
      "setHighlight",
      "setNotificationPreferences",
      "updateComment",
      "updateDrop",
      "updateMe",
    ]);
  });

  it("needs no session for exactly the signed-out page and a logged-out device's removal", () => {
    expect(
      OPERATIONS.filter((op) => op.public)
        .map((op) => op.id)
        .sort(),
    ).toEqual(["previewInvitationWeb", "removeDevice"]);
    for (const op of OPERATIONS) {
      const operation = ((document.paths as JsonObject)[op.path] as JsonObject)[op.method] as JsonObject;
      expect(operation.security, op.id).toEqual(op.public ? [] : undefined);
    }
  });

  it("works before the profile is complete for exactly the account's own setup routes (FQ13, FQ69)", () => {
    expect(
      OPERATIONS.filter((op) => op.beforeProfile)
        .map((op) => op.id)
        .sort(),
    ).toEqual([
      "completeUpload",
      "createUpload",
      "deleteAccount",
      "deleteMyAvatar",
      "getConfig",
      "getMe",
      "getMyAvatar",
      "getUpload",
      "updateMe",
    ]);
  });

  it("gives each operation exactly its own errors, beyond those of its kind", () => {
    const own = Object.fromEntries(
      OPERATIONS.filter((op) => op.errors).map((op) => [op.id, [...(op.errors ?? [])].sort()]),
    );
    expect(own).toEqual({
      acceptInvitation: ["CLUB_FULL", "INVITATION_EXPIRED", "NOT_FOUND", "ROSTER_CHANGED", "VERSION_CONFLICT"],
      approveRoster: ["CLUB_FULL", "ROSTER_CHANGED", "VERSION_CONFLICT"],
      blockMember: ["MEMBERSHIP_CHANGED", "NOT_FOUND"],
      chooseScheduleDays: ["MEMBERSHIP_CHANGED", "NOT_ALLOWED", "VERSION_CONFLICT"],
      completeUpload: ["MEDIA_NOT_READY"],
      confirmScheduleDays: ["MEMBERSHIP_CHANGED", "NOT_ALLOWED", "VERSION_CONFLICT"],
      createInvitation: ["NOT_ALLOWED"],
      createDrop: [
        "CAPTION_CONTAINS_SOURCE",
        "DUPLICATE_DROP",
        "EXTERNAL_LIMIT",
        "MEDIA_NOT_READY",
        "MEMBERSHIP_CHANGED",
        "OCCURRENCE_CLOSED",
        "QUOTA_FULL",
      ],
      createReport: ["NOT_FOUND"],
      createReservation: ["EXTERNAL_LIMIT", "MEMBERSHIP_CHANGED", "OCCURRENCE_CLOSED", "QUOTA_FULL"],
      createUpload: ["MEMBERSHIP_CHANGED", "NOT_FOUND", "OCCURRENCE_CLOSED", "PROFILE_INCOMPLETE"],
      declineRoster: ["ROSTER_CHANGED", "VERSION_CONFLICT"],
      getMyAvatar: ["NOT_FOUND"],
      listFavourites: ["NOT_FOUND"],
      listMemories: ["NOT_FOUND"],
      previewInvitation: ["NOT_FOUND"],
      proposeRoster: ["CLUB_FULL", "VERSION_CONFLICT"],
      resolveSource: ["PROVIDER_UNSUPPORTED"],
      revokeInvitation: ["NOT_ALLOWED"],
      searchMemories: ["NOT_FOUND"],
      setClubNotificationPreferences: ["VERSION_CONFLICT"],
      setHighlight: ["MEMBERSHIP_CHANGED", "OCCURRENCE_CLOSED", "VERSION_CONFLICT"],
      setNotificationPreferences: ["VERSION_CONFLICT"],
      setReaction: ["NOT_ALLOWED"],
      updateComment: ["VERSION_CONFLICT"],
      updateDrop: [
        "CAPTION_CONTAINS_SOURCE",
        "DUPLICATE_DROP",
        "MEDIA_NOT_READY",
        "MEMBERSHIP_CHANGED",
        "OCCURRENCE_CLOSED",
        "VERSION_CONFLICT",
      ],
      updateMe: ["MEDIA_NOT_READY", "NOT_FOUND", "VERSION_CONFLICT"],
    });
  });

  it("names, in a schema's description, every rule on a request the document can't carry", () => {
    // Each refined schema, with the words its description must use to say the rule.
    const names = /grapheme clusters, well formed \(no lone surrogate\).*at least one visible character/s;
    const text = /grapheme clusters.*well formed \(no lone surrogate\)/s;
    const RULES: Record<string, RegExp> = {
      AgeConfirmation: /only `true`/,
      CandidateLabel: names,
      Caption: text,
      ChosenWeekdays: /each only once/,
      ClubName: names,
      CommentText: text,
      ConfirmedWeekdays: /each only once/,
      DisplayName: names,
      ReportNote: text,
      SearchText: text,
      Timezone: /an IANA time zone the server can resolve/,
    };
    // Grapheme counts, well-formedness and "only true" are zod refinements: the document can't say them, so Prism and
    // the Swift client don't check them, and the API answers INVALID_REQUEST. Each sits in a named
    // schema whose description says the rule, for the app to keep.
    const refined: string[] = [];
    const visit = (schema: z.ZodType, path: string): void => {
      const def = schema._zod.def as unknown as {
        type: string;
        checks?: { _zod: { def: { check: string } } }[];
        shape?: Record<string, z.ZodType>;
        innerType?: z.ZodType;
        element?: z.ZodType;
        options?: z.ZodType[];
      };
      if ((def.checks ?? []).some((check) => check._zod.def.check === "custom")) {
        const meta = registry.get(schema);
        refined.push(meta ? meta.id : `${path} (unnamed)`);
        if (meta) expect(meta.description, meta.id).toMatch(RULES[meta.id] ?? /a rule this test doesn't know/);
      }
      for (const [key, child] of Object.entries(def.shape ?? {})) visit(child, `${path}.${key}`);
      if (def.innerType) visit(def.innerType, path);
      if (def.element) visit(def.element, `${path}[]`);
      for (const option of def.options ?? []) visit(option, path);
    };
    for (const op of OPERATIONS) if (op.body) visit(op.body, op.id);
    expect([...new Set(refined)].sort()).toEqual(Object.keys(RULES).sort());
  });
});

describe("the pre-reveal whitelist (T10)", () => {
  const without = (node: Json): Json => {
    // The shape alone: descriptions are words, not fields.
    if (Array.isArray(node)) return node.map(without);
    if (node === null || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "description")
        .map(([k, v]) => [k, without(v)]),
    );
  };

  it("is exactly the caption, the sender's display identity and the media class, with an opaque id", () => {
    expect(Object.keys(DropCaption.shape).sort()).toEqual(["author", "caption", "id", "media_class", "view"]);
    expect(Object.keys(Person.shape).sort()).toEqual(["avatar_version", "display_name", "membership_id"]);
    expect(without(schemas.DropCaption ?? null)).toEqual({
      type: "object",
      properties: {
        view: { type: "string", enum: ["caption"] },
        id: { $ref: "#/components/schemas/Id" },
        author: { $ref: "#/components/schemas/Person" },
        media_class: { $ref: "#/components/schemas/MediaClass" },
        caption: { $ref: "#/components/schemas/Caption" },
      },
      required: ["view", "id", "author", "media_class"],
    });
    expect(without(schemas.Person ?? null)).toEqual({
      type: "object",
      properties: {
        membership_id: { $ref: "#/components/schemas/Id" },
        display_name: { $ref: "#/components/schemas/DisplayName" },
        avatar_version: { $ref: "#/components/schemas/ContentVersion" },
      },
      required: ["membership_id", "display_name"],
    });
    expect((schemas.MediaClass as JsonObject).enum).toEqual(["photo", "external_video"]);
  });

  it("is all a day before the reveal can hold: nothing revealed, no rail, no count (T10, T15)", () => {
    expect(Object.keys((schemas.UpcomingDay as JsonObject).properties as JsonObject).sort()).toEqual([
      "add_target",
      "club",
      "drops",
      "next_cursor",
      "occurrence",
      "server_now",
      "stage",
      "viewer",
    ]);
    // Everything an upcoming day can reach. A schema added here is a field a non-author may see before
    // 7 AM, so it changes only with T10.
    expect([...reachable([{ $ref: "#/components/schemas/UpcomingDay" }])].sort()).toEqual([
      "Caption",
      "ClubName",
      "ClubRef",
      "ContentVersion",
      "Cursor",
      "DisplayName",
      "DropCaption",
      "DropOwn",
      "Id",
      "Instant",
      "LocalDate",
      "MediaClass",
      "Occurrence",
      "OccurrencePhase",
      "OwnDropState",
      "Person",
      "Timezone",
      "UpcomingDay",
      "UpcomingDropCard",
      "Version",
      "ViewerDay",
    ]);
    for (const name of ["ViewerDay", "Occurrence", "ClubRef"]) {
      expect(Object.keys((schemas[name] as JsonObject).properties as JsonObject).sort(), name).toEqual(
        {
          ViewerDay: ["is_star", "joined_later"],
          Occurrence: ["close_at", "club_id", "id", "local_date", "phase", "reveal_at", "star"],
          ClubRef: ["id", "my_membership_id", "name", "timezone"],
        }[name],
      );
    }
  });
});

describe("a roster revision's candidates (FQ66, handoff 1)", () => {
  it("show every member a candidate's id, one name and proposer, and the link's state only in the proposer's part", () => {
    // Every active member gets a revision's candidates. A field added here tells them something about a
    // candidate, such as whether they have accepted, which handoff 1 keeps to the proposer.
    expect(Object.keys((schemas.Candidate as JsonObject).properties as JsonObject).sort()).toEqual([
      "id",
      "invitation",
      "name",
      "proposed_by",
    ]);
    expect(Object.keys((schemas.CandidateInvitation as JsonObject).properties as JsonObject).sort()).toEqual([
      "expires_at",
      "id",
      "state",
    ]);
  });
});

describe("names (FQ70)", () => {
  const good = ["Ben", "Ana María", "Zoë", "Zoe\u0308", "李", "क्", "Debby O'Neil", "👨‍👩‍👧"];
  const bad = [
    "",
    "   ",
    " Ben",
    "Ben ",
    "\u00A0Ben",
    "\u202Eneb",
    "Ben\u0000",
    "Be\nn",
    "\u2066x",
    "a\u200Fb",
    "x\u2028y",
    // Nothing to see: a zero-width space, a word joiner, a soft hyphen, the blank fillers, marks with nothing
    // to sit on, and characters Unicode says to draw as nothing.
    "\u200B",
    "\u2060\u2060",
    "\u00AD",
    "\u115F",
    "\u3164",
    "\u2800",
    "\uFFA0",
    "\u200B\u200D\u200B",
    "\u0308",
    "\u034F",
    "\uFE0F",
    "\uFE00\uFE01",
    "\u17B4",
    "\u180B",
    "\u{E0100}",
    "\u{16FE4}",
  ];
  const documentPattern = new RegExp((schemas.DisplayName as JsonObject).pattern as string, "u");

  for (const schema of [DisplayName, ClubName, CandidateLabel]) {
    it(`${String(registry.get(schema)?.id)} keeps a name plain, in zod and in the document alike`, () => {
      for (const value of good) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(true);
      for (const value of bad) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
      expect(documentPattern.source).toBe(NAME_PATTERN.source);
      for (const value of [...good, ...bad.filter(Boolean)]) {
        expect(documentPattern.test(value), JSON.stringify(value)).toBe(NAME_PATTERN.test(value));
      }
    });
  }
});

describe("text's guard and its well-formedness (T13, FQ70)", () => {
  // Every schema made by text() or name(), with its guard: 16 code points a cluster (zod's `.max` and the
  // document's `maxLength` both count code points, not UTF-16 units).
  const GUARDED: [z.ZodType, number][] = [
    [DisplayName, 640],
    [ClubName, 640],
    [CandidateLabel, 640],
    [Caption, 2240],
    [CommentText, 8000],
    [ReportNote, 8000],
    [SearchText, 1600],
  ];
  const nameOf = (schema: z.ZodType): string => String(registry.get(schema)?.id);

  for (const [schema, guard] of GUARDED) {
    it(`${nameOf(schema)} never counts a string past its guard of ${String(guard)} code points`, () => {
      expect((schemas[nameOf(schema)] as JsonObject).maxLength).toBe(guard);
      const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
      try {
        for (const value of ["a".repeat(guard + 1), "a".repeat(1_000_000)]) {
          const result = schema.safeParse(value);
          expect(result.success ? [] : result.error.issues.map((issue) => issue.code)).toEqual(["too_big"]);
        }
        expect(segment).not.toHaveBeenCalled();
        schema.safeParse("a".repeat(guard));
        expect(segment).toHaveBeenCalledTimes(1);
      } finally {
        segment.mockRestore();
      }
    });

    it(`${nameOf(schema)} refuses a lone surrogate and keeps a surrogate pair`, () => {
      for (const value of ["A\uD800B", "\uDC00", "Ana\uD83D", "\uDE00Ana", "\uD83D\uD83D", "\uDE00\uD83D"]) {
        const result = schema.safeParse(value);
        expect(result.success, JSON.stringify(value)).toBe(false);
        expect(result.success ? [] : result.error.issues.map((issue) => issue.path), JSON.stringify(value)).toEqual([
          [],
        ]);
      }
      expect(schema.safeParse("Ana \u{1F600}").success).toBe(true);
    });
  }

  it("counts code points at the guard, not code units: a cluster of 640 code points is one name", () => {
    // A black flag and 639 tag characters: one grapheme cluster, 640 code points, 1,280 code units.
    const longest = `\u{1F3F4}${"\u{E0067}".repeat(639)}`;
    expect(longest.length).toBe(1280);
    expect(DisplayName.safeParse(longest).success).toBe(true);
    expect(DisplayName.safeParse(`${longest}\u{E0067}`).success).toBe(false);
  });
});

describe("other request rules", () => {
  it("takes only a time zone the server can resolve, since a club's is fixed (FQ19)", () => {
    for (const zone of ["America/New_York", "Europe/London", "Asia/Kolkata", "UTC", "Etc/GMT+5"]) {
      expect(Timezone.safeParse(zone).success, zone).toBe(true);
    }
    for (const zone of ["Mars/Base", "Not_A_Zone", "America/Nowhere", "+05", "-05", "+0500", "-0500"]) {
      expect(Timezone.safeParse(zone).success, zone).toBe(false);
    }
  });

  it("takes only a name Temporal resolves back to itself, as the server's clubTimeZone does (T2)", () => {
    // Every name that fits the pattern and that Intl.DateTimeFormat takes but Temporal refuses, on Node
    // 26.13.0 (tzdata 2026e): ICU's three-letter ids, the SystemV zones and two retired links. Intl reads
    // some as zones nobody would mean (BST as Asia/Dhaka, NST as Pacific/Auckland, ART as Africa/Cairo),
    // and the server couldn't find a club's days in any of them.
    const intlOnly = [
      ...["ACT", "AET", "AGT", "ART", "AST", "BET", "BST", "CAT", "CNT", "CST", "CTT", "EAT", "ECT"],
      ...["IET", "IST", "JST", "MIT", "NET", "NST", "PLT", "PNT", "PRT", "PST", "SST", "VST"],
      ...["AST4", "AST4ADT", "CST6", "CST6CDT", "EST5", "EST5EDT", "HST10"].map((zone) => `SystemV/${zone}`),
      ...["MST7", "MST7MDT", "PST8", "PST8PDT", "YST9", "YST9YDT"].map((zone) => `SystemV/${zone}`),
      "US/Pacific-New",
      "Canada/East-Saskatchewan",
    ];
    for (const zone of intlOnly) {
      expect(Timezone.safeParse(zone).success, zone).toBe(false);
    }
    // Temporal reads a string that starts with T as an ISO time and takes its offset, or UTC for Z: these
    // fit the pattern, and aren't zones.
    for (const zone of ["T07+05", "t0000-0330", "T07-00", "T0700+0530", "T07Z", "t0700z"]) {
      expect(Timezone.safeParse(zone).success, zone).toBe(false);
    }
    // An offset in Temporal's own spelling resolves to itself, and isn't a zone either.
    for (const zone of ["+05:00", "-03:30", "+00:00"]) {
      expect(Timezone.safeParse(zone).success, zone).toBe(false);
    }
    // Any case, as clubTimeZone, which keeps Temporal's spelling; and the old names Temporal keeps.
    for (const zone of ["europe/london", "AMERICA/NEW_YORK", "Asia/Calcutta", "US/Eastern", "GMT", "EST5EDT"]) {
      expect(Timezone.safeParse(zone).success, zone).toBe(true);
    }
    // And every zone the runtime knows, so the check never refuses a real one.
    for (const zone of Intl.supportedValuesOf("timeZone")) {
      expect(Timezone.safeParse(zone).success, zone).toBe(true);
    }
  });

  it("takes each weekday only once in a choice, and a choice of none to two; a confirmation names one or two (T6)", () => {
    // A two-day picker removes a choice on a tap, the last one too (handoff 6), so a choice may hold none.
    for (const days of [[], ["monday"], ["monday", "thursday"]]) {
      expect(ChosenWeekdays.safeParse(days).success, JSON.stringify(days)).toBe(true);
    }
    for (const days of [
      ["monday", "monday"],
      ["monday", "tuesday", "thursday"],
    ]) {
      expect(ChosenWeekdays.safeParse(days).success, JSON.stringify(days)).toBe(false);
    }
    for (const days of [["monday"], ["monday", "thursday"]]) {
      expect(ConfirmedWeekdays.safeParse(days).success, JSON.stringify(days)).toBe(true);
    }
    for (const days of [[], ["monday", "monday"], ["monday", "tuesday", "thursday"]]) {
      expect(ConfirmedWeekdays.safeParse(days).success, JSON.stringify(days)).toBe(false);
    }
  });

  it("holds one confirmed day as the schedule in force, while others still choose (FQ55)", () => {
    const one = { weekday: "tuesday", person: { membership_id: "mem_sp_maya", display_name: "Maya" } };
    expect(CurrentSchedule.safeParse({ effective_from: "2026-11-02", assignments: [one] }).success).toBe(true);
    expect(CurrentSchedule.safeParse({ effective_from: "2026-11-02", assignments: [] }).success).toBe(false);
  });

  it("puts no free text in a URL: every path and query parameter has a fixed shape (T52)", () => {
    // Search text, captions, notes and comments travel in bodies. A parameter is an enum, an integer, or a
    // string whose anchored pattern refuses a space, so none of them can carry what someone wrote.
    const resolve = (node: JsonObject): JsonObject => {
      const target = node.$ref;
      return typeof target === "string"
        ? resolve(schemas[target.slice("#/components/schemas/".length)] as JsonObject)
        : node;
    };
    for (const operation of operations) {
      for (const parameter of (operation.parameters ?? []) as JsonObject[]) {
        if (parameter.$ref) continue; // the Idempotency-Key header
        const where = JSON.stringify([operation.operationId, parameter.in, parameter.name]);
        expect(["path", "query"], where).toContain(parameter.in);
        const schema = resolve(parameter.schema as JsonObject);
        if (Array.isArray(schema.enum) || schema.type === "integer") continue;
        expect(schema.type, where).toBe("string");
        const pattern = typeof schema.pattern === "string" ? schema.pattern : "";
        expect(pattern, where).toMatch(/^\^.*\$$/);
        expect(new RegExp(pattern, "u").test("two words"), where).toBe(false);
      }
    }
  });

  it("gives a signed upload URL only in createUpload's answer (T12)", () => {
    for (const operation of operations) {
      for (const response of Object.values(operation.responses as JsonObject)) {
        const reached = reachable([response]);
        if (reached.has("SignedUpload")) expect(operation.operationId).toBe("createUpload");
      }
    }
  });
});

describe("the examples", () => {
  const examples = allSuccessExamples();

  it("belong to operations that exist, and every JSON answer has at least one", () => {
    const ids = new Set(OPERATIONS.map((op) => op.id));
    for (const id of Object.keys(examples)) expect(ids.has(id), id).toBe(true);
    for (const op of OPERATIONS) {
      if ("json" in op.ok && !("binary" in op.ok)) expect(examples[op.id], op.id).toBeDefined();
    }
  });

  for (const op of OPERATIONS) {
    const set = examples[op.id];
    if (!set || !("json" in op.ok)) continue;
    const schema = op.ok.json;
    for (const [name, example] of Object.entries(set)) {
      it(`${op.id}: ${name} matches its schema, with no key it doesn't name`, () => {
        const result = schema.safeParse(example.value);
        expect(result.success ? "" : JSON.stringify(result.error.issues, null, 2)).toBe("");
        expect(
          unknownKeys(document, { $ref: `#/components/schemas/${String(registry.get(schema)?.id)}` }, example.value),
        ).toEqual([]);
      });
    }
  }

  it("give each error only the fields its code names, and a missed or full day its next date (T4)", () => {
    const fields = Object.keys(ApiError.shape).filter((key) => key !== "code");
    for (const code of ERROR_CODES) {
      const named = new Set([...ERRORS[code][1].matchAll(/`([a-z_]+)`/g)].map((match) => match[1]));
      const present = Object.keys(errorExample(code) as JsonObject).filter((key) => key !== "code");
      for (const key of present) {
        expect(fields, `${code}.${key}`).toContain(key);
        expect(named.has(key), `${code} names ${key}`).toBe(true);
      }
    }
    for (const code of ["OCCURRENCE_CLOSED", "QUOTA_FULL", "EXTERNAL_LIMIT"] as const) {
      expect(Object.keys(errorExample(code) as JsonObject), code).toEqual(
        expect.arrayContaining(["target", "next_target"]),
      );
    }
  });

  for (const code of ERROR_CODES) {
    it(`the ${code} example is a valid error with its own code`, () => {
      const value = errorExample(code);
      expect(ApiError.safeParse(value).success).toBe(true);
      expect(unknownKeys(document, { $ref: "#/components/schemas/Error" }, value)).toEqual([]);
      expect((value as { code: string }).code).toBe(code);
    });
  }

  // The scenes are independent (book p12), but one id is one thing in all of them.
  it("agree with each other on every drop, day and invitation they share", () => {
    const seen = new Map<string, string>();
    const remember = (key: string, facts: unknown, where: string): void => {
      const text = JSON.stringify(facts);
      const earlier = seen.get(key);
      if (earlier === undefined) seen.set(key, text);
      else expect(text, `${key} in ${where}`).toBe(earlier);
    };
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          if (typeof node.view === "string" && typeof node.id === "string") {
            remember(
              `drop ${node.id}`,
              [(node.author as JsonObject).membership_id, node.caption ?? null, node.media_class],
              `${id}.${name}`,
            );
          }
          if (typeof node.reveal_at === "string" && typeof node.id === "string") {
            remember(
              `day ${node.id}`,
              [node.local_date, node.reveal_at, node.close_at, (node.star as JsonObject).membership_id],
              `${id}.${name}`,
            );
          }
          // Every scene is Ben's, so a day has one cover for him wherever it appears (D08).
          if (
            typeof node.cover_drop_id === "string" &&
            node.occurrence !== null &&
            typeof node.occurrence === "object"
          ) {
            remember(
              `cover ${JSON.stringify((node.occurrence as JsonObject).id)}`,
              node.cover_drop_id,
              `${id}.${name}`,
            );
          }
          // A candidate's link names its invitation by `id`; a link and a preview, by `invitation_id`.
          const invitation = typeof node.invitation_id === "string" ? node.invitation_id : node.id;
          if (typeof invitation === "string" && invitation.startsWith("inv_") && typeof node.expires_at === "string") {
            remember(`invitation ${invitation}`, node.expires_at, `${id}.${name}`);
          }
        });
      }
    }
  });

  it("give a comment's version only to its author, Ben", () => {
    let own = 0;
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          if (typeof node.text !== "string" || typeof node.edited !== "boolean") return;
          const author = (node.author as JsonObject).membership_id;
          const bens = typeof author === "string" && author.endsWith("_ben");
          if (bens) own += 1;
          expect("version" in node, `${id}.${name}: ${JSON.stringify(node.id)}`).toBe(bens);
        });
      }
    }
    expect(own).toBeGreaterThan(0);
  });

  // The schedule's views (book p11; FQ46, FQ48, FQ55, FQ78, FQ79, FQ81, FQ98). A Schedule names its
  // viewer (`club.my_membership_id`); a ScheduleProposal answer doesn't, so this table does.
  const PROPOSAL_VIEWERS: Record<string, string> = {
    "chooseScheduleDays.chosen": "mem_sp_ben",
    "chooseScheduleDays.joined_contest": "mem_sp_sam",
    "confirmScheduleDays.confirmed": "mem_kt_ben",
    "confirmScheduleDays.first_day_confirmed": "mem_sp_ben",
  };
  // The order each club's members joined in: the fixture's rosters, then Leila in Kitchen table.
  const joined = new Map<string, number>([
    ...rosters.sundayPeople.map(([who], index) => [member("sundayPeople", who).membership_id, index] as const),
    ...[...rosters.kitchenTable.map(([who]) => who), "leila" as const].map(
      (who, index) => [member("kitchenTable", who).membership_id, index] as const,
    ),
  ]);
  const asText = (value: Json | undefined): string => (typeof value === "string" ? value : JSON.stringify(value));
  const idOf = (person: Json | undefined): string => asText((person as JsonObject).membership_id);
  type Read = { where: string; viewer: string; proposal: JsonObject };
  const reads = (): Read[] => {
    const found: Read[] = [];
    for (const [name, example] of Object.entries(examples.getSchedule ?? {})) {
      const value = example.value as JsonObject;
      if (value.proposal === undefined) continue;
      const viewer = asText((value.club as JsonObject).my_membership_id);
      found.push({ where: `getSchedule.${name}`, viewer, proposal: value.proposal as JsonObject });
    }
    for (const id of ["chooseScheduleDays", "confirmScheduleDays"]) {
      for (const [name, example] of Object.entries(examples[id] ?? {})) {
        const where = `${id}.${name}`;
        const viewer = PROPOSAL_VIEWERS[where];
        expect(viewer, `${where} has a viewer in PROPOSAL_VIEWERS`).toBeDefined();
        found.push({ where, viewer: String(viewer), proposal: example.value as JsonObject });
      }
    }
    return found;
  };
  const slotsOf = (proposal: JsonObject): JsonObject[] => proposal.slots as JsonObject[];

  it("say on each day only what its state allows, and name nobody on a day the viewer doesn't hold with others (book p11, FQ46, FQ48, FQ78)", () => {
    const seen = { taken: 0, clash: 0, no_reveal: 0, held_by: 0, three: 0, change: 0 };
    for (const { where, viewer, proposal } of reads()) {
      const change = proposal.reason === "membership_change";
      if (change) seen.change += 1;
      for (const slot of slotsOf(proposal)) {
        const at = `${where}: ${asText(slot.weekday)}`;
        const state = asText(slot.state);
        if (state === "taken" || state === "clash" || state === "no_reveal") seen[state] += 1;
        // A taken day names its owner; a contested day names its holders to them alone; a day one other
        // member holds names them on the picker; nothing else names anyone, a no_reveal day least of all.
        expect("owner" in slot, at).toBe(state === "taken");
        expect("holders" in slot, at).toBe(state === "clash");
        if ("held_by" in slot) {
          seen.held_by += 1;
          expect(state, at).toBe("available");
          expect(idOf(slot.held_by), at).not.toBe(viewer);
          // In the first days only a viewer still choosing is told; a confirmed one sees the club's week.
          if (!change) expect(proposal.my_state, at).toBe("choosing");
        }
        if (state === "clash") {
          const ids = (slot.holders as Json[]).map(idOf);
          expect(ids.length, at).toBeGreaterThanOrEqual(2);
          expect(new Set(ids).size, at).toBe(ids.length);
          expect(
            ids.filter((id) => id === viewer),
            at,
          ).toHaveLength(1);
          const order = ids.map((id) => joined.get(id) ?? Number.NaN);
          expect(order, at).toEqual([...order].sort((a, b) => a - b));
          if (ids.length >= 3) seen.three += 1;
        }
        // A membership change is one week everyone confirms: no day is taken or contested on its own,
        // and Kitchen table's gives every weekday to someone, so each of the others' days names them.
        if (change) {
          expect(["yours", "available"], at).toContain(state);
          if (state === "available") expect("held_by" in slot, at).toBe(true);
        }
      }
    }
    // Each view the questions define has a scene, so none of these checks is empty.
    for (const [view, count] of Object.entries(seen)) expect(count, view).toBeGreaterThan(0);
  });

  it("propose each member's first day by the order they joined, as the frames draw it (spec 05, FQ98)", () => {
    // Friends lists the first days in join order (FQ98), and a contested day's holders are in that order
    // too, while the frames draw both in the proposed week's order (F01-friends-first-days,
    // G04-conflict-three). The two agree because the fixture's first days propose weekdays in join order,
    // as spec 05's own examples do: this ties them.
    let checked = 0;
    for (const { where, viewer, proposal } of reads()) {
      if (proposal.reason !== "activation") continue;
      const index = joined.get(viewer) ?? -1;
      const weekday = rosters.sundayPeople[index]?.[1];
      const suggested = slotsOf(proposal)
        .filter((slot) => slot.suggested === true)
        .map((slot) => slot.weekday);
      expect(suggested, where).toEqual([weekday]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("date only a day confirmed in the first days, on its own weekday (T49, FQ79)", () => {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    let dated = 0;
    for (const { where, proposal } of reads()) {
      const firstDays = proposal.reason === "activation";
      for (const slot of slotsOf(proposal)) {
        const at = `${where}: ${asText(slot.weekday)}`;
        const confirmed = slot.state === "taken" || (slot.state === "yours" && proposal.my_state === "confirmed");
        expect("first_date" in slot, at).toBe(firstDays && confirmed);
        if (typeof slot.first_date === "string") {
          dated += 1;
          expect(weekdays[new Date(`${slot.first_date}T12:00:00Z`).getUTCDay()], at).toBe(slot.weekday);
        }
      }
    }
    expect(dated).toBeGreaterThan(0);
  });

  it("list a change's announced days in date order, every one before it starts, and nowhere else (spec 05, FQ61)", () => {
    let listed = 0;
    for (const { where, proposal } of reads()) {
      if (proposal.reason !== "membership_change") {
        expect("announced" in proposal, where).toBe(false);
        continue;
      }
      const dates = ((proposal.announced ?? []) as JsonObject[]).map((day) => asText(day.local_date));
      expect(dates, where).toEqual([...dates].sort());
      for (const date of dates) expect(date < asText(proposal.effective_from), `${where}: ${date}`).toBe(true);
      listed += dates.length;
    }
    expect(listed).toBeGreaterThan(0);
  });

  it("agree on one version and one start for each proposal, whoever reads it and whatever anyone has chosen or confirmed (T33)", () => {
    // A proposal's version moves only with its state or a new revision of its week, so it never tells a
    // member that someone else has chosen or confirmed; its start moves only with a new proposal (FQ49).
    const facts = new Map<string, string>();
    for (const { where, proposal } of reads()) {
      const id = asText(proposal.id);
      const these = JSON.stringify([proposal.version, proposal.effective_from, proposal.state]);
      const earlier = facts.get(id);
      if (earlier === undefined) facts.set(id, these);
      else expect(these, `${id} in ${where}`).toBe(earlier);
    }
    expect(facts.size).toBeGreaterThan(1);
  });

  it("show a membership change the same before and after the viewer confirms it, as the confirmation answers (FQ81)", () => {
    const before = (examples.getSchedule?.change?.value as JsonObject).proposal as JsonObject;
    const after = (examples.getSchedule?.change_confirmed?.value as JsonObject).proposal as JsonObject;
    expect([before.my_state, after.my_state]).toEqual(["choosing", "confirmed"]);
    expect({ ...after, my_state: "choosing" }).toEqual(before);
    expect(examples.confirmScheduleDays?.confirmed?.value).toEqual(after);
  });

  it("place every member once, and in the first days by the order they joined (spec 09, FQ98)", () => {
    for (const [name, example] of Object.entries(examples.listMembers ?? {})) {
      const members = (example.value as JsonObject).members as JsonObject[];
      expect(
        members.map((row) => Number(row.position)).sort((a, b) => a - b),
        name,
      ).toEqual(members.map((_, index) => index + 1));
    }
    const firstDays = (examples.listMembers?.first_days?.value as JsonObject).members as JsonObject[];
    const byPosition = [...firstDays].sort((a, b) => Number(a.position) - Number(b.position));
    expect(byPosition.map((row) => joined.get(idOf(row.person)))).toEqual(byPosition.map((_, index) => index));
    // Ben and Debby haven't confirmed, so they have no date, and keep their places (F01-friends-first-days).
    expect(byPosition.filter((row) => !("next_day" in row)).map((row) => row.position)).toEqual([1, 5]);
  });

  it("show a candidate's link, and whether it was accepted, only to the member who proposed them (handoff 1)", () => {
    const seen = { proposer: 0, accepted: 0, others: 0 };
    const check = (node: JsonObject, where: string): void => {
      if (!Array.isArray(node.candidates) || typeof node.club !== "object") return;
      const viewer = (node.club as JsonObject).my_membership_id;
      // Each candidate's own proposer, never the revision's: a candidate carried into a newer revision
      // keeps the member who proposed them.
      for (const candidate of node.candidates as JsonObject[]) {
        const proposer = viewer === (candidate.proposed_by as JsonObject).membership_id;
        seen[proposer ? "proposer" : "others"] += 1;
        if (!proposer) expect("invitation" in candidate, where).toBe(false);
        if ((candidate.invitation as JsonObject | undefined)?.state === "accepted") seen.accepted += 1;
      }
    };
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          check(node, `${id}.${name}`);
        });
      }
    }
    for (const count of Object.values(seen)) expect(count).toBeGreaterThan(0);
    // Every scene's candidates were proposed by the revision's own proposer, so this one tells the two
    // rules apart: Leila, whom Ben proposed, carried into a revision Maya proposed. Ben still sees the link.
    const accepted = examples.getRosterRevision?.accepted?.value as JsonObject;
    const maya = (accepted.members as JsonObject[]).find(
      (person) => typeof person.membership_id === "string" && person.membership_id.endsWith("_maya"),
    );
    expect(maya).toBeDefined();
    const carried: JsonObject = { ...accepted, proposed_by: maya ?? null };
    expect(RosterRevision.safeParse(carried).success).toBe(true);
    const before = seen.proposer;
    check(carried, "Leila carried into Maya's revision");
    expect(seen.proposer).toBe(before + 1);
  });

  it("ask a revision's proposer to approve it only when the server made it for a name (FQ60, FQ84)", () => {
    // A revision the server made for a name supersedes one with the same candidates, one of them renamed.
    const scenes: [string, JsonObject][] = [];
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          if (Array.isArray(node.candidates) && typeof node.my_decision === "string")
            scenes.push([`${id}.${name}`, node]);
        });
      }
    }
    const candidates = (node: JsonObject) => (node.candidates as JsonObject[]).map((c) => [c.id, c.name]);
    const serverMade = new Set<string>();
    for (const [, node] of scenes) {
      const next = scenes.find(([, other]) => other.id === node.superseded_by)?.[1];
      if (!next) continue;
      const [was, now] = [candidates(node), candidates(next)];
      const same = JSON.stringify(was.map(([id]) => id)) === JSON.stringify(now.map(([id]) => id));
      if (same && JSON.stringify(was) !== JSON.stringify(now)) serverMade.add(JSON.stringify(next.id));
    }
    let asked = 0;
    for (const [where, node] of scenes) {
      if ((node.club as JsonObject).my_membership_id !== (node.proposed_by as JsonObject).membership_id) continue;
      if (!serverMade.has(JSON.stringify(node.id))) expect(node.my_decision, where).not.toBe("pending");
      else if (node.my_decision === "pending") asked += 1;
    }
    expect(serverMade.size).toBeGreaterThan(0);
    expect(asked).toBeGreaterThan(0);
  });

  it("show each answer to an acceptance, and each state of a candidate's link, in some scene (FQ66, FQ71, handoff 1)", () => {
    const states = new Set<unknown>();
    for (const scene of Object.values(examples.acceptInvitation ?? {})) states.add((scene.value as JsonObject).state);
    expect([...states].sort()).toEqual([...InvitationAcceptance.shape.state.options].sort());
    const links = new Set<unknown>();
    for (const set of Object.values(examples)) {
      for (const example of Object.values(set)) {
        walk(example.value as Json, (node) => {
          // A candidate's link: its id, state and expiry, for its proposer (CandidateInvitation).
          if (
            typeof node.state === "string" &&
            typeof node.expires_at === "string" &&
            typeof node.id === "string" &&
            node.id.startsWith("inv_")
          ) {
            links.add(node.state);
          }
        });
      }
    }
    for (const state of CandidateLinkState.options) expect(links.has(state), state).toBe(true);
  });

  it("agree on one version for an open revision, whoever reads it and whatever they've decided (T33)", () => {
    // A revision's version moves only with its own state, so it never counts approvals or acceptances.
    const versions = new Map<string, unknown>();
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          const open = Array.isArray(node.candidates) && node.state === "open";
          const [revision, version] = open ? [node.id, node.version] : [node.revision_id, node.revision_version];
          if (typeof revision !== "string" || version === undefined) return;
          const earlier = versions.get(revision);
          if (earlier === undefined) versions.set(revision, version);
          else expect(version, `${revision} in ${id}.${name}`).toBe(earlier);
        });
      }
    }
    expect(versions.size).toBeGreaterThan(1);
  });

  it("show who reacted only to the drop's author, Ben, and never to anyone else (FQ73)", () => {
    for (const [id, set] of Object.entries(examples)) {
      for (const [name, example] of Object.entries(set)) {
        walk(example.value as Json, (node) => {
          if (node.view !== "revealed") return;
          const author = (node.author as JsonObject).membership_id;
          const ownDrop = typeof author === "string" && author.endsWith("_ben");
          for (const summary of (node.reactions ?? []) as JsonObject[]) {
            expect("people" in summary, `${id}.${name}: ${JSON.stringify(node.id)}`).toBe(ownDrop);
          }
        });
      }
    }
  });
});

function nameOfBody(id: string): string {
  const op = OPERATIONS.find((candidate) => candidate.id === id);
  const operation = op ? (((document.paths as JsonObject)[op.path] as JsonObject)[op.method] as JsonObject) : {};
  const content = ((operation.requestBody as JsonObject | undefined)?.content ?? {}) as JsonObject;
  const ref = ((content["application/json"] as JsonObject | undefined)?.schema as JsonObject | undefined)?.$ref;
  return typeof ref === "string" ? ref.slice("#/components/schemas/".length) : "";
}
