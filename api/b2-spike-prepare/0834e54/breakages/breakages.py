"""Deliberate breakages of spike S2's server half, the worker's photo preparation (api/b2-spike-prepare), one
change each, on the tree its fifth commit holds (round 4 of PR #111's review): the fourth commit's 87
(../../7037f3d/breakages/), with the anchors and test names round 4 moved, and the new ones for round 4's fixes
(I35 to I37, X16 to X27, P13, M05).

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py O01 P02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-share"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "s2brk6/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
OUTBOX = "services/worker/src/outbox.ts"
PREPARE = "services/worker/src/prepare.ts"
DPREP = "packages/domain/src/media/prepare.ts"
IMAGE = "services/worker/src/image.ts"
PROCESS = "services/worker/src/image-process.ts"
CHILD = "services/worker/src/image-child.ts"
STORAGE = "services/worker/src/storage.ts"
START = "services/worker/src/start.ts"
PROBE = "tools/ops/src/supabase-probe.ts"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
W = ["npx", "vitest", "run"]
SUITES = {
    "outbox": ("tests", [*DB, "src/db/worker-outbox.test.ts"]),
    "prepare": ("tests", [*DB, "src/db/worker-prepare.test.ts"]),
    "outboxu": ("services/worker", [*W, "src/outbox.test.ts"]),
    "image": ("services/worker", [*W, "src/image.test.ts"]),
    "storage": ("services/worker", [*W, "src/storage.test.ts"]),
    "start": ("services/worker", [*W, "src/start.test.ts"]),
    "probe": ("tools/ops", [*W, "src/supabase-probe.test.ts"]),
    "memory": ("services/worker", [*W, "src/image-memory.test.ts"]),
    "process": ("services/worker", [*W, "src/image-process.test.ts"]),
    "prepu": ("services/worker", [*W, "src/prepare.test.ts"]),
}

OB_CLAIM = "takes the oldest due event of the worker's topics alone, counts the attempt and leases it"
OB_SKIP = "never gives two claimers the same event: one held by another claim is skipped, not waited for"
OB_LEASE = "brings an event back once its lease has passed when its attempt never reported back, as the next attempt"
OB_DONE = "marks a handled event done at the clock's sample, and its handler is given the event's payload"
OB_BACKOFF = "tries a failed event again after 30, 60, 120 and 240 seconds, and kills it after five attempts"
OB_FOREVER = "kills at once an event whose failure no retry would end, keeping its code"
OB_SPENT = "kills an event claimed with its attempts spent without running its handler, as lease_lapsed, whatever an"
OB_LINES = "writes each line as soon as what it says is committed, before the next event, and keeps it when the pass"
OB_STALE = "writes a failure only over its own claim: once the lease passed and another claim took the event, that one"
OB_STOP = "stops between events when told to, leaving the rest due"
OB_ENDED = "writes nothing over an event its handler already ended, when the handler then fails"
OU_CODE = "is unknown for anything else, and never anything an error says"
PREP_READY = "stores full and display at the upload's key, then records them with the owner's hash, a random version"
PREP_HELD = "holds a photo the safety provider holds: its renditions are made and recorded, its state held"
PREP_NOTHING = "finishes an event whose upload isn't preparing, has lapsed or doesn't exist, calling Storage for nothing"
PREP_KILL = "kills at once an event whose payload names no upload, and one whose upload's renditions aren't built"
PREP_RETRY = "tries again after its backoff, and the retry writes over the same keys, leaving one row of each rendition"
PREP_FIRST = "records nothing when another run of the same event recorded first, and finishes the event"
PREP_RACE = "makes a second run recording at the same time wait for the first and then write nothing, while a row"
PREP_LAPSE = "records nothing for an upload that lapses during the work, and finishes the event"
PREP_CLOCK = "reads the record's clock after the upload's lock, so what it writes is dated when it could write it"
IM_DECLARED = "refuses bytes that aren't the type the intent declared as unsupported_type"
IM_DECODERS = "decodes none but the three, even past the signature check: an SVG behind a JPEG's first bytes"
IM_SIZE = "refuses more than 20 MiB as too_large, before reading anything else"
IM_PIXELS = "refuses more than 64 megapixels by the header as too_many_pixels, and takes exactly 64,000,000"
IM_STRIP = "strips the location, the capture date, every EXIF, XMP, IPTC and ICC block"
IM_ORIENT = "makes the pixels upright from the EXIF orientation, which it doesn't keep"
IM_SCREEN = "never makes a long screenshot's display taller than its full"
IM_SMALL = "never enlarges a small photo"
IM_TIMEOUT = "is the worker's limit, a failure to try again, never a rejection of the photo"
IM_HASH = "is the same for one owner's same bytes, and different for another owner or other bytes"
IM_HELD_COUNT = "counts what libjpeg and libvips hold whole"
IM_HELD_JPEG = "refuses a progressive JPEG whose coefficients pass 128 MiB as too_many_pixels"
IM_HELD_PNG = "refuses an interlaced PNG whose pixels pass 128 MiB as too_many_pixels"
IM_WEBP_COUNT = "counts a WebP by how its chunks code it"
IM_WEBP_BUDGET = "refuses a WebP that holds the whole image past 128 MiB as too_many_pixels"
PREP_VERSION = "gives one owner's same photo the same hash and each upload its own random version"
MEM = "keeps each named photo's process under 352 MiB, of each kind the largest at the budget"
MEM_HOSTILE = "refuses every file built to hold what no header shows, by its structure or by the cap"
IM_ONE_PAGE = "refuses a WebP that holds the whole image past 128 MiB as too_many_pixels"
IM_RIFF_CODING = "reads a WebP's coding no further than its RIFF's end, as libwebp does"
IM_RIFF = "refuses a WebP whose RIFF size isn't its length as unreadable"
IM_RIFF_COUNT = "counts a WebP's chunks at its top level, up to its RIFF's end, and none if that end isn't the file's"
IM_CHUNKS = "refuses a WebP of more than"
IM_SCANS = "refuses a JPEG of more than"
IM_SCAN_WALK = "counts no SOS inside a segment, nor a stuffed byte, a restart, fill bytes or anything after the EOI"
PX_KILL = "is killed past its peak memory, before it can answer, and the photo refused as too_many_pixels"
PX_BOMB = "refuses a PNG whose compressed text would take the worker past its Machine, the worker holding none of it"
PX_DEADLINE = "is killed past its deadline, whatever it is doing, and the decode is tried again (ImageTimeout)"
PX_ENV = "goes first to the kernel's out-of-memory killer, and starts with an empty environment"
PX_SAME = "answers as prepareImage does in this process, rendition for rendition, byte for byte"
PX_FAILED = "fails, to be tried again, when its code throws, never refusing the photo"
PX_DECODE_TIMEOUT = "passes a decode's own timeout on as ImageTimeout"
PO_REFUSE = "refuses the photo as too_many_pixels when the worker killed it for memory, its peak passed, or SIGKILL ended it"
PO_UNREADABLE = "refuses the photo as unreadable when the child crashed once it held it"
PO_FAILED = "throws ImageProcessFailed when it ended before it was ready, of its own accord or by another signal without"
PO_MALFORMED = "throws ImageProcessFailed for an answer that isn't one rendition of each kind, a JPEG inside its box, or"
PO_ANSWER = "is the child's answer when it answered within its memory, its renditions as Buffers"
PX_ORPHAN = "ends with the worker: a worker killed while its photo is decoded leaves no process behind"
PO_TIMEOUT = "throws ImageTimeout for its deadline even past its memory, and for a decode's timeout within it"
IM_RESERVED = "gives no count for a reserved marker before the EOI, which libjpeg passes over without its length at a"
IM_HIDDEN = "refuses a JPEG that hides its scans behind a reserved marker as unsupported_type, before its decode"
PX_STRAY = "ignores a message that isn't one of the child's, and a second ready, and keeps the first answer"
PX_HOLDER = "settles when the child ends though a process it started holds its channel, and ends that process"
PX_LINGERS = "ends a child that answered but never exits at its deadline, and keeps its answer"
PX_EXITS = "fails, to be tried again, when the child exits with a code of its own without answering"
PREP_TOOLARGE = "rejects more than 20 MiB, starting no process for it as too_large"
PREP_RANDOM = "makes the version at random: the same upload's same photo, prepared again from the same start, gets another"
ST_404 = "gives no object for Storage's not-found, in the body as Storage sends it or in the status"
ST_CAP = "reads no further than 20 MiB and a byte"
ST_UPSERT = "puts the JPEG at its key in renditions with upsert on, with the service key"
ST_REDIRECT = "asks for the one object in uploads with the service key, refusing redirects, with a time limit"
SS_SUPA = "stops before it connects when a Supabase setting is missing or isn't one, naming neither value"
PR_PUT = "puts a rendition as the worker does, a POST to renditions with the service key, image/jpeg and x-upsert"
PR_KEPT = "fails the worker's write when Storage refuses the put over, or answers it and keeps the first bytes"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # The outbox's claim (plan section 1.1, 1.2; T54).
    ("O01 the claim waits on an event another claim holds", OUTBOX,
     "       FOR UPDATE SKIP LOCKED`;", "       FOR UPDATE`;", "outbox", OB_SKIP),
    ("O02 the claim takes any topic", OUTBOX,
     " AND topic = ANY(${tx.array([...topics])})", "", "outbox", OB_CLAIM),
    ("O03 the claim counts no attempt", OUTBOX,
     "SET attempts = attempts + 1, available_at", "SET available_at", "outbox", OB_CLAIM),
    ("O04 the claim leases nothing", OUTBOX,
     "available_at = ${at.add({ seconds: LEASE_SECONDS })}", "available_at = ${at}", "outbox", OB_CLAIM),
    ("O05 a spent event is worked on again", OUTBOX,
     "if (row.attempts >= MAX_ATTEMPTS) {", "if (row.attempts > MAX_ATTEMPTS) {", "outbox", OB_SPENT),
    ("O06 a spent event keeps an earlier attempt's code", OUTBOX,
     "last_error = ${LEASE_LAPSED}\n", "last_error = COALESCE(last_error, ${LEASE_LAPSED})\n", "outbox", OB_SPENT),
    # The outbox's pass (plan section 1.3 to 1.7; T52, T54).
    ("O07 a handled event isn't marked done", OUTBOX,
     "      await limited(sql, async (tx) => finishEvent(tx, event.id, await clock.sample(tx)));\n", "", "outbox", OB_DONE),
    ("O08 the backoff doesn't double", OUTBOX,
     "return BACKOFF_SECONDS * 2 ** (attempts - 1);", "return BACKOFF_SECONDS * attempts;", "outbox", OB_BACKOFF),
    ("O09 a failure no retry would end is tried again", OUTBOX,
     "const dies = forGood || event.attempts >= MAX_ATTEMPTS;", "const dies = event.attempts >= MAX_ATTEMPTS;",
     "outbox", OB_FOREVER),
    ("O10 a failure writes over an event its handler ended", OUTBOX,
     "SET last_error = ${code}, available_at = ${at.add({ seconds: backoffSeconds(event.attempts) })}\n"
     "           WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}`;",
     "SET last_error = ${code}, available_at = ${at.add({ seconds: backoffSeconds(event.attempts) })}\n"
     "           WHERE id = ${event.id} AND attempts = ${event.attempts}`;", "outbox", OB_ENDED),
    ("O11 a pass doesn't stop when told to", OUTBOX,
     "  while (!stopping()) {", "  while (stopping() || !stopping()) {", "outbox", OB_STOP),
    ("O12 a failure's code is its message", OUTBOX,
     '  if (typeof code !== "string") return "unknown";',
     '  if (typeof code !== "string") return error instanceof Error ? error.message : "unknown";', "outboxu", OU_CODE),
    # Round 1 of PR #111's review: the outbox (R1-2, R1-7).
    ("O13 a retried failure is written over a newer claim", OUTBOX,
     "backoffSeconds(event.attempts) })}\n           WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}`;",
     "backoffSeconds(event.attempts) })}\n           WHERE id = ${event.id} AND state = 'pending'`;", "outbox", OB_STALE),
    ("O14 a failure for good is written over a newer claim", OUTBOX,
     "last_error = ${code}\n           WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}`\n",
     "last_error = ${code}\n           WHERE id = ${event.id} AND state = 'pending'`\n", "outbox", OB_STALE),
    ("O15 the lines are written when the pass ends", OUTBOX,
     [("  { warn, stopping = () => false }: OutboxPassOptions,\n): Promise<OutboxPassResult> {\n",
       "  { warn: say, stopping = () => false }: OutboxPassOptions,\n): Promise<OutboxPassResult> {\n"
       "  const kept: string[] = [];\n  const warn = (line: string) => kept.push(line);\n"),
      ("  return { handled };\n}", "  for (const line of kept) say(line);\n  return { handled };\n}")],
     None, "outbox", OB_LINES),
    # upload.prepare (plan section 2; T21, T54).
    ("P01 a lapsed upload is prepared", DPREP,
     "WHERE id = ${id} AND state = 'preparing' AND expires_at > ${at}`;", "WHERE id = ${id} AND state = 'preparing'`;",
     "prepare", PREP_NOTHING),
    ("P02 the record writes over an upload no longer preparing", DPREP,
     'if (row?.["state"] !== "preparing") return { at, recorded: false };',
     "if (row === undefined) return { at, recorded: false };", "prepare", PREP_FIRST),
    ("P03 the record locks the upload FOR UPDATE", DPREP,
     "SELECT state, expires_at FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;",
     "SELECT state, expires_at FROM app.uploads WHERE id = ${id} FOR UPDATE`;", "prepare", PREP_RACE),
    ("P04 a purpose with no renditions built is prepared", PREPARE,
     "  if (!DROP_PHOTO.has(upload.purpose)) throw new FailedForGood(`purpose.${upload.purpose}`);\n", "",
     "prepare", PREP_KILL),
    ("P05 a payload's id isn't checked", PREPARE,
     'if (typeof id !== "string" || !ID.test(id)) throw new FailedForGood("payload");',
     'if (typeof id !== "string") throw new FailedForGood("payload");', "prepare", PREP_KILL),
    ("P06 a held photo is recorded ready", PREPARE,
     'state: verdict === "hold" ? "held" : "ready",', 'state: "ready",', "prepare", PREP_HELD),
    ("P07 the hash is the original's, not the owner's", PREPARE,
     "contentHash: contentHash(upload.ownerUserId, original),", 'contentHash: contentHash("", original),',
     "prepare", PREP_READY),
    # Round 1 of PR #111's review: the record (R1-5, R1-6).
    ("P08 a lapse during the work isn't seen under the lock", DPREP,
     "  if (Temporal.Instant.compare(expiresAt, at) <= 0) return { at, recorded: false };\n", "", "prepare", PREP_LAPSE),
    ("P09 the record's clock is read before its lock", DPREP,
     "  const rows = await bound(tx)`SELECT state, expires_at FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;\n"
     "  const at = await clock.sample(tx);\n",
     "  const at = await clock.sample(tx);\n"
     "  const rows = await bound(tx)`SELECT state, expires_at FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;\n",
     "prepare", PREP_CLOCK),
    # The checks and renditions (plan sections 3 and 4).
    ("I01 the declared type isn't checked against the bytes", IMAGE,
     "if (type === undefined || type !== declared)", "if (type === undefined)", "image", IM_DECLARED),
    ("I02 every decoder is allowed", IMAGE,
     'sharp.block({ operation: ["VipsForeignLoad"] });\n', "", "image", IM_DECODERS),
    ("I03 the size isn't checked", IMAGE,
     '  if (bytes.length > UPLOAD_MAX_BYTES) return { ok: false, rejection: "too_large" };\n', "", "image", IM_SIZE),
    ("I04 the pixels aren't checked by the header", IMAGE,
     '  if (width * height > MAX_PIXELS) return { ok: false, rejection: "too_many_pixels" };\n', "", "image", IM_PIXELS),
    ("I05 the renditions keep the metadata", IMAGE,
     "      .jpeg({ quality: 80 })", "      .keepMetadata()\n      .jpeg({ quality: 80 })", "image", IM_STRIP),
    ("I06 the pixels aren't made upright", IMAGE,
     'failOn: "warning", autoOrient: true }', 'failOn: "warning" }', "image", IM_ORIENT),
    ("I07 display's height isn't bounded", PROCESS,
     "display: { width: 1290, height: 2560 }", "display: { width: 1290 }", "image", IM_SCREEN),
    ("I08 a small photo is enlarged", IMAGE,
     'fit: "inside", withoutEnlargement: true', 'fit: "inside"', "image", IM_SMALL),
    ("I09 a slow decode is a rejection", IMAGE,
     "      if (timedOut(error)) throw new ImageTimeout();\n", "", "image", IM_TIMEOUT),
    ("I10 the hash isn't keyed by the owner", PREPARE,
     'createHmac("sha256", `tadayo.upload.v1:${ownerUserId}`)', 'createHmac("sha256", "tadayo.upload.v1:")',
     "prepu", IM_HASH),
    # Round 1 of PR #111's review: what a decode that can't stream would hold (R1-1, FQ138).
    ("I11 what a decode would hold isn't checked", IMAGE,
     '  if (heldBytes(header, bytes) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };\n', "",
     "image", IM_HELD_JPEG),
    ("I12 a JPEG's components aren't all counted", IMAGE,
     "padded(header.height) * header.channels * 2;", "padded(header.height) * 3 * 2;", "image", IM_HELD_JPEG),
    ("I13 a 16-bit PNG's samples count as one byte", IMAGE,
     '(header.depth === "uchar" ? 1 : 2)', "1", "image", IM_HELD_PNG),
    ("I14 an interlaced PNG holds nothing", IMAGE,
     '  if (header.format === "png") {', '  if (header.format === "gif") {', "image", IM_HELD_PNG),
    ("I15 a JPEG's padding to whole MCUs isn't counted", IMAGE,
     "Math.ceil(side / 32) * 32", "side", "image", IM_HELD_COUNT),
    ("I16 the budget is 512 MiB", IMAGE,
     "MAX_HELD_BYTES = 128 * 1024 * 1024;", "MAX_HELD_BYTES = 512 * 1024 * 1024;", "image", IM_HELD_COUNT),
    ("M01 what a decode would hold isn't checked, measured", IMAGE,
     '  if (heldBytes(header, bytes) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };\n', "",
     "memory", MEM),
    # Round 2 of PR #111's review: what a WebP's decode holds (R2-1, R2-2, FQ138).
    ("I17 an animated WebP holds nothing", IMAGE,
     "if (header.pages !== undefined) return pixels * 10;", "if (header.pages !== undefined) return 0;",
     "image", IM_WEBP_BUDGET),
    ("I18 a lossless WebP holds nothing", IMAGE,
     'coding === "lossless" ? 4 :', 'coding === "lossless" ? 0 :', "image", IM_WEBP_BUDGET),
    ("I19 a lossy WebP's alpha holds only its plane", IMAGE,
     'coding === "lossy with alpha" ? 5 :', 'coding === "lossy with alpha" ? 1 :', "image", IM_WEBP_BUDGET),
    ("I20 a WebP whose coding can't be read holds nothing", IMAGE,
     'coding === "lossy with alpha" ? 5 : 10);', 'coding === "lossy with alpha" ? 5 : 0);', "image", IM_WEBP_COUNT),
    ("I21 an ALPH chunk isn't seen", IMAGE,
     '    if (fourcc === "ALPH") alpha = true;\n', "", "image", IM_WEBP_COUNT),
    ("I22 a WebP's chunks aren't passed over", IMAGE,
     '    if (fourcc === "ALPH") alpha = true;\n    const size = view.getUint32(at + 4, true);\n    at += 8 + size + (size % 2);',
     '    if (fourcc === "ALPH") alpha = true;\n    at = bytes.length;', "image", IM_WEBP_COUNT),
    ("I23 an animated WebP counts as two canvases", IMAGE,
     "if (header.pages !== undefined) return pixels * 10;", "if (header.pages !== undefined) return pixels * 8;",
     "image", IM_WEBP_BUDGET),
    ("I24 libvips' pages are passed over, the chunks alone deciding", IMAGE,
     "if (header.pages !== undefined) return pixels * 10;", "if (header.pages !== undefined && header.pages > 99) return pixels * 10;",
     "image", IM_WEBP_COUNT),
    ("M02 an animated WebP holds nothing, measured", IMAGE,
     "if (header.pages !== undefined) return pixels * 10;", "if (header.pages !== undefined) return 0;",
     "memory", MEM),
    ("M03 a lossy WebP's alpha holds nothing, measured", IMAGE,
     'coding === "lossy with alpha" ? 5 :', 'coding === "lossy with alpha" ? 0 :', "memory", MEM),
    # Round 2 of PR #111's review: the content version (R2-3, T21).
    ("P10 the content version is derived from the bytes", DPREP,
     'content_version = ${newId("mv")}',
     'content_version = ${"mv_" + Buffer.from(outcome.contentHash).toString("base64url").slice(0, 22)}',
     "prepare", PREP_VERSION),
    # Round 3 of PR #111's review: what a file's structure costs, read before the decoder (R3-2, R3-6, FQ138).
    ("I25 an animation of one page isn't counted as one", IMAGE,
     "if (header.pages !== undefined) return pixels * 10;", "if ((header.pages ?? 1) > 1) return pixels * 10;",
     "image", IM_WEBP_COUNT),
    ("I26 a WebP's coding is read past its RIFF's end", IMAGE,
     "  const end = Math.min(bytes.length, riffEnd(bytes));", "  const end = bytes.length;", "image", IM_RIFF_CODING),
    ("I27 a WebP's RIFF size isn't checked against its length", IMAGE,
     "if (bytes.length < 12 || riffEnd(bytes) !== bytes.length) return undefined;",
     "if (bytes.length < 12) return undefined;", "image", IM_RIFF),
    ("I28 a WebP whose RIFF size isn't its length is decoded", IMAGE,
     '    if (chunks === undefined) return { ok: false, rejection: "unreadable" };\n', "", "image", IM_RIFF),
    ("I29 a WebP's chunks aren't capped", IMAGE,
     '    if (chunks > MAX_WEBP_CHUNKS) return { ok: false, rejection: "unsupported_type" };\n', "", "image", IM_CHUNKS),
    ("I30 a WebP's chunks are counted past its RIFF's end", IMAGE,
     "if (bytes.length < 12 || riffEnd(bytes) !== bytes.length) return undefined;",
     "if (bytes.length < 12 || riffEnd(bytes) > bytes.length) return undefined;", "image", IM_RIFF_COUNT),
    ("I31 a JPEG's scans aren't capped", IMAGE,
     '    if (scans === undefined || scans > MAX_JPEG_SCANS) return { ok: false, rejection: "unsupported_type" };\n',
     '    if (scans === undefined) return { ok: false, rejection: "unsupported_type" };\n', "image", IM_SCANS),
    ("I32 a segment isn't passed over by its length", IMAGE,
     "      at += 2 + (((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0));", "      at += 2;", "image", IM_SCAN_WALK),
    ("I33 a stuffed byte is taken for a marker", IMAGE,
     "    } else if (marker === 0x00 || marker === 0x01", "    } else if (marker === 0x01", "image", IM_SCAN_WALK),
    ("I34 scans past the EOI are counted", IMAGE,
     "    if (marker === 0xd9) return scans;\n", "", "image", IM_SCAN_WALK),
    ("M04 the structure isn't walked, measured", IMAGE,
     [('    if (scans === undefined || scans > MAX_JPEG_SCANS) return { ok: false, rejection: "unsupported_type" };\n', ""),
      ('    if (chunks > MAX_WEBP_CHUNKS) return { ok: false, rejection: "unsupported_type" };\n', "")],
     None, "memory", MEM_HOSTILE),
    # Round 3 of PR #111's review: each photo in a process of its own (R3-1, R3-3, R3-4, R3-6).
    ("X01 the child's memory isn't watched", PROCESS,
     "      if (peak > mostBytes) kill(\"memory\");\n", "", "process", PX_KILL),
    ("X02 the deadline kills nothing", PROCESS,
     "      () => {\n        kill(\"time\");\n      },", "      () => {\n        void 0;\n      },", "process", PX_DEADLINE),
    ("X03 a peak past the cap that the child reports is taken", PROCESS,
     '  if (end.killed === "memory" || peakBytes > end.mostBytes) {', '  if (end.killed === "memory") {', "process", PO_REFUSE),
    ("X04 a SIGKILL the worker didn't send refuses nothing", PROCESS,
     '  if (end.signal === "SIGKILL") return { prepared: { ok: false, rejection: "too_many_pixels" }, peakBytes };\n', "",
     "process", PO_REFUSE),
    ("X05 a child's crash is tried again", PROCESS,
     '  if (end.signal !== null && CRASHES.has(end.signal))\n    return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };\n',
     "", "process", PO_UNREADABLE),
    ("X06 a child that ends before it is ready refuses the photo", PROCESS,
     '  if (answer?.kind === "failed" || !end.ready) throw new ImageProcessFailed();',
     '  if (answer?.kind === "failed") throw new ImageProcessFailed();', "process", PO_FAILED),
    ("X07 the child's answer isn't checked", PROCESS,
     "    if (!wellFormed(answer.prepared)) throw new ImageProcessFailed();\n", "", "process", PO_MALFORMED),
    ("X08 the child gets the worker's environment", PROCESS,
     "      env: {},\n", "      env: process.env,\n", "process", PX_ENV),
    ("X09 the child doesn't go first to the out-of-memory killer", CHILD,
     '    writeFileSync("/proc/self/oom_score_adj", "1000");\n', "", "process", PX_ENV),
    ("X10 the cap is 512 MiB", PROCESS,
     "export const PEAK_BYTES = 352 * 1024 * 1024;", "export const PEAK_BYTES = 512 * 1024 * 1024;", "process", PX_BOMB),
    ("X11 a code's error in the child refuses the photo", CHILD,
     '  answer = error instanceof ImageTimeout ? { kind: "timeout" } : { kind: "failed" };',
     '  answer = error instanceof ImageTimeout ? { kind: "timeout" } : { kind: "prepared", prepared: { ok: false, rejection: "unreadable" }, peakBytes: 0, oomScoreAdj: adjusted, environment: 0 };',
     "process", PX_FAILED),
    ("X12 a decode's timeout in the child is a failure", CHILD,
     '  answer = error instanceof ImageTimeout ? { kind: "timeout" } : { kind: "failed" };',
     '  answer = { kind: "failed" };', "process", PX_DECODE_TIMEOUT),
    ("X13 the renditions aren't made Buffers", PROCESS,
     "            bytes: Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength),\n",
     "            bytes: r.bytes as Buffer,\n", "process", PO_ANSWER),
    ("X14 the child outlives its worker", CHILD,
     'process.on("disconnect", () => {\n  process.kill(process.pid, "SIGKILL");\n});\n', "", "process", PX_ORPHAN),
    ("X15 the child exits by process.exit when its worker goes, which waits for its decode", CHILD,
     'process.kill(process.pid, "SIGKILL");', "process.exit(1);", "process", PX_ORPHAN),
    ("P11 the worker decodes the photo itself", PREPARE,
     "    ({ prepared, peakBytes: photoPeakBytes } = await prepareIsolated(original, upload.contentType));",
     '    prepared = await (await import("./image.ts")).prepareImage(original, upload.contentType);',
     "prepare", PREP_READY),
    ("P12 the version is made from the upload and its bytes", DPREP,
     'content_version = ${newId("mv")}',
     'content_version = ${"mv_" + Buffer.from(outcome.contentHash).toString("base64url").slice(0, 10) + id.slice(-12)}',
     "prepare", PREP_RANDOM),
    # The worker's Storage client (plan section 5.1; T12, T56).
    ("S01 Storage's not-found is an error", STORAGE,
     "        if (logical === 404) return null;\n", "", "storage", ST_404),
    ("S02 an original is read whole", STORAGE,
     "return await readUpTo(response.body, UPLOAD_MAX_BYTES + 1);",
     "return new Uint8Array(await new Response(response.body).arrayBuffer());", "storage", ST_CAP),
    ("S03 a rendition is put with upsert off", STORAGE,
     '"content-type": "image/jpeg", "x-upsert": "true" },', '"content-type": "image/jpeg" },', "storage", ST_UPSERT),
    ("S04 redirects are followed", STORAGE,
     '{ ...init, redirect: "error", signal', "{ ...init, signal", "storage", ST_REDIRECT),
    # The worker's start (plan section 5.1).
    ("W01 Storage's settings are read after the database answers", START,
     [("  const storage = workerStorage({ projectUrl: project, serviceKey });\n", ""),
      ("    return { sql, clock: await prepareClock(env.TADAYO_ENVIRONMENT ?? \"\", sql), storage };",
       "    const clock = await prepareClock(env.TADAYO_ENVIRONMENT ?? \"\", sql);\n"
       "    return { sql, clock, storage: workerStorage({ projectUrl: project, serviceKey }) };")],
     None, "start", SS_SUPA),
    # The probe's worker checks (plan section 5.2).
    ("R01 the probe puts the rendition with upsert off", PROBE,
     '        contentType: "image/jpeg",\n        headers: { "x-upsert": "true" },\n      });\n      const stored',
     '        contentType: "image/jpeg",\n      });\n      const stored', "probe", PR_PUT),
    ("R02 the probe doesn't compare the bytes read back", PROBE,
     "reply.status === 200 && sameBytes(reply.bytes, bytes)),", "reply.status === 200),", "probe", PR_KEPT),
    # Round 4 of PR #111's review (R4-1, R4-3 to R4-6, R4-8).
    ("I35 a reserved marker isn't refused", IMAGE,
     "    if (marker >= 0x02 && marker <= 0xbf) return undefined;\n", "", "image", IM_RESERVED),
    ("I36 the reserved markers stop at 0x7F", IMAGE,
     "    if (marker >= 0x02 && marker <= 0xbf) return undefined;", "    if (marker >= 0x02 && marker <= 0x7f) return undefined;",
     "image", IM_RESERVED),
    ("I37 a JPEG with a reserved marker isn't refused by the checks", IMAGE,
     "    if (scans === undefined || scans > MAX_JPEG_SCANS)", "    if (scans! > MAX_JPEG_SCANS)", "image", IM_HIDDEN),
    ("X16 a message that isn't one of the child's is read as one", PROCESS,
     "      const message = messageOf(sent);\n      if (message === undefined) return;\n",
     "      const message = sent as ChildMessage;\n", "process", PX_STRAY),
    ("X17 a second ready is taken for the answer", PROCESS,
     '      if (message.kind === "ready") {\n        if (ready) return;\n',
     '      if (message.kind === "ready" && !ready) {\n', "process", PX_STRAY),
    ("X18 a child's end waits for its channel to close", PROCESS,
     '    child.on("exit", allowGrace);\n', "", "process", PX_HOLDER),
    ("X19 the child alone is killed, not its group", PROCESS,
     'process.kill(-child.pid, "SIGKILL");', 'process.kill(child.pid, "SIGKILL");', "process", PX_HOLDER),
    ("X20 the child leads no group of its own", PROCESS,
     "      detached: true,\n", "", "process", PX_HOLDER),
    ("X21 a child that answered is never killed", PROCESS,
     "      if (killed === undefined && answer === undefined) killed = why;\n",
     "      if (killed !== undefined || answer !== undefined) return;\n      killed = why;\n", "process", PX_LINGERS),
    ("X22 a child's own exit refuses the photo", PROCESS,
     '    return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };\n  throw new ImageProcessFailed();\n}',
     '    return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };\n  return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };\n}',
     "process", PO_FAILED),
    ("X23 any number of renditions", PROCESS,
     "    renditions.length === RENDITION_KINDS.length &&\n", "", "process", PO_MALFORMED),
    ("X24 a rendition's size isn't checked against its box", PROCESS,
     "    height >= 1 &&\n    width <= box.width &&\n    height <= box.height\n", "    height >= 1\n", "process", PO_MALFORMED),
    ("X25 a rendition's bytes needn't be a JPEG's", PROCESS,
     "    bytes[0] === 0xff &&\n    bytes[1] === 0xd8 &&\n    bytes[2] === 0xff &&\n", "", "process", PO_MALFORMED),
    ("X26 any string is a rejection", PROCESS,
     "  if (ok === false) return UPLOAD_REJECTIONS.some((code) => code === rejection);",
     '  if (ok === false) return typeof rejection === "string";', "process", PO_MALFORMED),
    ("X27 a decode's timeout past the memory is tried again", PROCESS,
     '  if (end.killed === "time") throw new ImageTimeout();',
     '  if (end.killed === "time" || end.answer?.kind === "timeout") throw new ImageTimeout();', "process", PO_TIMEOUT),
    ("X28 the worker keeps its end of the child's standard input", PROCESS,
     "      child.stdin?.destroy();\n", "", "process",
     "closes its ends of the child's pipes as it settles, though a process the child started outside its group holds them"),
    ("X29 the worker keeps its end of the child's channel", PROCESS,
     "      if (child.connected) child.disconnect();\n", "", "process",
     "closes its ends of the child's pipes as it settles, though a process the child started outside its group holds them"),
    ("P13 a process is started for an original past 20 MiB", PREPARE,
     "  if (original !== null && original.length > UPLOAD_MAX_BYTES) {",
     "  if (original !== null && original.length > UPLOAD_MAX_BYTES * 2) {", "prepare", PREP_TOOLARGE),
    ("M05 a photo past the budget refused by another code, measured", IMAGE,
     '  if (heldBytes(header, bytes) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };',
     '  if (heldBytes(header, bytes) > MAX_HELD_BYTES) return { ok: false, rejection: "unreadable" };', "memory", MEM),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def remake():
    a = run(["bash", SP + "/s4/pgci.sh"])
    b = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    return a.returncode, b.returncode, (b.stdout + b.stderr)[-400:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def edit(text, old, new):
    if isinstance(old, list):
        for a, b in old:
            text = swap(text, a, b)
        return text
    return swap(text, old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = edit(text, old, new) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            broken = edit(orig, old, new)
            p.write_text(broken)
            # The breakage alone: the file as it stands before against the file broken.
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            note = ""
            if suite == "mig":
                dirty = True
                made = remake()
                note = f" (database made again: {made[0]} {made[1]})"
                if made[1] != 0:
                    note += " " + made[2].replace("\n", " | ")
            elif dirty:
                p.write_text(orig)
                made = remake()
                dirty = False
                p.write_text(edit(orig, old, new))
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}{note}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    if dirty:
        print("database made again from the true migration:", remake()[:2], flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
