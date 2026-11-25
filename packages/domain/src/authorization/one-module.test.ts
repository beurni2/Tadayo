// Only the authorization module reads a drop's audience and the blocks (T9: "The predicate lives in one
// authorization module, used by every route, job, notification, search, suggestion and widget"; TECH-DESIGN
// section 5). A route, a job or an ops script that joined `app.drop_audience` or `app.blocks` itself would be stating
// the predicate again, and a copy can drift: the outside audit's A14 rewrote Home's page with its own one-way block,
// and Cleo, who had blocked Ben, got Ben's drop. The commit writes the audience once, sealed (T8): that line is kept,
// with its reason. So are the migrations' lines that define the tables, refer to the audience by a foreign key or
// guard a write by it, each with its reason; a view or a function that read them for a viewer would be a second
// statement of the predicate in SQL, and is scanned like any other line.
//
// The scan reads the server's code a line at a time, like the time module's (../time/one-clock.test.ts), so it
// catches the ordinary ways of naming the tables, not a deliberate way round it such as a name built from parts.

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const MODULE = join("packages", "domain", "src", "authorization") + sep;

/** The server's folders but `tests/` (docs/MILESTONES.md, "Lanes"), as the time module's scan reads them. */
const ROOTS = ["packages", "services", "db", join("apps", "web"), join("tools", "ops")];
const SCANNED = /\.(?:ts|mts|cts|js|mjs|cjs|sql|html)$/;
const TEST = /\.test\.(?:ts|mts|cts|js|mjs|cjs)$/;

const NAMES = [
  { what: "a drop's audience", pattern: /\bdrop_audience\b/i },
  // `blocks` alone is an English word, so the table is looked for as SQL names it: with its schema, in any case, or
  // after FROM, JOIN, INTO, UPDATE or TABLE as this codebase writes them, in capitals, quoted or not. Unqualified,
  // it names nothing: no role here has `app` on its search path.
  { what: "the blocks", pattern: /\bapp"?\s*\.\s*"?blocks\b/i },
  { what: "the blocks", pattern: /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+"?blocks\b/ },
] as const;

const DEFINES = "the migration defines the table, its row security, an index on it or its write-once guard";
const SEALS = "the audience's own guard: written once, at commit, by active members only, and never changed (T8)";
const COMMITTED =
  "the commit's last check, at its end: a committed drop's audience holds its author, its star and every active member (T8); it shows nobody anything";
const REFERS =
  "a foreign key, or the comment on one: a reaction, comment, favourite, report or removal names someone in the drop's audience, which the database checks on write";
const REPLIES =
  "the last guard behind the predicate on a photo reply's upload: its owner is in the drop's audience and still a member (T63), on write";

function kept(file: string, why: string, lines: readonly string[]) {
  return lines.map((line) => ({ file, line, why }));
}

/**
 * Lines outside the module that name one of the tables and read nothing through it for a viewer, each with its
 * reason. The match is the whole line, trimmed, so any change to one is scanned again.
 */
const KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: join("packages", "domain", "src", "drops", "commit.ts"),
    line: "INSERT INTO app.drop_audience (drop_id, club_id, interval_id)",
    why: "the commit writes the drop's audience once, at commit, and the table seals it (T8); it reads nothing back",
  },
  ...kept(join("db", "migrations", "0006_contributions.sql"), DEFINES, [
    "CREATE TABLE app.drop_audience (",
    "ALTER TABLE app.drop_audience ENABLE ROW LEVEL SECURITY;",
    "CREATE INDEX drop_audience_by_interval ON app.drop_audience (interval_id, drop_id);",
  ]),
  ...kept(join("db", "migrations", "0006_contributions.sql"), SEALS, [
    "CREATE FUNCTION app.drop_audience_guard() RETURNS trigger",
    "RAISE EXCEPTION 'app.drop_audience: an audience is written once and never changes (T8)'",
    "RAISE EXCEPTION 'app.drop_audience: drop %''s audience was sealed at %; nobody joins it afterwards (T8)',",
    "RAISE EXCEPTION 'app.drop_audience: % isn''t an active member, so it isn''t in an audience (T8)', NEW.interval_id",
    "CREATE TRIGGER drop_audience_guard BEFORE INSERT OR UPDATE OR DELETE ON app.drop_audience",
    "FOR EACH ROW EXECUTE FUNCTION app.drop_audience_guard();",
    "CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience",
  ]),
  ...kept(join("db", "migrations", "0006_contributions.sql"), COMMITTED, [
    "IF NOT EXISTS (SELECT FROM app.drop_audience WHERE drop_id = d.id AND interval_id = d.author_interval_id)",
    "OR NOT EXISTS (SELECT FROM app.drop_audience WHERE drop_id = d.id AND interval_id = star) THEN",
    "AND NOT EXISTS (SELECT FROM app.drop_audience a WHERE a.drop_id = d.id AND a.interval_id = m.interval_id)) THEN",
  ]),
  ...kept(join("db", "migrations", "0007_after_the_reveal.sql"), REFERS, [
    "-- drop_audience, so nobody outside it can react, comment or save. Each is written only from the",
    "FOREIGN KEY (drop_id, interval_id) REFERENCES app.drop_audience (drop_id, interval_id)",
    "FOREIGN KEY (drop_id, author_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),",
  ]),
  ...kept(join("db", "migrations", "0008_safety.sql"), REFERS, [
    "FOREIGN KEY (drop_id, reporter_interval_id) REFERENCES app.drop_audience (drop_id, interval_id)",
    "FOREIGN KEY (drop_id, actor_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),",
  ]),
  ...kept(join("db", "migrations", "0008_safety.sql"), DEFINES, [
    "CREATE TABLE app.blocks (",
    "ALTER TABLE app.blocks ENABLE ROW LEVEL SECURITY;",
    "CREATE INDEX blocks_by_blocker ON app.blocks (blocker_user_id, created_at DESC, id);",
    "CREATE INDEX blocks_by_blocked ON app.blocks (blocked_user_id);",
    "CREATE TRIGGER blocks_written_once BEFORE UPDATE ON app.blocks",
  ]),
  ...kept(join("db", "migrations", "0011_photo_messages.sql"), REPLIES, [
    "PERFORM FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id",
  ]),
  ...kept(join("db", "migrations", "0011_photo_messages.sql"), REFERS, [
    "FOREIGN KEY (drop_id, actor_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),",
  ]),
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
  it("finds the server's code to look at, the migrations included, and neither a test nor the module itself", () => {
    const files = scannedFiles();
    for (const file of [
      "packages/domain/src/clubs/home.ts",
      "packages/domain/src/drops/commit.ts",
      "services/api/src/app.ts",
      "services/worker/src/main.ts",
      "tools/ops/src/migrate.ts",
      "db/bootstrap.sql",
      "db/migrations/0006_contributions.sql",
      "db/migrations/0008_safety.sql",
    ])
      expect(files).toContain(join(...file.split("/")));
    expect(files.some((file) => file.startsWith(MODULE))).toBe(false);
    expect(files.some((file) => TEST.test(file))).toBe(false);
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
      "from app.blocks b where b.blocked_user_id = $1",
      "CREATE VIEW app.readable AS SELECT d.id FROM app.drops d JOIN app.drop_audience a ON a.drop_id = d.id",
      "CREATE FUNCTION app.may_see(viewer app.id) RETURNS boolean AS $$ SELECT NOT EXISTS (SELECT FROM app.blocks b",
    ])
      expect(tableNames("x.ts", line), line).not.toEqual([]);
    for (const line of [
      "// a block ends every club they shared (D11)",
      "// what the viewer's blocks mean for Home",
      "const blocks = await blocksOf(viewer);",
      "for (const block of blocks) {",
      "// the drop's audience, sealed at commit",
      "// split the text into blocks",
      'const note = "keep it out from blocks of text";',
      "-- blocks are written once (D11)",
    ])
      expect(tableNames("x.ts", line), line).toEqual([]);
    // A kept line is kept only in its own file.
    expect(tableNames(join("packages", "domain", "src", "clubs", "home.ts"), KEPT[0]?.line ?? "")).not.toEqual([]);
    expect(
      tableNames(
        join("db", "migrations", "0099_later.sql"),
        "FOREIGN KEY (drop_id, interval_id) REFERENCES app.drop_audience (drop_id, interval_id)",
      ),
    ).not.toEqual([]);
  });
});
