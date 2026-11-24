// Under the worker's command: a POSIX message queue refused (RLIMIT_MSGQUEUE 0). The core limit's check is run.sh's own
// line, as tadayo-image.
import { writeFileSync, readdirSync } from "node:fs";
let mq;
try { writeFileSync("/dev/mqueue/probe", ""); mq = "made"; } catch (e) { mq = e.code; }
console.log(JSON.stringify({ mqueue: mq, cwd: process.cwd(), filesBefore: readdirSync(".") }));
