import { readFileSync } from "node:fs";
const keys = /^(Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs|SigBlk|SigCgt):/;
export const status = (pid) => Object.fromEntries(readFileSync(`/proc/${pid}/status`, "utf8").split("\n").filter((l) => keys.test(l)).map((l) => { const [k, ...v] = l.split(":"); return [k, v.join(":").trim().replace(/\s+/g, " ")]; }));
const limits = (pid) => Object.fromEntries(readFileSync(`/proc/${pid}/limits`, "utf8").split("\n").filter((l) => /^Max (core file size|processes|msgqueue size)/.test(l)).map((l) => [l.slice(0, 26).trim(), l.slice(26).trim().replace(/\s+/g, " ")]));
if (process.argv[1].endsWith("status.mjs")) {
  const self = status("self");
  let dumpable; try { readFileSync("/proc/self/environ"); dumpable = "environ readable"; } catch (e) { dumpable = e.code; }
  const usr1 = (field) => (BigInt(`0x${self[field]}`) & 0x200n) !== 0n;
  console.log(JSON.stringify({ ...self, usr1Blocked: usr1("SigBlk"), usr1Caught: usr1("SigCgt"), limits: limits("self"), environSelf: dumpable, argv: process.execArgv }));
}
