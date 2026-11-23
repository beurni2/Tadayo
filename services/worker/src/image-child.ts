// The process one photo is prepared in (./image-process.ts starts it, with no environment and no output). It asks to
// go first to the kernel's out-of-memory killer, says it is ready, reads the photo from its standard input, the
// declared type and the decode's limit being its arguments, answers with prepareImage's answer (./image.ts) and its
// own peak resident memory, and exits. It ends with the worker: when the channel to the worker closes, it kills itself.

import { readFileSync, writeFileSync } from "node:fs";
import type { UploadContentType } from "@tadayo/domain";
import { ImageTimeout, peakOf, type ChildMessage } from "./image-process.ts";
import { prepareImage } from "./image.ts";

function oomScoreAdj(): number | undefined {
  try {
    writeFileSync("/proc/self/oom_score_adj", "1000");
    return Number(readFileSync("/proc/self/oom_score_adj", "latin1").trim());
  } catch {
    return undefined;
  }
}

const adjusted = oomScoreAdj();

function send(message: ChildMessage): Promise<void> {
  return new Promise((resolve) => {
    if (process.send === undefined) process.exit(1);
    process.send(message, undefined, undefined, () => {
      resolve();
    });
  });
}

// When the channel to the worker closes, as it does when the worker is killed, nobody watches this process any more,
// so it ends at once. Not with process.exit, which waits for a decode in progress to finish: a child whose worker
// was killed mid-decode lived on 2.3 s in the session, and could for as long as its two decodes' limits.
process.on("disconnect", () => {
  process.kill(process.pid, "SIGKILL");
});

const [declared, seconds] = process.argv.slice(2) as [UploadContentType, string];

await send({ kind: "ready" });
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const bytes = Buffer.concat(chunks);
chunks.length = 0;
let answer: ChildMessage;
try {
  const prepared = await prepareImage(bytes, declared, { seconds: Number(seconds) });
  answer = {
    kind: "prepared",
    prepared,
    peakBytes: peakOf("self") ?? 0,
    oomScoreAdj: adjusted,
    environment: Object.keys(process.env).length,
  };
} catch (error) {
  answer = error instanceof ImageTimeout ? { kind: "timeout" } : { kind: "failed" };
}
await send(answer);
process.exit(0);
