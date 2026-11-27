// Every error the server's own code makes carries a site code (the outside audit's B7; fault.ts). The scan reads the
// TypeScript of the API, the worker and this package through the compiler, so code inside a string (the sweep's script
// in services/worker/src/privileges.ts) isn't read as code, and a site laid over several lines is still one site. It
// leaves tests, `testing.ts` and the root harness alone, which never run in a server, and `fault.ts`, which makes the
// one error that has no site code of its own. A deliberate way round, such as `const E = Error; new E()`, is review's.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { Fault, InputFault, RangeFault, SITE_CODE } from "./fault.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const FOLDERS = [join("services", "api", "src"), join("services", "worker", "src"), join("packages", "domain", "src")];
const BUILT_IN = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
]);
// services/worker/src/privileges.ts imports only Node's own modules (./turn.ts), so it has its own fault, of the same
// shape (privileges.test.ts holds its pattern to SITE_CODE).
const FAULTS = new Set(["Fault", "InputFault", "RangeFault", "PrivilegeFault"]);

/** The server's own files of a folder, at any depth: not a test, `testing.ts`, a harness or `fault.ts`. */
function serverFiles(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .filter((name) => !/(?:\.test\.ts|(?:^|\/)testing\.ts|-harness\.ts)$/.test(name))
    .map((name) => join(folder, name))
    .filter((path) => path !== join("packages", "domain", "src", "fault.ts"));
}

/** The name a `new X(…)` or `X(…)` calls: an identifier, or `globalThis.X`. */
function calleeName(callee: ts.Expression): string | undefined {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return callee.expression.text === "globalThis" ? callee.name.text : undefined;
  }
  return undefined;
}

interface Scan {
  /** Each built-in error made outside fault.ts, as `file:line Name`. */
  readonly bare: string[];
  /** Each fault whose first argument isn't a site code written out, as `file:line`. */
  readonly unwritten: string[];
  /** Each site code, with the sites that use it. */
  readonly codes: Map<string, string[]>;
}

/** Reads `files` (paths under ROOT) for the errors they make. */
function scan(
  files: readonly string[],
  read: (path: string) => string = (path) => readFileSync(join(ROOT, path), "utf8"),
): Scan {
  const bare: string[] = [];
  const unwritten: string[] = [];
  const codes = new Map<string, string[]>();
  for (const path of files) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const where = (node: ts.Node) =>
      `${path}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
        const name = calleeName(node.expression);
        if (name !== undefined && BUILT_IN.has(name)) bare.push(`${where(node)} ${name}`);
        if (name !== undefined && FAULTS.has(name)) {
          const first = node.arguments?.[0];
          if (
            first === undefined ||
            !ts.isStringLiteral(first) ||
            first.text.length > 32 ||
            !SITE_CODE.test(first.text)
          ) {
            unwritten.push(where(node));
          } else {
            codes.set(first.text, [...(codes.get(first.text) ?? []), where(node)]);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { bare, unwritten, codes };
}

describe("a fault (the outside audit's B7)", () => {
  it("carries its site code, its message and its cause, and is the kind of error it stands for", () => {
    const cause = new Error("under it");
    const fault = new Fault("home_3", "home: the open day holds more drops than a page", { cause });
    expect(fault).toBeInstanceOf(Error);
    expect([fault.name, fault.code, fault.message, fault.cause]).toEqual([
      "Fault",
      "home_3",
      "home: the open day holds more drops than a page",
      cause,
    ]);
    const input = new InputFault("devices_1", "devices: a removal secret is base64url");
    expect(input).toBeInstanceOf(TypeError);
    expect([input.name, input.code]).toEqual(["InputFault", "devices_1"]);
    const range = new RangeFault("propose_2", "schedule: two to six members");
    expect(range).toBeInstanceOf(RangeError);
    expect([range.name, range.code]).toEqual(["RangeFault", "propose_2"]);
  });

  it("takes a site code only: lower-case letters, digits and _, ending in _ and a number, at most 32", () => {
    for (const code of ["a_1", "worker_privileges_22", "api_start_6", `${"a".repeat(29)}_99`]) {
      expect(new Fault(code, "x").code, code).toBe(code);
    }
    for (const code of [
      "",
      "home",
      "home_",
      "Home_3",
      "3home_3",
      "_home_3",
      "home.3",
      "home_3a",
      "storage.unavailable",
      "usr_01JC5V8Q0000000000000000_1 ",
      "home 3",
      `${"a".repeat(30)}_99`,
    ]) {
      expect(() => new Fault(code, "x"), code).toThrow(TypeError);
      expect(() => new InputFault(code, "x"), code).toThrow(TypeError);
      expect(() => new RangeFault(code, "x"), code).toThrow(TypeError);
    }
  });
});

describe("the server's own errors", () => {
  const files = FOLDERS.flatMap(serverFiles);
  const found = scan(files);

  it("reads the three folders' own files, and none of their tests", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(join("services", "api", "src", "app.ts"));
    expect(files).toContain(join("services", "worker", "src", "privileges.ts"));
    expect(files).toContain(join("packages", "domain", "src", "clubs", "home.ts"));
    expect(files.filter((path) => /\.test\.ts$|testing\.ts$|-harness\.ts$/.test(path))).toEqual([]);
  });

  it("are faults, never a built-in error with no site code", () => {
    expect(found.bare).toEqual([]);
  });

  it("each carry a site code written out at the site", () => {
    expect(found.unwritten).toEqual([]);
    expect(found.codes.size).toBeGreaterThan(200);
  });

  it("each carry a code no other site uses", () => {
    expect([...found.codes].filter(([, sites]) => sites.length > 1)).toEqual([]);
  });

  it("is held by a scan that finds each way a site could go wrong", () => {
    const planted: Record<string, string> = {
      "plain.ts": 'throw new Error("x");\nconst e = TypeError("y");\nPromise.reject(new globalThis.RangeError("z"));',
      "unwritten.ts":
        'const code = "a_1";\nthrow new Fault(code, "x");\nnew InputFault(`b_2`, "y");\nnew RangeFault();',
      "shapes.ts": 'new Fault("a.b_1", "x");\nnew Fault("Ab_1", "y");\nnew Fault("ab", "z");',
      "twice.ts": 'new Fault("c_1", "x");\nnew InputFault("c_1", "y");\nnew RangeFault("d_1", "z");',
      "string.ts": 'const script = \'throw new Error("inside a string")\';\n// throw new Error("in a comment")',
    };
    const result = scan(Object.keys(planted), (path) => planted[path] ?? "");
    expect(result.bare).toEqual(["plain.ts:1 Error", "plain.ts:2 TypeError", "plain.ts:3 RangeError"]);
    expect(result.unwritten).toEqual([
      "unwritten.ts:2",
      "unwritten.ts:3",
      "unwritten.ts:4",
      "shapes.ts:1",
      "shapes.ts:2",
      "shapes.ts:3",
    ]);
    expect([...result.codes]).toEqual([
      ["c_1", ["twice.ts:1", "twice.ts:2"]],
      ["d_1", ["twice.ts:3"]],
    ]);
  });
});
