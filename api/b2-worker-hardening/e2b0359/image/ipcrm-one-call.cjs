// As tadayo-image: 32,000 queues and 32,000 semaphore sets, then one ipcrm call for all, as the third commit's sweep made it.
const fs = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const uid = String(process.getuid());
const collect = () => {
  const objects = [];
  for (const [kind, flag] of [["shm", "-m"], ["sem", "-s"], ["msg", "-q"]]) {
    const [head, ...rows] = fs.readFileSync("/proc/sysvipc/" + kind, "latin1").trim().split("\n").map((l) => l.trim().split(/\s+/));
    const id = head.indexOf(kind === "msg" ? "msqid" : kind + "id");
    for (const row of rows) if (row[head.indexOf("uid")] === uid || row[head.indexOf("cuid")] === uid) objects.push(flag, row[id]);
  }
  return objects;
};
const mode = process.argv[2];
const objects = collect();
const bytes = objects.reduce((n, a) => n + a.length + 1 + 8, 0);
let out;
if (mode === "exec") {
  try { execFileSync("/usr/bin/ipcrm", objects, { stdio: "ignore" }); out = "returned"; }
  catch (e) { out = { name: e.name, code: e.code, status: e.status, message: String(e.message).slice(0, 120) }; }
} else {
  const r = spawnSync("/usr/bin/ipcrm", objects, { stdio: "ignore" });
  out = { status: r.status, error: r.error && r.error.code };
}
console.log(JSON.stringify({ mode, args: objects.length, argBytes: bytes, out, left: collect().length / 2 }));
