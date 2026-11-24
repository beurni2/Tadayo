# B1 · ios · each `ios` intermittent at its cause (audit A9)

Written on 24 November 2026. The outside audit's finding A9 is that `ios` fails about half the time and gates nothing: `ci`, `main`'s required check, doesn't need it, and "each failing test passed in the other attempt" has become the usual reading. The founder said to go ahead with the iOS findings in the project chat at 10:02 UTC on 2026-11-24, in the order A8, A9, B3. For A9 the aim is that every intermittent is fixed at its cause or recorded here with a date, so that `ios` can become a required check.

Three rules hold throughout:

- No test is skipped, quarantined or loosened without the founder's own word (CLAUDE.md, "Honesty"). A quarantine would be the founder's recorded decision, with its date, here.
- A workflow change goes in its own CI-configuration PR under a freeze (T58; `docs/MILESTONES.md`, "Lanes"). A change to `tools/ci/` alone needs no freeze.
- Making `ios` a required check is a change to `main`'s protection, which is the founder's (and part of the audit's founder-owned A2). The lane asks for it only once this record shows each intermittent fixed or decided.

## 1. The record, as of 2026-11-24

**Window:** the 60 `ios` runs created from 02:37 UTC on 2026-11-22 to 05:38 UTC on 2026-11-24, on every branch, read through the Actions API (72 attempts of the build job: 16 passed, 42 failed, 14 cancelled). Each failed attempt's job log was read, and for the failures of item 1 each run's `logs/test-27.2.log` on the `evidence` branch.

Failures that were a branch's own work in progress aren't intermittents and are left out: a screen's new references before they were taken (`ios/b1-create-screens`, `ios/b1-invitation-screens`, `ios/b1-create-handoff-9`), a compile error (`bbbd19a`), and a new test fixed in its branch's next commit (`KeychainInvitationLinkVaultTests` at `0e0e97b`).

| # | Intermittent | Runtime | Failed attempts in the window | What the logs show | Cause | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ArrivalFocusTests.testA03TakesTheFocusAsItReplacesA02Age`, lines 37 and 38 ("the name's field lost the focus") | iOS 27.2 only | 18, four of them on `main` (`459a153`, `6a6f0b0`, `4404ff1`, `8e56ce4`) | In all 12 whose own log the `evidence` branch holds, the host's XPC connection to the simulator's keyboard service was invalidated during the test, and 11 also show `_UIRemoteKeyboards proxy` failing ("The connection to service with pid … was invalidated"). The field's editing ended with it. The failures took 15 to 41 seconds, where a pass takes about 6. One pass shows the same death and still passed, in 21 seconds (`1294c5d`'s re-run), so the death can fall outside the test's 2.5 seconds. Runners in passing runs had loads as high (300 to 450) at the same point. | The keyboard service ends mid-test. Why it ends isn't in the logs. | Step 1 (section 2) makes the next failure say which process ended and how. |
| 2 | A snapshot whose draws don't settle (the Liquid Glass capsule drawn 1 or 2 levels off, `docs/LIMITATIONS.md`, 2026-11-14) | iOS 27.2 (the snapshot runtime) | At least 6: `main` `459a153` (`A02-code-verify-failed-network`, then `A02-code-error` on the re-run) and `3f1de6b` (`G02-changed`); `26df37f` (`G05-members-failed`), `644b61f` (`A02-code-resend-failed-network`), `3914acd` (`G02-link-entry-signed-in-cannot-check`) | Screens the branches didn't change. Where the draws were read (the A02 states), the difference is the glass capsule. | The system's glass, drawn differently from one draw to the next. No app fix found; the glass is never hidden (T45). | Open. A later step, with a question for the founder if no fix is found. |
| 3 | `SignInReadingTests.testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea`, line 629 | iOS 26.5 only | 2 (`26df37f`, `c5b960a`) | Continue placed right, but the column not yet scrolled when it was read. | The read comes before the system's scroll; not yet traced. | Open, a later step. |
| 4 | The code field's 5-second wait after Send a code (`ClubDetailsUITests.testAClubNoLongerTheCallersClosesItsDetails`, line 84) | iOS 26.5 | 1 in the window (`main` `4404ff1`), and once before it | The field never came, or came late. | Unknown. PR #114 (`ios/b1-ui-code-wait`) makes the next miss print what the screen showed. | #114 open. |
| 5 | `InvitationUITests.testNotNowOnAChangedRosterLeavesItsRowHoldingTheLinkWhichOpensItAgain`, line 135 | both | 4 (`da20caf`, `b7e1c92`, `4982975`, `ec55ba5`), and the probe `db367f0` | The accepted invitation's screen stayed up after the join. | An accepted invitation's join didn't take its screen off in the action that joined. | **Fixed at its cause** by #119 (`ed1b036`, 2026-11-24). |
| 6 | The test step's 50-minute limit | — | 9 (`4404ff1` twice, `3a76bdc`, `b6e18c4`, `b91724b`, `b7e1c92` twice, `1294c5d` twice) | iOS 26.5's pass stopped by the limit on a slow runner. | The runner, slow most of 2026-11-23. | **Fixed** by #115 (`6cd94fd`, 2026-11-23): 90 minutes; `docs/LIMITATIONS.md` says when to lower it again. |
| 7 | A lost runner | — | 2 (`4982975`, `6e8ba7b`), each followed by the evidence job's "Unable to download artifact" | The build job's log is gone (`BlobNotFound`). | GitHub's hosted runner; nothing in the repository causes it. | Recorded. A re-run is the answer. |
| 8 | The evidence job's ImageMagick step stopped by its limit | — | 1 (`d624a08`) | The step's timeout. | Not yet read. | Open, a later step. |

## 2. Step 1: the crash and jetsam reports of each pass (`ios/b1-ci-crash-reports`)

CI configuration only (T58): `tools/ci/ios_steps.py` and its tests, with no workflow file, so no freeze.

- After each test pass, `Steps.crash_reports` reads the crash and jetsam reports macOS wrote during it (`~/Library/Logs/DiagnosticReports` and `/Library/Logs/DiagnosticReports`; a simulator's processes are reported there too). It writes a summary of each to `logs/crashes-<v>.txt`, and the step's output names the processes. A summary has which process ended and how: the report's name, type and time, the process's path and parent, a crash's exception and signal, a kill's namespace and reason, and the processes a jetsam event killed. A thread's frames aren't kept. There are 30 reports at most, and each field is cut to 300 characters. The file is written only when there's a report.
- After a failed pass, `Steps.service_exits` adds the simulator's own log lines about services that exited during it (`xcrun simctl spawn <udid> log show` with `SERVICE_LOG_PREDICATE`, given 90 seconds, 200 lines at most). These catch a process that ended with no report.
- Neither decides a step. The evidence job publishes `logs/` as it is, so the file reaches `<branch>/<short-sha>/ios/logs/` on `evidence`.
- **Tests** (`tools/ci/ios_steps_test.py`):
  - `test_the_crash_and_jetsam_reports_of_a_pass_are_kept`: a crash report and a jetsam event written during the iOS 27.2 pass go to `crashes-27.2.txt`, and the step names them. A report from before the pass, or a file that isn't a report, is left out, as are the threads' frames. The 26.5 pass, with none, writes no file.
  - `test_a_failed_pass_keeps_the_simulator_s_lines_about_services_that_exited`: only the failed pass reads the device's log; a log that can't be read is said, and one with no such line writes nothing.
  - `test_a_report_that_isn_t_ips_or_can_t_be_read_is_kept_as_it_is`: a report in another form, or one that doesn't parse, gives its first lines; a long field is cut; a folder that can't be read is said, and a missing one is passed over.
- **Done when:** the next failure of item 1 says which process ended, and how. That decides the fix: the runner (memory or load; `runner.txt` already shows a full 7 GB and swapping during the 27.2 pass), the simulator's service, or the app.

## 3. The next steps, in order

Each step is its own PR, and each changes this record when it lands.

1. Item 1 at its cause, from what step 1's reports show.
2. Item 2: whether the glass can be drawn the same each time without hiding it. If not, ask the founder once how the snapshot tests should treat it, with a recommendation.
3. Items 3 and 8.
4. Item 4 with #114's prints, once a miss happens.
5. Once each item is fixed or decided, ask the founder to make `ios` a required check. That covers `main`'s protection, and whether `ci` should need `ios` for a PR that changes the app (a workflow change, under a freeze).
