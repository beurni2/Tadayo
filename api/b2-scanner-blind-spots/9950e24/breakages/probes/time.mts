import { randomBytes } from "node:crypto";
const S: any = await import("/home/user/tadayo-a14b/tests/src/privacy/scanner.ts");
const texts = new S.Needles([], { cuts: true });
const states = ["before the reveal", "on the day", "after the day", "in Memories"];
for (let w = 0; w < 3000; w++) { const sfx = " " + randomBytes(6).toString("hex"); for (const t of ["Ana", "Ben", "Cleo", "Dan", "Saturday People", "From Ben", "Ben's pick", "Cleo's pick", "Ana's label", "Ben's label"]) texts.add(t + sfx); for (const st of states) texts.add(`The ferry at dawn${sfx} ${st}`); }
console.log("needles", texts.size);
const vals = ["request", "createInvitation", "getClubNotificationPreferences", "sign-in keys unavailable", "Reply was already sent", randomBytes(12).toString("base64url")];
let t0 = performance.now(); let hits = 0;
for (let i = 0; i < 20000; i++) for (const v of vals) hits += texts.within(v, false).length;
console.log("honest: per value us", ((performance.now() - t0) * 1000 / (20000 * vals.length)).toFixed(2), "hits", hits);
const long = "x ".repeat(100) + "from ben's pick the ferry at dawn ".repeat(30);
t0 = performance.now(); for (let i = 0; i < 20; i++) texts.within(long, false);
console.log("long (", long.length, ") per value ms", ((performance.now() - t0) / 20).toFixed(1));
let rid = 0; for (let i = 0; i < 200000; i++) if (texts.within(randomBytes(12).toString("base64url"), false).length) rid++;
console.log("random reqId hits in 200k", rid);
if (typeof texts.holds === "function") {
  t0 = performance.now(); for (let i = 0; i < 200; i++) texts.holds(long, false);
  console.log("holds long per value ms", ((performance.now() - t0) / 200).toFixed(3));
  t0 = performance.now(); for (let i = 0; i < 20000; i++) for (const v of vals) texts.holds(v, false);
  console.log("holds honest per value us", ((performance.now() - t0) * 1000 / (20000 * vals.length)).toFixed(2));
}
const m = process.memoryUsage(); console.log("heap MB", Math.round(m.heapUsed / 1e6));
