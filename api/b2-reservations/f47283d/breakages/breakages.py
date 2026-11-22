# Deliberate breakages of the reservations slice: each a small change in place, run against the tests that
# should catch it, then restored byte for byte. Usage: python3 breakages.py [ids...]
import os, subprocess, sys, json, time
ROOT = os.environ.get('BREAK_ROOT', '/home/user/tadayo-b2res')
ENV = dict(os.environ)
ENV['PATH'] = '/opt/nvm/versions/node/v26.13.0/bin:' + ENV['PATH']
sys.path.insert(0, os.path.join(ROOT, 'tools/ci'))
import ci_steps as c
ENV['DATABASE_URL'] = c.APP_URL
ENV['DATABASE_ADMIN_URL'] = c.ADMIN_URL
CMDS = {
  'U': ('packages/domain', ['npx', 'vitest', 'run', 'src/drops', 'src/authorization/add-target.test.ts']),
  'R': ('services/api', ['npx', 'vitest', 'run', 'src/drops/reservations.test.ts']),
  'D': ('tests', ['npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', 'src/db/reservations.test.ts']),
  'J': ('tests', ['npx', 'vitest', 'run', '--config', 'vitest.privacy.config.ts', 'src/privacy/reservation.test.ts']),
  'M': ('tests', ['npx', 'vitest', 'run', '--config', 'vitest.privacy.config.ts', 'src/privacy/matrix.test.ts']),
}
MAT = 'tests/src/privacy/matrix.test.ts'
RES = 'packages/domain/src/drops/reserve.ts'
REL = 'packages/domain/src/drops/release.ts'
CNT = 'packages/domain/src/drops/counter.ts'
ALW = 'packages/domain/src/drops/allowance.ts'
ADD = 'packages/domain/src/authorization/add-target.ts'
ANS = 'services/api/src/answers.ts'
JUD = 'tests/src/privacy/reservation.ts'
B = [
  ('C01', 'the clock sampled before the locks', 'D', [(RES, '  const at = await clock.sample(tx);\n', '  const at = first;\n')]),
  ('C02', 'the counter read without its row lock', 'D', [(CNT, '       FOR NO KEY UPDATE`;\n  if (rows.length !== 1) throw new Error("counter: no row to hold");', '`;\n  if (rows.length !== 1) throw new Error("counter: no row to hold");')]),
  ('C03', 'everyone gets the star\'s role', 'UD', [(ADD, '    isStar: facts.viewerInterval === day.starInterval,\n', '    isStar: true,\n')]),
  ('C04', 'nobody gets the star\'s role', 'UD', [(ADD, '    isStar: facts.viewerInterval === day.starInterval,\n', '    isStar: false,\n')]),
  ('C05', 'lapsed reservations counted (never settled)', 'D', [(CNT, "AND state = 'live' AND expires_at <= ${at}::pg_catalog.timestamptz", "AND state = 'live' AND false AND expires_at <= ${at}::pg_catalog.timestamptz")]),
  ('C06', 'a lapse at < instead of <=', 'D', [(CNT, "AND state = 'live' AND expires_at <= ${at}::pg_catalog.timestamptz", "AND state = 'live' AND expires_at < ${at}::pg_catalog.timestamptz")]),
  ('C07', 'the cutoff at > instead of >=', 'UD', [(ADD, '  if (!before(now, day.revealAt)) {\n    return { kind: "closed"', '  if (Temporal.Instant.compare(now, day.revealAt) > 0) {\n    return { kind: "closed"')]),
  ('C08', 'QUOTA_FULL after the others', 'UD', [(ALW, '  if (allowance.added + allowance.reserved >= allowance.limit) return "QUOTA_FULL";\n', ''), (ALW, '  return null;\n}', '  if (allowance.added + allowance.reserved >= allowance.limit) return "QUOTA_FULL";\n  return null;\n}')]),
  ('C09', 'a friend\'s photo limit at three', 'UD', [(ALW, 'FRIEND_LIMITS: Limits = Object.freeze({ total: 3, photos: 2, links: 1 })', 'FRIEND_LIMITS: Limits = Object.freeze({ total: 3, photos: 3, links: 1 })')]),
  ('C10', 'the star\'s link limit at three', 'UD', [(ALW, 'STAR_LIMITS: Limits = Object.freeze({ total: 6, photos: 6, links: 2 })', 'STAR_LIMITS: Limits = Object.freeze({ total: 6, photos: 6, links: 3 })')]),
  ('C11', 'expires_at not capped at the reveal', 'UD', [(RES, '  return Temporal.Instant.compare(later, revealAt) < 0 ? later : revealAt;', '  return later;')]),
  ('C12', 'a slot held 31 minutes', 'UD', [(RES, 'export const RESERVATION_MINUTES = 30;', 'export const RESERVATION_MINUTES = 31;')]),
  ('C13', 'a release that frees a link as a photo', 'D', [(CNT, "             - (SELECT pg_catalog.count(*) FROM freed WHERE media_class = 'external_video')::pg_catalog.int2", "             - (SELECT pg_catalog.count(*) FROM freed WHERE media_class = 'photo')::pg_catalog.int2")]),
  ('C14', 'a release of another member\'s reservation', 'UD', [(ADD, '  return facts !== null && addTargetOutcome(facts, now).kind !== "not_found" && facts.viewerInterval === slotInterval;', '  return facts !== null && addTargetOutcome(facts, now).kind !== "not_found" && slotInterval.length > 0;')]),
  ('C15', 'the receipt read without the interval that made it (FQ112)', 'D', [(RES, 'import { completeReceipt, reserveAsMember, type ReceiptKey }', 'import { completeReceipt, reserveReceipt, type ReceiptKey }'), (RES, '  const stored = await reserveAsMember(tx, receipt, first, interval);', '  const stored = interval === "" ? null : await reserveReceipt(tx, receipt, first);')]),
  ('C16', 'next_target the target itself', 'UD', [(ADD, 'days: later.filter((one) => one.clubId === day.clubId && before(day.revealAt, one.revealAt)),', 'days: [day, ...later].filter((one) => one.clubId === day.clubId && !before(one.revealAt, day.revealAt)),')]),
  ('C17', 'an ended interval taken as the caller\'s', 'D', [(ADD, "m.user_id = ${userId}::pg_catalog.text AND m.state = 'active') AS viewer_interval", "m.user_id = ${userId}::pg_catalog.text ORDER BY m.joined_at LIMIT 1) AS viewer_interval")]),
  ('C18', 'a held day answers NOT_FOUND, not MEMBERSHIP_CHANGED', 'D', [(RES, '  if (outcome.kind === "held") throw new Refused("MEMBERSHIP_CHANGED");', '  if (outcome.kind === "held") throw new Refused("NOT_FOUND");')]),
  ('C19', 'a star who left before the reveal not holding the day', 'UD', [(ADD, '  if (!(notBeforeReveal(day.starLeftAt, day.revealAt) && notBeforeReveal(day.starDeletionRequestedAt, day.revealAt))) {', '  if (!notBeforeReveal(day.starDeletionRequestedAt, day.revealAt)) {')]),
  ('C20', 'a refusal without its allowance', 'R', [(ANS, '...(allowance === undefined ? {} : { allowance: allowanceBody(allowance) }),', '...(allowance === undefined || true ? {} : { allowance: allowanceBody(allowance) }),')]),
  ('C21', 'a release that settles no lapse', 'D', [(REL, '  let row = await settleLapsed(tx, key, at);', '  let row = await settleLapsed(tx, key, at.subtract({ hours: 24 }));')]),
  ('C22', 'the limits checked before the lapses are settled', 'D', [(RES, '  const before = allowanceOf(await settleLapsed(tx, key, at), outcome.isStar);', '  const before = allowanceOf(await settleLapsed(tx, key, at.subtract({ hours: 24 })), outcome.isStar);')]),
  ('J01', 'judge: a drop withdrawn before the reveal still counted', 'J', [(JUD, '      !(drop.state === "withdrawn" && drop.endedAt !== null && before(drop.endedAt, theDay.revealAt)),', '      true,')]),
  ('J02', 'judge: a refusal may settle the caller\'s lapses', 'J', [(JUD, '        outcome.kind === "held" &&\n        was.state === "live" &&', '        was.state === "live" &&')]),
  ('J03', 'judge: QUOTA_FULL after the others', 'J', [(JUD, '    allowance.added + allowance.reserved >= allowance.limit\n      ? "QUOTA_FULL"\n      : media === "external_video" && links >= allowance.external_limit\n        ? "EXTERNAL_LIMIT"\n        : media === "photo" && photos >= allowance.photo_limit\n          ? "PHOTO_LIMIT"\n          : null;', '    media === "external_video" && links >= allowance.external_limit\n      ? "EXTERNAL_LIMIT"\n      : media === "photo" && photos >= allowance.photo_limit\n        ? "PHOTO_LIMIT"\n        : allowance.added + allowance.reserved >= allowance.limit\n          ? "QUOTA_FULL"\n          : null;')]),
  ('J04', 'judge: a friend\'s photo limit at three', 'J', [(JUD, '    photo_limit: star ? 6 : 2,', '    photo_limit: star ? 6 : 3,')]),
  ('J05', 'judge: a star\'s deletion request not holding the day', 'J', [(JUD, '    (star.leftAt !== null && before(star.leftAt, theDay.revealAt)) || (asked !== null && before(asked, theDay.revealAt))', '    star.leftAt !== null && before(star.leftAt, theDay.revealAt)')]),
  ('J06', 'judge: expires_at not capped', 'J', [(JUD, '      expires_at: second(before(lapses, theDay.revealAt) ? lapses : theDay.revealAt),', '      expires_at: second(lapses),')]),
  ('J07', 'judge: anyone may give back a slot', 'J', [(JUD, '  if (interval === undefined || interval !== slot.interval) return { kind: "pinned", answer: NEUTRAL };', '  if (interval === undefined) return { kind: "pinned", answer: NEUTRAL };')]),
  ('J08', 'judge: a release\'s own state unchecked', 'J', [(JUD, '      if (now_.state !== outcome.body.state) problems.push(`${id} is ${now_.state}, not ${String(outcome.body.state)}`);', '')]),
  ('J09', 'judge: a suspended club still lets members add', 'J', [(JUD, '  if (world.clubs.get(theDay.club)?.suspendedAt !== null) return undefined;\n', '')]),
  ('J10', 'judge: a slot live at its own expires_at', 'J', [(JUD, '    (slot) => slot.day === day && slot.interval === interval && slot.state === "live" && before(now, slot.expiresAt),', '    (slot) => slot.day === day && slot.interval === interval && slot.state === "live" && !before(slot.expiresAt, now),')]),
  ('J11', 'judge: the slot held\'s rows unchecked', 'J', [(JUD, '    if (made.length !== 1 || made[0] !== id)\n      problems.push(`the slot held made ${JSON.stringify(made)}, not its own id`);\n', '')]),
  ('J12', 'judge: no next day offered', 'J', [(JUD, '    ...(next === undefined ? {} : { next_target: next }),\n    ...(allowance === undefined ? {} : { allowance }),', '    ...(allowance === undefined ? {} : { allowance }),')]),
  ('J13', 'judge: a refusal may settle any lapsed slot, the caller\'s or another\'s', 'J', [(JUD, '        outcome.kind === "held" &&\n        was.state === "live" &&\n        now_.state === "expired" &&\n        !before(now, was.expiresAt) &&\n        was.interval === outcome.interval &&\n        was.day === outcome.body.occurrence_id;', '        was.state === "live" &&\n        now_.state === "expired" &&\n        !before(now, was.expiresAt);')]),
  # Round 1 (review at b251f11): the fixes' and the new tests' own breakages.
  ('C23', 'a lapse ended at the sample, not at its expires_at', 'D', [(CNT, "UPDATE app.reservations SET state = 'expired', ended_at = expires_at", "UPDATE app.reservations SET state = 'expired', ended_at = ${at}::pg_catalog.timestamptz")]),
  ('C24', 'the clock sampled between the day\'s locks and the counter\'s', 'D', [(RES, '  await lockCounter(tx, key);\n\n  // 4. The clock.\n  const at = await clock.sample(tx);\n', '  const at = await clock.sample(tx);\n  await lockCounter(tx, key);\n\n  // 4. The clock.\n')]),
  ('C25', 'a held day answered before the denying facts', 'UD', [(ADD, '  const { day } = facts;\n  if (!(\n', '  const { day } = facts;\n  if (!(notBeforeReveal(day.starLeftAt, day.revealAt) && notBeforeReveal(day.starDeletionRequestedAt, day.revealAt))) return { kind: "held" };\n  if (!(\n')]),
  ('C26', 'a day that closed before the caller joined answered as it is (no Q06 check)', 'UD', [(ADD, '  if (facts.viewerJoinedAt === null || !before(facts.viewerJoinedAt, day.closeAt)) return { kind: "not_found" };\n', '')]),
  ('J14', 'judge: no Q06 check', 'J', [(JUD, '      return before(member.joinedAt, theDay.closeAt) ? interval : undefined;', '      return interval;')]),
  ('J15', 'judge: a slot held may settle the caller\'s lapsed slots in any day', 'J', [(JUD, '        was.interval === outcome.interval &&\n        was.day === outcome.body.occurrence_id;', '        was.interval === outcome.interval;')]),
  ('J16', 'judge: a release may settle the caller\'s lapsed slots in any day', 'J', [(JUD, '      was.interval === outcome.interval &&\n      was.day === day &&\n', '      was.interval === outcome.interval &&\n')]),
]
B += [
  ('M1', 'the matrix: a lapse at < instead of <=', 'M', [(CNT, "AND state = 'live' AND expires_at <= ${at}::pg_catalog.timestamptz", "AND state = 'live' AND expires_at < ${at}::pg_catalog.timestamptz")]),
  ('M2', 'the matrix: a refusal without its allowance', 'M', [(ANS, '...(allowance === undefined ? {} : { allowance: allowanceBody(allowance) }),', '...(allowance === undefined || true ? {} : { allowance: allowanceBody(allowance) }),')]),
  ('M3', 'the matrix: the table skipped after its first step', 'M', [(MAT, 'for (const [n, media] of RESERVE_TABLE.entries()) {', 'for (const [n, media] of RESERVE_TABLE.slice(0, 1).entries()) {')]),
  ('M4', 'the matrix: anyone may give back a slot', 'M', [(ADD, '  return facts !== null && addTargetOutcome(facts, now).kind !== "not_found" && facts.viewerInterval === slotInterval;', '  return facts !== null && addTargetOutcome(facts, now).kind !== "not_found" && slotInterval.length > 0;')]),
  ('M5', 'the matrix: Cleo\'s slot never given back', 'M', [(MAT, '          const cleos = await giveBack(cell.cleos, "Cleo\'s slot, held as a member and lapsed before any phase");', '          const cleos = { ended: undefined };')]),
]
want = set(sys.argv[1:])
if not want: B = [b for b in B if not b[0].startswith('M')]
results = []
for bid, what, kinds, edits in B:
    if want and bid not in want: continue
    originals = {}
    try:
        for f, old, new in edits:
            p = os.path.join(ROOT, f)
            if f not in originals: originals[f] = open(p).read()
            text = open(p).read()
            assert text.count(old) == 1, f'{bid}: anchor not found once in {f}'
            open(p, 'w').write(text.replace(old, new))
        caught = []
        for k in kinds:
            cwd, cmd = CMDS[k]
            r = subprocess.run(cmd, cwd=os.path.join(ROOT, cwd), env=ENV, capture_output=True, text=True, timeout=900)
            out = r.stdout + r.stderr
            failed = [l.strip() for l in out.splitlines() if ('FAIL' in l or '×' in l) and '>' in l][:3]
            caught.append((k, r.returncode, failed))
        ok = any(rc != 0 for _, rc, _ in caught)
        results.append({'id': bid, 'what': what, 'caught': ok, 'by': [{'suite': k, 'exit': rc, 'first': f[:2]} for k, rc, f in caught]})
        print(f'{bid} {"CAUGHT" if ok else "SURVIVED"}: {what} :: ' + '; '.join(f'{k} exit {rc} {f[:1]}' for k, rc, f in caught), flush=True)
    finally:
        for f, text in originals.items():
            open(os.path.join(ROOT, f), 'w').write(text)
json.dump(results, open('/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/res/breakages-' + ('-'.join(sorted(want)) or 'all') + '.json', 'w'), indent=1)
print(f'{sum(r["caught"] for r in results)} of {len(results)} caught')
