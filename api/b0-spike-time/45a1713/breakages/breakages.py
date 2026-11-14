# S5's deliberate breakages (docs/plans/api-b0-spike-time.md section 5): each applies its edits (each old
# text must occur exactly once), runs the named tests, and must fail with the registered test among the
# failures; then the files are put back. One line per breakage; results in results*.json.
import json, os, subprocess, sys
ROOT = os.environ.get("BRK_ROOT", "/home/user/tadayo-s5-brk")
OUT = os.path.dirname(os.path.abspath(__file__))
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres")
D = "packages/domain/src/authorization/days.ts"
RS = "packages/domain/src/authorization/read-sql.ts"
R = "packages/domain/src/authorization/read.ts"
CLF = "packages/domain/src/clubs/club-list.ts"
LF = "services/api/src/clubs/list.ts"
AC = "tests/src/privacy/account.ts"
SF = "tools/ops/src/spike-time.ts"
DC = "tools/ops/src/dev-clock.ts"
DT = ("packages/domain", ["src/authorization/days.test.ts"])
HD = ("tests", ["--config", "vitest.db.config.ts", "src/db/home-days.test.ts"])
CL = ("tests", ["--config", "vitest.db.config.ts", "src/db/club-list.test.ts"])
OST = ("tests", ["--config", "vitest.db.config.ts", "src/db/ops-spike-time.test.ts"])
ODC = ("tests", ["--config", "vitest.db.config.ts", "src/db/ops-dev-clock.test.ts"])
AT = ("tests", ["--config", "vitest.privacy.config.ts", "src/privacy/account.test.ts"])
LT = ("services/api", ["src/clubs/list.test.ts"])
ST = ("tools/ops", ["src/spike-time.test.ts"])
RR = ("tools/ops", ["src/run-remote.test.ts"])
RUN = "tools/ops/src/run.ts"

OPENS = "opens each day at its 7 AM exactly and closes it at its 1 AM exactly, and gives the next in date order"
B = [
 # The day choice in SQL (daysByClub), caught on Postgres.
 ("sql: open from after reveal_at (< for <=)", [(D, "? bound(sql)`o.reveal_at <= ${now}", "? bound(sql)`o.reveal_at < ${now}")], [HD], OPENS),
 ("sql: open at close_at too (<= for <)", [(D, "${now}::pg_catalog.timestamptz < o.close_at", "${now}::pg_catalog.timestamptz <= o.close_at")], [HD], OPENS),
 ("sql: next from reveal_at itself (>= for >)", [(D, ": bound(sql)`o.reveal_at > ${now}", ": bound(sql)`o.reveal_at >= ${now}")], [HD], OPENS),
 ("sql: next ordered the wrong way", [(D, "     ORDER BY o.reveal_at, o.id\n", "     ORDER BY o.reveal_at DESC, o.id\n")], [HD], OPENS),
 ("sql: local_date from close_at", [(D, "'local_date', o.local_date,", "'local_date', (o.close_at AT TIME ZONE c.timezone)::pg_catalog.date,")], [HD], OPENS),
 ("sql: the status condition dropped", [(D, "       AND o.status = 'scheduled'\n", "")], [HD], "never chooses a suspended or cancelled day, and moves next on"),
 ("sql: the suspended club condition dropped", [(D, "     WHERE c.suspended_at IS NULL\n       AND EXISTS", "     WHERE EXISTS")], [HD], "gives nothing in a suspended club, and a paused club's days"),
 ("sql: the viewer's interval state dropped", [(D, "AND m.state = 'active' AND u.state = 'active')`;", "AND u.state = 'active')`;")], [HD], "gives a stranger, a former member, an account being deleted"),
 ("sql: the viewer's account state dropped", [(D, "AND m.state = 'active' AND u.state = 'active')`;", "AND m.state = 'active')`;")], [HD], "gives a stranger, a former member, an account being deleted"),
 ("sql: the viewer's membership dropped", [(D, "     WHERE c.suspended_at IS NULL\n       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id\n                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text\n                      AND m.state = 'active' AND u.state = 'active')`;", "     WHERE c.suspended_at IS NULL AND ${viewer}::pg_catalog.text IS NOT NULL`;")], [HD], "gives a stranger, a former member, an account being deleted"),
 ("sql: a day taken across the viewer's clubs", [(D, "     WHERE o.club_id = c.id\n", "     WHERE o.club_id IN (SELECT m2.club_id FROM app.memberships m2 WHERE m2.state = 'active' AND m2.user_id IN (SELECT m3.user_id FROM app.memberships m3 WHERE m3.club_id = c.id AND m3.state = 'active'))\n")], [HD], "never mixes them: each club's days carry its own id, star and date"),
 ("sql: the star's name from the viewer's row", [(D, "function oneDay<F>(sql: FragmentSql<F>, now: ServerNow, phase: ChosenPhase): F {", "function oneDay<F>(sql: FragmentSql<F>, now: ServerNow, phase: ChosenPhase, viewer = \"\"): F {"), (D, "'star_name', CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END,", "'star_name', (SELECT vu.display_name FROM app.users vu WHERE vu.id = ${viewer}::pg_catalog.text),"), (D, "(${oneDay(sql, now, \"open\")}) AS open_day", "(${oneDay(sql, now, \"open\", viewer)}) AS open_day"), (D, "(${oneDay(sql, now, \"collecting\")}) AS next_day", "(${oneDay(sql, now, \"collecting\", viewer)}) AS next_day")], [HD], "names an active star by their account's name now"),
 ("sql: the star's name always the account's (FQ75)", [(D, "'star_name', CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END,", "'star_name', su.display_name,")], [HD], "names a star who left during the open day by the name it ended with"),
 ("sql: the avatar while the account is being deleted", [(D, "CASE WHEN s.state = 'active' AND su.state = 'active'", "CASE WHEN s.state = 'active'")], [HD], "keeps the name and drops the avatar while a deletion asked for during the open day"),
 ("sql: the nameless star's day kept", [(D, "       AND (CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END) IS NOT NULL\n", "")], [HD], "leaves out an open day whose star has no name to show"),
 ("sql: the star's leaving condition dropped", [(RS, "`(s.left_at IS NULL OR s.left_at >= o.reveal_at)\n       AND (su.deletion_requested_at", "`(su.deletion_requested_at")], [HD], "holds a day whose star left a microsecond before its reveal"),
 ("sql: the star's leaving at the reveal holds the day (> for >=)", [(RS, "s.left_at >= o.reveal_at)\n       AND (su.deletion_requested_at", "s.left_at > o.reveal_at)\n       AND (su.deletion_requested_at")], [HD], "keeps a day open to its close when its star leaves or asks to delete at its reveal"),
 ("sql: the star's deletion condition dropped", [(RS, "s.left_at >= o.reveal_at)\n       AND (su.deletion_requested_at IS NULL OR su.deletion_requested_at >= o.reveal_at)`;", "s.left_at >= o.reveal_at)`;")], [HD], "holds a day whose star asked to delete their account a microsecond before its reveal"),
 ("sql: the star's deletion at the reveal holds the day (> for >=)", [(RS, "su.deletion_requested_at >= o.reveal_at)`;", "su.deletion_requested_at > o.reveal_at)`;")], [HD], "keeps a day open to its close when its star leaves or asks to delete at its reveal"),
 # The same rules as a policy (chooseDays), caught on facts.
 ("policy: open from after reveal_at", [(D, "days.find((day) => !before(now, day.revealAt) && before(now, day.closeAt))", "days.find((day) => before(day.revealAt, now) && before(now, day.closeAt))")], [DT], "opens the day at reveal_at exactly, not a microsecond before"),
 ("policy: open at close_at too", [(D, "days.find((day) => !before(now, day.revealAt) && before(now, day.closeAt))", "days.find((day) => !before(now, day.revealAt) && !before(day.closeAt, now))")], [DT], "opens the day at reveal_at exactly, not a microsecond before"),
 ("policy: next from reveal_at itself", [(D, "const next = days.find((day) => before(now, day.revealAt));", "const next = days.find((day) => !before(day.revealAt, now));")], [DT], "gives the earliest day to open as next"),
 ("policy: next ordered the wrong way", [(D, "Temporal.Instant.compare(a.revealAt, b.revealAt) ||", "Temporal.Instant.compare(b.revealAt, a.revealAt) ||")], [DT], "gives the earliest day to open as next"),
 ("policy: the open day's phase collecting", [(D, "open: open === undefined ? null : chosen(open, \"open\"),", "open: open === undefined ? null : chosen(open, \"collecting\"),")], [DT], "says each chosen day's phase from its slot"),
 ("policy: the status condition dropped", [(D, "    day.status === \"scheduled\" &&\n", "")], [DT], "never chooses a suspended or cancelled day, open or next"),
 ("policy: the suspended club condition dropped", [(D, " && facts.clubSuspendedAt === null))", "))")], [DT], "gives nothing in a suspended club"),
 ("policy: the viewer's account condition dropped", [(D, "if (!(facts.viewerAccount === \"active\" && facts.viewerInterval", "if (!(facts.viewerInterval")], [DT], "gives nothing to a stranger, a former member, an account that isn't active"),
 ("policy: the viewer's interval condition dropped", [(D, "facts.viewerAccount === \"active\" && facts.viewerInterval === \"active\" && ", "facts.viewerAccount === \"active\" && ")], [DT], "gives nothing to a stranger, a former member, an account that isn't active"),
 ("policy: the star's leaving condition dropped", [(D, "    notBeforeReveal(day.starLeftAt, day.revealAt) &&\n", "")], [DT], "holds a day whose star left before its reveal"),
 ("policy: the star's deletion condition dropped", [(D, "    notBeforeReveal(day.starDeletionRequestedAt, day.revealAt) &&\n", "")], [DT], "holds a day whose star asked to delete their account a microsecond before its reveal"),
 ("policy: leaving at the reveal holds the day (> for >=)", [(R, "Temporal.Instant.compare(at, revealAt) >= 0)", "Temporal.Instant.compare(at, revealAt) > 0)")], [DT], "keeps a day open to its close when its star leaves or asks to delete at its reveal or after"),
 ("policy: the star's name always the account's (FQ75)", [(D, "return day.starIntervalState === \"active\" ? day.starName : day.starEndedName;", "return day.starName;")], [DT], "names a star whose interval ended during the open day by the name it ended with"),
 ("policy: the avatar while the account is being deleted", [(D, "day.starIntervalState === \"active\" && day.starAccount === \"active\" ? day.starAvatarVersion", "day.starIntervalState === \"active\" ? day.starAvatarVersion")], [DT], "keeps the name and drops the avatar while a deletion asked for"),
 ("policy: the nameless star's day kept", [(D, " &&\n    typeof starNameOf(day) === \"string\"\n", "\n")], [DT], "leaves out an open day whose star has no name to show"),
 ("chosenDay: a day that closes before it opens read", [(D, "  if (!before(revealAt, closeAt)) throw shape();\n", "")], [DT], "refuses anything outside the shape rather than show it"),
 # The club list: one statement, the slots, the serializer, one sample.
 ("listClubs: the days read in a second statement", [(CLF, "  const days = daysByClub(sql, userId, now);\n", "  const days = daysByClub(sql, userId, now);\n  await bound(sql)`SELECT FROM (${days}) d`;\n")], [CL], "reads both lists and the clubs' days in one statement"),
 ("listClubs: the open day read as collecting", [(CLF, "openDay: dayOf(row[\"open_day\"], \"open\", id),", "openDay: dayOf(row[\"open_day\"], \"collecting\", id),")], [CL], "lists a member's club with their own membership"),
 ("serializer: instants not cut to the second", [(LF, "    reveal_at: contractInstant(day.revealAt),\n", "    reveal_at: day.revealAt.toString(),\n")], [LT], "gives a day's instants in the contract's whole seconds"),
 ("serializer: the avatar key always sent", [(LF, "      ...(day.star.avatarVersion === null ? {} : { avatar_version: day.star.avatarVersion }),\n", "      avatar_version: day.star.avatarVersion,\n")], [LT], "gives each day as the contract's Occurrence and nothing else of it"),
 ("serializer: the day object spread in", [(LF, "  return {\n    id: day.id,\n    club_id: day.clubId,", "  return {\n    ...(day as unknown as Record<string, Json>),\n    id: day.id,\n    club_id: day.clubId,")], [LT], "is an explicit field list"),
 ("route: the days chosen a second after the instant", [(LF, "await listClubs(tx, account.id, now)", "await listClubs(tx, account.id, now.add({ seconds: 1 }))")], [LT], "chooses the days at the instant it answers with"),
 # The matrix's judge (daysOf, clubsJudge).
 ("judge: expectation read from the answer", [(AC, "      const expected = daysOf(world, club.id, now);\n", "      const expected = { open: club[\"open_day\"], next: club[\"next_day\"] };\n")], [AT], "makes clubsJudge refuse a missing day"),
 ("judge: open from after reveal_at", [(AC, "days.find(({ day }) => !before(now, day.revealAt) && before(now, day.closeAt)),", "days.find(({ day }) => before(day.revealAt, now) && before(now, day.closeAt)),")], [AT], "opens the day at its reveal exactly and closes it at its close exactly"),
 ("judge: the suspended club given days", [(AC, "  if (world.clubs.get(club)?.suspendedAt !== null) return {};\n", "  if (world.clubs.get(club) === undefined) return {};\n")], [AT], "gives none in a suspended club or a club it doesn't know"),
 ("judge: a held day given", [(AC, "      return !left && !deleting;\n", "      return !deleting;\n")], [AT], "holds a day whose star left or asked to delete their account before its reveal"),
 # The live run (spike-time), on fakes and on Postgres.
 ("run: expectation read from the answer", [(SF, "  const expected = expectedClubList(club, serverNow);\n", "  const expected = answer.json as Json;\n")], [ST], "fails a switch a second early or a second late"),
 ("run: the day open from after its reveal", [(SF, "      Temporal.Instant.compare(day.revealAt, serverNow) <= 0 && Temporal.Instant.compare(serverNow, day.closeAt) < 0,", "      Temporal.Instant.compare(day.revealAt, serverNow) < 0 && Temporal.Instant.compare(serverNow, day.closeAt) < 0,")], [ST, OST], "is T5 at the answer's server_now"),
 ("run: the day open at its close", [(SF, "      Temporal.Instant.compare(day.revealAt, serverNow) <= 0 && Temporal.Instant.compare(serverNow, day.closeAt) < 0,", "      Temporal.Instant.compare(day.revealAt, serverNow) <= 0 && Temporal.Instant.compare(serverNow, day.closeAt) <= 0,")], [ST, OST], "is T5 at the answer's server_now"),
 ("run: an answer at the instant counted before it", [(SF, "if (Temporal.Instant.compare(verdict.serverNow, at) < 0) {", "if (Temporal.Instant.compare(verdict.serverNow, at) <= 0) {")], [ST], "signs in, makes the account the app's way"),
 ("run: the cache header not checked", [(SF, "  if (answer.cacheControl !== \"private, no-store\") {", "  if (answer.cacheControl === \"never\") {")], [ST], "fails an answer with another cache header"),
 ("run: the user not deleted", [(SF, "    if (user !== undefined) {\n      const reply = await auth(", "    if (user !== undefined && !cleaning) {\n      const reply = await auth(")], [ST], "signs in, makes the account the app's way"),
 ("run: a Saturday as the first day", [(SF, "if (date.dayOfWeek <= 5 && ", "if (date.dayOfWeek <= 6 && ")], [ST], "is the earliest Monday to Friday in New York"),
 ("club: the account's subject not checked", [(SF, " AND auth_subject = ${account.subject}::pg_catalog.uuid", "")], [OST], "refuses an account that isn't the run's own"),
 ("club: the account's name not checked", [(SF, "AND state = 'active' AND display_name = 'Ana' AND age_confirmed_at", "AND state = 'active' AND age_confirmed_at")], [OST], "refuses an account that isn't the run's own"),
 ("club: the roster's seal dropped", [(SF, "  await tx`\n    UPDATE app.roster_revisions SET roster_sealed_at = ${at}::pg_catalog.text::pg_catalog.timestamptz\n     WHERE id = ${revision}`;\n", "")], [OST], "goes in whole through the schema's guards"),
 ("club: the roster's approval dropped", [(SF, "  await tx`\n    INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)\n    VALUES (${revision}, ${ana}, 'approved', true, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;\n", "")], [OST], "goes in whole through the schema's guards"),
 ("club: Ben's acceptance dropped", [(SF, "  await tx`\n    UPDATE app.roster_revision_candidates\n       SET accepted_at", "  if (Math.abs(1) === 2) await tx`\n    UPDATE app.roster_revision_candidates\n       SET accepted_at")], [OST], "goes in whole through the schema's guards"),
 ("club: the candidate left unjoined", [(SF, "  await tx`\n    UPDATE app.candidates SET state = 'joined'", "  if (Math.abs(1) === 2) await tx`\n    UPDATE app.candidates SET state = 'joined'")], [OST], "goes in whole through the schema's guards"),
 ("club: Ana left off the revision's members", [(SF, "  await tx`\n    INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id) VALUES", "  if (Math.abs(1) === 2) await tx`\n    INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id) VALUES")], [OST], "goes in whole through the schema's guards"),
 ("club: the first day's collecting_from a day early", [(SF, "              ${at}::pg_catalog.text::pg_catalog.timestamptz)`;\n    days.push({", "              ${now.subtract({ hours: 24 }).toString()}::pg_catalog.text::pg_catalog.timestamptz)`;\n    days.push({")], [OST], "goes in whole through the schema's guards"),
 ("club: the days' instants to the millisecond", [(SF, "              ${instants.revealAt.toString()}::pg_catalog.text::pg_catalog.timestamptz,", "              ${instants.revealAt.add({ microseconds: 1 }).toString()}::pg_catalog.text::pg_catalog.timestamptz,")], [OST], "goes in whole through the schema's guards"),
 # dev-clock without its file.
 ("dev-clock: a missing table made without the file", [(DC, "  if (made && options.makeSql === undefined) {\n", "  if (made && options.makeSql === \"never\") {\n")], [ODC], "without the file, moves a table that's there"),
 # Added by round 1 of the PR's review (the plan's section 5).
 ("judge: an absent expectation skipped", [(AC, "        if (canonical(club[field]) !== canonical(want))\n", "        if (want !== undefined && canonical(club[field]) !== canonical(want))\n")], [AT], "makes clubsJudge refuse a missing day"),
 ("run: no answer before the instant passes", [(SF, "      before > 0 && after >= ANSWERS_AFTER\n", "      after >= ANSWERS_AFTER\n")], [ST], "fails when no answer came before the instant"),
 ("run: the poll four times as fast", [(SF, "      if (after < ANSWERS_AFTER) await input.sleep(POLL_MS);\n", "      if (after < ANSWERS_AFTER) await input.sleep(POLL_MS / 4);\n")], [ST], "reads four times a second"),
 ("run: the may-be-left address not named", [(SF, "    } else if (mayBeMade === true) {\n", "    } else if (Math.abs(1) === 2) {\n")], [ST], "names the address it may leave"),
 ("run: shown reading the answer's name", [(SF, "    return `${own.star.displayName}'s ${own.localDate.toString()} (${phase})`;", "    return `${String((value[\"star\"] as Record<string, unknown> | undefined)?.[\"display_name\"])}'s ${own.localDate.toString()} (${phase})`;")], [ST], "says which of the run's own days an answer showed"),
 ("run: the close moved after an empty reveal window", [(SF, "        if ((await watch(token, club, edge, at)) === 0 && edge === \"reveal\") {", "        if ((await watch(token, club, edge, at)) === 0 && Math.abs(1) === 2) {")], [ST], "makes no second move of dev's clock after a reveal's window with no answer"),
 ("run: the club's write awaited without the limit", [(SF, "      const club = await untilAborted(input.database.writeClub(account), within);", "      const club = await input.database.writeClub(account);")], [ST], "leaves a database call that never settles at the run's limit"),
 ("run.ts: the transaction's limits after the clock's check", [(RUN, "              await limitTransaction(tx);\n              return writeClub(tx, { run, account, clock: await prepareClock(\"dev\", tx) });", "              const clock = await prepareClock(\"dev\", tx);\n              await limitTransaction(tx);\n              return writeClub(tx, { run, account, clock });")], [RR], "runs from an image without the repository's other folders"),
 ("run.ts: the connection's end unbounded", [(RUN, "    await db.end(endSeconds === undefined ? undefined : { timeout: endSeconds });", "    await db.end();")], [RR], "runs from an image without the repository's other folders"),
 ("listClubs: a day under another club's id served", [(CLF, "  if (day !== null && day.clubId !== club) throw shape();\n", "")], [LT], "refuses to serve a day whose club isn't the club it is listed under"),
 ("club: the account's state not checked", [(SF, "AND state = 'active' AND display_name = 'Ana' AND age_confirmed_at", "AND display_name = 'Ana' AND age_confirmed_at")], [OST], "refuses an account that isn't the run's own"),
]

only = sys.argv[1:]
results = []
for name, edits, suites, want in B:
    if only and name not in only: continue
    backup = {}
    ok = True
    for path, old, new in edits:
        full = os.path.join(ROOT, path)
        if path not in backup: backup[path] = open(full).read()
        cur = open(full).read()
        if cur.count(old) != 1:
            print(f"SETUP FAIL {name}: {old[:70]!r} occurs {cur.count(old)} times in {path}", flush=True); ok = False; break
        open(full, "w").write(cur.replace(old, new))
    failed_by = []
    outputs = []
    if ok:
        for pkg, args in suites:
            r = subprocess.run(["npx", "vitest", "run", *args], cwd=os.path.join(ROOT, pkg), env=ENV, capture_output=True, text=True, timeout=900)
            out = r.stdout + r.stderr
            outputs.append(f"$ (cd {pkg} && npx vitest run {' '.join(args)})  # exit {r.returncode}\n{out}")
            fails = [l.strip() for l in out.splitlines() if l.strip().startswith("×")]
            if r.returncode != 0: failed_by.extend(f"{pkg}: {f}" for f in fails) or failed_by.append(f"{pkg}: exit {r.returncode}, no test named")
    for path, text in backup.items():
        open(os.path.join(ROOT, path), "w").write(text)
    named = [f for f in failed_by if want in f]
    verdict = "SETUP" if not ok else ("CAUGHT" if named else "MISSED")
    slug = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")[:80]
    results.append({"name": name, "slug": slug, "verdict": verdict, "expected": want, "named": named, "all": failed_by,
                    "edits": [{"path": p, "old": o, "new": n} for p, o, n in edits]})
    open(os.path.join(OUT, "out", slug + ".txt"), "w").write("\n\n".join(outputs))
    print(f"{verdict:7} {name} :: {len(failed_by)} failing; named: {(named[0] if named else '-')[:140]}", flush=True)
json.dump(results, open(os.path.join(OUT, "results" + ("-" + str(len(only)) if only else "") + ".json"), "w"), indent=1)
print(f"done: {sum(r['verdict']=='CAUGHT' for r in results)} caught of {len(results)}", flush=True)
