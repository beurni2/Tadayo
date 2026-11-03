// `pnpm copy-lint`: runs the copy lint over every string file in the repository
// (docs/INVARIANTS.md T41 to T43). Exit 0 when clean, 1 with each finding printed.
// `design/reference/` holds renders and deliveries that are never shipped, so it's skipped.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractStrings, isStringFile } from "./extract.ts";
import { lintString } from "./rules.ts";

// Renders and deliveries at the top of the repository are never shipped; dependencies anywhere.
function skipped(path: string): boolean {
  return path.startsWith("design/reference/") || path.startsWith("node_modules/") || path.includes("/node_modules/");
}

export function decode(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  // UTF-16 without a byte-order mark: ASCII text leaves every other byte zero.
  if (bytes.length >= 2 && bytes[1] === 0 && bytes[0] !== 0) return bytes.toString("utf16le");
  if (bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0) {
    const swapped = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return bytes.toString("utf8").replace(/^\uFEFF/u, "");
}

function stringFiles(root: string): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return listed
    .split("\0")
    .filter((path) => path !== "" && isStringFile(path))
    .filter((path) => !skipped(path))
    .sort();
}

function main(): number {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = stringFiles(root);
  let problems = 0;
  for (const path of files) {
    for (const text of extractStrings(path, decode(readFileSync(join(root, path))))) {
      for (const finding of lintString(text)) {
        problems += 1;
        console.log(`${path}: [${finding.rule}] ${finding.message}\n    in: ${JSON.stringify(text)}`);
      }
    }
  }
  console.log(`copy lint: ${String(files.length)} string file(s), ${String(problems)} finding(s)`);
  return problems === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main();
