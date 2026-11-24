# B1 · ios · an accepted invitation's join leaves "Opening…" every time (`ios/b1-accepted-join-pop`)

Branch `ios/b1-accepted-join-pop`, from `main` at `3f1de6b` (#116). Written on 24 November 2026. One app file changes, `apps/ios/Tadayo/Tabs/TabsView.swift`, and no test, check, snapshot, string or model. What changes is when the accepted invitation's screen comes off Home's stack.

## 1. What failed

`InvitationUITests.testNotNowOnAChangedRosterLeavesItsRowHoldingTheLinkWhichOpensItAgain` opens a changed roster's row on Home (the club list's accepted invitation, from #112), taps Accept, and waits 10 seconds for Home with Kitchen table (`acceptJoinsKitchenTable`, line 135). Five runs failed there:

| Run | Head | Runtime |
|---|---|---|
| `ios` 45119109664, attempt 2 | `da20caf` (#112) | iOS 26.5 |
| `ios` 45150202042 | `3a76bdc` (#113) | iOS 27.2 |
| `ios` 45174501515 | `b7e1c92` (#113) | iOS 27.2 |
| `ios` 45270246244, attempt 2 | `4982975` (#114) | iOS 27.2 |
| `ios` 45305516934 | `ec55ba5` (`api/b2-worker-hardening`, `main` at `3f1de6b` merged in; told by the api lane) | iOS 27.2 |

Each time, #112's diagnostic printed the invitation screen still on "Opening Kitchen table…" (`G02-opening`) 10 seconds after Accept, the Invitation bar pushed and no Accept button. Where it passes, Home with Kitchen table comes within about a second. The stand-in services answer at once (`UITestLaunch`'s `Invited`), so nothing was waiting on the network. Reading the code left three ways to stay on `G02-opening` (`docs/JOURNAL.md` block 1.3, Next 1, before this branch): the root's `joined` closure finding another invitation or none shown (`RootModel.makeInvitation`), the model closed while its Accept was on its way (`joinedWhileClosed`), or `TabsView.rootInvitationChanged` finding no `.accepted` on any tab.

## 2. What the probe showed

`ios/b1-opening-probe`, from `main` at `8e56ce4`, never merged, as `ios/b0-arrival-probe` wasn't: a trace of the root invitation's events (`TadayoCore`'s `Probe`, notes in `RootModel` and `InvitationModel`, notes in `TabsView`), read from one hidden accessibility element and printed by the test after each Accept ("probe: joined" or "probe: STUCK"), with `tools/ci/ios_steps.py` running only this test, many times on each runtime.

- **`db367f0`, `ios` 45297919026, 30 iterations on each runtime:** 3 of 60 stuck (iOS 27.2 1, iOS 26.5 2). Each stuck iteration's trace is the same as a joined one's to its last line: the Accept answered with the model open (`accept … closed=false`, `answer … closed=false current=true`); the `joined` closure found its own invitation shown (`joined 64c9 inv=64c9`), read the list and let the invitation go (`setInv 64c9→nil`); the tabs saw the club list and the selected club change (`tabs clubs listed`, `tabs selected club_kitchen`); and `rootInvitationChanged` ran from the `onChange` of the root's invitation with `.accepted` on Home's path (`tabs rootChanged nil - on=nil paths=[home: [accepted]]`) and took it off. No write of the path followed, yet the stack kept the screen. So none of the three ways in section 1 happened: the root and the tabs' state were right, and SwiftUI's `NavigationStack` lost a pop asked for from an `onChange` in the update where its root view turned from the no-club Home to Kitchen table's Home.
- **`d066cf4`, `ios` 45307726088, 40 iterations on each runtime, with the change of section 3:** 0 of 80 stuck. Each trace now has `tabs acceptedAnswered … opening` with `.accepted` on the path, then `tabs clubs listed … paths=[home: []]`: the pop is in the same change as the club list's, before any `onChange` runs. With 3 stuck in 60 before, none in 80 has under a 2 percent chance if nothing changed.
- **`68b2b4c`, `ios` 45317659286, 40 iterations on each runtime, with the guard this branch has (`shownAccepted === model`):** see section 4.

The paste step's joins (`testBenAcceptsALinkThatJoinsAndHomeShowsTheClub`, `testAChangedInvitationWithNoLinkAsksForItAndThenJoins`) never stuck: `TabsView.answered` closes their screens in the action that joined (`closeInvitationScreens`), not from the root's change.

## 3. The change

`apps/ios/Tadayo/Tabs/TabsView.swift`, the accepted invitation's destination (`ClubRoute.accepted`):

- **`acceptedAnswered(_:)`**, given to `InvitationDestination` as `answered`, which it calls after Accept or Retry returns: when the model is the one this screen shows (`shownAccepted === model`) and its state is `opening` (a club joined), it takes `.accepted` off every tab's path, in the same main-actor job as the root's `joined` closure, before SwiftUI draws the list's change. An Accept that answers after its screen was left with Back finds no `.accepted` left to take off, or, when another accepted invitation's screen is up by then, a different `shownAccepted` (`rootInvitationChanged` sets it before pushing), and takes nothing off. Until now `answered` did nothing here, and the pop waited for the root.
- **`leaveAccepted()`**, given as `leave` (Not now, Done and Close invitation): takes `.accepted` off, then the root closes the invitation, where until now it called only `closeInvitation()` and left the pop to the root's change.
- **`removeAccepted()`**: the loop `rootInvitationChanged` had, shared. `rootInvitationChanged` keeps calling it when the root's invitation goes, for every other way it goes (a session ending, another invitation in its place).

Nothing else moves: `RootModel`'s `joined` closure still keeps the club as the selected one, reads the list and lets the invitation go; Home opens on Kitchen table as before. Removing `.accepted` from `paths` directly doesn't call the path binding's setter, so the setter's `closeInvitation()` for Back isn't run twice.

Not taken: deferring `rootInvitationChanged`'s pop to the main queue's next turn, which would wait for a time, not a state, and still pop from outside the action; and changing the test, whose check (Home with Kitchen table within 10 seconds of Accept) is right and stays as it is (T58).

## 4. Verification

- `swift format lint --strict --configuration apps/ios/.swift-format` on `TabsView.swift`; the app compiles only on CI.
- The branch's `ios` run: every test on both runtimes, `InvitationUITests` among them, every snapshot matching (no screen is drawn differently).
- The probe's third run, `68b2b4c` (`ios` 45317659286): the exact condition this branch ships, 40 iterations on each runtime; expected no "probe: STUCK".
- **Not verifiable on one run:** a failure that came about 1 time in 20 isn't shown gone by one pass of the suite; the probe's iterations are the evidence, and `main`'s `ios` runs keep watching the test.

## 5. Review

One fresh reviewer, the founder's cap for a lower-risk PR being two rounds.
