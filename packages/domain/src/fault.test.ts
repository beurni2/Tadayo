// Every error the server's own code makes carries a site code (the outside audit's B7; fault.ts). The scan reads the
// TypeScript of the API, the worker and this package through the compiler, so code inside a string (the sweep's script
// in services/worker/src/privileges.ts) isn't read as code, and a site laid over several lines is still one site. It
// leaves tests alone, the four files named in NOT_SERVER, which never run in a server, and `fault.ts`, which makes the
// one error that has no site code of its own. The code's shape alone doesn't keep a value out (`debby_2` has it): the
// literal at the site does. So the scan also fails on each way round it can see, one of these classes under another
// name, passed as a value or extended (PR #148's review).

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

/**
 * The files of the three folders that never run in a server, by exact path, so a module of the server's own can't be
 * left out by its name: each package's entry for tests (`@tadayo/api/testing`, `@tadayo/worker/testing`,
 * `@tadayo/domain/testing`), which no product code imports, and the root harness.
 */
const NOT_SERVER = [
  join("services", "api", "src", "testing.ts"),
  join("services", "worker", "src", "testing.ts"),
  join("services", "worker", "src", "privileges-harness.ts"),
  join("packages", "domain", "src", "time", "testing.ts"),
];
/** fault.ts makes the one error that has no site code of its own. */
const FAULT_MODULE = join("packages", "domain", "src", "fault.ts");

/** A folder's TypeScript, at any depth, as paths under ROOT. */
function typeScriptOf(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .map((name) => join(folder, name));
}

/** The server's own files of a folder: not a test, not one of NOT_SERVER, not fault.ts. */
function serverFiles(folder: string): string[] {
  return typeScriptOf(folder).filter(
    (path) => !path.endsWith(".test.ts") && !NOT_SERVER.includes(path) && path !== FAULT_MODULE,
  );
}

/** The expression under any parentheses, `as`, `satisfies`, `!` or `<T>`. */
function unwrapped(node: ts.Expression): ts.Expression {
  let at = node;
  while (
    ts.isParenthesizedExpression(at) ||
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at) ||
    ts.isNonNullExpression(at) ||
    ts.isTypeAssertionExpression(at)
  ) {
    at = at.expression;
  }
  return at;
}

/**
 * The class an expression names, read through `unwrapped`: an identifier, the last name of a property access
 * (`globalThis.Error`, `f.Fault`), or an element access by a written name (`globalThis["Error"]`).
 */
function nameOf(node: ts.Expression): string | undefined {
  const at = unwrapped(node);
  if (ts.isIdentifier(at)) return at.text;
  if (ts.isPropertyAccessExpression(at)) return at.name.text;
  if (ts.isElementAccessExpression(at) && ts.isStringLiteralLike(at.argumentExpression)) {
    return at.argumentExpression.text;
  }
  return undefined;
}

const ERRORS = new Set([...BUILT_IN, ...FAULTS]);

interface Scan {
  /** Each built-in error made outside fault.ts, as `file:line Name`. */
  readonly bare: string[];
  /** Each fault whose first argument isn't a site code written out, as `file:line`. */
  readonly unwritten: string[];
  /** Each site code, with the sites that use it. */
  readonly codes: Map<string, string[]>;
  /**
   * Each way round the rules above, as `file:line what`: one of these classes under another name (an alias, a
   * renamed import, export or binding), passed as a value (`Reflect.construct(Error, …)`), a fault extended, or
   * the fault module imported whole.
   */
  readonly roundabout: string[];
}

/** Reads `files` (paths under ROOT) for the errors they make. */
function scan(
  files: readonly string[],
  read: (path: string) => string = (path) => readFileSync(join(ROOT, path), "utf8"),
): Scan {
  const bare: string[] = [];
  const unwritten: string[] = [];
  const codes = new Map<string, string[]>();
  const roundabout: string[] = [];
  for (const path of files) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const where = (node: ts.Node) =>
      `${path}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
    const named = (node: ts.Expression | undefined): string | undefined => {
      const name = node === undefined ? undefined : nameOf(node);
      return name !== undefined && ERRORS.has(name) ? name : undefined;
    };
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
        const name = nameOf(node.expression);
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
        for (const argument of node.arguments ?? []) {
          const passed = named(argument);
          if (passed !== undefined) roundabout.push(`${where(argument)} ${passed} passed as a value`);
        }
      }
      if (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) {
        const aliased = named(node.initializer);
        if (aliased !== undefined) roundabout.push(`${where(node)} ${aliased} under another name`);
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const aliased = named(node.right);
        if (aliased !== undefined) roundabout.push(`${where(node)} ${aliased} under another name`);
      }
      if (
        (ts.isImportSpecifier(node) || ts.isExportSpecifier(node) || ts.isBindingElement(node)) &&
        node.propertyName !== undefined
      ) {
        const original = ts.isIdentifier(node.propertyName) ? node.propertyName.text : undefined;
        const local = ts.isIdentifier(node.name) ? node.name.text : undefined;
        if (original !== undefined && ERRORS.has(original) && local !== original) {
          roundabout.push(`${where(node)} ${original} under another name`);
        }
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        const bindings = node.importClause?.namedBindings;
        if (/(?:^|\/)fault(?:\.ts)?$/.test(module) && bindings !== undefined && ts.isNamespaceImport(bindings)) {
          roundabout.push(`${where(node)} the fault module imported whole`);
        }
      }
      if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of node.types) {
          const extended = nameOf(type.expression);
          if (extended !== undefined && FAULTS.has(extended)) roundabout.push(`${where(type)} ${extended} extended`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { bare, unwritten, codes, roundabout };
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
    // What it leaves out, beside the tests, is exactly the files that never run in a server, and fault.ts.
    const left = FOLDERS.flatMap(typeScriptOf).filter((path) => !path.endsWith(".test.ts") && !files.includes(path));
    expect(left.sort()).toEqual([...NOT_SERVER, FAULT_MODULE].sort());
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

  it("are made where they're named, never by a roundabout way the scan couldn't follow", () => {
    expect(found.roundabout).toEqual([]);
  });

  it("is held by a scan that finds each way a site could go wrong", () => {
    const planted: Record<string, string> = {
      "plain.ts": 'throw new Error("x");\nconst e = TypeError("y");\nPromise.reject(new globalThis.RangeError("z"));',
      "unwritten.ts":
        'const code = "a_1";\nthrow new Fault(code, "x");\nnew InputFault(`b_2`, "y");\nnew RangeFault();',
      "shapes.ts": 'new Fault("a.b_1", "x");\nnew Fault("Ab_1", "y");\nnew Fault("ab", "z");',
      "twice.ts": 'new Fault("c_1", "x");\nnew InputFault("c_1", "y");\nnew RangeFault("d_1", "z");',
      "string.ts": 'const script = \'throw new Error("inside a string")\';\n// throw new Error("in a comment")',
      "wrapped.ts": [
        'throw new (Error)("x");',
        'new (Error as ErrorConstructor)("y");',
        'new faults.Fault(`${x}_1`, "z");',
        'new globalThis["TypeError"]("w");',
      ].join("\n"),
      "roundabout.ts": [
        'import { Fault as F } from "@tadayo/domain/fault";',
        'import * as faults from "@tadayo/domain/fault";',
        "const E = Error;",
        "let G; G = faults.InputFault;",
        'Reflect.construct(RangeError, ["x"]);',
        "class Mine extends Fault {}",
        "const { Fault: H } = faults;",
        "const table = { make: TypeError };",
        'export { RangeFault as R } from "@tadayo/domain/fault";',
      ].join("\n"),
    };
    const result = scan(Object.keys(planted), (path) => planted[path] ?? "");
    expect(result.bare).toEqual([
      "plain.ts:1 Error",
      "plain.ts:2 TypeError",
      "plain.ts:3 RangeError",
      "wrapped.ts:1 Error",
      "wrapped.ts:2 Error",
      "wrapped.ts:4 TypeError",
    ]);
    expect(result.unwritten).toEqual([
      "unwritten.ts:2",
      "unwritten.ts:3",
      "unwritten.ts:4",
      "shapes.ts:1",
      "shapes.ts:2",
      "shapes.ts:3",
      "wrapped.ts:3",
    ]);
    expect([...result.codes]).toEqual([
      ["c_1", ["twice.ts:1", "twice.ts:2"]],
      ["d_1", ["twice.ts:3"]],
    ]);
    expect(result.roundabout).toEqual([
      "roundabout.ts:1 Fault under another name",
      "roundabout.ts:2 the fault module imported whole",
      "roundabout.ts:3 Error under another name",
      "roundabout.ts:4 InputFault under another name",
      "roundabout.ts:5 RangeError passed as a value",
      "roundabout.ts:6 Fault extended",
      "roundabout.ts:7 Fault under another name",
      "roundabout.ts:8 TypeError under another name",
      "roundabout.ts:9 RangeFault under another name",
    ]);
  });
});
