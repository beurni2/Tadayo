# Spike S3, the video viewer: the ios lane's plan

Branch `ios/b0-spike-video`, from `main` at `824c0b6`. The B0 plan's slice 13, second spike (`docs/plans/B0.md` section 4, order 2), after slice 12 put a build in TestFlight.

## 1. What is asked

`docs/MILESTONES.md`, the spike table: "The TikTok Embed Player plays in the isolated web view on the founder's iPhone, signed out. Close, pause on background and Open original work. The player's messages are received with the origin checked; top-level navigation is intercepted. Records how TikTok treats the bundled shell's origin, and whether a hosted page is needed."

`docs/plans/B0.md` section 4: "The isolated `WKWebView`, the bundled shell, the TikTok Embed Player, the navigation and message checks of TECH-DESIGN section 4." Needs: slice 12; TikTok signed out on the founder's iPhone.

The rules it is held to: T39 ("The player is a guest"), spec 17, Q20 and Q21, `docs/TECH-DESIGN.md` section 4, "The video viewer (screen E01)".

The spike answers questions; it doesn't build E01. E01's screen, the embed endpoint, the provider's switch and Instagram (FQ11) are B7's. What the spike builds is kept only where it is clean enough to keep (`docs/MILESTONES.md`, "Spikes"): the rules in `TadayoCore` and the web view are written to stay; the Lab screen is a workbench.

## 2. What the branch builds

| File | What |
|---|---|
| `packages/swift/TadayoCore/Sources/TadayoCore/Video/TikTokPost.swift` | A TikTok link read as a post: only `https://(www.\|m.)tiktok.com/@<author>/video/<digits>`; the player's address with the documented options `autoplay=0&rel=0`; the original's address rebuilt without the link's query. Short links are no post here (the server follows redirects when a link is added, B7) |
| `…/Video/PlayerMessage.swift` | One `postMessage` read: the origin must be exactly `https://www.tiktok.com`, the text at most 4096 bytes, a JSON object marked `"x-tiktok-player": true`, with a documented type and the value that type carries. Anything else is refused, with the reason |
| `…/Video/VideoNavigation.swift` | What may load. The web view's page is the shell and nothing else. Any other top-level load, and any new window, is stopped: an `https` address is asked about, any other scheme is stopped with nothing asked. A frame loads only this post's player at `https://www.tiktok.com/player/v1/<id>`, or an empty document |
| `…/Video/VideoViewerModel.swift` | The states of spec 17's table: nothing before the tap, loading, ready with the player's state, and four failures (unavailable, can't play, timeout, no connection); Retry as a new load whose predecessor's words are ignored; Close from any state; one question at a time before leaving; a bounded log of hosts and message types |
| `apps/ios/Tadayo/Video/PlayerShell.html` | The bundled shell: one frame with the player, a content security policy that lets the page frame only `https://www.tiktok.com`, every message of that frame passed to the app with the origin the browser gave it, and `pause` as the only word sent to the player |
| `apps/ios/Tadayo/Video/PlayerWebView.swift` | The web view: a new `WKWebsiteDataStore.nonPersistent()` each time, media only on the person's tap, no picture in picture or AirPlay, no window opened by script, every frame's load asked of `VideoNavigation`, messages taken only from the shell's own page, and `release`, which pauses, stops and empties it |
| `apps/ios/Tadayo/Lab/LabVideoSpike.swift`, `LabView.swift` | The Lab's "Video (S3)" screen (builds with the Lab only): a link, the choice of shell address, Load video, the viewing with Close, Retry and Open original, and the log with Copy log |

Nothing is injected into TikTok's frame, nothing is read from it, and nothing of the player is hidden or covered (T39, "No tricks").

**The shell's address** (TECH-DESIGN, "Embedding origin"). The shell is loaded from the app's bundle as text, under one of two addresses the Lab screen offers:
- none: the page's origin is opaque and the player is sent no referrer;
- `https://tadayo.app/`: the page's origin is Tadayo's own site, as a hosted page's would be, without a request to it.

A page hosted on `tadayo.app` is the third way, built only if neither of these plays.

## 3. TikTok's documentation, as read

"Embed Player", https://developers.tiktok.com/doc/embed-player, last updated 28 October 2026, read on 2026-11-19 once the founder had allowed the host.

- The player: `https://www.tiktok.com/player/v1/{tiktok_post_id}`; its own example is post 6718335390845095173 of `@scout2015`.
- Options used: `autoplay` (default 0, set to 0 all the same) and `rel=0` ("Show the current video author's videos as related video"; the default 1 shows recommended videos). The others keep their defaults, so every control of the player shows.
- Messages are `{ 'x-tiktok-player': boolean, value, type }` through `postMessage`. Host to player: `play`, `pause`, `seekTo`, `mute`, `unMute`, `navigateTo`; the app sends `pause` alone. Player to host: `onPlayerReady`; `onStateChange` (-1 init, 0 ended, 1 playing, 2 paused, 3 buffering); `onCurrentTime` (`currentTime`, `duration`); `onMute` (boolean); `onVolumeChange` (0 to 100); `onImageChange`; `onError` (deprecated, a `MediaError.code`); `onPlayerError` (`errorCode`, `errorType`).
- Errors: 1001 INVALID_VIDEO ("Invalid Media ID, no video/photo found"), 2001 SERVER_ERROR, 3001 PLAYBACK_ERROR, 3002 AUTOPLAY_ERROR.
- "TikTok may apply usage limits to embedded players on a per-domain basis. If an embedding domain generates unusually high request volume, the player may become temporarily unavailable."
- The page says nothing about a web view in an app, about the origin its messages come from, about a login or an age wall, or about which hosts the player loads from. Those are what the spike finds out.

The documentation's sample posts to the frame with the target `'*'`; the shell posts `pause` with the target `https://www.tiktok.com`, so only the player can receive it.

## 4. Tests

On Linux (`swift test --package-path packages/swift/TadayoCore`), written from the rules before the code they test: `TikTokPostTests` (3 tests, 23 refused links), `PlayerMessageTests` (8: each documented message; the deprecated `onError` read apart; the origin, 10 others refused; the shape; the type; the value; the length), `VideoNavigationTests` (8: the page is the shell alone; the shell loads once, under each address; `https` asked; other schemes stopped; no new window; the player's frame with the viewer's own options and an empty one allowed; 25 other frames stopped, the player with other options among them), `VideoViewerModelTests` (13: nothing before the tap; the loading shell's end; another origin's message changes nothing; a refused message from the player's origin ends the loading shell, 4 shapes; the deprecated error waits for the player's own; each failure; the autoplay error; Retry; Close; one question; the log holds hosts only).

Hosted, on both iOS versions each `ios` run tests (`apps/ios/TadayoTests/PlayerWebViewTests.swift`), with every web view's data store given a proxy at a closed local port, so nothing reaches TikTok: the store isn't persistent, holds no cookie when the app's own storage holds one for `www.tiktok.com`, and is a new one for each web view; the settings above; the shell makes one frame with the post's player; it loads under `https://tadayo.app/` with that origin; a script's navigation of the page is stopped and asked about, another app's scheme is stopped with nothing asked, and neither changes the page or fails the viewer; the bridge moves the viewer only on a player's message; the shell ignores a message that isn't its frame's; `release` leaves an empty page with no handler.

Added with the review (section 9): the shell's own address never loads a second time, under either address; a frame's own word to the app's handler is refused (an empty frame the test makes in the page, which needs no network).

Not tested on CI, and why: a new window (`target="_blank"`, `window.open`), because a script can't open one without the person's tap. It is in the device steps.

No snapshot: the Lab screen is a workbench whose content is the live player.

## 5. The probe on CI

`www.tiktok.com` can't be reached from the session, and CI's simulators can reach it. So a branch that never merges, `ios/b0-spike-video-probe`, made from this one, adds one hosted test without the closed proxy, which loads the documentation's own post under each shell address and fails on purpose with what it saw: whether `onPlayerReady` came and after how long, each message type and refusal, each navigation stopped, and, from a resource-timing reader the test alone puts in every frame, the hosts the player loaded from. That reader is in the probe only; the app never puts a script in TikTok's frame.

**What it saw** (`ios` run 44666542447, started by hand at `d3e9fe5`, iOS 27.2 on the simulator, 03:30 UTC on 2026-11-20; `ios/b0-spike-video-probe/d3e9fe5/ios-full/logs/test-27.2.log` on `evidence`, from the line `S3-PROBE`):

- **The player loads under both shell addresses,** the same way. Its frame's text after 12 seconds: "Scout, Suki & Stella scout2015 00:00/00:10 35.2K 5837 1531". Under no address TikTok's frame sees no referrer and an ancestor of `null`; under `https://tadayo.app/` it sees that address as referrer and ancestor. So no address tells TikTok less, and is tried first on the iPhone.
- **`onPlayerReady` never came** in 30 seconds, nor after a `play` message, and the frame held no `video` element (the simulator, with no tap; whether an iPhone differs is a device step). The only message was the string `"[tea-sdk]ready"`, refused as `shape`. As built at commit A the viewer would have given up after 20 seconds on a player that had drawn itself. So anything TikTok's origin posts now ends the loading shell (`VideoViewerModel.answered`), still refused.
- **A post that doesn't exist** (`/video/1`): TikTok's page says "Video currently unavailable", and the player sent, in order, `{"type":"onError","value":1,…}`, then `{"type":"onPlayerError","value":{"errorCode":1001,"errorType":"INVALID_VIDEO"},…}`, then a string of JSON with a width and height. Commit A failed on the first as "cannot play" and never read the second. So `onError` is now read apart (`PlayerMessage.mediaError`) and decides nothing, and 1001 gives "unavailable", 4.8 seconds after the load began.
- **Hosts the player's frame loaded from:** `www.tiktok.com`, `lf16-tiktok-web.tiktokcdn-us.com`, `lf16-cdn-tos.tiktokcdn-us.com`, `p16-common-sign.tiktokcdn-us.com`, `p19-common-sign.tiktokcdn-us.com`, `vmweb.us.tiktok.com`, `mon16-normal-useast5.tiktokv.us`, `mcs.tiktokw.us`, `mssdk-ttp2.tiktokw.us` (from a runner in the United States; the names carry the region, so another region's will differ).
- **Frames inside the player's frame:** six `about:blank` frames, all allowed by `VideoNavigation`; no other frame, no navigation of the page, no new window.
- **Cookies** in the web view's store after each load: none.

What the probe can't say: whether the video plays with sound on an iPhone, what a signed-out person on a home network is shown, and how Close and the background feel. Those are the founder's steps.

## 6. The founder's device steps

They go to the founder with the TestFlight build made from this branch by `ios-release` (an upload, so on the founder's yes). Written out in full: `docs/plans/ios-b0-spike-video-device-steps.md`. In outline: TikTok signed out, and once with the TikTok app absent; Lab, Video (S3), Load video; the player appears and plays on a tap, with sound; Close; the app to the background while it plays, and back (paused); Open original; a tap on TikTok's own links inside the player (the question before leaving; Stay; Open); a deleted post's link and a private one; aeroplane mode; Copy log after each, pasted into the thread.

## 7. What stays open after this branch

- **The hosts the player loads from.** The navigation delegate sees frames, not the scripts, pictures and video a frame loads. T39's "allowlisted hosts" holds for frames here. Limiting the rest needs a content rule list made from the hosts the probe finds; whether TikTok's hosts are stable enough for that is for the spike's report.
- **A login or consent wall** inside the frame can't be read by the app (nothing is read from the frame). The spike records what a signed-out person is shown and which navigations it brings.
- **What "ready" means.** Since any message from TikTok's origin ends the loading shell, a login or consent wall, or an error page that posts something and no `onPlayerError`, shows as ready, and the timeout no longer catches it. The device steps ask what is on the screen; B7 decides with that.
- **The question can come back.** After Stay, another tap inside the player can raise "Leave Tadayo?" again (WebKit asks for a tap in the frame before a frame may move the page). The device step that taps Stay and then Open needs that; B7 limits it if the device shows it abused.
- **The spike's report**, `docs/spikes/S3-video.md`, with the measured times, after the founder's steps.

## 8. Decisions in this branch

- Twenty seconds before the loading shell gives up (`VideoViewerModel.timeout`): a first value; the spike measures how long the player takes.
- Open original opens the original at once, because the person asked for it; every other way out is asked about first (T39).
- A second address while one question shows is stopped, not queued.
- The Lab screen's words are plain labels, as the Lab's are; E01's words come with its design in B7.
- Any message from `https://www.tiktok.com` ends the loading shell, not `onPlayerReady` alone, since the simulator's player never sent it (section 5). The timeout still covers a frame that never answers.
- The deprecated `onError` decides nothing; `onPlayerError` does.
- No address for the shell first; `https://tadayo.app/` stays in the Lab as the other choice.
- The player's frame loads with the viewer's own options only (`autoplay=0&rel=0`); the same post with others is stopped.
- No new FQ or ADR.

## 9. The review

One fresh reviewer of the whole branch at commit B, at the depth the video viewer asks for (privacy and security). No must-fix: no way found for the frame or a crafted link to reach the app's credentials, to make an address that isn't TikTok's, to inject through the user script, or to forge an origin.

Fixed in commit C:

1. The shell's own address could load again (the real `https://tadayo.app/` in the viewer's page, or an empty page over the shell): the shell loads once (`VideoNavigation.Request.shellLoaded`; a Linux test and a hosted one, under both addresses).
2. The log could hold more than hosts (another scheme's "host" is the page's own text, an id for instance): a host is logged for `https` alone, the scheme otherwise, both cut short.
3. The guard on a frame's own word to the app had no test: `testAFramesOwnWordToTheAppIsRefused`.
4. A script's `window.open` may reach `createWebViewWith` without `decidePolicyFor`: the request is decided there too, so the person is asked either way.
5. Pause relied on TikTok's page obeying a message: the web view's media is paused too (`pauseAllMediaPlayback`), on pause and on release.
- Notes taken: the shell's policy gains `base-uri 'none'; form-action 'none'`; the player's frame is held to the viewer's options; the camera, the microphone and motion are refused in the web view's delegate.

Answered, not changed:

6. The question can be raised again after Stay: section 7, for B7.
- A script hash in place of `'unsafe-inline'`: nothing reaches the shell's markup, and a hash must be remade by hand at each edit of the shell; for B7 if the shell stays.
- `JSON.stringify` runs on a whole message before the cut: the cost stays in the web view's own process.
- Link forms whose reading differs between Linux and iOS (a percent-encoded or full-width host, an empty port): each can at worst be read as the same TikTok post, since both addresses are rebuilt from constants and the id's digits; `TikTokPostTests` runs on Linux only, so pinning them there would say nothing of iOS.
- The cookie assertion in `testTheWebViewSharesNothing…` is nearly trivial with nothing reaching the network: the store's `isPersistent == false` and the new store for each web view carry that test, and the probe read no cookie after the real player loaded.
