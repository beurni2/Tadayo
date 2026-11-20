# Tadayo video viewer (spike S3): device steps

This build adds one test screen to the Lab: TikTok's own player inside Tadayo. It isn't a screen of the product yet. The spike asks one thing: does TikTok's player work well enough, and safely enough, inside the app? Your answers decide how the real viewer is built in B7.

About 10 minutes. Tick or cross each line and send the list back. After each part marked **Copy log**, tap Copy log and paste it into our thread: the log holds only web site names and message types, never the link.

**How to get it.** TestFlight, once I tell you the build is uploaded and Apple has processed it. Install it over the build you have.

**Where it is.** Open the Lab tab (the fourth tab). At the top left, tap **Video (S3)**.

**Before you start.** If the TikTok app is on your iPhone, the first pass is with it installed. Part F asks for one pass with it removed, if you don't mind removing it; skip F if you do.

## A. The player appears

1. The screen shows a TikTok link already filled in (TikTok's own example video) and a switch, "Load the shell as https://tadayo.app/", which is off. Leave it off.
2. Tap **Load video**. A full screen opens with Close at the top. How long until the video's picture appears? (A count in your head is enough: about 1, 3, 5 seconds, or longer.)
3. Nothing plays by itself: no sound, no moving picture, until you tap.
4. What do you see around the video: TikTok's name or logo, the creator's name, any banner asking you to log in, accept cookies or open the app? Tell me each one.

## B. Playing

5. Tap the video's play button. It plays, with sound (check the ring switch and the volume).
6. Tap to pause, then play again. Drag the progress bar if there is one.
7. Let it play to the end. What happens: it stops, it loops, or it shows other videos?
8. While it plays, swipe up to the Home Screen, wait a few seconds, and come back. It should be paused, with no sound while you were away.
9. Tap **Close**. The screen closes and the sound stops at once. **Copy log.**

## C. Leaving Tadayo

10. Load video again. Tap **Open original**. The video opens outside Tadayo: in the TikTok app if you have it, or in Safari. Come back to Tadayo.
11. Inside the player, tap something of TikTok's that leads elsewhere: the creator's name, the TikTok logo, or a "Watch on TikTok" button. Tadayo should ask "Leave Tadayo?" first. Tap **Stay**: nothing opens and the player is still there.
12. Tap the same thing again and choose **Open**: it opens outside Tadayo. Come back, and tap Close. **Copy log.**
13. Did anything open by itself at any point, with no question: a new page, the App Store, the TikTok app?

## D. A video that is gone

14. Back on the first screen, change the end of the link from `6718335390845095173` to `1`, so that it ends `/video/1`. Tap Load video.
15. Within a few seconds the screen should say "The player says this video is no longer available.", with Retry and Open original. **Copy log.** Close.

## E. No connection, and the other address

16. Put the link back (or leave the screen and come back: it refills). Turn on aeroplane mode, with Wi-Fi off too. Tap Load video. What does it say, and after how long? **Copy log.** Close, and turn aeroplane mode off.
17. Turn the switch "Load the shell as https://tadayo.app/" on. Load video, play it for a few seconds, Close. Was anything different from part B? **Copy log.**

## F. Without the TikTok app (optional)

18. Remove the TikTok app from the iPhone. Repeat steps 2, 5, 10 and 11. Tell me what changed, most of all any banner asking to install the app or log in. **Copy log.**

## G. How it felt

19. In a sentence or two: did the player feel acceptable inside Tadayo? Anything slow, cramped, noisy or pushy?
