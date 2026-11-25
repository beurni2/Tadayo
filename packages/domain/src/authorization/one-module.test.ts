// Only the authorization module reads a drop's audience and the blocks (T9: "The predicate lives in one
// authorization module, used by every route, job, notification, search, suggestion and widget"; TECH-DESIGN
// section 5). A route, a job or an ops script that joined `app.drop_audience` or `app.blocks` itself would be stating
// the predicate again, and a copy can drift: the outside audit's A14 rewrote Home's page with its own one-way block,
// and Cleo, who had blocked Ben, got Ben's drop. The commit writes the audience once, sealed (T8): that line is kept,
// with its reason. The migrations, which define the tables, aren't scanned.
//
// The scan reads the server's code a line at a time, like the time module's (../time/one-clock.test.ts), so it
// catches the ordinary ways of naming the tables, not a deliberate way round it such as a name built from parts.

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const MODULE = join("packages", "domain", "src", "authorization") + sep;

/** The server's folders but `tests/` and `db/` (docs/MILESTONES.md, "Lanes"). */
const ROOTS = ["packages", "services", join("apps", "web"), join("tools", "ops")];
const SCANNED = /\.(?:ts|mts|cts|js|mjs|cjs|sql|html)$/;
const TEST = /\.test\.(?:ts|mts|cts|js|mjs|cjs)$/;

const NAMES = [
  { what: "a drop's audience", pattern: /\bdrop_audience\b/i },
  // `blocks` alone is an English word, so the table is looked for as SQL names it: with its schema, or after FROM,
  // JOIN, INTO, UPDATE or TABLE, quoted or not.
  { what: "the blocks", pattern: /(?:\bapp"?\s*\.\s*|\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+)"?blocks\b/i },
] as const;

/**
 * Lines outside the module that name one of the tables and read nothing through it, each with its reason. The match
 * is the whole line, trimmed, so any change to one is scanned again.
 */
const KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: join("packages", "domain", "src", "drops", "commit.ts"),
    line: "INSERT INTO app.drop_audience (drop_id, club_id, interval_id)",
    why: "the commit writes the drop's audience once, at commit, and the table seals it (T8); it reads nothing back",
  },
];

/** A file the scan reads: code, SQL or a web page anywhere under a root, but a test, a dependency or the module. */
export function isScanned(file: string): boolean {
  return (
    SCANNED.test(file) && !TEST.test(file) && !file.split(sep).includes("node_modules") && !file.startsWith(MODULE)
  );
}

function scannedFiles(): string[] {
  return ROOTS.flatMap((dir) =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((entry) => join(dir, entry)),
  )
    .filter(isScanned)
    .sort();
}

/** Each line of `text` that names the audience or the blocks, as "file:line: what", leaving out the lines KEPT. */
export function tableNames(file: string, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (KEPT.some((kept) => kept.file === file && kept.line === line.trim())) return;
    for (const name of NAMES) if (name.pattern.test(line)) found.push(`${file}:${String(index + 1)}: ${name.what}`);
  });
  return found;
}

describe("only the authorization module reads a drop's audience and the blocks (T9)", () => {
  it("finds the server's code to look at, and neither a test nor the module itself", () => {
    const files = scannedFiles();
    for (const file of [
      "packages/domain/src/clubs/home.ts",
      "packages/domain/src/drops/commit.ts",
      "services/api/src/app.ts",
      "services/worker/src/main.ts",
      "tools/ops/src/migrate.ts",
    ])
      expect(files).toContain(join(...file.split("/")));
    expect(files.some((file) => file.startsWith(MODULE))).toBe(false);
    expect(files.some((file) => TEST.test(file))).toBe(false);
    expect(files.some((file) => file.startsWith("db" + sep))).toBe(false);
  });

  it("finds no other code that names them", () => {
    const found = scannedFiles().flatMap((file) => tableNames(file, readFileSync(join(ROOT, file), "utf8")));
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

  it("catches each way of naming them", () => {
    for (const line of [
      "JOIN app.drop_audience a ON a.drop_id = d.id",
      "FROM app.drop_audience",
      'SELECT FROM "app"."drop_audience"',
      "AND NOT EXISTS (SELECT FROM app.blocks b",
      "LEFT JOIN app . blocks b ON b.blocker_user_id = m.user_id",
      "FROM blocks b",
      'JOIN "blocks" b',
      'SELECT FROM "app"."blocks"',
      "INSERT INTO app.blocks (id, blocker_user_id)",
      "DELETE FROM app.blocks WHERE id = $1",
      "UPDATE app.drop_audience SET interval_id = $1",
      "INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES ($1, $2, $3)",
    ])
      expect(tableNames("x.ts", line), line).not.toEqual([]);
    for (const line of [
      "// a block ends every club they shared (D11)",
      "// what the viewer's blocks mean for Home",
      "const blocks = await blocksOf(viewer);",
      "for (const block of blocks) {",
      "// the drop's audience, sealed at commit",
    ])
      expect(tableNames("x.ts", line), line).toEqual([]);
    // The kept line is kept only in its own file.
    expect(tableNames(join("packages", "domain", "src", "clubs", "home.ts"), KEPT[0]?.line ?? "")).not.toEqual([]);
  });
});
