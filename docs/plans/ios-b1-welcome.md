# B1 plan PR 8: Welcome (`ios/b1-welcome`)

Branch `ios/b1-welcome`, from `main` at `954e47d` (#144), written on 27 November 2026. B1 plan item 8 (`docs/plans/ios-b1-clubs.md` section 4): `A01-welcome`, `A01-welcome-dark` and `A01-welcome-xl`, before A02-email, which then has the system back to Welcome; a received invitation skips Welcome (book p9). The signed-out paste step, `G02-link-entry`, comes with it, since it's Welcome's I have an invite (`docs/plans/ios-b1-invitation.md` section 1, "The paste step").

## 1. Sources

- **Book p9:** "Create a club and I have an invite are the primary routes. A received invite skips the generic introduction." Recovery: "Expired, changed or pending invitations retain their intent through authentication."
- **Handoff 8's Welcome** (`claude-design/handoff-8/IMPLEMENTATION.md`, "Welcome and invitation introduction"; `component-contracts.json` `handoff8.welcome`): the 144-point wordmark; the brand line, "Your day. Your story. A thought from your friends.", in `dayTitle` and `primaryText`; the explanation, "Take turns sharing what you’ve been up to. Friends can add something that reminded them of you.", in `body` and `secondaryText`; the example labelled "An example · before and on the day", the target "Debby’s Friday · 6 November 2026", the stages "Caption now" and "Photo on the day", Maya's caption "Your future living room." beside the chair. At the default size two 170-point columns 13 apart, the cover 172 high with the fold, the caption in `row` and the sender in `metadata` beside a 28-point avatar. At the largest size one stage after the other in one scrolling column, with no footer laid over the text. The routes: Create a club goes to A02-email, then the age and profile if needed, then `G01-create`; I have an invite goes to `G02-link-entry`, then sign-in before the roster; "Keep the existing received-link route that skips generic Welcome."
- **Handoff 9's frames 18 to 20** (`handoff9.welcome`): "Already here? Sign in", the text action under I have an invite, 44 high, hinted "Sign in to your existing account.", going to A02-email, then wherever the account goes. Frame 20 is scrolled to the three routes; "First arrival starts at top."
- **Handoff 2's frame 11, `G02-link-entry`:** handoff 4's paste step with "Sign in before you can see the club or its people." under Paste, and Continue disabled while empty. "A valid format stores an opaque invitation intent. If signed out, continue through authentication before fetching or displaying the club and roster" (`IMPLEMENTATION.md`, "Link entry and browser text"). Handoff 9's `linkEntry.cancellation`: "discard the account-scoped intent on explicit exit".
- **Handoff 1:** "Leave sign-in exits the restricted setup session and returns to Welcome". Handoff 7: "A02-email-empty is the first screen in B0: no Welcome back chevron."
- **FQ23 and FQ24:** the chair and Maya's portrait are fixtures, only in builds that point at `dev` (the Lab's, `#if LAB`). A build that points at `prod` shows the initial for Maya and needs the founder's photograph before Gate D.

## 2. The flow

`SignInModel` holds the sign-in flow as one navigation stack: Welcome at its root, then the paste step, A02-email and A02-code pushed in turn.

- **Where it starts.** Welcome, at a launch with no sign-in and after Leave sign-in (handoff 1). A02-email, with nothing under it, in three cases: a link is held (book p9: a received invite skips Welcome); the server ended the sign-in (`A02-email-signed-out`: its words are for someone already here); and Retry after a sign-in the phone couldn't keep (the address kept, only the code asked again). `SignInModel.showsWelcome`, set by the root (`RootModel.showSignIn`).
- **Welcome's routes** (`SignInModel.Way`, `choose(_:)`):
  - **Create a club** pushes A02-email. Once the account shows complete, after the age and profile if it needs them, the tabs open with `G01-create` pushed on Home (`RootModel.createsClubOnArrival`, `arrivalCreate()`). Held in memory for the first account that shows; Back to Welcome, Leave sign-in and a newer link forget it.
  - **I have an invite** pushes the paste step, signed out (`InvitationLinkEntryModel(hold:letGo:)`): Continue reads the field as an invitation link, as signed in, and holds it, checking nothing and showing nothing of the club before sign-in; A02-email is pushed over it. After sign-in the root presents the held link once the list has answered, as it does a link opened before sign-in (`RootModel.show`), and the tabs push it onto the selected tab as an accepted invitation's is (`TabsView.rootInvitationChanged`, for an invitation no row asked for; 6c's link handler will use the same).
  - **Already here? Sign in** pushes A02-email; then wherever the account goes.
- **Back.** A02-email's system back returns to Welcome, or to the paste step it was pushed over, and hides while a code is on its way, as A02-code's does. Back from A02-email to the paste step lets the held link go, the field keeping its text (Continue holds it again); Back from the paste step to Welcome lets it go too (handoff 9's `cancellation`). Welcome shown again holds no link and no Create a club.
- **A link opened while signed out** (`RootModel.open`, which B1 plan PR 6c's link handler calls): held, as now. While Welcome shows, the flow starts at A02-email instead, Welcome skipped (`SignInModel.received()`). After Create a club, the link replaces it: A02-email stays, and the tabs show the invitation rather than `G01-create`. Anywhere else the screen stays where it is.

## 3. Welcome (`WelcomeScreen`)

The stack's root, with no bar. One scrolling column, 20 in from each edge, on `canvas`:

- the wordmark, 144 wide, an image named "Tadayo" (`brand.wordmark`), 12 under the safe area's top (frame 18 draws 13: 72 on its 59-point safe area; book p35's nearest step);
- the brand line, `dayTitle`, a heading, 32 under the wordmark; the explanation, `body` `secondaryText`, 20 under it;
- the example: its label in `metadata` `secondaryText` 24 under the explanation, the target in `metadata` `primaryText` 12 under it, the stage labels in `metadata` `secondaryText` 12 under that, and the two stages 8 under them: Maya's card (the cover of Maya's slot, 172 high, radius 16, the fold 18, the caption in `row` 16 in, Maya's avatar at 28 and the name in `metadata`, 8 apart, at the foot) and the photograph (172 high, radius 14), the two in columns 13 apart, the photograph as high as the card if the card grows. At the accessibility sizes, one column, as frame 20 draws it: "Caption now", the card growing with its text, 32 under it "Photo on the day", and the photograph, the column's width and 300 high, each label 12 over its stage. Frame 20 draws the stacked card with no fold and a 36-point avatar; the app keeps the fold and the 28-point avatar, which keeps its size at every text size (handoff 4's `dynamicTypePolicy.avatarMarks`): a known difference;
- Create a club (`tadayoPrimary`), I have an invite (`tadayoSecondary`) 16 under it, and Already here? Sign in (`tadayoTextUnderPrimary`, centred, as frame 18 draws it) 8 under that, with its hint: at the foot of a screen the column doesn't fill, as frame 18 draws them ending at the safe area's foot, at least 24 under the example (frame 18 has 27 to spare), and 32 at the accessibility sizes, where the column ends 24 under the last, as frame 20's does (`PinnedFooterLayout`, made public for it). The labels are the visible words (`handoff9`'s `voiceOver` entries); Create a club and I have an invite have no hint.
- Where the column is longer than the screen, at the accessibility sizes, it scrolls under the status bar's band, on `canvas`, as frame 20 draws it (no bar there, so nothing else would keep the column's words out of the clock), as the tabs' columns do (`TabScroll`'s band).
- VoiceOver reads the example in its order: the label, the target, "Caption now", the card as one element ("Maya. Your future living room."), then "Photo on the day"; the photograph itself is hidden, so nothing reads it as a real drop (spec 04: a labelled example). Each column is a container, read label then stage.
- The photographs: `#if LAB`, the chair (`fixture-chair`) and Maya's portrait (`fixture-maya`); otherwise Maya's initial and an empty photograph slot until the founder's photograph comes (FQ23). No build that points at `prod` is made before then.

## 4. The signed-out paste step (`LinkEntryScreen`, signed out)

The same screen as `G02-link-entry-signed-in` (handoff 4, `ios/b1-invitation-screens`), pushed onto the sign-in stack, with handoff 2's line, "Sign in before you can see the club or its people.", in place of "We’ll check the link before showing the club or its people.", and Continue read by its visible word (handoff 2 gives no VoiceOver label for it, and "Check the invitation link." would say what doesn't happen). No check, so no busy form and no `cannotCheck`; `invalid` and `clipboardEmpty` as signed in. While the app isn't active, the field isn't drawn, as signed in.

## 5. Tests first, on Linux

`SignInModelTests` and `RootModelWelcomeTests`, `InvitationLinkEntryModelTests`:

- With no sign-in, the root's sign-in starts at Welcome, with no way chosen; after Leave sign-in too. A sign-in the server ended starts at A02-email; so does Retry after a sign-in the phone couldn't keep, with the address kept; so does a launch with a link held.
- Each way: Create a club and Already here? Sign in reach A02-email; I have an invite reaches the paste step, whose Continue holds a link and checks nothing (no club call), and whose invalid text holds nothing.
- Back to Welcome forgets the way, lets a held link go and keeps the address typed; not while a code is on its way. Back from A02-email to the paste step lets the link go and keeps the text.
- Create a club, signed in with a complete account: the tabs show with `createsClubOnArrival`, `arrivalCreate()` gives a `CreateClubModel` once and then nil. With an incomplete account, after the age and the name. Already here? Sign in: none. Leave sign-in from A02-age forgets it.
- I have an invite, signed in: the invitation is presented once the list has answered, and nothing of the club is read before sign-in; the held link is the account's that shows.
- A link opened while Welcome shows skips Welcome; one opened after Create a club replaces it.

## 6. Screens and states

Snapshots (`WelcomeSnapshotTests`), each light, dark and largest text unless said:

- `A01-welcome`, `A01-welcome-dark`: frames 18 and 19.
- `A01-welcome-xl`: frame 20. The `.xl` window, 2,200 points high, holds the whole column, so the one image shows the top the app opens at and the end, the three routes, that frame 20 draws scrolled to. (A first build started the column at its end with a snapshot seam and took the top as a second image; the two images came out the same, so both went.)
- `G02-link-entry`: handoff 2's frame 11, signed out, empty, in light, dark and largest text.
- `G02-link-entry-invalid`: built from spec, signed out, handoff 4's `linkEntry.invalid` under the field.
- `A02-email-from-welcome`: built from spec, A02-email pushed over Welcome, with the system back. The A02 states keep their snapshots as A02-email first, as a held link or an ended sign-in shows it.

A UI test (`WelcomeUITests`): Welcome's three routes and Back from each; Create a club through sign-in to `G01-create`; I have an invite, a link, sign-in, then the invitation. The UI tests that sign in begin with Already here? Sign in (`XCUIApplication.leaveWelcome()`, `SignInSteps.swift`).

## 7. Decisions and questions

- Where the flow starts (section 2): Welcome only for a phone with no sign-in or after Leave sign-in; A02-email first for a held link, a sign-in the server ended and Retry after one the phone couldn't keep. The safest reading of book p9 and handoff 7's words; noted in the PR.
- The Create a club intent is the root's, in memory, for the first account that shows, as a link opened before sign-in is (FQ135).
- Release's example (FQ23): the photograph slot empty and Maya's initial until the founder's photograph comes; recorded as a gap for Gate D.
- No new FQ: every word on these screens is a delivery's.

## 8. Read against the frames

The 13 images of `0cc199d` (`origin/evidence:ios/b1-welcome/0cc199d/ios/snapshots/`), read beside frames 18 to 20 and handoff 2's frame 11 at the same scale. The three weakest things, and what was done:

1. **The snapshot seam.** `A01-welcome-xl` started the column at its end through a flag on `WelcomeScreen` and `SignInFlow` that only the snapshot set, and `A01-welcome-top-xl` took the top. The two images were byte for byte the same: the 2,200-point window holds the whole column, so neither end needs a seam. The flag and the second test went; `A01-welcome-xl` is the plain flow.
2. **The status bar.** Frame 20 draws the column's top cut off under an opaque status bar on `canvas`. Welcome has no bar, so on a phone at the accessibility sizes the scrolled column's words would run through the clock. `WelcomeScreen` now carries `TabScroll`'s band. No snapshot can show it (the window doesn't scroll); it draws `canvas` over `canvas` in every image.
3. **What stays against the frames,** each now written in the A01 rows of `design/reference/INVENTORY.md`:
    - the card's fold is the book's folded corner, as every card draws it, where frames 18 and 19 turn it inside out;
    - the brand line's two lines sit 37 apart, where the frame sets 34 (`TypeRole`, Known differences' wrapped titles);
    - at the accessibility sizes, the routes' words are at the `button` and `textAction` roles' largest sizes, as every screen's actions are (`G06-no-club-xl`), smaller than frame 20 draws them, so I have an invite stays on one line where the frame wraps it;
    - Already here? Sign in stays 8 under I have an invite at every size (frame 18), where frame 20 leaves about 16.

Everything else matched the frames within a point or two: the wordmark 12 under the safe area (frame 13), the gaps down the column, the example's two stages 172 high and 13 apart, the stacked stages at the accessibility sizes, and the routes at the safe area's foot. G02-link-entry sits against handoff 2's frame 11 as `G02-link-entry-signed-in` does: the title and the field about 15 lower, where handoff 9's frames 3 to 5 draw them (`SetupGap.linkField`), the system's own back button, and no Paste, which a snapshot can't draw (Known differences' native controls); the sign-in line under the field is the frame's.
