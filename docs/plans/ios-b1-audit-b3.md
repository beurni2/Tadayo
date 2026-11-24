# B1 · ios · the audit's four smaller iOS gaps (audit B3)

Written on 24 November 2026. The outside audit's finding B3 names four smaller iOS gaps. The founder said to go ahead with the iOS findings in the project chat at 10:02 UTC on 2026-11-24, in the order A8, A9, B3. Each gap was checked against `main` at `dd0154d` before it was fixed. Three are fixed here; the fourth, the invitation link handler, is the B1 plan's 6c and waits for spike S6's device results (section 5).

## 1. The privacy manifest's reason for `UserDefaults`

**On `main`:** `apps/ios/Tadayo/PrivacyInfo.xcprivacy` lists no required-reason API (`NSPrivacyAccessedAPITypes` is empty), but `DefaultsClubSelection` (`packages/swift/TadayoCore/Sources/TadayoCore/ClubSelection.swift`) reads and writes the app's standard `UserDefaults` to keep the selected club. Apple counts `UserDefaults` as a required-reason API ("Describing use of required reason API"). An upload without the reason gets App Store Connect's warning email (ITMS-91053), and App Review can refuse the build. `docs/plans/ios-slice-11-second-part.md` said no `UserDefaults` was used; that was true before B1's club selection.

**The fix:** the app's manifest declares `NSPrivacyAccessedAPICategoryUserDefaults` with `CA92.1`, Apple's reason for information only the app itself reads and writes. It's the app's standard defaults, not the app group's, so `1C8F.1` doesn't apply. No other required-reason API is called from the app's or the packages' sources: a search for file timestamps, boot time, disk space and keyboards found none.

The share extension's own code calls no required-reason API, but it links `TadayoCore` statically, and the linker can leave `DefaultsClubSelection`'s references to `NSUserDefaults` in its binary, which is what Apple's scan reads. So its manifest declares the same category and reason (the review's round 1). The reason is true for the extension too: if it ever reads the defaults, they are its own, read by it alone.

**Test:** `PrivacyManifestTests` (hosted, so on both runtimes) reads the two manifests as built: `testTheAppGivesItsReasonForUserDefaults` and `testTheShareExtensionGivesItsReasonForUserDefaults`, each asserting no tracking and one category, `UserDefaults`, for `CA92.1` alone.

## 2. An unclear signal never signs anyone out

FQ89's default puts "Couldn’t load your account." over "Try again." on screen, with Retry, when the account can't be read. Before this branch, two unclear signals skipped that and ended the session instead. Ending it deletes the session and the account's kept invitation links (ADR-037).

**On `main`:**

- **A keychain read that throws.** `SessionManager.accessToken()` and `accessToken(afterRejecting:)` read the store with `try?`, so any failure reads as no session and throws `SessionError.signedOut`. The root then ends the session as if the server had (`RootModel.endedByServer()`). `isSignedIn` did the same at launch, which showed sign-in over a session still kept. A keychain read can fail for a moment: the session's item is readable only once the iPhone has been unlocked since it started (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), so a read before that, by a launch in the background, say, is refused (`errSecInteractionNotAllowed`).
- **A refresh answer that doesn't say the session ended.** `SupabaseAuth.refresh` read every answer that wasn't a success, 429, 5xx or `refresh_token_already_used` as `AuthFailure.sessionEnded`, and `SessionManager` deleted the session for it. Those answers include:
  - GoTrue's 409 `conflict` ("Too many concurrent token refresh requests"), which the app and the share extension refreshing at once can draw;
  - a captive portal's or a gateway's page;
  - a 200 with no tokens;
  - an OAuth-style error;
  - a code this build doesn't know.

**The fix:**

- **The store's read.** `SessionManager.stored()` is the one read. A store that holds nothing gives nil. A load that throws `UnusableSession` also gives nil: bytes that don't decode never will, so they read as no session, and sign-in writes over them. Any other throw is `SessionError.unavailable`: the session stays kept and nothing is deleted.
  - `KeychainSessionStore.load()` throws `UnusableSession` for an item that doesn't decode, where it threw `KeychainFailure(errSecDecode)`. Otherwise Retry could never get past such an item.
  - `isSignedIn` throws `unavailable` for a refused read.
  - `SessionError.unavailable` maps to `APIFailure.unavailable` as before, so a screen says "Try again." and keeps its Retry.
- **A refresh the store can't confirm.** GoTrue's `refresh_token_already_used` ends the session only when the store, read again after the answer, still holds the token sent: otherwise the share extension refreshed it first, and its session is used. Before this branch, a read refused at that moment was taken to hold the token sent, and the session was deleted. Now that read's refusal ends nothing: the answer is `SessionError.unavailable` and the next read decides (the review's round 1).
- **The refresh.** Only a 400 with one of GoTrue's codes for a refresh token it won't take ends the session (`SupabaseAuth.sessionEndingCodes`): `refresh_token_not_found`, `user_banned`, `session_not_found`, `session_expired` and `validation_failed`. This is the list `theCodesThatEndASession` already held. They come from `RefreshTokenGrant` in `supabase/auth`'s `internal/tokens/service.go` and the grant's parameter check in `internal/api/token_refresh.go`, read on 2026-11-24, where each is `NewBadRequestError`, a 400 (`internal/api/apierrors/apierrors.go`). The code is in the `x-sb-error-code` header, as `errorCode` already reads it. A 400 `refresh_token_already_used` is handled as before. Every other answer is `AuthFailure.unavailable`, which keeps the session.
- **The launch.** `RootModel.start()` shows `.failed(.other)` for a refused read, the account's failure with Retry (FQ89), and never shows sign-in or purges for it.
- **Retry after "Couldn’t keep you signed in."** `RootModel.retry()` reads the store first there. A refused read keeps that line and the address typed, rather than show the account's failure when no account was kept to read (T43), and the Retry after it reaches A02-email with the address, as FQ89's default says (the review's round 2).

**Tests (written first, each failing on `main` but the third; `SessionManager`'s and `SupabaseAuth`'s on Linux):**

- `SessionManagerTests.aKeychainReadThatFailsEndsNothing`: two refused reads, then a good one; no token, no delete, no refresh.
- `SessionManagerTests.aRefreshTokenAlreadyUsedWithAStoreThatCantBeReadEndsNothing`: the refresh answers "already used" and the store's read after it is refused; `unavailable`, no delete, and the session still kept. It fails without the fix (run in the session, with the case removed).
- `SessionManagerTests.aSessionThatCanNeverBeReadIsNoSession`: an `UnusableSession` reads as signed out, and a sign-in writes over it. It passes on `main` too, and guards the fix from treating a permanent failure as a passing one.
- `SupabaseAuthTests.anAnswerThatDoesntSayTheSessionEndedKeepsIt`: nine answers that keep the session.
  - the 409 `conflict`;
  - an OAuth `invalid_request`;
  - a bare 401;
  - a gateway's 403 page;
  - a portal's 200 page;
  - a 200 with no tokens;
  - a 302;
  - an unknown code;
  - `session_expired` with a 404.
- `RootModelClubsTests.aLaunchWhoseKeychainCantBeReadIsAFailureThatKeepsEverything`: `.failed(.other)` at launch, with the session, the choice and the links kept, then Retry reaches the tabs with the kept club.
- `RootModelTests.aRetryWhoseReadIsRefusedStillSaysTheSessionWasntKept`: a session the device couldn't keep, then a Retry whose read is refused, stays on "Couldn’t keep you signed in."; the next Retry reaches A02-email with the address typed. It fails without the fix (run in the session, with the read removed from `retry()`).
- `KeychainSessionStoreTests.testAnItemThatDoesntDecodeIsAnUnusableSession` (hosted).

## 3. A launch with no session forgets what an account kept

**On `main`:** `RootModel.start()` with no session shows sign-in and forgets nothing. A session can end out of the app's sight:

- a refresh that found the session ended deletes it in `SessionManager`, and the app can be stopped before the root ends the account;
- a vault that refused both its delete and its blank write tries again only in that launch (`InvitationLinkBook.forgetVault()`);
- from B4, the share extension's own refresh can end it.

Leave sign-in isn't one of them: it forgets the choice and the links before it deletes the session (`RootModel.endSession`). The selected club (`DefaultsClubSelection`) and the kept links (`KeychainInvitationLinkVault`) then stay on the device, keyed by the account. The next account can't read them through the app, but they shouldn't wait there (T11, ADR-037).

**The fix:** with no session, `start()` calls `selection.forget()` and `links.forget()` before sign-in shows. It doesn't call `left()`, which resets the connections. At launch they are new, so a reset could only cancel a request started meanwhile, and `withNoSessionItOpensOnSignIn` still asserts it isn't called. A cache the app keeps on disk later, such as B4's author's preview (T11), is purged here too once it exists. A link opened before any account showed is held in memory (`pendingInvitation`), not in the vault, so it still reaches the first account that shows.

**Tests:**

- `RootModelClubsTests.aLaunchWithNoSessionForgetsWhatTheLastAccountKept`: an earlier launch kept a link and a received token in the vault, and the choice was kept; this launch's book finds them, and once sign-in shows the choice is gone, the vault is empty, and the book holds neither.
- `AppLaunchTests.testALaunchWithNoSessionForgetsTheInvitationLinks` (hosted): the same through `AppGraph`.
- `AppLaunchTests.testLeavingForgetsTheInvitationLinks` no longer starts the root first, since a launch with no session now forgets the links itself and the test would prove nothing about Leave (the review's round 1).

## 4. Verification

- **In the session:**
  - `swift test --package-path packages/swift/TadayoCore`: 506 tests in 30 suites.
  - `swift test --package-path packages/swift/TadayoAPI`: 52 tests in 2 suites.
  - `swift format lint --strict` on every changed Swift file.
  - The manifest read with Python's `plistlib`.
  - The first commit's four new Core tests other than `aSessionThatCanNeverBeReadIsNoSession` failed on `main`'s sources (run before the fix, with only `UnusableSession` declared so the tests compile). The review's two later tests, `aRefreshTokenAlreadyUsedWithAStoreThatCantBeReadEndsNothing` (round 1) and `aRetryWhoseReadIsRefusedStillSaysTheSessionWasntKept` (round 2), each fail with its fix removed.
- **The `ios` runs.** At `354aab3` (round 1), `ios` 45396084473's first attempt passed every test on iOS 27.2, `PrivacyManifestTests`, the keychain test and the two launch tests among them, with no snapshot changed, and every test on iOS 26.5 but one: `SignInReadingTests.testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea` (-314 against 16), item 3 of the intermittents' record (`docs/plans/ios-b1-intermittents.md`, on `ios/b1-ui-details-wait`), a sign-in screen this branch doesn't touch. The run at this branch's head is to be read the same way.
- **Not verifiable here:** whether App Store Connect's scan finds anything else in either binary. The next upload's email says.

## 5. Not in this branch

The invitation link handler (audit B3's fourth gap) is the B1 plan's 6c, `ios/b1-invitation-links`. It waits for spike S6's device results on build 6.1, which say how SwiftUI hands a universal link over. Until it lands, a tapped invitation link opens the app and is dropped, so testers paste the link (Next 6 (c) in the journal's block 1.3).

## 6. Risks

- **A refresh code GoTrue adds later.** It keeps the session, so the person sees "Try again." rather than being signed out. Leave sign-in shows only on A02-age and A03-profile, and the Lab's Log out only in builds that point at `dev`, so from the tabs the way out is a reinstall, which forgets the session at first launch (FQ87). A later build adds the code.
- **A keychain refusal that lasts.** A read refused for good, for example `errSecMissingEntitlement` (-34018) after a signing mistake, keeps the account's failure on screen at every launch, where `main` showed sign-in. Retry tries again each time, and a reinstall is the way out. Such a refusal would fail the save after a verified code too, so `main` gave no working sign-in either.
