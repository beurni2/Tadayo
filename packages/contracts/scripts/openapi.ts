// Writes openapi.yaml from the zod schemas, or checks that it's up to date (the ci step `openapi`).
//   node scripts/openapi.ts write
//   node scripts/openapi.ts check
import { readFileSync, writeFileSync } from "node:fs";

import { renderOpenApi } from "../src/render.ts";

const file = new URL("../openapi.yaml", import.meta.url);
const mode = process.argv[2];
const text = renderOpenApi();

if (mode === "write") {
  writeFileSync(file, text);
  console.log("openapi.yaml written");
} else if (mode === "check") {
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {
    console.error("openapi.yaml is missing: run `pnpm --filter @tadayo/contracts openapi:write`");
    process.exit(1);
  }
  if (current !== text) {
    console.error("openapi.yaml is out of date: run `pnpm --filter @tadayo/contracts openapi:write` and commit it");
    process.exit(1);
  }
  console.log("openapi.yaml is up to date");
} else {
  console.error("usage: node scripts/openapi.ts write|check");
  process.exit(2);
}
