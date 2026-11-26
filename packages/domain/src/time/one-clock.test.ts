// Only the time module reads a clock (T1; TECH-DESIGN section 5: "Nothing else reads the system
// clock"). A route, a job, a migration or an ops script that read the time for itself would decide
// by a clock that the dev clock can't move and the tests' fake clock can't hold, and in SQL `now()`
// and the literal 'now' are the transaction's start, before any lock (ADR-013). Tests may read
// clocks. The tests' fake clock, for its part, appears in no product code, and no numbered
// migration, which every environment runs, makes the dev clock's table.
//
// The scan reads the server's code a line at a time, so it catches the ordinary ways of reading a
// clock, not a deliberate way round it such as `const D = Date; new D()`. The app's own clock, the
// device half of T1, is the ios lane's: Swift isn't scanned here.
//
// Nor does code outside the time module make a `ServerNow` of its own (the outside audit's A14). The read predicate,
// the day choice and the add-target policy take only a `ServerNow`, so a time a route read from a request (`?t=`, a
// header) reaches them only through something that says it is one without the clock. That check reads the server's
// TypeScript through the compiler, not a line at a time, so it follows a type through its names, aliases, wrappers
// and fields however the code is laid out (`nowMints`, below). It leaves three things to others: a value typed `any`
// is the lint's (strictTypeChecked's no-unsafe-* rules); the browser's pages (apps/web) run none of the server's
// code; and TypeScript's unsound corners, a write through a wider alias of a mutable field or array, or a call made
// through `Function` (`Reflect.apply`), are a deliberate way round. Nor does the time an action happens
// at reach code as a plain `Temporal.Instant`, which a request's time would reach with no cast at all: the code that
// decides, writes or answers by the time now takes a ServerNow, and each plain instant the server's code still takes, a
// parameter or a field, the time module's own included, is on `PLAIN_INSTANTS` with its reason, so a new one fails
// until someone says why it isn't the clock's sample (`plainInstants`). It reads a parameter's or a field's own type:
// an instant in an array, a tuple, a map, a mapped type or a promise, a parameter typed `unknown`, and a time as text
// or as a date are left to review (docs/plans/api-b2-server-time-types.md, section 4). Tests may make a ServerNow.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const TIME_MODULE = join("packages", "domain", "src", "time") + sep;
const MIGRATIONS = join("db", "migrations") + sep;

const READS = [
  { what: "Date.now()", pattern: /\bDate\s*\.\s*now\b/ },
  { what: "performance.now() or its timeOrigin", pattern: /\bperformance\s*\.\s*(?:now|timeOrigin)\b/ },
  { what: "new Date() with no argument", pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { what: "new Date with no parentheses", pattern: /\bnew\s+Date\b(?!\s*\()/ },
  { what: "Date() without new", pattern: /(?<!\bnew\s+)(?<![\w$.])Date\s*\(/ },
  { what: "the global object's Date", pattern: /\b(?:globalThis|global|window|self)\s*\.\s*Date\b/ },
  { what: "Date built by Reflect", pattern: /\bReflect\s*\.\s*construct\s*\(\s*Date\b/ },
  {
    what: "a formatter's format() with no argument, which formats the time now",
    pattern: /\.format(?:ToParts)?\s*\(\s*\)/,
  },
  { what: "Temporal.Now", pattern: /\bTemporal\s*\.\s*Now\b/ },
  { what: "process.hrtime", pattern: /\bprocess\s*\.\s*hrtime\b/ },
  {
    what: "a clock function of SQL's",
    // Written `now()`, or with a space, `now ()`; these take no argument, so prose's "now (T5)"
    // isn't one.
    pattern: /\b(?:now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)(?:\(|\s+\(\s*\))/i,
  },
  {
    what: "a clock keyword of SQL's",
    pattern: /\b(?:current_timestamp|current_date|current_time|localtimestamp|localtime)\b/i,
  },
  // `age(t)` with one argument measures from today's midnight.
  { what: "SQL's age()", pattern: /\bage\s*\(/i },
  {
    what: "a clock literal of SQL's",
    // The word alone or with a time on either side: 'now', 'today 07:00', '01:00 tomorrow'.
    pattern: /'\s*(?:now|today|tomorrow|yesterday)\b[^']*'|'[^']*\b(?:now|today|tomorrow|yesterday)\s*'/i,
  },
  { what: "the tests' fake clock", pattern: /\bfakeClock\b|@tadayo\/domain\/testing/ },
] as const;

/** What each way of making a `ServerNow` is called in a failure. */
const MINT = {
  cast: "a cast to a type that holds a ServerNow, or to any or never",
  guard: "a guard that makes a ServerNow",
  answer:
    "a call whose answer holds a ServerNow through a type parameter none of its parameters names (a typed query's row, a generic cast)",
  bodiless: "a signature with no body whose answer holds a ServerNow (an overload or an ambient function)",
  ambient: "an ambient declaration that holds a ServerNow",
  silenced: "a comment that silences the compiler",
} as const;

/** The settings every package's tsconfig extends. */
function baseOptions(): ts.CompilerOptions {
  const read = ts.readConfigFile(join(ROOT, "tsconfig.base.json"), (path) => ts.sys.readFile(path));
  return ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT).options;
}

/**
 * One program of the server's TypeScript, and of `extra`, files that exist only in memory, beside it. The browser's
 * pages (apps/web) are left out: they compile with the DOM's types, and they run none of the server's code.
 */
function compile(roots: readonly string[], extra: ReadonlyMap<string, string>): ts.Program {
  const options = baseOptions();
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, version, onError, create) => {
    const text = extra.get(name);
    return text === undefined
      ? getSourceFile(name, version, onError, create)
      : ts.createSourceFile(name, text, version, true);
  };
  host.fileExists = (name) => extra.has(name) || fileExists(name);
  host.readFile = (name) => extra.get(name) ?? readFile(name);
  return ts.createProgram({ rootNames: [...roots.map((file) => join(ROOT, file)), ...extra.keys()], options, host });
}

function isReference(type: ts.Type): type is ts.TypeReference {
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

/**
 * Each place in `file` where code makes a `ServerNow` without the clock, as "file:line: what", read by the compiler,
 * so a type is followed through its names, aliases, wrappers and fields, however the code is laid out:
 * - a cast (`as`, or angle brackets) to a type a value of which, or a part of which, is a ServerNow, or to any or never;
 * - a guard (`is`, `asserts … is`) that says a value is one;
 * - a call, a `new` or a tagged template whose answer holds one through a type parameter none of its parameters
 *   names, which is what a typed query is (`tx<Row[]>` and `const rows: Row[] = await tx…` alike) and what a generic
 *   cast is (`function as<T>(value: unknown): T`);
 * - a signature with no body whose answer holds one, which the compiler doesn't hold to an implementation (an overload,
 *   a `declare function`), and an ambient variable that holds one;
 * - a comment that silences the compiler (`@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`).
 */
export function nowMints(program: ts.Program, file: string): string[] {
  const source = program.getSourceFile(join(ROOT, file));
  if (source === undefined) throw new Error(`time: ${file} isn't in the program`);
  const checker = program.getTypeChecker();
  const clock = program.getSourceFile(join(ROOT, TIME_MODULE, "clock.ts"));
  const alias = clock?.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "ServerNow",
  );
  if (alias === undefined) throw new Error("time: clock.ts declares no ServerNow");
  const now = checker.getTypeAtLocation(alias.name);

  const inProduct = (symbol: ts.Symbol | undefined): boolean =>
    symbol?.declarations?.some((declaration) => {
      const file = declaration.getSourceFile();
      return !program.isSourceFileDefaultLibrary(file) && !file.fileName.split("/").includes("node_modules");
    }) ?? false;

  // A value of `type` is a ServerNow, or a part of one is: a member of a union, a type's argument (an array's
  // element, a promise's answer), an index's value, or, in a type the server's code declares, a field or an answer.
  // `any` and `never` count only as the whole type: anywhere else, `any` is the lint's (no-unsafe-*).
  const holds = (type: ts.Type, whole: boolean, seen: Set<ts.Type>): boolean => {
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) !== 0) return whole;
    if (seen.has(type)) return false;
    seen.add(type);
    if (checker.isTypeAssignableTo(type, now)) return true;
    const parts: ts.Type[] = [...(type.aliasTypeArguments ?? [])];
    if (type.isUnionOrIntersection()) parts.push(...type.types);
    if (isReference(type)) parts.push(...checker.getTypeArguments(type));
    for (const index of checker.getIndexInfosOfType(type)) parts.push(index.type);
    if (inProduct(type.getSymbol())) {
      for (const property of type.getProperties()) parts.push(checker.getTypeOfSymbol(property));
      for (const signature of type.getCallSignatures()) parts.push(signature.getReturnType());
    }
    return parts.some((part) => holds(part, false, seen));
  };
  const holdsNow = (type: ts.Type, whole = true) => holds(type, whole, new Set());

  // Whether any of `nodes` names the type parameter.
  const names = (nodes: readonly ts.Node[], parameter: ts.TypeParameter): boolean => {
    const symbol = parameter.getSymbol();
    const look = (node: ts.Node): boolean =>
      (ts.isTypeReferenceNode(node) && checker.getSymbolAtLocation(node.typeName) === symbol) ||
      (ts.forEachChild(node, look) ?? false);
    return nodes.some(look);
  };

  const answersNow = (node: ts.CallLikeExpression): boolean => {
    const signature = checker.getResolvedSignature(node);
    if (signature === undefined) return false;
    const given = checker.getTypeArgumentsForResolvedSignature(signature) ?? [];
    // A class with no constructor of its own is made by a signature the compiler writes, with no parameters at all.
    const declaration = signature.getDeclaration() as ts.SignatureDeclaration | undefined;
    if (declaration === undefined) return given.some((argument) => holdsNow(argument, false));
    const parameters = checker.getSignatureFromDeclaration(declaration)?.getTypeParameters() ?? [];
    return parameters.some((parameter, index) => {
      const argument = given[index];
      return argument !== undefined && !names(declaration.parameters, parameter) && holdsNow(argument, false);
    });
  };

  // Whether `node` is in an ambient declaration (`declare const`, `declare global`, `declare module`).
  const declared = (node: ts.Node | undefined): boolean =>
    node !== undefined &&
    ((ts.canHaveModifiers(node) &&
      (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) ||
      declared(node.parent));

  const found: string[] = [];
  const report = (position: number, what: string) => {
    found.push(`${file}:${String(source.getLineAndCharacterOfPosition(position).line + 1)}: ${what}`);
  };
  for (const comment of source.text.matchAll(/@ts-(?:expect-error|ignore|nocheck)\b/g))
    report(comment.index, MINT.silenced);
  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const isConst =
        ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === "const";
      if (!isConst && holdsNow(checker.getTypeFromTypeNode(node.type))) report(node.type.getStart(source), MINT.cast);
    } else if (ts.isTypePredicateNode(node)) {
      if (node.type !== undefined && holdsNow(checker.getTypeFromTypeNode(node.type))) {
        report(node.getStart(source), MINT.guard);
      }
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
      if (answersNow(node)) report(node.getStart(source), MINT.answer);
    } else if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.body === undefined) {
      const answer = checker.getSignatureFromDeclaration(node)?.getReturnType();
      const abstract = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Abstract) !== 0;
      if (!abstract && answer !== undefined && holdsNow(answer)) report(node.getStart(source), MINT.bodiless);
    } else if (ts.isVariableDeclaration(node) && declared(node)) {
      if (holdsNow(checker.getTypeAtLocation(node.name))) report(node.getStart(source), MINT.ambient);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `Temporal.Instant` and `ServerNow`, as `ServerNow`'s declaration in clock.ts names them. */
function instantTypes(program: ts.Program): { instant: ts.Type; serverNow: ts.Type } {
  const checker = program.getTypeChecker();
  const clock = program.getSourceFile(join(ROOT, TIME_MODULE, "clock.ts"));
  const declared = clock?.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "ServerNow",
  );
  const instantNode =
    declared !== undefined && ts.isIntersectionTypeNode(declared.type) ? declared.type.types[0] : undefined;
  if (declared === undefined || instantNode === undefined) throw new Error("time: clock.ts declares no ServerNow");
  const instant = checker.getTypeFromTypeNode(instantNode);
  const symbol = instant.getSymbol();
  if (
    symbol?.getName() !== "Instant" ||
    !(symbol.declarations ?? []).some((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()))
  ) {
    throw new Error("time: ServerNow isn't Temporal.Instant and its brand");
  }
  return { instant, serverNow: checker.getTypeFromTypeNode(declared.type) };
}

/**
 * Each parameter in `file`, and each field of a type it declares, whose type, alone or in a union, is an instant and
 * not a ServerNow, as "file: owner(parameter)" or "file: Owner.field": a type the compiler takes for a
 * `Temporal.Instant` (through an alias, read only, with a brand of its own, a type parameter whose constraint is one, or one or null)
 * that a ServerNow's place wouldn't take. A request's time reaches such a place with no cast, so the time an action
 * happens at is never one: each that is left is on `PLAIN_INSTANTS` with its reason. An instant inside an array, a
 * tuple, a map, a mapped type or a promise isn't read, nor a variable, which no caller gives.
 */
export function plainInstants(program: ts.Program, file: string): string[] {
  const source = program.getSourceFile(join(ROOT, file));
  if (source === undefined) throw new Error(`time: ${file} isn't in the program`);
  const checker = program.getTypeChecker();
  const { instant, serverNow } = instantTypes(program);
  // A type's members: a union's, each read in turn, and a type parameter's constraint's, so that
  // `T extends Temporal.Instant | null` is read as the instant and the null its constraint allows.
  const parts = (type: ts.Type): readonly ts.Type[] => {
    if (type.isUnion()) return type.types.flatMap(parts);
    const constraint = type.isTypeParameter() ? checker.getBaseConstraintOfType(type) : undefined;
    return constraint === undefined || constraint === type ? [type] : parts(constraint);
  };
  // By what the compiler lets through, not by name: an intersection with a brand of its own, a type parameter whose
  // constraint is an instant, `Readonly<Temporal.Instant>`. `any` passes for a ServerNow too, so it stays the lint's.
  const plain = (type: ts.Type): boolean =>
    parts(type).some(
      (part) => !checker.isTypeAssignableTo(part, serverNow) && checker.isTypeAssignableTo(part, instant),
    );
  // The named declarations around `node`, outermost first: "holdSlot(slot)" for a field of `holdSlot`'s `slot`.
  const ownerOf = (node: ts.Node): string => {
    let owner = "";
    for (let at = node.parent; !ts.isSourceFile(at); at = at.parent) {
      if (ts.isParameter(at)) owner = `(${at.name.getText(source)})${owner}`;
      else if (
        (ts.isFunctionDeclaration(at) ||
          ts.isFunctionExpression(at) ||
          ts.isMethodDeclaration(at) ||
          ts.isMethodSignature(at) ||
          ts.isInterfaceDeclaration(at) ||
          ts.isTypeAliasDeclaration(at) ||
          ts.isClassDeclaration(at) ||
          ts.isVariableDeclaration(at) ||
          ts.isPropertySignature(at) ||
          ts.isPropertyAssignment(at)) &&
        at.name !== undefined
      ) {
        owner = at.name.getText(source) + (owner === "" || owner.startsWith("(") ? owner : `.${owner}`);
      }
    }
    return owner;
  };
  const found: string[] = [];
  const where = file.split(sep).join("/");
  const visit = (node: ts.Node): void => {
    const named = ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node);
    if (named && node.name.getText(source) !== "this" && plain(checker.getTypeAtLocation(node))) {
      const owner = ownerOf(node);
      const name = node.name.getText(source);
      found.push(`${where}: ${ts.isParameter(node) ? `${owner}(${name})` : owner === "" ? name : `${owner}.${name}`}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Why the root harness of the photo user's tests reads a clock (KEPT). */
const HARNESS =
  "the root harness of services/worker/src/privileges.test.ts, which only that test starts, as root: it times how soon the worker killed a fake photo process (past its memory, past its deadline), and no request, job or rule of a day reads it";

/**
 * Lines that read a clock and decide nothing by it, each with its reason. The match is the whole
 * line, trimmed, so any change to one is scanned again.
 */
const KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: join("tools", "ops", "src", "migrate.ts"),
    line: "applied_at timestamptz NOT NULL DEFAULT pg_catalog.now()",
    why: "the migration runner's record of when it applied a file, which nothing compares with a day's instants",
  },
  {
    file: join("tools", "ops", "src", "dev-clock.ts"),
    line: "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)",
    why: "the dev clock's own tool: an instant becomes an offset only by Postgres's own clock, which the offset is from; it runs by hand on dev only (environment.ts), and no request, job or rule of a day reads it",
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: 'appendFileSync(out + "memory.log", String(Date.now()) + "\\n");',
    why: HARNESS,
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: "const started = Date.now();",
    why: HARNESS,
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: "const settledAt = Date.now();",
    why: HARNESS,
  },
];

/**
 * Each plain `Temporal.Instant` the server's code takes, as `plainInstants` names it, with why it isn't the time an
 * action happens at, which is the clock's sample, a ServerNow, everywhere (the outside audit's A14). A new one fails
 * the check until it is a ServerNow or is here with its reason.
 */
const PLAIN_INSTANTS: readonly { readonly why: string; readonly at: readonly string[] }[] = [
  {
    why: "a time a row holds, or a day's own time from its date and zone: a fact that a decision compares with the clock's sample or with another fact, or copies into a row it writes, never the time the decision is made at",
    at: [
      "packages/domain/src/authorization/add-target.ts: AddTargetFacts.viewerJoinedAt",
      "packages/domain/src/authorization/add-target.ts: AddTargetFacts.clubSuspendedAt",
      "packages/domain/src/authorization/days.ts: PlacedDay.revealAt",
      "packages/domain/src/authorization/days.ts: PlacedDay.closeAt",
      "packages/domain/src/authorization/days.ts: DayFacts.revealAt",
      "packages/domain/src/authorization/days.ts: DayFacts.closeAt",
      "packages/domain/src/authorization/days.ts: DayFacts.starLeftAt",
      "packages/domain/src/authorization/days.ts: DayFacts.starDeletionRequestedAt",
      "packages/domain/src/authorization/days.ts: ClubDayFacts.clubSuspendedAt",
      "packages/domain/src/authorization/read.ts: DropReadFacts.clubSuspendedAt",
      "packages/domain/src/authorization/read.ts: DropReadFacts.revealAt",
      "packages/domain/src/authorization/read.ts: DropReadFacts.starLeftAt",
      "packages/domain/src/authorization/read.ts: DropReadFacts.starDeletionRequestedAt",
      "packages/domain/src/authorization/read.ts: notBeforeReveal(at)",
      "packages/domain/src/authorization/read.ts: notBeforeReveal(revealAt)",
      "packages/domain/src/drops/reserve.ts: reservationExpiry(revealAt)",
      "packages/domain/src/schedule/generate.ts: OwedDay.revealAt",
      "packages/domain/src/schedule/generate.ts: OwedDay.closeAt",
      "packages/domain/src/schedule/settle-change.ts: LatestAssignment.confirmedAt",
      "packages/domain/src/time/civil.ts: DayInstants.revealAt",
      "packages/domain/src/time/civil.ts: DayInstants.closeAt",
    ],
  },
  {
    why: "an expiry: computed from the clock's sample by the command that took it (`reservationExpiry`, `uploadExpiry`, which take a ServerNow), or read back from the row it was written to, and compared with a later sample",
    at: [
      "packages/domain/src/authorization/upload.ts: UploadOwnership.expiresAt",
      "packages/domain/src/clubs/invitation-facts.ts: LinkFacts.expiresAt",
      "packages/domain/src/clubs/roster-revision.ts: RevisionLink.expiresAt",
      "packages/domain/src/drops/commit.ts: UploadFacts.expiresAt",
      "packages/domain/src/drops/counter.ts: holdSlot(slot).expiresAt",
      "packages/domain/src/media/upload.ts: ToSign.expiresAt",
      "packages/domain/src/media/upload.ts: UploadRow.expiresAt",
      "packages/domain/src/media/upload.ts: SlotRow.expiresAt",
    ],
  },
  {
    why: "an answer's field: an expiry a command or a read reports to its caller, computed from the clock's sample or read from its row, which no decision reads back (the time an action happened at, which an answer reports too, is a ServerNow: `CreatedClub.at`, `LeftClub.leftAt`, `DeviceRegistration.registeredAt`)",
    at: [
      "packages/domain/src/clubs/invitation-preview.ts: InvitationSight.expiresAt",
      "packages/domain/src/clubs/invitation.ts: MadeLink.expiresAt",
      "packages/domain/src/drops/reserve.ts: ReservationAnswer.expiresAt",
      "packages/domain/src/media/upload.ts: UploadAnswer.expiresAt",
    ],
  },
  {
    why: "a helper's own instants, which it orders, cuts to the second or checks to the microsecond, or writes as the contract's or the database's text, for its caller, whatever the caller has: a fact or the sample",
    at: [
      "packages/domain/src/authorization/add-target.ts: before(a)",
      "packages/domain/src/authorization/add-target.ts: before(b)",
      "packages/domain/src/authorization/days.ts: before(a)",
      "packages/domain/src/authorization/days.ts: before(b)",
      "packages/domain/src/clubs/invitation.ts: wholeSecond(instant)",
      "packages/domain/src/time/instant.ts: wholeMicroseconds(instant)",
      "packages/domain/src/time/instant.ts: databaseInstant(instant)",
      "packages/domain/src/time/instant.ts: contractInstant(instant)",
    ],
  },
  {
    why: "the database connection's instant type (`INSTANT_TYPE`, and each connection's), which binds and reads every instant a query holds, the clock's sample among them",
    at: [
      "packages/domain/src/time/instant.ts: INSTANT_TYPE.serialize(value)",
      "services/api/src/connection.ts: ApiSql.instant",
      "services/api/src/connection.ts: connect.body(tx).instant",
      "services/api/src/connection.ts: connect(tx).instant",
      "services/worker/src/connection.ts: WorkerSql.instant",
      "services/worker/src/connection.ts: WorkerTx.instant",
    ],
  },
  {
    why: "tools/ops, run by hand on dev only: the instant an operator moves dev's clock to and the two clocks' report (dev-clock.ts), and spike S5's run, which reads the server's time from its answers and the days from their rows, as a client does (spike-time.ts, run.ts); the run's first day is from dev's clock's sample in the club's transaction (`startDay`, `firstDate`, which take a ServerNow)",
    at: [
      "tools/ops/src/dev-clock.ts: DevClockOptions.to",
      "tools/ops/src/dev-clock.ts: DevClockReport.postgresNow",
      "tools/ops/src/dev-clock.ts: DevClockReport.devNow",
      "tools/ops/src/dev-clock.ts: moveOffset(target)",
      "tools/ops/src/run.ts: spikeOnMachine.checks.database.moveClock(to)",
      "tools/ops/src/spike-time.ts: SpikeDay.revealAt",
      "tools/ops/src/spike-time.ts: SpikeDay.closeAt",
      "tools/ops/src/spike-time.ts: wholeSeconds(instant)",
      "tools/ops/src/spike-time.ts: moveClock(to)",
      "tools/ops/src/spike-time.ts: expectedClubList(serverNow)",
      "tools/ops/src/spike-time.ts: judge.serverNow",
      "tools/ops/src/spike-time.ts: SpikeDatabase.moveClock(to)",
      "tools/ops/src/spike-time.ts: spikeTime.move(to)",
      "tools/ops/src/spike-time.ts: spikeTime.watch(at)",
      "tools/ops/src/spike-time.ts: spikeTime.watch.lastBefore.serverNow",
      "tools/ops/src/spike-time.ts: spikeTime.watch.firstAfter.serverNow",
    ],
  },
];

/** The server's folders (docs/MILESTONES.md, "Lanes"), but `tests/`, whole: each must be there. */
const ROOTS = ["packages", "services", "db", join("apps", "web"), join("tools", "ops")];
const SCANNED = /\.(?:ts|mts|cts|js|mjs|cjs|sql|html)$/;
const TEST = /\.test\.(?:ts|mts|cts|js|mjs|cjs)$/;

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((entry) => join(dir, entry));
}

/**
 * A file the scan reads: code, SQL or a web page anywhere under a root, in `src` or out of it,
 * but a test, a dependency, or the time module itself. Swift isn't among them.
 */
export function isProductFile(file: string): boolean {
  return (
    SCANNED.test(file) && !TEST.test(file) && !file.split(sep).includes("node_modules") && !file.startsWith(TIME_MODULE)
  );
}

function productFiles(): string[] {
  return ROOTS.flatMap(walk).filter(isProductFile).sort();
}

/** Each line of `text` that reads a clock, as "file:line: what", leaving out the lines KEPT. */
export function clockReads(file: string, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (KEPT.some((kept) => kept.file === file && kept.line === line.trim())) return;
    for (const read of READS) {
      if (read.pattern.test(line)) found.push(`${file}:${String(index + 1)}: ${read.what}`);
    }
  });
  return found;
}

/** The server's TypeScript: every product file the compiler reads but the browser's pages (apps/web). */
function serverTypeScript(): string[] {
  return productFiles().filter((file) => /\.(?:ts|mts|cts)$/.test(file) && !file.startsWith(join("apps", "web") + sep));
}

/** The time module's own code, which the scans above leave out, but for the tests' clock (testing.ts). */
function timeModule(): string[] {
  return walk(TIME_MODULE)
    .filter((file) => file.endsWith(".ts") && !TEST.test(file) && file !== join(TIME_MODULE, "testing.ts"))
    .sort();
}

const HEAD = '/// <reference lib="esnext.temporal" />\n';
const NOW = 'import type { ServerNow } from "@tadayo/domain";\n';
const PREDICATE = 'import { readableDrops, type FragmentSql } from "@tadayo/domain";\n';
const QUERY = 'import type postgres from "postgres";\n' + NOW + "interface Asked {\n  readonly now: ServerNow;\n}\n";

/** Code that makes a ServerNow without the clock, each way as it would ordinarily be written, laid out by prettier. */
const MAKES: readonly (readonly [what: string, text: string, refused?: string])[] = [
  ["a cast", NOW + "export const nowOf = (t: Temporal.Instant): ServerNow => t as ServerNow;"],
  [
    "a cast through unknown",
    NOW + "export const nowOf = (t: Temporal.Instant): ServerNow => t as unknown as ServerNow;",
  ],
  [
    "a cast in angle brackets, which the compiler refuses too",
    NOW + "export const nowOf = (t: Temporal.Instant): ServerNow => <ServerNow>t;",
    "This syntax is not allowed when 'erasableSyntaxOnly' is enabled.",
  ],
  [
    "a cast to the type through its module",
    'import type * as domain from "@tadayo/domain";\n' +
      "export const nowOf = (t: Temporal.Instant): domain.ServerNow => t as domain.ServerNow;",
  ],
  ["a cast to an alias", NOW + "type Now = ServerNow;\nexport const nowOf = (t: Temporal.Instant): Now => t as Now;"],
  [
    "a cast to the type imported under another name",
    'import type { ServerNow as Now } from "@tadayo/domain";\nexport const nowOf = (t: Temporal.Instant): Now => t as Now;',
  ],
  [
    "a cast to a wrapper of it",
    NOW + "export const nowOf = (t: Temporal.Instant): Readonly<ServerNow> => t as Readonly<ServerNow>;",
  ],
  [
    "a cast to another wrapper",
    NOW + "export const nowOf = (t: Temporal.Instant): ServerNow => t as NonNullable<ServerNow>;",
  ],
  [
    "a cast to a union",
    NOW + "export const nowOf = (t: Temporal.Instant | null): ServerNow | null => t as ServerNow | null;",
  ],
  [
    "a cast to a promise of one",
    NOW + "export const nowOf = (t: Temporal.Instant): Promise<ServerNow> => Promise.resolve(t) as Promise<ServerNow>;",
  ],
  [
    "a cast to a function that answers one",
    NOW + "export const nowOf = ((t: Temporal.Instant) => t) as (t: Temporal.Instant) => ServerNow;",
  ],
  [
    "a cast to never",
    PREDICATE +
      'export const page = (sql: FragmentSql<string>, t: Temporal.Instant): string =>\n  readableDrops(sql, "usr_1", t as never, "media");',
  ],
  [
    "a cast to any",
    PREDICATE +
      'export const page = (sql: FragmentSql<string>, t: Temporal.Instant): string =>\n  readableDrops(sql, "usr_1", t as any, "media");',
  ],
  [
    "a guard",
    NOW + "export function isNow(t: Temporal.Instant): t is ServerNow {\n  return t.epochNanoseconds > 0n;\n}",
  ],
  [
    "a guard that asserts",
    NOW +
      'export function assertNow(t: Temporal.Instant): asserts t is ServerNow {\n  if (t.epochNanoseconds < 0n) throw new Error("before 1970");\n}',
  ],
  [
    "a typed query's named row",
    QUERY +
      "export async function askedNow(tx: postgres.TransactionSql, since: string): Promise<ServerNow | undefined> {\n" +
      "  const [row] = await tx<Asked[]>`SELECT ${since}::pg_catalog.timestamptz AS now`;\n" +
      "  return row?.now;\n}",
  ],
  [
    "a typed query's row across lines",
    'import type postgres from "postgres";\n' +
      NOW +
      "export async function askedNow(tx: postgres.TransactionSql, since: string): Promise<ServerNow | undefined> {\n" +
      "  const [row] = await tx<\n" +
      "    { id: string; occurrence_id: string; reveal_at: Temporal.Instant; close_at: Temporal.Instant; at: ServerNow }[]\n" +
      "  >`SELECT o.id, o.id AS occurrence_id, o.reveal_at, o.close_at, ${since}::pg_catalog.timestamptz AS at FROM app.occurrences o`;\n" +
      "  return row?.at;\n}",
  ],
  [
    "a query's row typed by its variable",
    QUERY +
      "export async function askedNow(tx: postgres.TransactionSql, since: string): Promise<ServerNow | undefined> {\n" +
      "  const rows: readonly Asked[] = await tx`SELECT ${since}::pg_catalog.timestamptz AS now`;\n" +
      "  return rows[0]?.now;\n}",
  ],
  [
    "a query's rows cast to a named row",
    QUERY +
      "export async function askedNow(tx: postgres.TransactionSql, since: string): Promise<ServerNow | undefined> {\n" +
      "  const rows = (await tx`SELECT ${since}::pg_catalog.timestamptz AS now`) as unknown as readonly Asked[];\n" +
      "  return rows[0]?.now;\n}",
  ],
  [
    "a query's row cast to a named row",
    QUERY +
      "export async function askedNow(tx: postgres.TransactionSql, since: string): Promise<ServerNow | undefined> {\n" +
      "  const [row] = await tx`SELECT ${since}::pg_catalog.timestamptz AS now`;\n" +
      "  return (row as Asked | undefined)?.now;\n}",
  ],
  [
    "an overload",
    NOW +
      "export function nowOf(t: Temporal.Instant): ServerNow;\nexport function nowOf(t: Temporal.Instant): Temporal.Instant {\n  return t;\n}",
  ],
  [
    "an ambient function",
    NOW + "declare function sampled(): ServerNow;\nexport const nowOf = (): ServerNow => sampled();",
  ],
  ["an ambient variable", NOW + "declare const sampled: ServerNow;\nexport const nowOf = (): ServerNow => sampled;"],
  [
    "a global declared to hold one",
    NOW +
      "declare global {\n  var sampledNow: ServerNow;\n}\nexport const nowOf = (): ServerNow => globalThis.sampledNow;",
  ],
  [
    "a generic cast",
    NOW +
      "function cast<T>(value: unknown): T {\n  return value as T;\n}\nexport const nowOf = (t: Temporal.Instant): ServerNow => cast<ServerNow>(t);",
  ],
  [
    "a generic cast, its type inferred",
    NOW +
      "function cast<T>(value: unknown): T {\n  return value as T;\n}\nexport const nowOf = (t: Temporal.Instant): ServerNow => cast(t);",
  ],
  [
    "a class whose type parameter only its answer names",
    NOW +
      "class Held<T> {\n  readonly #value: unknown;\n  constructor(value: unknown) {\n    this.#value = value;\n  }\n" +
      "  get(): T {\n    return this.#value as T;\n  }\n}\n" +
      "export const nowOf = (t: Temporal.Instant): ServerNow => new Held<ServerNow>(t).get();",
  ],
  [
    "a class with no constructor of its own whose type parameter only its answer names",
    NOW +
      "class Held<T> {\n  value: unknown = undefined;\n  get(): T {\n    return this.value as T;\n  }\n}\n" +
      "export function nowOf(t: Temporal.Instant): ServerNow {\n  const held = new Held<ServerNow>();\n  held.value = t;\n  return held.get();\n}",
  ],
  [
    "a method's overload",
    NOW +
      "class Times {\n  nowOf(t: Temporal.Instant): ServerNow;\n  nowOf(t: Temporal.Instant): Temporal.Instant {\n    return t;\n  }\n}\n" +
      "export const nowOf = (t: Temporal.Instant): ServerNow => new Times().nowOf(t);",
  ],
  [
    "the compiler told to expect an error",
    PREDICATE +
      "export function page(sql: FragmentSql<string>, t: Temporal.Instant): string {\n" +
      "  // @ts-expect-error the request's time, taken as the server's\n" +
      '  return readableDrops(sql, "usr_1", t, "media");\n}',
  ],
  [
    "the compiler told to ignore a line",
    PREDICATE +
      "export function page(sql: FragmentSql<string>, t: Temporal.Instant): string {\n" +
      "  // @ts-ignore the request's time, taken as the server's\n" +
      '  return readableDrops(sql, "usr_1", t, "media");\n}',
  ],
  [
    "the compiler told to leave a file alone",
    "// @ts-nocheck\n" +
      PREDICATE +
      'export const page = (sql: FragmentSql<string>, t: Temporal.Instant): string => readableDrops(sql, "usr_1", t, "media");',
  ],
];

/** Code that names the type, keeps the clock's samples and passes them on, and casts to other types: none makes one. */
const LEAVES: readonly (readonly [string, string])[] = [
  [
    "the type named for a parameter, a field and an answer",
    NOW +
      "export interface Made {\n  readonly at: ServerNow;\n  readonly recorded: boolean;\n}\n" +
      "export function made(at: ServerNow): Made {\n  return { at, recorded: true };\n}\n" +
      "export function keep(now: ServerNow): ServerNow {\n  return now;\n}",
  ],
  [
    "containers of the clock's samples",
    NOW +
      "export function kept(now: ServerNow): Map<string, ServerNow> {\n" +
      "  const seen = new Map<string, ServerNow>();\n  const at: ServerNow[] = [];\n  at.push(now);\n" +
      '  for (const each of at) seen.set("usr_1", each);\n  return seen;\n}',
  ],
  [
    "the samples passed on",
    NOW +
      "export async function first(rows: readonly { readonly at: ServerNow }[]): Promise<ServerNow | undefined> {\n" +
      "  const ats = rows.map((row) => row.at);\n  return Promise.resolve(ats.find((at) => at.epochNanoseconds > 0n));\n}",
  ],
  [
    "a typed query that holds none",
    'import type postgres from "postgres";\n' +
      "export async function days(tx: postgres.TransactionSql): Promise<number> {\n" +
      "  const rows = await tx<{ id: string; reveal_at: Temporal.Instant }[]>`SELECT id, reveal_at FROM app.occurrences`;\n" +
      "  return rows.length;\n}",
  ],
  [
    "the predicate given the clock's sample",
    'import { readableDrops, type Clock, type ClockSql, type FragmentSql } from "@tadayo/domain";\n' +
      "export async function page(clock: Clock, tx: ClockSql, sql: FragmentSql<string>): Promise<string> {\n" +
      '  const now = await clock.sample(tx);\n  return readableDrops(sql, "usr_1", now, "media");\n}',
  ],
  [
    "casts to other types",
    "export function first(rows: readonly Record<string, unknown>[]): { id: string } | undefined {\n" +
      '  const kinds = ["photo", "video"] as const;\n' +
      "  return kinds.length > 0 ? (rows[0] as { id: string } | undefined) : undefined;\n}",
  ],
  [
    "prose about the compiler",
    "// A ServerNow comes only from the clock, with no cast and no ts-expect-error.\nexport const one = 1;",
  ],
];

/**
 * Planted files `plainInstants` reads, each with what it must find there: a plain instant a parameter or a field
 * takes, alone or in a union, through an alias or optional, is found; a ServerNow, alone or in a union, and an
 * instant inside an array, are not.
 */
const PLAIN: readonly (readonly [string, string, readonly string[]])[] = [
  [
    "a parameter",
    "export function lapsed(now: Temporal.Instant): boolean {\n  return now.epochNanoseconds > 0n;\n}",
    ["lapsed(now)"],
  ],
  [
    "an arrow function's parameter that may be null",
    "export const late = (at: Temporal.Instant | null): boolean => at !== null;",
    ["late(at)"],
  ],
  ["an optional field", "export interface Asked {\n  readonly at?: Temporal.Instant;\n}", ["Asked.at"]],
  [
    "a field of a parameter's own type",
    "export function held(slot: { readonly at: Temporal.Instant }): Temporal.Instant {\n  return slot.at;\n}",
    ["held(slot).at"],
  ],
  [
    "a class's field",
    "export class Counter {\n  at: Temporal.Instant = Temporal.Instant.fromEpochNanoseconds(0n);\n}",
    ["Counter.at"],
  ],
  [
    "a parameter typed through an alias",
    "type Moment = Temporal.Instant;\nexport function moved(to: Moment): Moment {\n  return to;\n}",
    ["moved(to)"],
  ],
  [
    "an instant with a brand of its own, one read only, and a type parameter whose constraint is an instant or may be null",
    "export function stamped(at: Temporal.Instant & { readonly stamped: true }): boolean {\n  return at.stamped;\n}\n" +
      "export function fixed(at: Readonly<Temporal.Instant>): bigint {\n  return at.epochNanoseconds;\n}\n" +
      "export function chosen<T extends Temporal.Instant>(at: T): T {\n  return at;\n}\n" +
      "export function chosenOrNone<T extends Temporal.Instant | null>(at: T): T {\n  return at;\n}",
    ["stamped(at)", "fixed(at)", "chosen(at)", "chosenOrNone(at)"],
  ],
  [
    "a ServerNow, alone, in a union, as a field and as a constraint that may be null or not, and an array of instants",
    NOW +
      "export interface Row {\n  readonly at: ServerNow | null;\n}\n" +
      "export function kept(now: ServerNow): ServerNow {\n  return now;\n}\n" +
      "export function sampled<T extends ServerNow>(now: T): T {\n  return now;\n}\n" +
      "export function sampledOrNone<T extends ServerNow | null>(now: T): T {\n  return now;\n}\n" +
      "export function many(at: readonly Temporal.Instant[]): number {\n  return at.length;\n}",
    [],
  ],
];

function caseFile(kind: "makes" | "leaves" | "plain", index: number): string {
  return join("services", "worker", "src", `now-${kind}-${String(index)}.ts`);
}

const TIMEOUT = 300_000;

let compiled: ts.Program | undefined;

/** The server's TypeScript, compiled once, with each case above beside it as a file of the worker's. */
function server(): ts.Program {
  const cases = new Map([
    ...MAKES.map(([, text], index) => [join(ROOT, caseFile("makes", index)), HEAD + text + "\n"] as const),
    ...LEAVES.map(([, text], index) => [join(ROOT, caseFile("leaves", index)), HEAD + text + "\n"] as const),
    ...PLAIN.map(([, text], index) => [join(ROOT, caseFile("plain", index)), HEAD + text + "\n"] as const),
  ]);
  compiled ??= compile([...serverTypeScript(), ...timeModule()], cases);
  return compiled;
}

/** The compiler's errors in `file`, as "file:line: message". */
function problems(program: ts.Program, file: string): string[] {
  const source = program.getSourceFile(join(ROOT, file));
  if (source === undefined) return [`${file}: not in the program`];
  return ts.getPreEmitDiagnostics(program, source).map((diagnostic) => {
    const line = diagnostic.start === undefined ? 0 : source.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
    return `${file}:${String(line)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
  });
}

describe("only the time module reads a clock (T1)", () => {
  it("finds every package, service, migration and ops script to look at, and no test", () => {
    const files = productFiles();
    for (const file of [
      "db/bootstrap.sql",
      "db/migrations/0006_contributions.sql",
      "packages/contracts/scripts/openapi.ts",
      "packages/contracts/src/common.ts",
      "packages/domain/src/index.ts",
      "services/api/src/index.ts",
      "services/worker/src/index.ts",
      "tools/ops/src/migrate.ts",
      "tools/ops/sql/dev_clock.sql",
    ]) {
      expect(files).toContain(join(...file.split("/")));
    }
    expect(files.some((file) => file.startsWith(TIME_MODULE))).toBe(false);
    expect(files.some((file) => TEST.test(file))).toBe(false);
  });

  it('looks in every folder the server\'s lane owns but its tests (docs/MILESTONES.md, "Lanes")', () => {
    const row = readFileSync(join(ROOT, "docs", "MILESTONES.md"), "utf8")
      .split("\n")
      .find((line) => line.startsWith("| **api** |"));
    const owned = [...(row ?? "").matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? "").replace(/\/$/, ""));
    expect(owned).toContain("services");
    for (const folder of owned) {
      const path = join(ROOT, ...folder.split("/"));
      if (folder === "tests" || !existsSync(path) || !statSync(path).isDirectory()) continue;
      const scanned = ROOTS.some((root) => (join(...folder.split("/")) + sep).startsWith(root + sep));
      expect(scanned, folder).toBe(true);
    }
  });

  it("would look at code, SQL or a page anywhere under them, in src or out of it", () => {
    for (const file of [
      "packages/domain/src/authorization/read.sql",
      "packages/domain/authorization/media.ts",
      "services/worker/main.ts",
      "services/api/src/routes/days.mjs",
      "apps/web/src/invite.js",
      "apps/web/invite.html",
      "tools/ops/src/dev-clock.ts",
    ]) {
      expect(isProductFile(join(...file.split("/"))), file).toBe(true);
    }
    for (const file of [
      "packages/domain/src/time/clock.ts",
      "services/api/src/routes.test.ts",
      "packages/domain/node_modules/postgres/src/index.js",
      "packages/contracts/openapi.yaml",
      "packages/swift/TadayoCore/Sources/TadayoCore/Countdown.swift",
    ]) {
      expect(isProductFile(join(...file.split("/"))), file).toBe(false);
    }
  });

  it("finds no other code that reads the time", () => {
    const found = productFiles().flatMap((file) => clockReads(file, readFileSync(join(ROOT, file), "utf8")));
    expect(found).toEqual([]);
  });

  it("keeps only lines that are still there, each with its reason", () => {
    for (const kept of KEPT) {
      const lines = readFileSync(join(ROOT, kept.file), "utf8")
        .split("\n")
        .map((line) => line.trim());
      expect(lines, kept.file).toContain(kept.line);
      expect(kept.why).not.toBe("");
    }
  });

  it("catches each way of reading it", () => {
    for (const line of [
      "const t = Date.now();",
      "const t = performance.now();",
      "const t = new Date();",
      "const t = new Date;",
      "const s = Date();",
      "Temporal.Now.instant()",
      "process.hrtime.bigint()",
      "const origin = performance.timeOrigin;",
      "const t = new globalThis.Date();",
      "const t = Reflect.construct(Date, []);",
      'new Intl.DateTimeFormat("en-GB").format()',
      "formatter.formatToParts( )",
      "sql`SELECT now()`",
      "SELECT now ()",
      "SELECT clock_timestamp( )",
      "DEFAULT pg_catalog.now()",
      "sql`SELECT clock_timestamp()`",
      "WHERE reveal_at <= CURRENT_TIMESTAMP",
      "SELECT localtimestamp",
      "SELECT transaction_timestamp()",
      "WHERE reveal_at <= 'now'::timestamptz",
      "SELECT timestamptz 'now'",
      "WHERE local_date = 'today'::date",
      "SELECT CAST('Tomorrow' AS date)",
      "WHERE reveal_at <= 'today 07:00'::timestamptz",
      "WHERE close_at <= 'tomorrow 01:00'",
      "SELECT '07:00 today'::timestamptz",
      "SELECT timestamptz 'yesterday 07:00+00'",
      "SELECT age(reveal_at) > interval '1 day'",
      "SELECT AGE (reveal_at)",
      'import { fakeClock } from "@tadayo/domain/testing";',
      "const clock = fakeClock(start);",
    ]) {
      expect(clockReads("x.ts", line), line).not.toEqual([]);
    }
    for (const line of [
      "new Date(Date.parse(day))",
      "new Date(instant)",
      "const d = nextDate(date);",
      "x.Date(1)",
      "// Home shows the day now (T5)",
      "// the members active now (T7)",
      "snow()",
      "reveal_at <= $1",
      "const nowish = 1;",
      'const label = "Today";',
      "formatter.format(new Date(instant))",
      "SELECT '2026-11-13 07:00:00+00'::timestamptz",
      "// a member's day isn't open now, so it's hidden",
      "const page = usage(1) + message(2);",
    ]) {
      expect(clockReads("x.ts", line), line).toEqual([]);
    }
  });

  it(
    "compiles the server's TypeScript without an error, so the check below follows every type to its end",
    () => {
      const program = server();
      const errors = serverTypeScript().flatMap((file) => problems(program, file));
      expect(errors).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "finds no code outside the time module that makes a ServerNow of its own (the outside audit's A14)",
    () => {
      const program = server();
      expect(serverTypeScript().flatMap((file) => nowMints(program, file))).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "catches each way of making one, however it is laid out or named, and leaves the type alone",
    () => {
      const program = server();
      for (const [index, [what, , refused]] of MAKES.entries()) {
        const file = caseFile("makes", index);
        expect(problems(program, file), what).toEqual(refused === undefined ? [] : [`${file}:3: ${refused}`]);
        expect(nowMints(program, file), what).not.toEqual([]);
      }
      for (const [index, [what]] of LEAVES.entries()) {
        const file = caseFile("leaves", index);
        expect(problems(program, file), what).toEqual([]);
        expect(nowMints(program, file), what).toEqual([]);
      }
    },
    TIMEOUT,
  );

  it("leaves the dev clock's table out of every numbered migration, which prod runs too (ADR-013)", () => {
    const migrations = walk("db").filter((file) => file.startsWith(MIGRATIONS) && file.endsWith(".sql"));
    expect(migrations.length).toBeGreaterThan(0);
    for (const file of migrations) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/dev_clock/i);
    }
  });
  it(
    "finds each plain instant the server's code takes on PLAIN_INSTANTS, and nothing there that it doesn't take (the outside audit's A14)",
    () => {
      const program = server();
      const found = [...serverTypeScript(), ...timeModule()].flatMap((file) => plainInstants(program, file)).sort();
      const kept = PLAIN_INSTANTS.flatMap((entry) => entry.at).sort();
      expect(found).toEqual(kept);
      for (const entry of PLAIN_INSTANTS) expect(entry.why).not.toBe("");
    },
    TIMEOUT,
  );

  it(
    "finds a plain instant a parameter or a field takes, alone, in a union, optional, through an alias, branded or as a constraint, and leaves a ServerNow alone",
    () => {
      const program = server();
      // Every case at once, so a failure names each case it reaches, not only the first.
      const found = PLAIN.map(([what], index) => {
        const file = caseFile("plain", index);
        return { what, problems: problems(program, file), plain: plainInstants(program, file) };
      });
      expect(found).toEqual(
        PLAIN.map(([what, , expected], index) => {
          const file = caseFile("plain", index).split(sep).join("/");
          return { what, problems: [], plain: expected.map((name) => `${file}: ${name}`) };
        }),
      );
    },
    TIMEOUT,
  );
});

// Nor does SQL resolve a zone: the time module resolves every one with Temporal, and Postgres only compares instants
// and dates (ADR-008). Postgres's zone list is its own, and need not have a name Node takes: Node keeps an older name as
// given (US/Eastern, Europe/Kiev), and some Postgres builds leave those names out (Ubuntu's Postgres 16 does), so a
// trigger that resolved the club's zone failed every join after the first days in such a club (the outside audit's
// A11). The scan reads the server's code and SQL, and the time module's, each file whole, so a form split over lines is
// read as one; the live schema's own check, after every migration has run, is tests/src/db/migrations.test.ts's.
//
// SQL can also take the session's zone without naming one: a cast between a timestamptz and a date or a timestamp,
// `to_char`, a field but the epoch, or a day's interval on a timestamptz. Their words can't tell them from a date's own,
// so the database tests run each session in a zone 14 hours from UTC (tests/src/db/harness.ts, SESSION_ZONE), where
// such SQL gives another date than UTC's for most of each day; the clock's scan above holds `CURRENT_DATE`,
// `LOCALTIMESTAMP` and `age()`.

/** The ways SQL names a zone, takes one by name, or sets the session's: the live check reads the schema for each too. */
const SQL_ZONES = [
  { what: "AT TIME ZONE or AT LOCAL", pattern: /\bAT\s+(?:TIME\s+ZONE|LOCAL)\b/i },
  { what: "timezone()", pattern: /\btimezone"?\s*\(/i },
  { what: "the zone lists", pattern: /\bpg_timezone_(?:names|abbrevs)\b/i },
  // Each takes a zone's name as its last argument, or the session's zone without one.
  { what: "a function that takes a zone", pattern: /\b(?:make_timestamptz|date_add|date_subtract)\s*\(/i },
  // Its third argument is a zone's name; on a timestamptz without one, it takes the session's zone.
  { what: "date_trunc but on a plain timestamp", pattern: /\bdate_trunc\s*\((?![^()]*::pg_catalog\.timestamp\s*\))/i },
  // A series of timestamptz steps by the session's zone, or by a zone named as its fourth argument.
  { what: "a series of times", pattern: /\bgenerate_series\s*\([^()]*\b(?:interval|timestamp)/i },
  { what: "a zone's name built into text", pattern: /\|\|\s*(?:\w+\.)?"?timezone\b|\btimezone"?\s*\|\|/i },
  {
    what: "a setting of the zone",
    pattern:
      /\bSET\s+(?:SESSION\s+|LOCAL\s+)?"?(?:TIME\s+ZONE|timezone)\b|\bset_config\s*\(\s*'timezone'|-c\s*timezone\s*=|\bPGTZ\b/i,
  },
] as const;

/** SQL's ways, and the database client's setting of the session's zone. */
const ZONES = [
  ...SQL_ZONES,
  // In the case Postgres's setting has: a field named `timezone` is a club's or a device's zone name.
  { what: "the client's TimeZone setting", pattern: /\bTimeZone\s*:/ },
  {
    what: "the client's timezone setting, quoted or among its connection options",
    pattern: /['"]timezone['"]\s*:|\bconnection\s*:\s*\{[^}]*\btimezone\b/i,
  },
] as const;

/** Lines that name a zone, each with its reason. */
const ZONES_KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: join("db", "migrations", "0015_new_member_day.sql"),
    line: "IF NEW.effective_from IS DISTINCT FROM (SELECT (NEW.created_at AT TIME ZONE c.timezone)::date",
    why: "0015 has run in every environment and is never edited; 0019 replaces app.schedule_change_start_guard with a check that resolves no zone, which the live schema's check holds",
  },
  {
    file: join("packages", "contracts", "src", "common.ts"),
    line: '"timezone (T2). Clients target its id, never a weekday (spec 05).",',
    why: "prose in the contract's description of a club's zone, not SQL",
  },
];

/**
 * Each place in `text` that names or resolves a zone in SQL, or sets the session's, as "file:line: what". The whole
 * text is read, so a form split over lines is one; a match that starts on a line kept is left out.
 */
export function zoneResolutions(file: string, text: string): string[] {
  const lines = text.split("\n");
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  const found: string[] = [];
  for (const zone of ZONES) {
    for (const match of text.matchAll(new RegExp(zone.pattern.source, zone.pattern.flags + "g"))) {
      const line = lineOf(match.index);
      const trimmed = (lines[line - 1] ?? "").trim();
      if (ZONES_KEPT.some((kept) => kept.file === file && kept.line === trimmed)) continue;
      found.push(`${file}:${String(line)}: ${zone.what}`);
    }
  }
  return found.sort();
}

describe("only the time module resolves a time zone; SQL compares instants and dates (ADR-008, T2; the outside audit's A11)", () => {
  it("finds no code or SQL of the server's, nor of the time module's, that names, takes or sets one", () => {
    const found = [...productFiles(), ...timeModule()].flatMap((file) =>
      zoneResolutions(file, readFileSync(join(ROOT, file), "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("reads the time module, whose clock runs SQL", () => {
    expect(timeModule()).toContain(join(TIME_MODULE, "clock.ts"));
  });

  it("keeps only lines that are still there, each with its reason", () => {
    for (const kept of ZONES_KEPT) {
      const lines = readFileSync(join(ROOT, kept.file), "utf8")
        .split("\n")
        .map((line) => line.trim());
      expect(lines, kept.file).toContain(kept.line);
      expect(kept.why).not.toBe("");
    }
  });

  it("has the live schema's check read for each of SQL's ways", () => {
    // tests/src/db/migrations.test.ts keeps its own list, as the tests package doesn't import the domain's tests.
    const live = readFileSync(join(ROOT, "tests", "src", "db", "migrations.test.ts"), "utf8");
    for (const zone of SQL_ZONES) expect(live, zone.what).toContain(zone.pattern.source);
  });

  it("catches each way of naming, taking or setting one, and a way split over lines", () => {
    for (const text of [
      "IF NEW.effective_from <> (NEW.created_at AT TIME ZONE c.timezone)::date THEN",
      "SELECT x at  time zone 'UTC'",
      "SELECT NEW.created_at AT LOCAL",
      "SELECT o.reveal_at AT\n         TIME ZONE c.timezone",
      "SELECT pg_catalog.timezone(c.timezone, NEW.created_at)",
      "SELECT timezone ('Europe/London', o.reveal_at)",
      "SELECT pg_catalog.timezone (zone_name, o.reveal_at)",
      'SELECT pg_catalog."timezone"(c.timezone, o.reveal_at)',
      "SELECT timezone\n  (c.timezone, o.reveal_at)",
      "SELECT name FROM pg_catalog.pg_timezone_names",
      "SELECT abbrev FROM pg_timezone_abbrevs",
      "SELECT pg_catalog.make_timestamptz(2026, 7, 1, 7, 0, 0, c.timezone)",
      "SELECT pg_catalog.date_add(o.reveal_at, interval '1 day', c.timezone)",
      "SELECT date_subtract(o.reveal_at, interval '1 day')",
      "SELECT pg_catalog.date_trunc('day', o.reveal_at, c.timezone)",
      "SELECT date_trunc('day', o.reveal_at)",
      "SELECT pg_catalog.generate_series(a.starts_at, a.ends_at, interval '1 day', c.timezone)",
      "SELECT (o.local_date::text || ' 07:00 ' || c.timezone)::pg_catalog.timestamptz",
      "SELECT (c.timezone || ' ' || x)",
      "SET TIME ZONE 'Europe/London';",
      "await sql`SET LOCAL timezone = 'UTC'`;",
      "ALTER ROLE tadayo_app SET timezone TO 'UTC';",
      `ALTER FUNCTION app.f() SET "TimeZone" TO 'UTC';`,
      "SELECT pg_catalog.set_config('timezone', 'UTC', true)",
      "const url = `${base}?options=-c TimeZone=UTC`;",
      "process.env.PGTZ = 'UTC';",
      "const sql = postgres(url, { connection: { TimeZone: 'UTC' } });",
      "const sql = postgres(url, { connection: { timezone: 'UTC' } });",
      "const sql = postgres(url, {\n  connection: {\n    application_name: 'api',\n    timezone: 'UTC',\n  },\n});",
      "const options = { 'TimeZone': 'UTC' };",
    ]) {
      expect(zoneResolutions("x.sql", text), text).not.toEqual([]);
    }
  });

  it("keeps every zone's offset between -12 and +14 hours to 2036, the bound migration 0019's check of a pick's date takes", () => {
    const sql = readFileSync(join(ROOT, "db", "migrations", "0019_pick_date_without_zone.sql"), "utf8");
    // A date begins at +14, 14 hours before its midnight by UTC's clock, and ends at -12, 36 hours after it.
    expect(sql).toContain("since_midnight < -14 * 3600 OR since_midnight >= 36 * 3600");
    const end = Temporal.Instant.from("2037-01-01T00:00:00Z");
    const outside: string[] = [];
    // Every zone Node lists, and Etc's two ends, which Temporal resolves though Node doesn't list them.
    for (const zone of [...Intl.supportedValuesOf("timeZone"), "Etc/GMT+12", "Etc/GMT-14"]) {
      let at: Temporal.ZonedDateTime | null = Temporal.Instant.from("2026-01-01T00:00:00Z").toZonedDateTimeISO(zone);
      while (at !== null && Temporal.Instant.compare(at.toInstant(), end) < 0) {
        const hours = at.offsetNanoseconds / 3_600_000_000_000;
        if (hours < -12 || hours > 14) outside.push(`${zone} at ${at.toString()}`);
        at = at.getTimeZoneTransition("next");
      }
    }
    expect(outside).toEqual([]);
  });

  it("leaves a column named timezone, the time module's own name for it, a date's cast and a series of numbers alone", () => {
    for (const text of [
      "SELECT c.timezone FROM app.clubs c WHERE c.id = ${clubId} FOR UPDATE",
      "timezone = clubTimeZone(input.timezone);",
      "readonly timezone: string;",
      "timezone text NOT NULL CHECK (",
      "INSERT INTO app.clubs (id, name, timezone) VALUES (${id}, ${name}, ${timezone})",
      "pg_catalog.date_trunc('week', o.local_date::pg_catalog.timestamp)",
      "EXTRACT(epoch FROM NEW.effective_from)",
      "SELECT pg_catalog.generate_series(1, ${count})",
      "now.toZonedDateTimeISO(clubTimeZone(timezone)).toPlainDate()",
      "const zone = Temporal.Now.timeZoneId();",
      "return { timezone: club.timezone, name: club.name };",
    ]) {
      expect(zoneResolutions("x.ts", text), text).toEqual([]);
    }
  });
});
