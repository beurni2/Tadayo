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

On Linux (`swift test --package-path packages/swift/TadayoCore`), written from the rules before the code they test: `TikTokPostTests` (3 tests, 23 refused links), `PlayerMessageTests` (7: each documented message; the origin, 10 others refused; the shape; the type; the value; the length), `VideoNavigationTests` (7: the page is the shell alone; `https` asked; other schemes stopped; no new window; the player's frame and an empty one allowed; 18 other frames stopped), `VideoViewerModelTests` (11: nothing before the tap; the loading shell's end; refusals logged; each failure; the autoplay error; Retry; Close; one question; the log holds hosts only).

Hosted, on both iOS versions each `ios` run tests (`apps/ios/TadayoTests/PlayerWebViewTests.swift`), with every web view's data store given a proxy at a closed local port, so nothing reaches TikTok: the store isn't persistent, holds no cookie when the app's own storage holds one for `www.tiktok.com`, and is a new one for each web view; the settings above; the shell makes one frame with the post's player; it loads under `https://tadayo.app/` with that origin; a script's navigation of the page is stopped and asked about, another app's scheme is stopped with nothing asked, and neither changes the page or fails the viewer; the bridge moves the viewer only on a player's message; the shell ignores a message that isn't its frame's; `release` leaves an empty page with no handler.

Not tested on CI, and why: a message arriving from inside a frame (`message.frameInfo.isMainFrame`), because a test can't load a frame with a script while nothing reaches the network; a new window (`target="_blank"`), because a script can't open one without the person's tap. Both are in the device steps.

No snapshot: the Lab screen is a workbench whose content is the live player.

## 5. The probe on CI

`www.tiktok.com` can't be reached from the session, and CI's simulators can reach it. So a branch that never merges, `ios/b0-spike-video-probe`, made from this one, adds one hosted test without the closed proxy, which loads the documentation's own post under each shell address and fails on purpose with what it saw: whether `onPlayerReady` came and after how long, each message type and refusal, each navigation stopped, and, from a resource-timing reader the test alone puts in every frame, the hosts the player loaded from. That reader is in the probe only; the app never puts a script in TikTok's frame.

What the probe can't say: whether the video plays with sound on an iPhone, what a signed-out person on a home network is shown, and how Close and the background feel. Those are the founder's steps.

## 6. The founder's device steps

They go to the founder with the TestFlight build made from this branch by `ios-release` (an upload, so on the founder's yes), once the probe has shown which shell address to try first. In outline: TikTok signed out, and once with the TikTok app absent; Lab, Video (S3), Load video; the player appears and plays on a tap, with sound; Close; the app to the background while it plays, and back (paused); Open original; a tap on TikTok's own links inside the player (the question before leaving; Stay; Open); a deleted post's link and a private one; aeroplane mode; Copy log after each, pasted into the thread.

## 7. What stays open after this branch

- **The hosts the player loads from.** The navigation delegate sees frames, not the scripts, pictures and video a frame loads. T39's "allowlisted hosts" holds for frames here. Limiting the rest needs a content rule list made from the hosts the probe finds; whether TikTok's hosts are stable enough for that is for the spike's report.
- **A login or consent wall** inside the frame can't be read by the app (nothing is read from the frame). The spike records what a signed-out person is shown and which navigations it brings.
- **The spike's report**, `docs/spikes/S3-video.md`, with the measured times, after the founder's steps.

## 8. Decisions in this branch

- Twenty seconds before the loading shell gives up (`VideoViewerModel.timeout`): a first value; the spike measures how long the player takes.
- Open original opens the original at once, because the person asked for it; every other way out is asked about first (T39).
- A second address while one question shows is stopped, not queued.
- The Lab screen's words are plain labels, as the Lab's are; E01's words come with its design in B7.
- No new FQ or ADR.
