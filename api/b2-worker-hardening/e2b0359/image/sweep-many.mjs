// Round 2's B3: tens of thousands of System V objects of the photo user, then the worker's sweep (as fly.toml's
// worker command runs it), timed; what is left after.
import { readFileSync } from "node:fs";
import { photoUserFor, sweep } from "/app/services/worker/src/privileges.ts";
const user = photoUserFor(process.env);
const count = () => Object.fromEntries(["msg", "sem", "shm"].map((kind) => {
  const [head, ...rows] = readFileSync(`/proc/sysvipc/${kind}`, "latin1").trim().split("\n").map((l) => l.trim().split(/\s+/));
  const owner = head.indexOf("uid");
  const maker = head.indexOf("cuid");
  return [kind, rows.filter((r) => r[owner] === String(user.uid) || r[maker] === String(user.uid)).length];
}));
const before = count();
const started = Date.now();
let outcome = "swept";
try { await sweep(user); } catch (e) { outcome = `${e.name}: ${e.why}`; }
console.log(JSON.stringify({ before, outcome, ms: Date.now() - started, after: count() }));
