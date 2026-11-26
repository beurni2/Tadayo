import { readFileSync, readdirSync } from "node:fs";
const New: any = await import("/home/user/tadayo-a14b/tests/src/privacy/scanner.ts");
const Old: any = await import("/home/user/tadayo-a14b/tests/src/privacy/.old-scanner-r4.ts");
const keys = new Set<string>();
const yaml = readFileSync("/home/user/tadayo-a14b/packages/contracts/openapi.yaml", "utf8");
// property keys: lines under a `properties:` block, indented one level deeper
const lines = yaml.split("\n");
for (let i = 0; i < lines.length; i++) {
  const m = /^(\s*)properties:\s*$/.exec(lines[i]); if (!m) continue;
  const base = m[1].length;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]; if (l.trim() === "") continue;
    const ind = l.length - l.trimStart().length; if (ind <= base) break;
    const k = /^\s*([A-Za-z_][A-Za-z0-9_]*):/.exec(l);
    if (k && ind === base + 2) keys.add(k[1]);
  }
}
for (const f of readdirSync("/home/user/tadayo-a14b/packages/contracts/src/schemas")) {
  const t = readFileSync(`/home/user/tadayo-a14b/packages/contracts/src/schemas/${f}`, "utf8");
  for (const m of t.matchAll(/^\s+([a-z_][a-z0-9_]*)\??:/gim)) keys.add(m[1]);
}
console.log("keys", keys.size);
const flips = [...keys].filter((k) => New.neverKey(k) !== Old.neverKey(k));
console.log("flips", flips);
