# Each breakage: apply its edits (each old text must occur exactly once), run the named tests, expect a
# failure, put the files back. Prints one line per breakage.
import json, os, subprocess, sys
ROOT = os.environ.get("TADAYO_ROOT", "/home/user/tadayo-b2")
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"])
EX = "packages/contracts/src/fixtures/examples-clubs.ts"
CT = ("packages/contracts", ["src/contract.test.ts"])
BL = ("tests", ["src/privacy/body-limits.test.ts"])
ME = ("services/api", ["src/identity/me.test.ts", "src/app.test.ts"])
B = [
 ("drop abort on text()'s guard", [("packages/contracts/src/common.ts", ".max(max * 16, { abort: true })", ".max(max * 16)")], [CT]),
 ("drop the isWellFormed refine", [("packages/contracts/src/common.ts", '.refine((value) => value.isWellFormed(), { error: "well formed, with no lone surrogate", abort: true })', "")], [CT, ME]),
 ("the old six-byte measure", [("tests/src/privacy/body-limits.test.ts", "escaped(maxLength) : 2 + 12 * maxLength;", "escaped(maxLength) : escaped(maxLength);")], [BL]),
 ("the corrected measure at the old limits", [("services/api/src/app.ts", "export const BODY_LIMIT = 128 * 1024;", "export const BODY_LIMIT = 64 * 1024;"), ("services/api/src/app.ts", "{ updateMe: 17 * 1024 }", "{ updateMe: 8 * 1024 }")], [BL]),
 ("updateMe at 16 KiB, under twice its largest body", [("services/api/src/app.ts", "{ updateMe: 17 * 1024 }", "{ updateMe: 16 * 1024 }")], [ME]),
 ("holders without the viewer", [(EX, "{ holders: who.map(person) }", "{ holders: who.filter((name) => name !== viewer).map(person) }")], [CT]),
 ("holders out of join order", [(EX, "{ holders: who.map(person) }", "{ holders: [...who].reverse().map(person) }")], [CT]),
 ("held_by for a confirmed viewer in the first days", [(EX, '{ ...spTakenFour, tuesday: ["yours", undefined, 10], monday: ["available"], friday: ["available"] }', '{ ...spTakenFour, tuesday: ["yours", undefined, 10], monday: ["available"], friday: ["available", "debby"] }')], [CT]),
 ("held_by dropped from a change's day", [(EX, '      : { weekday, state: "available", held_by: member("kitchenTable", ktChange[weekday]), suggested: false },', '      : ktChange[weekday] === "leila" ? { weekday, state: "available", suggested: false } : { weekday, state: "available", held_by: member("kitchenTable", ktChange[weekday]), suggested: false },')], [CT]),
 ("a name on a no_reveal day", [(EX, '...(state === "available" && typeof who === "string" ? { held_by: person(who) } : {}),', '...((state === "available" || state === "no_reveal") && typeof who === "string" ? { held_by: person(who) } : {}),'), (EX, '            friday: ["no_reveal"],\n            saturday: ["available", "nina"],\n          }),\n        ),\n      },\n      confirm_refused', '            friday: ["no_reveal", "ben"],\n            saturday: ["available", "nina"],\n          }),\n        ),\n      },\n      confirm_refused')], [CT]),
 ("held_by naming the viewer", [(EX, '            friday: ["clash", ["ben", "alex", "debby"]],\n            saturday: ["available", "nina"],', '            friday: ["clash", ["ben", "alex", "debby"]],\n            saturday: ["available", "ben"],')], [CT]),
 ("a first_date on an unconfirmed day", [(EX, 'spFirstDays("ben", { ...spTakenFour, monday: ["yours"], friday: ["available", "debby"] }),', 'spFirstDays("ben", { ...spTakenFour, monday: ["yours", undefined, 9], friday: ["available", "debby"] }),')], [CT]),
 ("a first_date on another weekday", [(EX, '  saturday: ["taken", "nina", 7],\n} as const;', '  saturday: ["taken", "nina", 8],\n} as const;')], [CT]),
 ("a version moved by a choice", [(EX, '  id: "spr_sp_1",\n  version: 1,', '  id: "spr_sp_1",\n  version: viewer === "sam" ? 2 : 1,')], [CT]),
 ("a change applied before its start for one viewer", [(EX, '  my_state: myState,\n  state: "open",\n  announced: ktAnnounced,', '  my_state: myState,\n  state: myState === "confirmed" ? "applied" : "open",\n  announced: ktAnnounced,')], [CT]),
 ("change_confirmed differing from change beyond my_state", [(EX, '  announced: ktAnnounced,\n});', '  announced: myState === "confirmed" ? ktAnnounced.slice(1) : ktAnnounced,\n});')], [CT]),
 ("an announced day on or after the start", [(EX, "Array.from({ length: 29 }", "Array.from({ length: 31 }")], [CT]),
 ("Ben's position after a member with a day", [(EX, "              position: index + 1,\n              cover: index + 1,\n              ...(first === undefined", "              position: who === \"ben\" ? 2 : who === \"maya\" ? 1 : index + 1,\n              cover: index + 1,\n              ...(first === undefined")], [CT]),
 ("a suggested day off the viewer's join place", [(EX, "suggested: proposedFor[weekday] === viewer,", 'suggested: proposedFor[weekday] === viewer || (viewer === "debby" && weekday === "saturday"),')], [CT]),
 ("a choice of none refused", [("packages/contracts/src/schemas/clubs.ts", '    .array(Weekday)\n    .max(2)\n    .refine((days) => new Set(days).size === days.length, "each weekday only once"),\n);\n\nexport const ConfirmedWeekdays', '    .array(Weekday)\n    .min(1)\n    .max(2)\n    .refine((days) => new Set(days).size === days.length, "each weekday only once"),\n);\n\nexport const ConfirmedWeekdays')], [CT]),
 ("a confirmation of none accepted", [("packages/contracts/src/schemas/clubs.ts", '  "One or two weekdays, each only once (T6): the days the caller saw as theirs and confirms.",\n  z\n    .array(Weekday)\n    .min(1)', '  "One or two weekdays, each only once (T6): the days the caller saw as theirs and confirms.",\n  z\n    .array(Weekday)\n    .min(0)')], [CT]),
 ("the schedule in force needing two", [("packages/contracts/src/schemas/clubs.ts", "assignments: z.array(ScheduleAssignment).min(1).max(6)", "assignments: z.array(ScheduleAssignment).min(2).max(6)")], [CT]),
 ("chooseScheduleDays without NOT_ALLOWED", [("packages/contracts/src/operations-clubs.ts", 'body: ScheduleChoiceRequest,\n    ok: { status: 200, json: ScheduleProposal },\n    errors: ["NOT_ALLOWED", "VERSION_CONFLICT", "MEMBERSHIP_CHANGED"],', 'body: ScheduleChoiceRequest,\n    ok: { status: 200, json: ScheduleProposal },\n    errors: ["VERSION_CONFLICT", "MEMBERSHIP_CHANGED"],')], [CT]),
 ("first-days held_by dropped from every example", [(EX, '...(state === "available" && typeof who === "string" ? { held_by: person(who) } : {}),', '...({}),')], [CT]),
 ("a day set aside naming its old holder", [(EX, '            wednesday: ["available"],\n            thursday: ["available", "sam"],\n            friday: ["clash", ["ben", "alex", "debby"]],', '            wednesday: ["available", "alex"],\n            thursday: ["available", "sam"],\n            friday: ["clash", ["ben", "alex", "debby"]],')], [CT]),
 ("drop the isWellFormed refine's abort", [("packages/contracts/src/common.ts", '{ error: "well formed, with no lone surrogate", abort: true }', '{ error: "well formed, with no lone surrogate" }')], [CT]),
 # Added after the PR's second review round, which found the version test loosened (r2-privacy-2, r2-mechanics-1).
 ("a choice answering applied at the next version", [(EX, '        value: spFirstDays("ben", {\n          monday: ["yours"],\n          tuesday: ["available", "maya"],', '        value: { ...spFirstDays("ben", {\n          monday: ["yours"],\n          tuesday: ["available", "maya"],'), (EX, '          saturday: ["available", "nina"],\n        }),\n      },\n      joined_contest:', '          saturday: ["available", "nina"],\n        }), state: "applied", version: 2 },\n      },\n      joined_contest:')], [CT]),
 ("a confirmation that isn't the last answering applied at the same version", [(EX, '        value: spFirstDays(\n          "ben",\n          { ...spTakenFour, monday: ["yours", undefined, 9]', '        value: { ...spFirstDays(\n          "ben",\n          { ...spTakenFour, monday: ["yours", undefined, 9]'), (EX, '          "confirmed",\n        ),\n      },\n    },\n    leaveClub:', '          "confirmed",\n        ), state: "applied" },\n      },\n    },\n    leaveClub:')], [CT]),
 ("a confirmation that isn't the last answering applied at the next version", [(EX, '        value: spFirstDays(\n          "ben",\n          { ...spTakenFour, monday: ["yours", undefined, 9]', '        value: { ...spFirstDays(\n          "ben",\n          { ...spTakenFour, monday: ["yours", undefined, 9]'), (EX, '          "confirmed",\n        ),\n      },\n    },\n    leaveClub:', '          "confirmed",\n        ), state: "applied", version: 2 },\n      },\n    },\n    leaveClub:')], [CT]),
 ("a first-days read shown superseded at another version", [(EX, '          spFirstDays(\n            "maya",', '          { ...spFirstDays(\n            "maya",'), (EX, '            "confirmed",\n          ),\n          spConfirmedFour,\n        ),\n      },\n    },\n    chooseScheduleDays:', '            "confirmed",\n          ), state: "superseded", version: 7 },\n          spConfirmedFour,\n        ),\n      },\n    },\n    chooseScheduleDays:')], [CT]),
]

# The test each breakage must fail, by the start of its name (registered before the run): a failure of
# another test alone, `openapi.yaml`'s check above all, which any change to an example trips, isn't a catch.
EXPECT = {
 "drop abort on text()'s guard": "never counts a string past its guard",
 "drop the isWellFormed refine": "refuses a lone surrogate",
 "the old six-byte measure": "measures what a schema allows, by hand",
 "the corrected measure at the old limits": "holds the longest body of every operation",
 "updateMe at 16 KiB, under twice its largest body": "takes the largest body the contract allows",
 "holders without the viewer": "say on each day only what its state allows",
 "holders out of join order": "say on each day only what its state allows",
 "held_by for a confirmed viewer in the first days": "say on each day only what its state allows",
 "held_by dropped from a change's day": "say on each day only what its state allows",
 "a name on a no_reveal day": "say on each day only what its state allows",
 "held_by naming the viewer": "say on each day only what its state allows",
 "a first_date on an unconfirmed day": "date only a day confirmed in the first days",
 "a first_date on another weekday": "date only a day confirmed in the first days",
 "a version moved by a choice": "agree on one state, version and start for each proposal",
 "a change applied before its start for one viewer": "show a membership change the same before and after",
 "change_confirmed differing from change beyond my_state": "show a membership change the same before and after",
 "an announced day on or after the start": "list a change's announced days in date order",
 "Ben's position after a member with a day": "place every member once",
 "a suggested day off the viewer's join place": "propose each member's first day by the order they joined",
 "a choice of none refused": "takes each weekday only once in a choice",
 "a confirmation of none accepted": "takes each weekday only once in a choice",
 "the schedule in force needing two": "holds one confirmed day as the schedule in force",
 "chooseScheduleDays without NOT_ALLOWED": "gives each operation exactly its own errors",
 "first-days held_by dropped from every example": "give each first-days day exactly the state",
 "a day set aside naming its old holder": "give each first-days day exactly the state",
 "drop the isWellFormed refine's abort": "refuses a lone surrogate",
 "a choice answering applied at the next version": "give each first-days day exactly the state",
 "a confirmation that isn't the last answering applied at the same version": "agree on one state, version and start for each proposal",
 "a confirmation that isn't the last answering applied at the next version": "give each first-days day exactly the state",
 "a first-days read shown superseded at another version": "agree on one state, version and start for each proposal",
}
only = sys.argv[1:]
results = []
for name, edits, suites in B:
    if only and name not in only: continue
    backup = {}
    ok = True
    for path, old, new in edits:
        full = os.path.join(ROOT, path)
        text = backup.get(path) if path in backup else open(full).read()
        backup.setdefault(path, open(full).read())
        cur = open(full).read()
        if cur.count(old) != 1:
            print(f"SETUP FAIL {name}: {old[:60]!r} occurs {cur.count(old)} times in {path}"); ok = False; break
        open(full, "w").write(cur.replace(old, new))
    failed_by = []
    if ok:
        for pkg, files in suites:
            r = subprocess.run(["npx", "vitest", "run", *files], cwd=os.path.join(ROOT, pkg), env=ENV, capture_output=True, text=True, timeout=600)
            out = r.stdout + r.stderr
            fails = [l.strip() for l in out.splitlines() if l.strip().startswith("×")]
            if r.returncode != 0: failed_by.extend(f"{pkg}: {f}" for f in fails)
            # A file that doesn't load fails no test by name: the breakage itself is broken, not caught.
            if r.returncode != 0 and not fails: ok = False; print(f"LOAD FAIL {name}: {pkg} ran no test")
    for path, text in backup.items():
        open(os.path.join(ROOT, path), "w").write(text)
    want = EXPECT[name]
    named = [f for f in failed_by if want in f]
    verdict = "SETUP" if not ok else ("CAUGHT" if named else "MISSED")
    results.append({"name": name, "verdict": verdict, "expected": want, "named": named, "all": failed_by})
    print(f"{verdict:7} {name} :: {len(failed_by)} failing; named: {(named[0] if named else '-')[:150]}", flush=True)
json.dump(results, open(os.environ.get("RESULTS", "results") + ("-" + str(len(only)) if only else "") + ".json", "w"), indent=1)
