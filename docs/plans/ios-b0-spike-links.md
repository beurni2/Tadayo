# ios/b0-spike-links: spike S6's ios half

B0 · ios · spike S6 (`docs/plans/B0.md` section 4, order 3). `docs/MILESTONES.md` says what S6 shows: "A universal link opens the invitation in the app. Without the app, the web page shows the inviter's name and a "Get Tadayo" link [...]. The token never reaches a server log." The api lane's half is on `main`: the site's `apple-app-site-association` names the app for `/i` (#91), and the invitation page and the API's CORS rule are there too (#94). The api thread runs S6 and writes its report, `docs/spikes/S6-links.md` (B0 section 4). This branch is the build the spike needs.

## 1. What the build shows, and what it leaves to B1

1. **iOS hands the link to Tadayo.** `https://tadayo.app/i#<token>` opens Tadayo rather than Safari, once a build carries `applinks:tadayo.app` in its Associated Domains.
2. **The link reaches the app whole, token included.** The token is in the fragment, which no server ever sees (T7). The app reads it with `InvitationToken(url:)` (`TadayoCore`, #88).
3. **Which way SwiftUI hands the link over.** Apple's documentation of `onOpenURL(perform:)` says SwiftUI passes a universal link to the app as a URL, through that modifier, where other frameworks pass it as a browsing activity (`NSUserActivity`). The Lab attaches both `onOpenURL` and `onContinueUserActivity` with `NSUserActivityTypeBrowsingWeb`, so the run shows which one SwiftUI calls when both are there, or whether it calls both. B1 takes the link one way, by one handler: `ios/b1-invitation` takes out the Lab's `labLinkReceipts()`, or feeds `OpenedLinks` from its own handler, so no build holds two link handlers (`docs/plans/ios-b1-clubs.md` section 4, PR 6).
4. **From a closed app as well as a running one.** The founder taps the link once with Tadayo in the background and once after swiping it away, so iOS starts it for the link. The Lab's list lives in memory only, so after the second tap it holds that one link.

Opening the invitation in full is B1's PR 6, `ios/b1-invitation` (`docs/plans/ios-b1-clubs.md` section 4). That means the invitation's screens: `G02-checking`, then `G02-invitation` or the other G02 states. B1's device checks test them before Gate A. This build reads the link in the Lab only, so it adds no product screen and no state without a render. S6's report says so.

## 2. The build

- **`apps/ios/project.yml`:** `com.apple.developer.associated-domains`, `applinks:tadayo.app`, under the `Tadayo` target's entitlements. The share extension and the test targets have none. The release check lets the app alone hold exactly this value (`tools/ci/ios_release_steps.py`, #96), and its test ties the value to this file.
- **`apps/ios/Tadayo/Lab/LabLinkSpike.swift`:** compiled only where `LAB` is on, which is the Debug and Dev configurations and never Release.
    - `OpenedLinks` records each link that opened the app since launch, at most ten, in memory only. Each record holds only its kind and the way it came. The kind is one of: an invitation link whose token was read, another tadayo.app link, or a link elsewhere. The token and the link are dropped at once (T7, T52).
    - The Lab's toolbar opens Links (S6), which lists the records. Its words are plain labels, like the rest of the Lab and S3's workbench (`LabVideoSpike`).
    - `TadayoApp` attaches both handlers through `labLinkReceipts()`, in `LAB` builds only.
- **Tests:** `apps/ios/TadayoTests/LabLinkSpikeTests.swift`, hosted, so they run on iOS 27.2 and 26.5. They cover each kind, including case, query, short-token and look-alike-host links, the way each record came, the cap of ten, and that no record's text, description or reflection holds the token or the link.
- **No snapshot changes:** the Lab's snapshot tests draw its sections, not its toolbar.

## 3. Release

1. **#96 first.** Until #96 merged, the release check on `main` refused the entitlement. Done: #96 merged as `e6df434` at 09:01 UTC on 2026-11-21, and `main` is merged in here (`1827ca2`).
2. **Dry run.** An `ios-release` dry run from this branch (environment `dev`, upload off) archives and checks the build, with no Apple account involved. Done: run 44888570713 at `1827ca2`, green: the Dev archive (build 5.1) was made with the entitlement in the project, and the archive's check passed. That check doesn't yet require the key, so it shows that no wrong value and no extension holds it, not that the app does (journal block 1.3, Next 6 (b2), adds the requirement).
3. **Upload, on the founder's yes.** The upload's export step uses Xcode's automatic signing. It must put Associated Domains into the App Store profile, which turns the capability on for the App ID `app.tadayo`; the founder said yes to that at 08:22 UTC on 2026-11-21. If the export fails on the capability, the fallback is for the founder to turn on Associated Domains for the App ID `app.tadayo` in Certificates, Identifiers & Profiles. The run then starts again. `docs/plans/B0.md` section 1 already listed this capability.
4. **Apple's copy of the site's file.** Since iOS 14 an iPhone reads `apple-app-site-association` from Apple's copy (`app-site-association.cdn-apple.com`), not from `tadayo.app`, and Apple's copy can lag behind the site, whose file has named the app since #91 (2026-11-21). The session can't read Apple's copy: the proxy refuses that host. If Safari opens in the founder's steps, that lag is the first thing to suspect.

## 4. The founder's steps, on the TestFlight build

Asked once, with the upload. The test link carries a made-up token in the contract's form, which no invitation has:

`https://tadayo.app/i#AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE`

1. Install the new build from TestFlight, open Tadayo, sign in if it asks, and then leave Tadayo.
2. Send yourself the link in Messages, or paste it into a note.
3. Before tapping: once a link has opened Tadayo, iOS shows "tadayo.app" at the top right of the screen. Don't tap it. That tells iOS to open later links in Safari. If it happens, long-press a link and choose to open it in Tadayo to undo it.
4. Long-press the link. The menu should offer to open it in Tadayo.
5. Tap the link. Tadayo should open, not Safari.
6. In Tadayo, open the Lab tab, then Links (S6) at the top left. Each line says which way a link came and what it was, such as "onOpenURL: an invitation link, its token read and not kept." or "The browsing activity: an invitation link, its token read and not kept." Take a screenshot, and say every line. Two lines for one tap would mean both ways took the link, which is an answer too.
7. Swipe Tadayo away in the app switcher, so it is closed, and tap the link again. Tadayo should start. Open the Lab tab, then Links (S6) again: the list starts empty with each launch, so it should hold one line. Take a second screenshot.
8. If Safari opens instead of Tadayo, the page says "This invitation isn't available.", since the test link's token matches no invitation. Then delete Tadayo and install it again from TestFlight, so iOS fetches Apple's copy of the site's file again, and repeat steps 4 to 7. Apple's copy can lag behind the site. Then say what you saw.

The web page without the app, and the token kept out of the server's logs, are the api thread's part of the run.
