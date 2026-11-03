// The contract's own tests: openapi.yaml is what the zod schemas say, every example is valid, the
// pre-reveal whitelist is exactly T10's, and the document keeps to what the Swift generator and Prism read.
import { readFileSync } from "node:fs";

import * as z from "zod";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { buildDocument } from "./document.ts";
import { ERROR_CODES, ApiError } from "./errors.ts";
import { standardErrors } from "./operation.ts";
import { OPERATIONS } from "./operations.ts";
import { registry } from "./registry.ts";
import { renderOpenApi } from "./render.ts";
import { CandidateLabel } from "./schemas/clubs.ts";
import { ClubName, DisplayName, NAME_PATTERN, Person } from "./common.ts";
import { DropCaption } from "./schemas/days.ts";
import { unknownKeys } from "./strict.ts";
import { allSuccessExamples, errorExample } from "./fixtures/examples.ts";

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
          expect(declared.ETag, where).toEqual({ $ref: "#/components/headers/ETag" });
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

  it("works before the profile is complete for exactly the account's own setup routes (FQ13)", () => {
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
      "registerDevice",
      "sendEvents",
      "updateMe",
    ]);
  });

  it("gives each operation exactly its own errors, beyond those of its kind", () => {
    const own = Object.fromEntries(
      OPERATIONS.filter((op) => op.errors).map((op) => [op.id, [...(op.errors ?? [])].sort()]),
    );
    expect(own).toEqual({
      acceptInvitation: ["CLUB_FULL", "INVITATION_EXPIRED", "NOT_FOUND", "ROSTER_CHANGED"],
      approveRoster: ["CLUB_FULL", "ROSTER_CHANGED", "VERSION_CONFLICT"],
      blockMember: ["MEMBERSHIP_CHANGED", "NOT_FOUND"],
      chooseScheduleDays: ["MEMBERSHIP_CHANGED", "VERSION_CONFLICT"],
      completeUpload: ["MEDIA_NOT_READY"],
      confirmScheduleDays: ["MEMBERSHIP_CHANGED", "NOT_ALLOWED", "VERSION_CONFLICT"],
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
      revokeInvitation: ["VERSION_CONFLICT"],
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
    // Grapheme counts and "only true" are zod refinements: the document can't say them, so Prism and
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
        if (meta) expect(meta.description, meta.id).toMatch(/grapheme clusters|only `true`/);
      }
      for (const [key, child] of Object.entries(def.shape ?? {})) visit(child, `${path}.${key}`);
      if (def.innerType) visit(def.innerType, path);
      if (def.element) visit(def.element, `${path}[]`);
      for (const option of def.options ?? []) visit(option, path);
    };
    for (const op of OPERATIONS) if (op.body) visit(op.body, op.id);
    expect([...new Set(refined)].sort()).toEqual([
      "AgeConfirmation",
      "CandidateLabel",
      "Caption",
      "ClubName",
      "CommentText",
      "DisplayName",
      "ReportNote",
      "SearchText",
    ]);
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

describe("names (FQ70)", () => {
  const good = ["Ben", "Ana María", "Zoë", "李", "Debby O'Neil", "👨‍👩‍👧"];
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
          // A candidate's link names its invitation by `id`; a link and a preview, by `invitation_id`.
          const invitation = typeof node.invitation_id === "string" ? node.invitation_id : node.id;
          if (typeof invitation === "string" && invitation.startsWith("inv_") && typeof node.expires_at === "string") {
            remember(`invitation ${invitation}`, node.expires_at, `${id}.${name}`);
          }
        });
      }
    }
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
