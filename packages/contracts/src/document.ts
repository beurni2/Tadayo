// Builds the OpenAPI 3.1 document from the zod schemas and the operations. `scripts/openapi.ts`
// writes it to openapi.yaml; the test fails when the file and this disagree.
//
// The document keeps to what Swift OpenAPI Generator reads (it ignores `examples` and `security`, and
// reads no `const` and no `null` types) and what Prism needs to mock it (`examples`, `security`).
import * as z from "zod";

import { ERRORS, statusOf, type ErrorCodeName } from "./errors.ts";
import { pathParameters, standardErrors, type Operation } from "./operation.ts";
import { OPERATIONS } from "./operations.ts";
import { registry } from "./registry.ts";
import { errorExample, successExamples } from "./fixtures/examples.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export const API_VERSION = "1.0.0";

const DESCRIPTION = `Tadayo's v1 API: the seam between the TypeScript API and the iPhone app (docs/MILESTONES.md, "Lanes").

Generated from the zod schemas in packages/contracts/src by \`pnpm --filter @tadayo/contracts openapi:write\`; never edit it by hand.

Rules every endpoint keeps:
- Authentication: a Supabase session's access token as a bearer token (T53), except where an operation says it's public.
- Unauthorized looks like missing: anything the caller may not see is the neutral NOT_FOUND (T14).
- Before the reveal, others get a drop's caption and nothing else (T10); media streams only through this API and no storage URL for reading ever reaches the app (T12).
- Every mutation a retry could duplicate takes an Idempotency-Key, created when the action starts and reused on every retry. A key is the caller's own, for one operation, and each action has its own: the same path, query and body return the original response; a different path, query or body is IDEMPOTENCY_CONFLICT (T19). Edits carry the version they read.
- Times are UTC instants; the server's clock decides (T1). Ids are opaque and random.
- Errors carry a code and facts, never copy: the app owns its words (T41 to T43).
- Lists are cursor-paged and filtered for the caller (T14). A cursor is opaque and carries no time.
- Every answer with a body says Cache-Control: private, no-store, and every image its ETag; a link's JSON has none.
- Requests refuse unknown fields; answers may gain fields, so an app ignores the ones it doesn't know.`;

function strip(node: Json): Json {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "$id") continue;
    out[key] = strip(value);
  }
  // zod writes a long calendar-checking pattern beside these formats; the format says it, and the
  // server's zod schema still checks it.
  if (out.format === "date-time") out.pattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$";
  if (out.format === "date") out.pattern = "^\\d{4}-\\d{2}-\\d{2}$";
  if (out.format === "uuid" || out.format === "uri") delete out.pattern;
  return out;
}

/** An example as JSON: fixtures are typed loosely and checked against their schemas by the tests. */
function plain(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asObject(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object");
  return value as JsonObject;
}

function nameOf(schema: z.ZodType, where: string): string {
  const meta = registry.get(schema);
  if (!meta) throw new Error(`${where}: the schema must be named (registry.ts)`);
  return meta.id;
}

function ref(schema: z.ZodType, where: string): JsonObject {
  return { $ref: `#/components/schemas/${nameOf(schema, where)}` };
}

const QUERY_PREFIX = "Query__";

/** Code-unit order, the same in every locale (`localeCompare` follows the process's). */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Each operation's query object, copied under a temporary name of its own, so two operations that share
// one (PageQuery) each keep their parameters. Made once: the registry is the module's.
const queryCopies = new Map<string, z.ZodObject>();

/** Every named schema, plus each operation's query object under a temporary name. */
function convert(): { schemas: JsonObject; queries: Map<string, JsonObject> } {
  for (const op of OPERATIONS) {
    if (!op.query || queryCopies.has(op.id)) continue;
    const copy = op.query.extend({});
    registry.add(copy, { id: `${QUERY_PREFIX}${op.id}`, description: "" });
    queryCopies.set(op.id, copy);
  }
  const output = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "throw",
    metadata: registry,
    uri: (id) => `#/components/schemas/${id}`,
  });
  const all = asObject(strip(asObject(output).schemas ?? null));
  const schemas: JsonObject = {};
  const queries = new Map<string, JsonObject>();
  for (const [id, schema] of Object.entries(all).sort(([a], [b]) => byCodeUnit(a, b))) {
    if (id.startsWith(QUERY_PREFIX)) queries.set(id.slice(QUERY_PREFIX.length), asObject(schema));
    else schemas[id] = schema;
  }
  return { schemas, queries };
}

function parameters(op: Operation, query: JsonObject | undefined): Json[] {
  const list: Json[] = pathParameters(op.path).map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { $ref: "#/components/schemas/Id" },
  }));
  if (query) {
    const required = new Set((query.required as string[] | undefined) ?? []);
    for (const [name, schema] of Object.entries(asObject(query.properties ?? {}))) {
      const object = asObject(schema);
      const description = object.description;
      delete object.description;
      list.push({
        name,
        in: "query",
        required: required.has(name),
        ...(typeof description === "string" ? { description } : {}),
        schema: object,
      });
    }
  }
  if (op.idempotent) list.push({ $ref: "#/components/parameters/IdempotencyKey" });
  return list;
}

const NO_STORE = "private, no-store";

// The response headers, each a value the document can check and Prism sends as it is.
const HEADERS: JsonObject = {
  CacheControl: {
    description:
      "Every answer with a body is for the caller alone, and no shared or device cache keeps it (T11, T12, " +
      "Q26): the app keeps what it needs in its own per-account caches (TECH-DESIGN section 4).",
    required: true,
    schema: { type: "string", enum: [NO_STORE] },
    example: NO_STORE,
  },
  ETag: {
    description:
      "The image's content version (`media_version` or `avatar_version`) as an entity tag: it changes " +
      "when the bytes do, and after a removal.",
    required: true,
    schema: { type: "string" },
    example: '"mv_drp_sam_hill_1"',
  },
  ImageETag: {
    description:
      "On the image answer only: the image's content version (`media_version` or `avatar_version`) as an " +
      "entity tag. A link's JSON answer has no image and carries none.",
    required: false,
    schema: { type: "string" },
    example: '"mv_drp_sam_hill_1"',
  },
  RetryAfter: {
    description: "Seconds to wait before trying again.",
    required: true,
    schema: { type: "integer", minimum: 1, maximum: 86_400 },
    example: 30,
  },
};

function headerRef(name: string): JsonObject {
  return { $ref: `#/components/headers/${name}` };
}

function success(op: Operation): JsonObject {
  const ok = op.ok;
  if (ok.status === 204) return { "204": { description: "Done." } };
  const content: JsonObject = {};
  // JSON first: a client sends its Accept values in the document's order, and Prism answers the first
  // it can, so a link's author preview isn't taken for a photo.
  if ("json" in ok) {
    const examples = successExamples(op.id);
    content["application/json"] = { schema: ref(ok.json, op.id), ...(examples ? { examples: plain(examples) } : {}) };
  }
  if ("binary" in ok) content[ok.binary] = { schema: { type: "string", format: "binary" } };
  const headers: JsonObject = { "Cache-Control": headerRef("CacheControl") };
  // An answer that is either a link's JSON or an image has an ETag only when it is the image.
  if ("binary" in ok) headers.ETag = headerRef("json" in ok ? "ImageETag" : "ETag");
  return { [String(ok.status)]: { description: op.summary, headers, content } };
}

function failures(op: Operation): JsonObject {
  const codes = [...standardErrors(op), ...(op.errors ?? [])];
  if (new Set(codes).size !== codes.length) throw new Error(`${op.id}: an error is listed twice`);
  const byStatus = new Map<number, ErrorCodeName[]>();
  for (const code of codes) byStatus.set(statusOf(code), [...(byStatus.get(statusOf(code)) ?? []), code]);
  const out: JsonObject = {};
  for (const [status, list] of [...byStatus.entries()].sort(([a], [b]) => a - b)) {
    const examples: JsonObject = {};
    for (const code of list) examples[code] = { summary: ERRORS[code][1], value: plain(errorExample(code)) };
    const headers: JsonObject = { "Cache-Control": headerRef("CacheControl") };
    if (status === 429) headers["Retry-After"] = headerRef("RetryAfter");
    out[String(status)] = {
      description: list.join(", "),
      headers,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, examples } },
    };
  }
  // The bare 503: no body, so nothing to describe but that it holds nothing (the ios lane, 2026-11-24).
  if (op.unavailable) {
    out["503"] = {
      description: "The database can't be reached, or didn't answer in time. Nothing in it.",
      headers: { "Cache-Control": headerRef("CacheControl") },
    };
  }
  return out;
}

export function buildDocument(): JsonObject {
  const { schemas, queries } = convert();
  const paths: Record<string, JsonObject> = {};
  const ids = new Set<string>();
  for (const op of OPERATIONS) {
    if (ids.has(op.id)) throw new Error(`two operations are called ${op.id}`);
    ids.add(op.id);
    const item = (paths[op.path] ??= {});
    if (op.method in item) throw new Error(`${op.method} ${op.path} is declared twice`);
    const operation: JsonObject = {
      operationId: op.id,
      summary: op.summary,
      description: op.description,
      ...(op.public ? { security: [] } : {}),
      parameters: parameters(op, queries.get(op.id)),
    };
    if (op.body) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: ref(op.body, op.id) } },
      };
    }
    operation.responses = { ...success(op), ...failures(op) };
    item[op.method] = operation;
  }
  const sortedPaths: JsonObject = {};
  for (const path of Object.keys(paths).sort(byCodeUnit)) sortedPaths[path] = paths[path] ?? {};
  return {
    openapi: "3.1.0",
    info: { title: "Tadayo API", version: API_VERSION, description: DESCRIPTION },
    servers: [
      { url: "https://api-dev.tadayo.app", description: "dev" },
      {
        url: "http://127.0.0.1:4010",
        description:
          "The Prism mock (pnpm --filter @tadayo/contracts mock). Its images are placeholders, not JPEG bytes, " +
          "and it checks a request's shape but not the rules only the API can (grapheme counts, only true).",
      },
    ],
    security: [{ bearer: [] }],
    paths: sortedPaths,
    components: {
      schemas,
      headers: HEADERS,
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          description:
            "Created when the action starts and reused on every retry of it (T19): the caller's own, for this " +
            "operation. The same path, query and body return the original response, even after the cutoff; a " +
            "different path, query or body is IDEMPOTENCY_CONFLICT.",
          schema: { type: "string", format: "uuid" },
        },
      },
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "A Supabase session's access token (T53).",
        },
      },
    },
  };
}
