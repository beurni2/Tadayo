// A check the tests run on every example and every answer the mock gives: no key the document doesn't
// name. zod's response objects strip unknown keys, and the document leaves answers open so an older app
// can read a newer API, so neither would notice a field the contract never declared (a URL on a caption
// card, a misspelled `reply_to`). Every other rule is zod's to check.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The paths in `value` that `schema` doesn't name, resolving `$ref`s against `document`. */
export function unknownKeys(document: JsonObject, schema: Json, value: unknown, path = "$"): string[] {
  if (!isObject(schema)) return [];
  const target = schema.$ref;
  if (typeof target === "string") {
    const name = target.slice("#/components/schemas/".length);
    const schemas = (document.components as JsonObject).schemas as JsonObject;
    const resolved = schemas[name];
    if (resolved === undefined) return [`${path}: ${target} doesn't exist`];
    return unknownKeys(document, resolved, value, path);
  }
  const members = schema.oneOf;
  if (Array.isArray(members)) {
    const discriminator = schema.discriminator as JsonObject | undefined;
    if (!discriminator || !isObject(value)) return [`${path}: a oneOf without a discriminator or an object`];
    const tag = value[discriminator.propertyName as string];
    const mapping = discriminator.mapping as JsonObject;
    const chosen = typeof tag === "string" ? mapping[tag] : undefined;
    if (typeof chosen !== "string") return [`${path}: no member for ${JSON.stringify(tag)}`];
    return unknownKeys(document, { $ref: chosen }, value, path);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      unknownKeys(document, schema.items ?? null, item, `${path}[${String(index)}]`),
    );
  }
  if (isObject(value)) {
    const properties = (schema.properties ?? {}) as JsonObject;
    const rest = schema.additionalProperties;
    return Object.entries(value).flatMap(([key, child]) => {
      if (key in properties) return unknownKeys(document, properties[key] ?? null, child, `${path}.${key}`);
      if (isObject(rest)) return unknownKeys(document, rest, child, `${path}.${key}`);
      return [`${path}.${key}`];
    });
  }
  return [];
}
