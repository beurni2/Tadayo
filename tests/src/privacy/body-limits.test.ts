// What the API's request-body limits (services/api/src/app.ts: BODY_LIMIT, bodyLimitOf) leave out: nothing a valid
// request holds. For each operation with a body the contract (packages/contracts/openapi.yaml) bounds the longest
// request a client can send, written the way that takes the most bytes, as JSON allows: a string's `maxLength`
// counts code points (JSON Schema's definition, and zod's `.max`, docs/LIMITATIONS.md), and a code point outside
// the Basic Multilingual Plane is written as two escapes of six bytes, so each code point of a string may take
// twelve bytes, unless its pattern holds it to ASCII, where each takes one escape of six; a key and an enum
// value are ASCII. The route's limit must be at least that. A contract change that grows a body past its
// route's limit fails here, before a valid request is refused. No database.

import { bodyLimitOf } from "@tadayo/api";
import { describe, expect, it } from "vitest";
import { contractOperations, isObject, readDocument, resolve, type Json, type JsonObject } from "./operations.ts";

const document = readDocument();

/** The keywords the contract's bodies use: one it adds fails the measure, so it is never silently skipped. */
const MEASURED = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "enum",
  "format",
  "pattern",
  "oneOf",
  "discriminator",
]);

/** The lengths of the forms a string with no maxLength may take, and the pattern that makes a date-time one. */
const FIXED: Readonly<Record<string, number>> = { uuid: 36, date: 10, "date-time": 20 };
const INSTANT = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$";

/** A string of `length` ASCII characters as the longest JSON text for it: its quotes and an escape for each. */
const escaped = (length: number): number => 2 + 6 * length;

/**
 * The patterns, as openapi.yaml writes them, that hold a string to ASCII: an id or a version, a hex string, a
 * time zone. Any other pattern, or none, lets a string hold any code point.
 */
const ASCII_ONLY: ReadonlySet<string> = new Set([
  "^[A-Za-z0-9_-]+$",
  "^[0-9a-fA-F]+$",
  "^[A-Za-z][A-Za-z0-9_+-]*(?:\\/[A-Za-z0-9_+-]+)*$",
]);

/** A string of at most `maxLength` code points as the longest JSON text for it: two escapes a code point, or one if ASCII. */
const bounded = (maxLength: number, pattern: unknown): number =>
  typeof pattern === "string" && ASCII_ONLY.has(pattern) ? escaped(maxLength) : 2 + 12 * maxLength;

/** The most bytes a valid JSON value for `node` can take, or a throw naming what the contract leaves unbounded. */
function longest(node: Json, where: string): number {
  const schema = resolve(document, node);
  if (!isObject(schema)) throw new Error(`${where}: not a schema`);
  const unmeasured = Object.keys(schema).filter((key) => !MEASURED.has(key));
  if (unmeasured.length > 0) throw new Error(`${where}: the keyword ${unmeasured.join(", ")} isn't measured`);
  if (Array.isArray(schema.oneOf)) {
    return Math.max(...schema.oneOf.map((branch, index) => longest(branch, `${where}|${String(index)}`)));
  }
  if (Array.isArray(schema.enum)) {
    return Math.max(
      ...schema.enum.map((value) => (typeof value === "string" ? escaped(value.length) : JSON.stringify(value).length)),
    );
  }
  switch (schema.type) {
    case "boolean":
      return "false".length;
    case "integer": {
      // `Number.MAX_SAFE_INTEGER` when the contract sets no bound, which no client sends past.
      const top = typeof schema.maximum === "number" ? schema.maximum : Number.MAX_SAFE_INTEGER;
      const bottom = typeof schema.minimum === "number" ? schema.minimum : 0;
      return Math.max(String(top).length, String(bottom).length);
    }
    case "string": {
      if (typeof schema.maxLength === "number") return bounded(schema.maxLength, schema.pattern);
      // With no maxLength a string is bounded by its form: a UUID, a date, or the contract's Instant.
      const format = typeof schema.format === "string" ? schema.format : "";
      const form = FIXED[format];
      if (form !== undefined && (format !== "date-time" || schema.pattern === INSTANT)) return escaped(form);
      throw new Error(`${where}: a string with no maxLength`);
    }
    case "array": {
      if (typeof schema.maxItems !== "number") throw new Error(`${where}: an array with no maxItems`);
      if (schema.items === undefined) throw new Error(`${where}: an array with no items`);
      const item = longest(schema.items, `${where}[]`);
      return 2 + schema.maxItems * item + Math.max(0, schema.maxItems - 1);
    }
    case "object": {
      if (schema.additionalProperties !== false) throw new Error(`${where}: an object that takes other keys`);
      const properties = isObject(schema.properties) ? Object.entries(schema.properties) : [];
      let total = 2 + Math.max(0, properties.length - 1);
      for (const [key, value] of properties) total += escaped(key.length) + 1 + longest(value, `${where}.${key}`);
      return total;
    }
    default:
      throw new Error(`${where}: a ${JSON.stringify(schema.type)} that isn't measured`);
  }
}

/** The JSON schema of `id`'s request body in the contract. */
function bodySchema(id: string): Json {
  const paths = document.paths;
  if (!isObject(paths)) throw new Error("openapi.yaml has no paths");
  for (const item of Object.values(paths)) {
    if (!isObject(item)) continue;
    for (const operation of Object.values(item)) {
      if (!isObject(operation) || operation.operationId !== id) continue;
      const body = resolve(document, operation.requestBody ?? null);
      const content = isObject(body) && isObject(body.content) ? body.content : {};
      const json = content["application/json"];
      if (!isObject(json) || json.schema === undefined) throw new Error(`${id}: a body that isn't JSON`);
      return json.schema;
    }
  }
  throw new Error(`${id} isn't in the contract`);
}

describe("the longest request a client can send, by the contract, and each route's body limit", () => {
  const operations = contractOperations(document).filter((operation) => operation.body);

  it("measures what a schema allows, by hand: a name, a number, a flag, a list and a choice of shapes", () => {
    const small: JsonObject = {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", maxLength: 3 },
        n: { type: "integer", minimum: 0, maximum: 99 },
        ok: { type: "boolean" },
        tags: { type: "array", maxItems: 2, items: { type: "string", maxLength: 1 } },
      },
    };
    // {"id":…,"n":99,"ok":false,"tags":[…,…]}: two braces, three commas between the four members, and for each
    // member its key (quotes and an escape for each character) and a colon, then its value, a string's code
    // points at two escapes each.
    const keys = escaped(2) + escaped(1) + escaped(2) + escaped(4) + 4;
    const values = 2 + 12 * 3 + "99".length + "false".length + (2 + 2 * (2 + 12 * 1) + 1);
    expect(longest(small, "small")).toBe(2 + 3 + keys + values);
    expect(longest({ oneOf: [{ type: "boolean" }, { type: "string", maxLength: 10 }] }, "either")).toBe(2 + 12 * 10);
    // A pattern that holds a string to ASCII takes one escape a character; any other takes two a code point.
    expect(longest({ type: "string", maxLength: 3, pattern: "^[A-Za-z0-9_-]+$" }, "id")).toBe(escaped(3));
    expect(longest({ type: "string", maxLength: 3, pattern: "^[a-z]+$" }, "other")).toBe(2 + 12 * 3);
    expect(longest({ type: "string", enum: ["ab", "abcd"] }, "choice")).toBe(escaped(4));
    expect(() => longest({ type: "string" }, "open")).toThrow("a string with no maxLength");
    expect(() => longest({ type: "array", items: { type: "boolean" } }, "open")).toThrow("an array with no maxItems");
    expect(() => longest({ type: "object", properties: {} }, "open")).toThrow("an object that takes other keys");
    expect(() => longest({ type: "string", maxLength: 1, nullable: true }, "new")).toThrow(
      "the keyword nullable isn't measured",
    );
  });

  it("knows a pattern holds a string to ASCII only when it does: none of them takes an accent, an emoji or a lone surrogate", () => {
    // Each read as JSON Schema reads it, an ECMA-262 regular expression, here with the u flag that makes a
    // code point one character.
    for (const pattern of ASCII_ONLY) {
      const regex = new RegExp(pattern, "u");
      for (const value of ["\u00E9", "a\u00E9", "\u{1F600}", "a\u{E0067}", "\uD800", "\u0660"]) {
        expect(regex.test(value), `${pattern} ${JSON.stringify(value)}`).toBe(false);
      }
    }
    // Each is a pattern the contract uses, so none is dead.
    const used = new Set<string>();
    const visit = (node: Json): void => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (isObject(node)) {
        if (typeof node.pattern === "string") used.add(node.pattern);
        Object.values(node).forEach(visit);
      }
    };
    visit(document);
    for (const pattern of ASCII_ONLY) expect(used.has(pattern), pattern).toBe(true);
  });

  it("holds the longest body of every operation that takes one to its route's limit", () => {
    expect(operations).toHaveLength(31);
    const sizes = new Map<string, number>();
    for (const operation of operations) {
      const size = longest(bodySchema(operation.id), operation.id);
      sizes.set(operation.id, size);
      expect(
        size,
        `${operation.id}: its longest body against its limit of ${String(bodyLimitOf(operation.id))}`,
      ).toBeLessThanOrEqual(bodyLimitOf(operation.id));
    }
    // The largest are comments and reports, some 96 kilobytes of escapes, a comment's ahead since it may name a
    // photo upload too (addendum 5); `updateMe`'s is some 8, in its 17 KiB; `sendEvents`', all ASCII, is 48,442
    // bytes.
    const [largest] = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
    expect(largest?.[0]).toBe("createComment");
    expect(sizes.get("createReport")).toBeGreaterThan(90_000);
    expect(largest?.[1]).toBeGreaterThan(90_000);
    expect(sizes.get("updateMe")).toBeGreaterThan(8 * 1024);
    expect(sizes.get("updateMe")).toBeLessThan(9_000);
    expect(sizes.get("sendEvents")).toBe(48_442);
  });
});
