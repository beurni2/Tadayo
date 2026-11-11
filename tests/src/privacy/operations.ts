// The contract's operations as the privacy matrix reads them: from packages/contracts/openapi.yaml,
// the committed document the app's routes and the Swift client both come from (TECH-DESIGN section
// 8: the matrix is "generated from the OpenAPI paths"). The contract's own test keeps the file
// equal to its zod schemas (`openapi:check`).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const OPENAPI = join(import.meta.dirname, "..", "..", "..", "packages", "contracts", "openapi.yaml");

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  schema: JsonObject;
  /** The values it takes, when its schema, or the schema it refers to, is an enum. */
  values: readonly string[] | null;
}

export interface Response {
  /** The JSON body's schema, when the answer has one. */
  json?: Json;
  /** Every media type the answer may carry. */
  media: string[];
}

export interface ContractOperation {
  id: string;
  /** Upper case, as Fastify and an HTTP request name it. */
  method: string;
  /** As the contract writes it, with `{name}` for each path parameter. */
  path: string;
  parameters: Parameter[];
  body: boolean;
  responses: Map<number, Response>;
}

/** The document, parsed. */
export function readDocument(text: string = readFileSync(OPENAPI, "utf8")): JsonObject {
  const document: unknown = parse(text);
  if (!isObject(document)) throw new Error("openapi.yaml isn't an object");
  return document;
}

/** Follows a `#/components/...` reference, once. */
export function resolve(document: JsonObject, node: Json): Json {
  if (!isObject(node) || typeof node.$ref !== "string") return node;
  let target: Json = document;
  for (const part of node.$ref.replace(/^#\//, "").split("/")) {
    target = isObject(target) ? (target[part] ?? null) : null;
  }
  if (target === null) throw new Error(`openapi.yaml: ${node.$ref} doesn't exist`);
  return target;
}

const METHODS = ["get", "put", "post", "delete", "patch"] as const;

/** Every operation in the document, in its order. */
export function contractOperations(document: JsonObject): ContractOperation[] {
  const paths = document.paths;
  if (!isObject(paths)) throw new Error("openapi.yaml has no paths");
  const operations: ContractOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      if (typeof operation.operationId !== "string") throw new Error(`${method} ${path} has no operationId`);
      const parameters = (Array.isArray(operation.parameters) ? operation.parameters : []).map((node): Parameter => {
        const parameter = resolve(document, node);
        if (!isObject(parameter) || typeof parameter.name !== "string" || !isObject(parameter.schema)) {
          throw new Error(`${operation.operationId as string}: a parameter without a name or schema`);
        }
        const where = parameter.in;
        if (where !== "path" && where !== "query" && where !== "header") {
          throw new Error(
            `${operation.operationId as string}: parameter ${parameter.name} is in ${JSON.stringify(where)}`,
          );
        }
        const target = resolve(document, parameter.schema);
        const values = isObject(target) && Array.isArray(target.enum) ? target.enum.map(String) : null;
        return {
          name: parameter.name,
          in: where,
          required: parameter.required === true,
          schema: parameter.schema,
          values,
        };
      });
      const responses = new Map<number, Response>();
      for (const [status, node] of Object.entries(isObject(operation.responses) ? operation.responses : {})) {
        const response = resolve(document, node);
        const content = isObject(response) && isObject(response.content) ? response.content : {};
        const json = content["application/json"];
        responses.set(Number(status), {
          ...(isObject(json) && json.schema !== undefined ? { json: json.schema } : {}),
          media: Object.keys(content),
        });
      }
      operations.push({
        id: operation.operationId,
        method: method.toUpperCase(),
        path,
        parameters,
        body: operation.requestBody !== undefined,
        responses,
      });
    }
  }
  return operations;
}
