// The registry of named schemas: each becomes one entry of the document's components.schemas, and
// every other schema refers to it there, so the generated Swift client gets one type per name.
import * as z from "zod";

export interface SchemaMeta {
  id: string;
  description: string;
  discriminator?: { propertyName: string; mapping: Record<string, string> };
}

export const registry = z.registry<SchemaMeta>();

/** Names a schema: it becomes `#/components/schemas/<id>`. */
export function named<T extends z.ZodType>(id: string, description: string, schema: T): T {
  registry.add(schema, { id, description });
  return schema;
}

/** A union told apart by `key`, whose members are each named objects with a one-value enum at `key`. */
export function tagged<const T extends readonly [z.ZodObject, z.ZodObject, ...z.ZodObject[]]>(
  id: string,
  description: string,
  key: string,
  members: T,
): z.ZodDiscriminatedUnion<T> {
  const mapping: Record<string, string> = {};
  for (const member of members) {
    const meta = registry.get(member);
    if (!meta) throw new Error(`${id}: every member of a tagged union must be named first`);
    const tag: unknown = member.shape[key];
    if (!(tag instanceof z.ZodEnum) || tag.options.length !== 1) {
      throw new Error(`${id}: ${meta.id}.${key} must be a one-value enum`);
    }
    const value = String(tag.options[0]);
    if (value in mapping) throw new Error(`${id}: two members share ${key} = ${value}`);
    mapping[value] = `#/components/schemas/${meta.id}`;
  }
  const union = z.discriminatedUnion(key, members);
  registry.add(union, { id, description, discriminator: { propertyName: key, mapping } });
  return union;
}

/** A one-value enum, for a union's tag (the Swift generator doesn't read `const`). */
export function tag<const V extends string>(value: V): z.ZodEnum<{ [K in V]: K }> {
  return z.enum([value]);
}
