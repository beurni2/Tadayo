// In the image, under fly.toml's worker command: the photo user from the image's own settings, and one real photo
// prepared by the real child as that user.
import { createRequire } from "node:module";
const sharp = createRequire("/app/services/worker/src/image.ts")("sharp");
import { prepareIsolated } from "/app/services/worker/src/image-process.ts";
import { photoUserFor, idsOf } from "/app/services/worker/src/privileges.ts";
const ids = idsOf();
const user = photoUserFor(process.env);
const small = await sharp({ create: { width: 504, height: 378, channels: 3, background: "#000000", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer();
const photo = await sharp(small).resize(4032, 3024).jpeg({ quality: 90 }).toBuffer();
const answer = await prepareIsolated(photo, "image/jpeg", { user });
console.log(JSON.stringify({ ids, user, ok: answer.prepared.ok, renditions: answer.prepared.ok ? answer.prepared.renditions.map((r) => [r.kind, r.width, r.height]) : answer.prepared.rejection, peakMiB: Math.round(answer.peakBytes / 1048576) }));
