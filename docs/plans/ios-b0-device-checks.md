# Tadayo build 0.1: device checks

The first TestFlight build. It points at `dev`, and it has the Lab. Your iPhone needs iOS 26 or later.

Tick or cross each line and send the list back, with a word on anything that felt wrong. A screen recording helps for anything odd. Most lines take a few seconds. Sections A to E are about 15 minutes; F and G need VoiceOver and other settings and can wait for another day.

**How to get it.** Open TestFlight on your iPhone. Tadayo appears under your apps once Apple has processed the build (usually 10 to 30 minutes after I tell you it's uploaded). Tap Install.

**The address to use.** The email address of your Supabase account, to be safe. The app sends a six-digit code to it. If no code arrives within a minute or two, stop there and tell me: sign-in email on `dev` may still need its mail key.

**Starting again.** To get back to the email screen: open the Lab tab (the fourth tab, which only test builds have) and tap Log out at the top right. Before you have a name saved, Leave sign-in on the age or name screen does the same.

**One thing to know.** Once your name is saved, signing in with that address goes straight to the tabs: the age and name screens don't come back. Steps 26 and 27 need those screens with VoiceOver on, so they need a second email address you can read and haven't used here. Skip them if you don't have one to hand.

## A. Launch and Home Screen

1. Look at the app icon on your Home Screen in light mode. Then switch the phone to dark mode (Settings, Display & Brightness). Then long-press the Home Screen, tap Edit, Customize (or Customise), Tinted. The icon should look right in all three.
2. Open the app from cold (swipe it away first). The launch screen is a plain canvas with nothing on it, and it hands over to the first screen with no flash or jump.

## B. Email screen

3. The address field is focused and the keyboard is up when the screen arrives.
4. Type your address and press Return on the keyboard. A code is sent. Does the keyboard stay up, or does it dip and come back?
5. Press Return again quickly while the code is on its way. Nothing should break, and the keyboard should stay.

## C. Code screen

6. With the keyboard up, Verify code is fully visible above the keyboard. Check it at the default text size.
7. Type a wrong code and tap Verify code. The error stays in view above the button.
8. Wait a minute. "Send a new code" becomes available. Tap it. A new code arrives.
9. Type a letter while a new code is on its way. Nothing odd should happen.
10. Go to Settings, Accessibility, Display & Text Size, Larger Text, turn on Larger Accessibility Sizes and drag to the largest. Back in Tadayo on the code screen: Verify code is still on screen above the keyboard, and you can scroll with the keyboard up.
11. Put the text size back to your usual one.

## D. Age and Leave sign-in

12. Enter the right code. The age screen appears.
13. Tap Leave sign-in. You should see "Leaving sign-in…" and then the email screen with an empty field.
14. Sign in again and go on past the age screen.

## E. Profile (your name)

15. The name field is focused on arrival and the keyboard rises once, with no flicker. The field is clear of Continue.
16. Type a name starting with an emoji, then clear it and try one starting with a symbol, then a letter, then a digit. Watch the person symbol in the circle as you type: tell me what it shows each time.
17. With the keyboard up, Continue sits a little above the keyboard. Dismiss the keyboard: Continue sits near the bottom.
18. Press Return to save. Does the keyboard dip?
19. After you continue, you reach the tabs. Scroll Home. The area behind the clock and battery stays plain canvas, with no blur or fade under it.
20. At the largest accessibility text size (as in step 10), the header at the top stacks: the Tadayo wordmark on one line, and + Add and Account on the line below. All are readable and tappable. Put the size back after.

## F. VoiceOver (Settings, Accessibility, VoiceOver; or triple-click the side button if set)

Log out first (Lab tab, Log out), so you start at the email screen.

21. On the empty address field, VoiceOver says what the field is for.
22. Send a code. VoiceOver says the code is being sent, once.
23. On the code screen, wait a minute. VoiceOver says "Send a new code is available." once.
24. Tap Send a new code. It says "Sending a new code…" once, then "Check <your address> for a new code…" once, and the focus goes back to the code field. Do the two announcements talk over each other?
25. At the largest text size, swipe through the code screen. Verify code is read before Send a new code.
26. (Second address.) On the age screen, tap "I'm 18 or older" and at once move VoiceOver to Leave sign-in: while your answer is being saved it is read as dimmed. The save is quick, so you may not catch it; say so if not.
27. (Second address.) On the name screen: arriving doesn't move your focus; "Saving your profile." is said once when you continue.
28. On the tabs: Account is read as "Open your account." If a tab shows Retry, it says "Load Home again." (with that tab's name).

## G. Other settings, if you have time

29. Switch Control (Settings, Accessibility, Switch Control): it reaches + Add and Account on the tabs, and Verify code on the code screen.
30. A hardware keyboard, if you have one: on the code screen Verify code stays visible; on the email screen Return sends the code; Tab doesn't trap the focus.

## The share sheet

31. Open Photos, pick up to six photos, tap Share. Tadayo appears in the share sheet. With seven photos it doesn't, and with a video in the selection it doesn't.
32. Share a web page from Safari. Tadayo appears.

Tapping Tadayo there closes the sheet at once and adds nothing. That is on purpose in this build: adding from the share sheet arrives in a later stage. I only need to know it appears.
