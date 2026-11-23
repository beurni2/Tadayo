import { readFileSync } from "node:fs";
const keys = /^(Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs):/;
export const status = (pid) => Object.fromEntries(readFileSync(`/proc/${pid}/status`, "utf8").split("\n").filter((l) => keys.test(l)).map((l) => { const [k, ...v] = l.split(":"); return [k, v.join(":").trim().replace(/\s+/g, " ")]; }));
if (process.argv[1].endsWith("status.mjs")) {
  const self = status("self");
  let dumpable; try { readFileSync("/proc/self/environ"); dumpable = "environ readable"; } catch (e) { dumpable = e.code; }
  console.log(JSON.stringify({ ...self, environSelf: dumpable }));
}
