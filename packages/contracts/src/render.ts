// openapi.yaml as text: the document from `document.ts`, in YAML with no anchors or aliases (the Swift
// generator and Prism read plain YAML), under a header that says it's generated.
import { stringify } from "yaml";

import { buildDocument } from "./document.ts";

const HEADER =
  "# Generated from packages/contracts/src by `pnpm --filter @tadayo/contracts openapi:write`.\n" +
  "# Never edit it by hand: `openapi:check` (the ci step `openapi`) fails when it and the zod schemas differ.\n";

export function renderOpenApi(): string {
  return HEADER + stringify(buildDocument(), { aliasDuplicateObjects: false, lineWidth: 0, indentSeq: true });
}
