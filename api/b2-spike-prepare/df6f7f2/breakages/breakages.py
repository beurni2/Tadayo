"""Deliberate breakages of spike S2's server half, the worker's photo preparation (api/b2-spike-prepare), one
change each, on the tree its second commit holds (round 1 of PR #111's review): the first commit's 36, with the
anchors the round moved, and 12 for the round's fixes.

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
OUT = pathlib.Path(SP) / "s2brk2/out"
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
MEM = "stays within 288 MiB for the largest photo each decoder takes, and refuses one past the budget holding nothing"
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
    ("I07 display's height isn't bounded", IMAGE,
     "display: { width: 1290, height: 2560 }", "display: { width: 1290 }", "image", IM_SCREEN),
    ("I08 a small photo is enlarged", IMAGE,
     'fit: "inside", withoutEnlargement: true', 'fit: "inside"', "image", IM_SMALL),
    ("I09 a slow decode is a rejection", IMAGE,
     "      if (timedOut(error)) throw new ImageTimeout();\n", "", "image", IM_TIMEOUT),
    ("I10 the hash isn't keyed by the owner", IMAGE,
     'createHmac("sha256", `tadayo.upload.v1:${ownerUserId}`)', 'createHmac("sha256", "tadayo.upload.v1:")',
     "image", IM_HASH),
    # Round 1 of PR #111's review: what a decode that can't stream would hold (R1-1, FQ138).
    ("I11 what a decode would hold isn't checked", IMAGE,
     '  if (heldBytes(header) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };\n', "",
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
     '  if (heldBytes(header) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };\n', "",
     "memory", MEM),
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
