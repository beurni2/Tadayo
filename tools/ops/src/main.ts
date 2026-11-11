// The `ops` entry (docs/plans/B0.md, slices 10a and 10b):
//
//   node tools/ops/src/main.ts <script> [--option value …]
//
// run.ts has the scripts and what each takes from the environment. Every line goes through the
// redactor, the error's too, and a failure prints its message and never its stack: a driver's or
// a child process's words may hold what the redactor knows how to hold back (T56).

import { join } from "node:path";
import postgres from "postgres";
import { failureText, noticeLine, redactor } from "./output.ts";
import { runScript } from "./run.ts";
import { spawnProcess } from "./spawn.ts";

const redact = redactor(process.env);

try {
  await runScript(process.argv[2], {
    env: process.env,
    args: process.argv.slice(3),
    repo: join(import.meta.dirname, "..", "..", ".."),
    spawn: spawnProcess,
    fetch,
    // Supabase's session pooler, which asks for TLS. Postgres's warnings are shown; its routine notices aren't.
    connect: (url) =>
      postgres(url, {
        max: 1,
        ssl: "require",
        connect_timeout: 20,
        onnotice: (notice) => {
          const line = noticeLine(notice);
          if (line !== undefined) console.error(redact(line));
        },
      }),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    say: (line) => {
      console.log(redact(line));
    },
  });
} catch (error) {
  console.error(redact(failureText(error)));
  process.exitCode = 1;
}
