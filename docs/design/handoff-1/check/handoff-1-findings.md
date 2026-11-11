# Design handoff 1: every verified finding

*3 November 2026. Five independent reviews of the export, each followed by a verifier who tried to refute every finding. Refuted findings are left out; where the verifier corrected a finding, the corrected text is given. The export is in `design/handoff-1/export/`. The summary for the founder is `handoff-1-check.md`.*

Severity: **blocker** means it can't be built as drawn without breaking a rule or the brief; **change** means the app will differ from the frame, or Claude Design should correct it; **note** means it's recorded and needs no action.
Counts: 50 confirmed, 16 adjusted, 0 refuted, plus the verifiers' own additions.


## Completeness against the brief

### complete-1 · all · change · adjusted

- **Rule:** FQ45; ADR-006; T44
- **Finding:** The frames and brand answers use revision 1.1, which the delivery says replaces handoff 0 ("Do not merge old and new token values"). FQ45's default keeps design/reference/brand/ (handoff 0) as the brand until the founder answers, and FQ45 is "Needed by: handoff 1's delivery", so the founder's answer is due now. Three 1.1-only values are visible in the 17 screens: the light input border #778579 on the A02-email, A02-code and A03-profile fields (handoff 0 has #849185); the disabled Verify code in #E2E6DF/#4F5E55 on A02-code and A02-code-error (actionDisabled and onActionDisabled, which handoff 0 doesn't have); and the 2 pt #284CDB focus ring around the A02-email and A02-code fields (focusRing, also not in handoff 0). Under the default, those two states have no handoff 0 role and can't match the frames. The avatars aren't a difference: light avatarCanvas #E1E5F6 is handoff 0's cover2 fallback fill. The delivery itself breaks no rule or brief requirement.
- **Evidence:** brand-tokens.json: "supersedes": "Handoff 0 colour, component and dark icon definitions only". IMPLEMENTATION.md, 'Complete brand corrections': "Do not merge old and new token values." A02-code.svg: Verify code rect fill="#E2E6DF" with label fill #4F5E55 (actionDisabled/onActionDisabled, new in 1.1). The fields in A02-email, A02-code and A03-profile use stroke="#778579"; handoff 0's brand-tokens.md has inputBorder #849185. QUESTIONS.md FQ45: "nothing is built from it before the founder answers ... Needed by: handoff 1's delivery."
- **Action:** Put FQ45 to the founder now, since its 'Needed by' is this delivery. Until the founder answers, follow FQ45's default: build from handoff 0; keep handoff 1's brand files only in design/reference/claude-design/handoff-1/; list each 1.1 change in INVENTORY beside the brand file it would change; and record the A02/A03 input border, the disabled Verify code and the field focus ring in Known differences.

### complete-2 · G02-changed · change · confirmed

- **Rule:** book p9; spec 04
- **Finding:** G02-changed is an invite-landing state, but it doesn't name the inviter. It names only the club and the roster. The book and the spec require a landing to name the inviter, the proposed club and the exact roster.
- **Evidence:** screen-copy.json G02-changed: "Review the", "new roster", "The people in Sunday people have changed.", the six names, "Accept this exact roster to continue. You’ll see only drops shared after joining.". There is no inviter string. Book p9: "Name the inviter, proposed club and exact roster, including the candidate once." Spec 04: "An invite landing screen names the inviter, proposed club and proposed roster." 2.1 G02-invitation shows "Debby invited you to this private club." INVENTORY lists G02-changed under "G02 Invite landing".
- **Action:** Ask Claude Design to add the inviter to G02-changed, as book p9 and 2.1's G02-invitation do, or the founder decides that a changed-roster review may leave it out. Until then the rule wins: list the difference in INVENTORY's Known differences.

### complete-3 · G01-invite-people · change · confirmed

- **Rule:** brief: G01-invite-people ("Ben makes one invitation link per person"); T46
- **Finding:** Only the finished list is drawn: five invitees, which is capacity. The step where Ben adds a person and makes that person's link has no frame. That step includes the 'Create an invitation' control and the name entry that the delivery's own text describes. Claude Code can't draw it.
- **Evidence:** PDF p22 / IMPLEMENTATION.md 'Invitation link': "Before the shown list is filled, Create an invitation asks only for the person’s display name, prepares a separate link and opens the native share sheet. At the shown five-invitee capacity, omit that add-person control." The G01-invite-people frame shows only Maya, Alex, Sam, Debby and Nina, with no add control.
- **Action:** Ask Claude Design, in the next handoff, for G01-invite-people with fewer than five invitees, showing Create an invitation, and for the name-entry step. Add both states to INVENTORY. Build them from the spec and mark them "built from spec" meanwhile.

### complete-4 · F01-no-club · change · confirmed

- **Rule:** book p7 (Secondary places); book p46
- **Finding:** F01-no-club has no Private drafts row. Book p7 puts that row at the top of Friends. In the no-club states, the delivery puts Drafts on Home (G06-no-club) only, even though its own text says drafts can exist with no club.
- **Evidence:** screen-copy.json F01-no-club has no "Private Drafts" string; G06-no-club has "Private Drafts". Book p7: "Private drafts has a prominent row at the top of Friends and an Open my drafts link in the Add picker." 2.1 F01-friends draws that row under "Choose who it’s for.". PDF p23: "Drafts are account-private and can exist with no club."
- **Action:** Ask Claude Design whether F01-no-club keeps book p7's drafts row. Until it or the founder decides, the rule wins: build the row as 2.1 F01-friends draws it, and list the difference in Known differences.

### complete-5 · G03-waiting · change · adjusted

- **Rule:** book p8 (Voice: not "addressing the wrong viewer"); T43
- **Finding:** G03-waiting addresses its viewer, Leila, as 'you' ("Your acceptance is saved", "before you can join") and then by name in the third person ("Leila will see only drops shared after joining."). That's G03-approve's sentence, written for an existing member. Spec 03 addresses the viewer in the second person ("Your pick"), and the delivery's own candidate screen G02-changed uses "You’ll see only drops shared after joining." No invariant is broken (T42 is satisfied); it's an inconsistent voice on one screen.
- **Evidence:** screen-copy.json G03-waiting: "The existing members need to approve before", "you can join.", then "Leila will see only drops shared after joining.". IMPLEMENTATION.md G03-waiting: "Leila is the viewer in this state." PDF p23: "Keep that wording on the existing G03-approve screen as well as the waiting explanation."
- **Action:** Ask Claude Design to confirm G03-waiting's candidate-facing sentence. Build it as drawn until it answers. G03-approve keeps "Leila will see only drops shared after joining" (FQ20).

### complete-6 · doc · note · confirmed

- **Rule:** brief (exact strings); T43
- **Finding:** IMPLEMENTATION.md is only part of the PDF. Several contracts and visible strings appear only in the PDF, and screen-copy.json holds base states only. Yet PDF p1 says these two files carry the exact strings.
- **Evidence:** A grep of IMPLEMENTATION.md finds none of the following; they are in the PDF only. p20's resend table: "A new code isn’t available yet. Try again shortly." and "Sending a new code…", plus "Reserve two 13/18 lines for it". p21: 'Profile completion' and 'Returning to the task'. p22: 'Link state language' (link, share arrow and check glyphs). p23: 'Access and history'. p30: the tab symbols ("system filled house"). p31: 'Acceptance checks'. PDF p1: "IMPLEMENTATION.md / screen-copy.json: Copyable behaviour contracts and exact visible screen strings."
- **Action:** Build from the PDF as the fuller source; its text is identical to the zip's PDF. Take the extra strings from it into the string files.

### complete-7 · G02-changed · note · confirmed

- **Rule:** book p34 (one shape, one meaning); the delivery's avatar table
- **Finding:** The roster-review rows in G02-changed draw 28 pt avatars. The delivery's own placement table gives member rows 36 pt and reserves 28 pt for card senders and the header.
- **Evidence:** G02-changed.svg: circles r="14.0" (28 pt) with 13 pt initials, rows 51 pt apart. G05-members.svg and G01-invite-people.svg: r="18.0" (36 pt) with 16 pt initials. PDF p26: "Standard member row / component reference 36 × 36 pt ... Card sender / header profile affordance 28 × 28 pt".
- **Action:** Ask Claude Design, in the next handoff, which size a roster-review row takes. Build G02-changed as drawn, with the avatar28 role, until it answers.

### complete-8 · G06-no-club · note · confirmed

- **Rule:** docs/DESIGN-HANDOFF.md (discovered states); T46
- **Finding:** The delivery sends "I have an invite" to a native link-entry route that has no frame and no state in INVENTORY.
- **Evidence:** IMPLEMENTATION.md G06-no-club: "I have an invite opens the native link-entry or deep-link recovery route without revealing any club first." F01-no-club: "Create a club and I have an invite lead to the same routes as Home." INVENTORY's G02 rows are only invitation, expired, changed, full and web.
- **Action:** Add the link-entry state to INVENTORY and to the next handoff. Build it from the spec meanwhile and mark it "built from spec".

### complete-9 · A02-code · change · adjusted

- **Rule:** T41; MILESTONES (copy lint)
- **Finding:** "Sent to ben@example.com" (A02-code, A02-code-error) uses a word T41 bans with no scope ("Never ... Sent"). MILESTONES' copy lint covers T41's whole banned list plus "Sent" as a drop state, so it doesn't exempt this string. T41's source, book p41 ("Do not compress these states into Sent"), and T20 aim the ban at drop states, so the string probably falls outside the ban's purpose. Only the founder can settle that reading.
- **Evidence:** screen-copy.json A02-code and A02-code-error: "Sent to ben@example.com". T41: "Never Dressing room, Edition, Publication, Quota or Sent." MILESTONES: "\"Sent\" as a drop state".
- **Action:** Add a QUESTIONS entry: does T41's 'Sent' cover only drop states (book p41, T20)? Default: yes, so the email-code line is built as drawn. Write the lint's scope for 'Sent' openly from that default, never as a silent exemption (T58), and flag it in the PR. If the founder reads T41 literally, ask Claude Design to reword the A02-code line.

### brief-m1 · A02-email, A02-code · change · found by the verifier

- **Rule:** T45 (native keyboard and fields); the delivery's own focus rule (brand-components; PDF p25)
- **Finding:** A02-email and A02-code draw the keyboard-focus ring around the text field while the on-screen software keyboard is up. The delivery's own rule shows that ring only when keyboard focus is visible, and never for a touch action. Built as drawn, every field being edited by touch gets a custom ring. Built by the rule, the app won't match these two frames. A02-code-error, with the keyboard also up, draws no ring.
- **Evidence:** A02-email.svg: <rect x="17" y="260" width="359" height="60" rx="13" fill="none" stroke="#284CDB" stroke-width="2"/> around the field <rect x="20" y="263" width="353" height="54" ...>, with the software keyboard drawn (screen-copy.json A02-email: "q", "w" ... "next"). A02-code.svg has the same ring with the number pad. brand-components: "Focus: 2 pt ring, 2 pt canvas gap, 4 pt beyond the control. Only when keyboard focus is visible." PDF p25: "Do not show it merely because a touch button was tapped. Native accessibility focus and system focus effects take precedence where the platform supplies them." IMPLEMENTATION.md A02-email: "The frame shows an entered, focused field".
- **Action:** Ask Claude Design whether the ring on the A02-email and A02-code fields marks touch editing or keyboard focus. Until it answers, follow its written rule: the ring only when keyboard focus is visible, with system focus effects first. List the frames' ring in INVENTORY's Known differences.

### brief-m2 · G05-members · note · found by the verifier

- **Rule:** docs/DESIGN-HANDOFF.md ('The inventory'); brief: G05-members
- **Finding:** INVENTORY describes G05-members as 'Roster with proposals'. The delivered frame, as the brief asked, is the full Sunday people roster with no proposal. The proposed-member state exists only as the brand-components specimen ('Leila / Proposed by Ben / Proposed'), with no Kitchen table members frame. The inventory row needs to say which state the frame covers, and the with-proposal list stays without a render.
- **Evidence:** INVENTORY line 51: "| G05 Club information | `G05-members` | Roster with proposals | ...". IMPLEMENTATION.md G05-members: "The full-club screen has no proposed member. In a five-member Kitchen table list, place Leila in one separate proposed row ... The revised brand-components frame shows that row."
- **Action:** When marking G05-members received, describe it as the full roster. Add a separate state for the Kitchen table list with Leila proposed, marked 'built from spec' from the component specimen, and name it in the next handoff.

### The brief's questions, as answered

- **How a proposed member (Leila, proposed by Ben for Kitchen table) appears in a club's members list, as one row: what marks it as proposed.** (yes; brand-components frame, 'Proposed member row'; IMPLEMENTATION.md 'G05-members' and 'Proposed member row'; PDF p16 and p23) Leila gets one row after the five current Kitchen table members. It has the regular row avatar 'L', the name 'Leila', the subtitle 'Proposed by Ben' and a trailing outlined status 'Proposed'. The row is at least 76 pt and grows. It shows no weekday, vote count or approver list, and it isn't a switch. The row is drawn only on the component sheet; there is no Kitchen table members frame. Fits the rules: yes: T7 and book p24 and p30; a word, not colour, marks the state (T44)
- **Where the 'Send a new code' action sits before and after its 60 seconds, and how the wait is shown without a ticking countdown.** (yes; A02-code and A02-code-error frames; IMPLEMENTATION.md 'A02-code', 'Resend timing' and 'Fixed resend region'; PDF p4, p5 and p20) It sits in a fixed 353x44 pt row below Verify code (baseline 465), above 'Change email address' in its own 44 pt row (baseline 513). Before 60 s the row holds the static 13/18 sentence 'You can send a new code after one minute.'. After 60 s it holds the 16 pt action 'Send a new code'. During a longer server cooldown it says 'A new code isn’t available yet. Try again shortly.', and while sending, 'Sending a new code…' (both strings are in the PDF only). Availability comes from the server's resend eligibility time and is announced once without moving focus. Fits the rules: yes: T47 (no per-tick countdown) and FQ12's six-digit code
- **How the 18-or-older confirmation reads and looks as one step, not a form.** (yes; A02-age frame; IMPLEMENTATION.md 'A02-age' and 'Age confirmation'; PDF p6 and p21) The title is 'Before you continue' (32/35) and the body 'Tadayo is for people aged 18 and older.'. One 50 pt primary button says 'I’m 18 or older', and a secondary link, 'Leave sign-in', returns to Welcome and isn't recorded as an answer. There is no checkbox, date picker, birthday field or second screen, and an account that already confirmed doesn't see it again. Fits the rules: yes: FQ13's default and spec 04
- **On G01-invite-people, how a person's link state (not yet shared, shared, accepted) shows without colour alone.** (yes; G01-invite-people frame; PDF p22 ('Link state language', 'Creator-only status'); IMPLEMENTATION.md 'G01-invite-people' (the glyph mapping is in the PDF only)) Each state is a word with its own glyph, all in secondaryText #607067 at 13/18: a link glyph with 'Not shared', a share arrow with 'Shared', and a check with 'Accepted'. The row actions are 'Share link' and 'Share again' (15 pt, action colour); an accepted row has none. 'Shared' means the share activity completed, not that the link was delivered or read, and cancelling the share sheet keeps 'Not shared'. Fits the rules: yes: T44 (colour never the only signal); creator-only, with no counts, as the brief asks
- **How the web page (G02-web) shows the wordmark at phone size, and which stem of the t sets its clear space (above or below the crossbar).** (yes; G02-web frame (wordmark group scale 0.15738 x 915 = 144, x 124.5, y 130); IMPLEMENTATION.md 'G02-web' and 'Dark icon and wordmark'; PDF p13 and p29; brand-tokens.json 'wordmark') The page uses the unchanged outlined wordmark, centred, 144 CSS px wide at 915:290. The clear space is set below the crossbar: u is 44 of 915 source units, measured across the lower straight vertical stem of the first t near source y=160, not the upper diagonal shoulder. That is 6.925 pt at 144 wide; at least u stays clear on every side of the viewBox. The minimum width is 96. Fits the rules: yes. It replaces handoff 0's 120 CSS px for the invitation page (INVENTORY, Known differences), and publishing the wordmark on tadayo.app waits on FQ42
- **The avatar fallback's fill on canvas and on each of the six covers, light and dark, and its sizes (36 on the sheet, 28 and 18 in the screens).** (yes; brand-components 'Avatar fallback'; IMPLEMENTATION.md 'Avatar placement'; PDF p26; brand-tokens.json avatarCanvas, onAvatarCanvas, avatarOnCover, onAvatarOnCover and 'avatar') On canvas or surface the fill and initial are #E1E5F6 / #182B25 in light and #35463A / #F7F8F2 in dark. On all six covers, in both themes, they are #182B25 / #FAFBF8. The sizes are 36 pt with a 16/20 bold initial (member row), 28 pt with 13/18 (card sender and header), 18 pt with 9/11 (rail) and 68 pt with 28/34 (profile). The header avatar gets a 44 pt target, and the dark rail uses the dark values. Fits the rules: yes: on covers the circle is 9.72 to 11.98:1 and the initials 9.42 to 14.33:1 (recomputed). The light canvas fill is still cover2's #E1E5F6 (1.21:1 against canvas), so the initial carries it. Adopting it needs FQ45
- **The primary button's disabled and pressed states, and its focus ring (A02-email and A02-code show them first).** (yes; brand-components 'Primary button states'; A02-code (disabled Verify code) and A02-email (default); IMPLEMENTATION.md 'Buttons and fields'; PDF p25) Pressed: #203FB7 / #FFFFFF light, #96A9F2 / #18233B dark. Disabled: #E2E6DF / #4F5E55 light, #35463A / #BAC6BD dark, with no opacity multiplier. Focus: a 2 pt focusRing (#284CDB / #AFBEFF) outside a 2 pt canvas gap, extending 4 pt beyond the button, for keyboard focus only. The button is at least 50 pt high, with a 16/22 bold label and radius 13. A02-email and A02-code draw the same ring on the focused field. Fits the rules: yes: text contrast 8.55, 6.89, 5.42 and 5.70:1, and the ring 6.43 and 9.57:1 on canvas (recomputed). These are new roles, so adopting them needs FQ45
- **Name the sizes handoff 0 draws that no type role names (card status line, plaque's two lines, F02 date title, header club name and '+ Add', button label) and the card radius (14 drawn, 16 in text and spec 24, ticket 18).** (yes; IMPLEMENTATION.md 'Type and geometry'; PDF p27; brand-tokens.json 'type' and 'geometry'; brand-components 'Type roles and radii') cardStatus 13/18 regular; plaqueWeekday 10/12 bold; plaqueDay 25/28 bold; dateTitle 25/29 bold; clubHeader 16/20 bold; headerAdd 15/20 bold; button 16/22 bold. Radii: folded card 16, ticket 18 (a different component), photo 14, surface 12, button 13, input 10, plaque 9. It also adds emptyTitle 25/30, allowance 12/17, photoLabel 11/14, highlight 12/14 and the avatar roles. Fits the rules: yes: card 16 is spec 24's value and the interim build's, and cardStatus is book p35's metadata 13/18, as the interim build has it. The roles under spec 24's approximate 13 to 15 for secondary labels (10, 11 and 12) must still scale with Dynamic Type (T47). Adopting them needs FQ45
- **A label on a photograph, such as 2.1's Highlight chip on a revealed photo: its colours, light and dark.** (yes; brand-components 'Input and photograph label'; IMPLEMENTATION.md 'Type and geometry'; PDF p25; brand-tokens.json photoLabel and onPhotoLabel) An opaque #FAFBF8 fill with #182B25 ink in both themes (14.33:1), 11/14 bold, radius 6, padding 6 pt vertical and 8 pt horizontal. The photograph is never tinted behind it, and the word identifies the state. Fits the rules: yes: T44 and book p6, and it matches 2.1's revealed 'Highlight' chip. FQ21's before-reveal rule is unchanged. Adopting it needs FQ45
- **The light input border is 2.92:1 on surface (3.17:1 on canvas). Should a field ever sit on surface, which border does it take?** (yes; brand-tokens frame and JSON inputBorder; brand-components 'Input and photograph label'; PDF p25; the A02-email, A02-code and A03-profile fields) The light inputBorder becomes #778579 for any field on canvas or surface: 3.73:1 on canvas and 3.44:1 on surface. The dark border stays #8C9B90 (5.93 and 4.76:1). It is 1 pt; an error takes a separate destructive border and a literal message, and a separator is never used as the outline. Fits the rules: yes: it meets the 3:1 a control boundary needs. It replaces handoff 0's and book p35's #849185, so adopting it needs FQ45
- **cover1 is the same yellow as the day plaque's accent, so the first member's cards share the plaque's colour. Keep it, or change one of them?** (yes; brand-tokens frame and JSON; IMPLEMENTATION.md 'Complete brand corrections'; PDF p24) cover1 changes to a muted cream, #EEDFC4 light and #DFCFB3 dark, with #182B25 ink (11.33 and 9.72:1). The plaque's accent stays #F0E4A8 / #E4D8A2. The two now differ by a CIEDE2000 of about 9.1 in light and 7.9 in dark (recomputed). Fits the rules: yes: book p13 (colour follows a stable sender and never a status). Adopting it needs FQ45, and the slot assignment stays FQ41's
- **The dark app icon is an opaque square; Apple asks for a transparent background. Confirm the opaque square, or give a transparent dark master.** (yes; brand-icon-dark frame (SVG and PNG) and assets/brand-icon-dark.*; PDF p29; IMPLEMENTATION.md 'Dark icon and wordmark') A transparent 1024x1024 master with the same flat #F0D968 folded t. It supersedes handoff 0's opaque square: iOS supplies the background and the mask, and nothing (checkerboard, container, glow or gradient) is baked in. Fits the rules: yes: it follows Apple's dark-icon guidance. It replaces brand/brand-icon-dark-1024.png, so adopting it needs FQ45, and the mark's provenance is FQ42

Verifier's corrections to the answers:

- Avatar fallback, fits_rules: 'on covers ... the initials 9.42 to 14.33:1' is mislabelled. On every cover the initial is #FAFBF8 on the #182B25 circle, a constant 14.33:1. The 9.42:1 is the dark canvas pair (#F7F8F2 on #35463A), and the light canvas pair (#182B25 on #E1E5F6) is 11.86:1. The canvas circles are 1.21:1 (light) and 1.72:1 (dark) against their canvas, so the initial carries them in both themes.
- Primary button states, 'where' and answer: the screens show the button only in its default state (A02-email) and disabled state (A02-code, A02-code-error). The pressed state and the button's own focus ring appear only on brand-components. The ring that A02-email and A02-code draw sits around the text field with the software keyboard up, which contradicts the delivery's 'Only when keyboard focus is visible' (see brief-m1). So 'fits_rules: yes' should carry that caveat.
- Type sizes and radius: 'It also adds ... allowance 12/17 ... highlight 12/14': both sizes were already drawn and labelled on handoff 0's brand-components ('Allowance 12 / 17', '91 × 69 default; label 12 / 14'). Revision 1.1 names them as roles; the new sizes are emptyTitle 25/30, photoLabel 11/14 and the avatar initial roles.
- Avatar fallback and the input border: under FQ45's default, the light avatarCanvas #E1E5F6 is unchanged from handoff 0's cover2 fallback. Of the brand answers, only the inputBorder, the button's pressed, disabled and focus roles, photoLabel, cover1 and the dark icon change what the app builds, so 'Adopting it needs FQ45' doesn't apply to the light canvas avatar.

### Checked and right

- A02-email meets the brief. Ben signs in with one native email field (353x54) showing ben@example.com, and there is one 50-pt primary button, 'Send a code'. The title is utilityTitle 32. The text asks for the email keyboard with no autocorrection or capitalisation.
- A02-code meets the brief. The address is shown ('Sent to ben@example.com') above one oneTimeCode field. Verify code is disabled (#E2E6DF/#4F5E55). The static wait sentence sits at baseline 465 and 'Change email address' at 513. Resend appears in the same row after 60 seconds, with no ticking countdown.
- A02-code-error meets the brief. The typed '529614' is kept, and 'This code has expired.' comes with an icon and a destructive border (6.09:1), so colour isn't the only signal. 'Send a new code' is offered. The wrong-code string ('That code wasn’t correct. Try again or send a new one.') and the undistinguished string are given in the text, and a network error is never presented as a wrong code.
- A02-age meets the brief: one 'I’m 18 or older' button, no birthdate, checkbox or date picker, shown after the code and before A03 (FQ13).
- A03-profile meets the brief: name 'Ben', an optional 'Add photo' marked 'Optional', and a 68 pt initial fallback B on #E1E5F6. Continue is enabled with no photo.
- G01-invite-people meets the brief. Each person has a row with a word plus a glyph. Nothing shows a total, a progress bar or a list of who is missing. 'Only you can see these link states.' marks the view as the creator's only. No contacts are imported.
- G01-pending meets the brief. The club isn't active, and activation by at least two people approving the same roster is in the text. 'What you prepare stays only with you.' and 'Nothing is shared while the club is waiting to start.' are on screen, and activation never submits a draft.
- G02-expired names only Ben ('Ask Ben for a new invitation link.') and shows no club name, roster, count or image. It's safe before sign-in under T7.
- G02-full says 'It already has six members.' after sign-in, with no club name, roster, waitlist or 'join anyway'.
- G02-web holds exactly three things: the wordmark (144 wide, centred at x=124.5), 'Ben invited you / to a club on Tadayo' and 'Get Tadayo'. It is 393 wide with no browser chrome and shows no club, roster or photo (T7).
- G03-waiting shows Leila's own acceptance for Kitchen table and waiting as a clock plus words. It has no approval list, count or percentage.
- G03-declined says 'This invitation didn’t go ahead.' and never names or implies who declined. There is no Retry approval.
- G05-members meets the brief: Ben · You Monday, Maya Tuesday, Alex Wednesday, Sam Thursday, Debby Friday, Nina Saturday, matching 2.1 F01-friends. It has no invite control while the club is full, and keeps the member count 'Sunday people has six members.' (book p24).
- G06-no-club offers 'Create a club' and 'I have an invite' on Home with the native tab bar. F01-no-club shows no example people. M01-no-club shows no months, photos or dates.
- Every copy string is checked. No string uses a gendered pronoun or an exclamation mark, and no frame shows a date, so none is invented.
- The paragraph on the 2.1 renders this stage keeps is addressed in IMPLEMENTATION.md, 'Existing screen copy changes', and on PDF p23. A01-welcome gets 'An example · before and on the day' and the wordmark at 144 pt. G03-approve gets 'Leila will see only drops shared after joining'. G06-switcher's sheet sits over 'Debby’s pick'. No redraws were needed.
- The 'Dark and large-text frames' line is addressed. The brief listed none and none were delivered. README and PDF p2 say so; brand-components shows the dark button and avatar specimens and the large-text highlight list.
- I recomputed the delivery's contrast values, and they match: inputBorder 3.73 on canvas and 3.44 on surface (light), 5.93 and 4.76 (dark); disabled text 5.42 (light) and 5.70 (dark); pressed text 8.55 and 6.89; focus ring 6.43 and 9.57 on canvas.

## Copy and voice

### copy-1 · A02-code-error · change · adjusted

- **Rule:** T43; spec 24 ("error messages name the failed action"); T1; ADR-011 and TECH-DESIGN section 1 (Supabase Auth email codes); the delivery's own "Error meaning" rule
- **Finding:** The frame's "This code has expired." and the undrawn "That code wasn’t correct. Try again or send a new one." need the server to tell an expired code from a wrong one. Supabase Auth (TECH-DESIGN l.21, ADR-011) returns the same error for both: code `otp_expired`, message "Token has expired or is invalid". So under the delivery's own Error meaning rule (IMPLEMENTATION l.130), the build always shows the generic string, and the drawn message never appears. The error code is literally `otp_expired` even for a mistyped code, so a build that mapped the code to the frame's message would wrongly tell someone with a typo that their code expired (T43). Nor can the app know a challenge is "known expired" (l.37), so Verify code can't stay disabled on that basis.
- **Evidence:** screen-copy.json A02-code-error: "This code has expired."; IMPLEMENTATION.md l.37 "This frame shows a server-confirmed expired code"; l.130 "Show a specific wrong-code or expired-code response only when the server distinguishes it. If it cannot distinguish them, say This code couldn’t be verified. Try again or send a new one."; docs/TECH-DESIGN.md l.21 "Supabase Auth with six-digit email codes"; supabase/auth internal/api/verify.go (master): isOtpValid = !isOtpExpired(sentAt, otpExp) && actual == expected, and for the email OTP types `if !isValid` returns ErrorCodeOTPExpired "Token has expired or is invalid" for a wrong and an expired code alike.
- **Action:** Build the generic "This code couldn’t be verified. Try again or send a new one." with the typed digits kept, as the delivery's l.130 says. Never map Supabase's `otp_expired` code to an expiry message, and never infer expiry from the device's send time: the delivery requires a server-confirmed failure (PDF p31). Record this in INVENTORY Known differences against A02-code-error. In the next handoff, tell Claude Design that the expired and wrong-code variants can't be reached with Supabase Auth, and ask how Verify code behaves after the generic failure.

### copy-2 · G03-waiting · change · confirmed

- **Rule:** book p8 Voice ("rather than addressing the wrong viewer"); brief: G03-waiting (Leila is the viewer); FQ20 (the line rewords G03-approve for an approver)
- **Finding:** On Leila's own screen, the access line refers to Leila by name in the third person, while the rest of the screen calls Leila "you". The sentence is FQ20's rewording for G03-approve, whose viewer is an existing member. It has been carried onto the candidate's screen.
- **Evidence:** screen-copy.json G03-waiting: "Your acceptance" "is saved." "The existing members need to approve before" "you can join." ... "Leila will see only drops shared after joining."; IMPLEMENTATION.md l.82 "Leila is the viewer in this state."; PDF p23 "Keep that wording on the existing G03-approve screen as well as the waiting explanation." G02-changed is also a candidate's screen, and the delivery's own line there is "You’ll see only drops shared after joining."; 2.1 G02-invitation: "You’ll see drops shared after you join."
- **Action:** Ask Claude Design to correct G03-waiting's line so it speaks to the viewer. The words already exist on its own G02-changed. Until it answers, the founder decides whether the build uses G02-changed's sentence. G03-approve keeps "Leila will see only drops shared after joining" (FQ20).

### copy-3 · G03-approve · change · confirmed

- **Rule:** T43 (direct and factual); spec 04; T7
- **Finding:** For G03-approve, the delivery changes only the pronoun line. It keeps 2.1's sentence saying Leila accepts after the members approve. In G03-waiting, which follows the brief, Leila accepts first and then waits for the approvals. An approver who sees G03-approve after Leila has accepted is reading a false sentence.
- **Evidence:** 2.1 G03-approve render: "Every existing member must approve. Leila then accepts the exact roster."; IMPLEMENTATION.md l.277 changes only "G03-approve: “Leila will see only drops shared after joining”"; G03-waiting: "Your acceptance is saved." / "The existing members need to approve before you can join."; brief: "G03-waiting: Leila has accepted the Kitchen table roster and waits for the existing members to approve."; spec 04: "The candidate accepts that roster. Existing members approve any additions"
- **Action:** The founder decides whether a candidate accepts before the approvals, after them, or in either order. T7 fixes no order. Then ask Claude Design for a G03-approve sentence that is true in that flow. Until then, list it in INVENTORY Known differences.

### copy-4 · G02-changed · change · confirmed

- **Rule:** book p9 ("Name the inviter, proposed club and exact roster, including the candidate once"); spec 04 ("An invite landing screen names the inviter, proposed club and proposed roster"); spec 29 G02 ("Identify inviter and roster")
- **Finding:** The changed-roster invite landing names the club and the exact roster but never the inviter.
- **Evidence:** screen-copy.json G02-changed: "Review the" "new roster" "The people in Sunday people have changed." then the six names, "Accept this exact roster to continue. You’ll see only drops shared after joining." "Accept this roster" "Not now". No inviter appears. 2.1 G02-invitation: "Debby invited you to this private club."
- **Action:** Ask Claude Design to add the inviter to G02-changed. The rule wins until the founder decides (DESIGN-HANDOFF, step 5). The founder decides whether the build carries 2.1 G02-invitation's inviter line in the meantime. Record this in INVENTORY Known differences.

### copy-5 · G05-members · change · confirmed

- **Rule:** T43 (direct and factual); spec 01 A02 ("With two or three members, each person has two reveal days per week"); book p11
- **Finding:** "Each person has a day." is true only for clubs of four to six. In a pair or a three-person club, each person has two days, and the frame's rows show only one weekday each.
- **Evidence:** screen-copy.json G05-members: "Each person has a day."; spec A02; book p11 "Pairs and three-person clubs select two available weekdays per person."
- **Action:** Ask Claude Design for G05-members' wording, and its rows, for a two-day club. Until then, build that variant from spec and mark it "built from spec" in INVENTORY.

### copy-6 · M01-no-club · change · confirmed

- **Rule:** T8; spec 07 ("Joining after submission does not inherit its caption or later media"); book p23 ("Previously submitted content is excluded"); book p9 ("historical media is not inherited"); T43
- **Finding:** "Past reveal days will appear here after you join a club." can be read as promising that a club's earlier days appear once you join. Someone who joins an existing club sees only days with drops shared after they joined.
- **Evidence:** screen-copy.json M01-no-club: "Past reveal days will appear here" "after you join a club."; 2.1 M01-empty: "Days shared after you joined will appear here after they open."
- **Action:** Ask Claude Design to state the joining boundary in M01-no-club's line, as 2.1 M01-empty does. Until it answers, the frame's line is built and listed in INVENTORY Known differences.

### copy-7 · doc · change · adjusted

- **Rule:** T43 ("Errors name the action that failed and keep the person's input"); spec 24; spec 03 ("Internal engineering names may differ, but must not leak into the interface"); T46
- **Finding:** The guidance defines behaviour for several undrawn states without giving their words, and neither the spec nor the book supplies them: a failed Send a code (network or server), a network failure on Verify code, a failed resend, a failed profile save, a failed profile photo upload, the optional creator acknowledgement after sharing (PDF p22), and the name prompt behind "Create an invitation" (l.157). "show the service error" (l.134) could be read as showing Supabase Auth's own text ("Token has expired or is invalid"), which spec 03 forbids. The undrawn strings the delivery does supply are "That code wasn’t correct. Try again or send a new one.", "This code couldn’t be verified. Try again or send a new one.", "A new code isn’t available yet. Try again shortly.", "Sending a new code…", the label "Create an invitation" and the accessibility label "Account". "Proposed by Ben" and "Proposed" are drawn on brand-components.
- **Evidence:** IMPLEMENTATION.md l.28 "preserves the address during a network failure" (no message); l.130 "Never turn a network failure into a wrong-code claim" (no message); l.134 "On failure, retain input and show the service error without claiming a new email was sent"; l.48 "A photo upload failure must still allow continuing with the initial ... explain a failed save without discarding the name" (no message); l.165 and PDF p22 "leave Not shared until an explicit creator acknowledgement" (no label); l.157 "Create an invitation asks only for the person’s display name" (field and sheet not drawn). The only undrawn strings supplied are "That code wasn’t correct. Try again or send a new one.", "This code couldn’t be verified. Try again or send a new one.", "A new code isn’t available yet. Try again shortly.", "Sending a new code…", "Account", "Proposed by Ben" and "Proposed".
- **Action:** Ask Claude Design for each missing string in the next handoff. Until they arrive, build these states from spec 24 and T43, naming the failed action and keeping the input, and mark them "built from spec" in INVENTORY. Never show Supabase's message text.

### copy-8 · A02-code · note · confirmed

- **Rule:** T41 ("Never Dressing room, Edition, Publication, Quota or Sent"); CLAUDE.md Copy ("never Sent"); book p41; docs/MILESTONES.md copy lint ("'Sent' as a drop state")
- **Finding:** Here "Sent" describes the sign-in email, not a drop, so it doesn't break T41 as book p41 and MILESTONES scope it. But T41 and CLAUDE.md state the ban without that scope, so a copy lint that bans the bare word would fail this string.
- **Evidence:** screen-copy.json A02-code and A02-code-error: "Sent to ben@example.com"; book p41 "Do not compress these states into Sent"; MILESTONES l.60 "'Sent' as a drop state"
- **Action:** No redraw. When the copy lint is built in B0, it checks "Sent" only as a drop state, as MILESTONES says. If the founder reads T41 as a ban on every use, Claude Design rewords this line.

### copy-9 · G01-invite-people · note · confirmed

- **Rule:** spec 03 ("Internal engineering names may differ, but must not leak into the interface"); T43
- **Finding:** "link states" is the brief's own working term ("per-person link state"), carried into the interface.
- **Evidence:** screen-copy.json G01-invite-people: "Only you can see these link states."; brief: "G01-invite-people's per-person link state is shown to the club's creator only."
- **Action:** No build change. Mention it to Claude Design at its next pass on G01, in case it wants plainer words.

### copy-10 · A02-code · note · confirmed

- **Rule:** T43 (direct and factual)
- **Finding:** The cooldown line promises a short wait whatever the server's wait actually is. The delivery itself says the server returns an eligibility time, and a project-wide email rate limit can hold sends longer than a minute.
- **Evidence:** PDF p20, resend table, "Server cooldown exceeds a minute": "A new code isn’t available yet. Try again shortly."; IMPLEMENTATION.md l.122 "The server returns a resend eligibility time."
- **Action:** The build uses the delivery's string. Ask Claude Design whether this line should reflect the server's eligibility time.

### copy-11 · G02-changed · note · adjusted

- **Rule:** brief ("Ben (Monday, the viewer unless stated)"; Leila on G03-waiting); book p9 ("Ben is consistently the candidate/current user in this example")
- **Finding:** Each frame's copy fits its own viewer, but the cast shifts. Ben creates Sunday people in G01-invite-people and is the inviter, with the club unnamed, in G02-expired, G02-full and G02-web. Yet Ben is the candidate ("Ben · You") reviewing Sunday people's changed roster in G02-changed. That follows the brief's default viewer and book p9's "Ben is consistently the candidate/current user". G02-expired and G02-full are seen by an unnamed recipient, and G03-declined by Leila (PDF p2). Nothing draws the proposer's view of a declined proposal, which the brief didn't ask for.
- **Evidence:** G02-expired: "Ask Ben for a new invitation link."; G02-full: "Ask Ben for a new invitation if a place opens."; G02-web: "Ben invited you"; G02-changed: "Ben · You"; PDF p2: "Leila is the viewer in G03-waiting and G03-declined. Ben-invited recovery pages show no recipient identity."
- **Action:** No copy change. Choose a consistent cast for each state's snapshot fixture: for G02-changed, an inviter other than Ben once copy-4 is settled, since Ben is the candidate there. Note the cast in the PR. The proposer's view of a declined outcome is a state for a later handoff.

### Checked and right

- No gendered or inferred pronouns in any string in screen-copy.json or in the strings proposed in IMPLEMENTATION.md and the PDF (T42). The three existing-screen changes match FQ20's right-hand wording exactly: A01-welcome "An example · before and on the day", G03-approve "Leila will see only drops shared after joining", G06-switcher "Debby’s pick".
- No Dressing room, Edition, Publication or Quota anywhere (spec 03, T41). The creator's link states use "Not shared / Shared / Accepted", never Sent. No exclamation marks in any screen string.
- Apostrophes are ’ throughout screen-copy.json (What’s, We’ll, I’m, You’ll, didn’t), as INVENTORY's apostrophe rule asks.
- G02-web's text is exactly the brief's: "Ben invited you" / "to a club on Tadayo" and "Get Tadayo", with no club name, roster or other copy (T7).
- G02-expired names only the inviter ("Ask Ben for a new invitation link."). G03-declined names no decliner and gives no reason (book p30, brief). G02-full's "It already has six members." is capacity, which the brief allows, and shows no club name.
- A02-age: the action is FQ13's exact "I’m 18 or older", with one reason line ("Tadayo is for people aged 18 and older.") and no birthdate.
- A02-code's wait is the static "You can send a new code after one minute.", with no ticking countdown (T47). A02-code-error keeps the typed digits "529614". The wrong-code and generic strings name the failed action and offer a new code (T43, spec 24).
- G06-no-club and F01-no-club use book p9's primary routes, "Create a club" and "I have an invite". "A private place for two to six people." matches spec A01.
- "Ben · You" marks the viewer as book p7 and 2.1 G02-invitation do. G05-members keeps the stable order Ben, Maya, Alex, Sam, Debby, Nina, with recurring weekdays. These aren't targets, so no exact date is needed (T41). The proposed row's "Proposed by Ben" is 2.1 G03-approve's wording.
- G01-pending's copy agrees with 2.1 G01-create and book p33: "Before the club starts", "The people joining need to agree to the same roster.", "What you prepare stays only with you." It is true under both FQ15's default and book p46.
- "Start your club." (G06-no-club) and "Your shared days, kept together." (M01-no-club) are headings in the same register as 2.1's own setup and empty-state titles ("Your people, together." on G01-create, "Your first memories are ahead." on M01-empty). Book p8 asks for direct copy on settings, errors and receipts, which these are not.
- These frames show no target date. The component sheet's card carries "Opens Fri 13 Nov" (T41, book p8). "Past reveal days" is the spec's own wording (spec A02, spec 09 "next reveal date").
- The proposed accessibility label "Account" for the 28 pt avatar, rather than announcing "B", follows book p7 (the avatar opens account settings) and T47.

## Privacy and product rules

### priv-1 · G02-changed · change · confirmed

- **Rule:** spec 04; spec 29 (G02 'Identify inviter and roster'); book p9
- **Finding:** G02-changed names the club and the exact roster but not the inviter. The rules require every invite landing to name the inviter, the proposed club and the exact roster.
- **Evidence:** screen-copy.json G02-changed: "Invitation", "Review the new roster", "The people in Sunday people have changed.", six roster rows, "Accept this exact roster to continue. You’ll see only drops shared after joining.", "Accept this roster", "Not now". It names no inviter. Spec 04: "An invite landing screen names the inviter, proposed club and proposed roster." Book p9: "Name the inviter, proposed club and exact roster, including the candidate once." 2.1 G02-invitation carries "Debby invited you to this private club."
- **Action:** Ask Claude Design to add the inviter line to G02-changed, as 2.1's G02-invitation carries it. Until then the build follows spec 04 with 2.1 G02-invitation's inviter line, and the gap is a row in INVENTORY's Known differences.

### priv-2 · G01-invite-people, G02-changed, G02-expired, G02-full, G02-web, G03-declined · note · adjusted

- **Rule:** brief Content ('Ben (Monday, the viewer unless stated)', 'Nothing invented'); book p9 ('Ben is consistently the candidate/current user in this example'); 2.1 G02-invitation
- **Finding:** In Sunday people the fixtures give Ben two incompatible roles. Ben is its creator and inviter: G01-invite-people (l.52 "Ben is the creator.") and G02-web ("Ben invited you", as the brief asked), with G02-expired and G02-full following the same cast (PDF p2: "Ben-invited recovery pages show no recipient identity"). Ben is also a candidate to it: G02-changed shows "Ben · You" (l.67) and PDF p21 says "while Ben signed in". Book p9 makes Ben the candidate. G03-declined is consistent: it is Kitchen table, where Ben proposed Leila (book p30). The brief caused the split.
- **Evidence:** IMPLEMENTATION.md l.52 "Ben is the creator."; l.67 "Ben reviews the full current exact Sunday people roster, including Ben once"; G02-changed row "Ben · You"; G02-expired "Ask Ben for a new invitation link."; G02-full "Ask Ben for a new invitation if a place opens."; G02-web "Ben invited you"; PDF p21 "If it expired, changed or filled while Ben signed in"; PDF p2 "Ben is the viewer in the account and Sunday people examples"; 2.1 G02-invitation: "Debby invited you to this private club." with "Ben · You" in the roster.
- **Action:** Record it in INVENTORY. Snapshot fixtures are per state: G02-changed follows book p9 and 2.1 G02-invitation (Debby invites Ben), which also supplies priv-1's inviter. G01, G02-web, G02-expired and G02-full follow their frames. No redraw is needed unless the founder wants one cast.

### priv-3 · G01-invite-people · note · adjusted

- **Rule:** T49 (truthful states); T43 (direct, factual copy); T46 (no undrawn controls)
- **Finding:** The guidance marks Shared after any completed share activity, Copy included. That agrees with its own definition ("Shared means the native activity reported completion; it does not mean delivered, opened or read") and breaks no invariant. Its fallback, an "explicit creator acknowledgement" when completion is unavailable, has no case with UIActivityViewController and no frame.
- **Evidence:** IMPLEMENTATION.md l.165 "A completed activity can mark Shared, including a copy activity; it cannot confirm the message reached anyone. If completion is unavailable, leave Not shared until an explicit creator acknowledgement."; l.161 "Not shared means the prepared link has no confirmed sharing activity."; PDF p22 "A visible creator acknowledgement, if needed by the platform fallback, is optional". No frame draws it.
- **Action:** Build as the guidance says. Note in B1's PR that Copy counts as Shared, so the founder can object. Don't build the acknowledgement control (T46).

### priv-4 · G01-invite-people · change · confirmed

- **Rule:** T7 (exact roster revision; existing members approve every addition); spec 04 ('Do not make changing creator selected candidates bypass existing acceptance'); spec 31 RosterRevision
- **Finding:** Each per-person link names its person only by a display name Ben types. The guidance's safeguard, "If the accepting identity differs from the reviewed candidate, require the roster process again", has nothing to compare against. No source says two things: whether the roster others review and accept shows Ben's typed name or the accepting account's own profile name; and what happens when a forwarded link is accepted by someone else. So "Debby · Accepted" can mean an unknown account took a place in a roster that others accepted by name, with no approval by Ben.
- **Evidence:** IMPLEMENTATION.md l.157 "Before the shown list is filled, Create an invitation asks only for the person’s display name, prepares a separate link ... Associate the accepted authenticated candidate with the roster revision. If the accepting identity differs from the reviewed candidate, require the roster process again."; G01-invite-people shows "Debby" with "Accepted" and no approval step for Ben.
- **Action:** Claude Code adds the question to docs/QUESTIONS.md with the safest reversible default and flags it in B1's PR. The default: once accepted, the roster shows the accepting account's own profile name, and a displayed name that changes is a new roster revision needing fresh acceptance (spec 04). The api lane models RosterRevision so that either answer fits.

### priv-5 · G03-waiting (with 2.1 G03-approve) · change · confirmed

- **Rule:** spec 04; T7; book p30 (none fixes the order of acceptance and approvals)
- **Finding:** G03-waiting and the kept 2.1 G03-approve state opposite orders. G03-waiting has Leila accept first and the members approve after. G03-approve tells members they approve first and Leila accepts after. The server must take both orders against the same revision, so G03-approve's sentence is false in the G03-waiting case.
- **Evidence:** 2.1 G03-approve: "Every existing member must approve. Leila then accepts the exact roster."; G03-waiting: "Your acceptance is saved." / "The existing members need to approve before you can join."; IMPLEMENTATION.md l.82 "Leila has accepted the Kitchen table roster and waits for the existing members’ approval."; book p30 "Each current member approves the exact proposed roster; Leila accepts that roster."
- **Action:** The api lane accepts the candidate's acceptance and the members' approvals in either order against one revision (spec 04, T7). Ask Claude Design to reword G03-approve's sequence sentence, or the founder fixes an order. Add a Known differences row until then.

### priv-6 · G03-waiting · change · confirmed

- **Rule:** T43 (direct voice); spec 03 ('Your pick' when the viewer is the person); viewer consistency
- **Finding:** Leila is the viewer and the screen addresses Leila as "you", then refers to Leila in the third person by name, as if the screen were meant for someone else. "Leila will see only drops shared after joining" was the brief's wording for G03-approve, which the members see. The delivery's own G02-changed uses the second-person form for the candidate.
- **Evidence:** G03-waiting: "Your acceptance is saved." ... "before you can join." ... "Leila will see only drops shared after joining."; IMPLEMENTATION.md l.82 "Leila is the viewer in this state."; PDF p23 "Keep that wording on the existing G03-approve screen as well as the waiting explanation."; G02-changed: "You’ll see only drops shared after joining."
- **Action:** Ask Claude Design to use the second-person sentence on Leila's own screen, as G02-changed does. G03-approve keeps "Leila will see only drops shared after joining."

### priv-7 · M01-no-club · change · confirmed

- **Rule:** T8; book p23 ('Previously submitted content is excluded, including drops that reveal after joining'); book p9 ('historical media is not inherited'); T49
- **Finding:** The empty Memories text reads as if a club's past reveal days appear once you join. A newcomer gets no day revealed before joining, and no drop submitted before joining.
- **Evidence:** M01-no-club: "Past reveal days will appear here" / "after you join a club." 2.1 M01-empty states the boundary: "Days shared after you joined will appear here after they open."
- **Action:** Ask Claude Design to reword M01-no-club so it doesn't promise earlier days. 2.1 M01-empty's sentence is the book's own boundary wording. Add a Known differences row until it arrives.

### priv-8 · A02-code-error · change · confirmed

- **Rule:** docs/TECH-DESIGN.md section 1, Identity (Supabase Auth, six-digit email codes); T43; the delivery's own 'Error meaning'
- **Finding:** The frame's message, "This code has expired.", is meant only for a server-confirmed expiry. Supabase Auth returns the same error for a wrong code and an expired one, so the app can never confirm either. The delivery's own fallback string ships instead, and "Verify code remains disabled for this known expired challenge" never applies.
- **Evidence:** screen-copy.json A02-code-error "This code has expired."; IMPLEMENTATION.md l.37 "server-confirmed expired code"; l.130 "If it cannot distinguish them, say This code couldn’t be verified. Try again or send a new one." supabase/auth master internal/api/verify.go (fetched 2 Nov 2026): isOtpValid returns `!isOtpExpired(sentAt, otpExp) && (actual == expected ...)`, and `if !isValid` returns ErrorCodeOTPExpired "Token has expired or is invalid". An unknown email gets the same response.
- **Action:** The build shows "This code couldn’t be verified. Try again or send a new one." in A02-code-error's message slot, with Send a new code as drawn. A Known differences row records that neither the expired string nor the wrong-code string can ship while sign-in is Supabase's. No redraw is needed.

### priv-9 · F01-no-club · change · confirmed

- **Rule:** book p7 ('Private drafts has a prominent row at the top of Friends'); book p22 (drafts can have no club)
- **Finding:** The no-club Friends tab drops the Private drafts row that book p7 puts at the top of Friends. The delivery moves the entry to Home (G06-no-club). An account with no club can hold drafts.
- **Evidence:** screen-copy.json F01-no-club has no Drafts string; G06-no-club has "Private Drafts"; 2.1 F01-friends draws "Private drafts / Only you · Saved for later" at the top of Friends.
- **Action:** Ask Claude Design whether F01-no-club keeps book p7's row. Until then the build follows book p7 with 2.1 F01-friends' row above the empty state, and keeps G06-no-club's Home row as drawn.

### priv-10 · G01-invite-people, G06-no-club, F01-no-club · change · confirmed

- **Rule:** T46; docs/DESIGN-HANDOFF.md (a state with no render gets a handoff); brief G01-invite-people
- **Finding:** The guidance specifies invitation states that no frame draws: adding a person by typing a display name, which also fixes the name shown on the roster (priv-4); revoking a person's link; and the 'I have an invite' link-entry route.
- **Evidence:** IMPLEMENTATION.md l.157 "Create an invitation asks only for the person’s display name, prepares a separate link and opens the native share sheet. At the shown five-invitee capacity, omit that add-person control."; l.52 "Every person has a separate revocable link" (G01-invite-people has no revoke control); l.98 "I have an invite opens the native link-entry or deep-link recovery route" (no frame).
- **Action:** Put G01's add-a-person name entry, revoking a link, and the invite link entry in the next handoff. Build them from spec meanwhile and mark them "built from spec" in INVENTORY.

### priv-11 · G01-invite-people · note · confirmed

- **Rule:** brief ('no counts or lists of who hasn't approved or accepted' vs G01-invite-people 'Shows who has a link and who has accepted'); CLAUDE.md 'nobody is chased'; T33
- **Finding:** The delivery follows the brief's G01 request. With Accepted shown per person, though, the other four rows read as a creator-only list of who hasn't accepted, and "Share again" beside an unaccepted person is a re-send affordance. The screen is creator-only and about invitations, not contributions, so T33 isn't broken.
- **Evidence:** G01-invite-people: Maya "Shared" + "Share again"; Alex, Sam, Nina "Not shared" + "Share link"; Debby "Accepted"; "Only you can see these link states."
- **Action:** The founder confirms this is intended. No build change otherwise.

### priv-12 · G01-invite-people · note · confirmed

- **Rule:** brief ('per-person link state is shown to the club's creator only'); T55
- **Finding:** The guidance shows link states to "the creator". For a later proposal, such as Ben proposing Leila to Kitchen table, a club whose creator no source names, the link's maker is the proposer. The guidance doesn't say who sees Leila's link state.
- **Evidence:** IMPLEMENTATION.md l.161 "These labels appear only to the creator; do not export them to other members."; l.93 "Leila, Proposed by Ben".
- **Action:** The build takes the narrowest reading: only the account that made a link sees its state. Flag it in B1's PR.

### priv-13 · doc · note · confirmed

- **Rule:** docs/DESIGN-HANDOFF.md 'How renders come back' (rules win over a frame until the founder decides); FQ12/ADR-011; T7; spec 04
- **Finding:** The delivery claims to supersede 'magic-link' and 'invitation-disclosure' examples. Where that matches, it only repeats decisions already made: FQ12's six-digit code and T7's signed-out page. It doesn't supersede spec 04's in-app landing (inviter, club and roster, see priv-1) or any other product rule.
- **Evidence:** IMPLEMENTATION.md l.290 / PDF p32 "The current handoff instructions supersede earlier magic-link, invitation-disclosure and brand examples where they conflict."
- **Action:** Record it in INVENTORY's Known differences, as handoff 0's item "The delivery's notes that reach beyond appearance aren't product rules" does.

### priv-14 · doc · note · confirmed

- **Rule:** T30 (after logout or an account switch, the next account can't read a draft); spec 23
- **Finding:** Read literally, preserving drafts "through sign-in" would carry a draft across a sign-in into whichever account signs in.
- **Evidence:** IMPLEMENTATION.md l.169 "Preserve drafts and invitation intent through app backgrounding, sign-in and network retries". PDF p21 says that only the opaque invitation reference crosses authentication.
- **Action:** The build follows T30: drafts are keyed to the signed-in account, and only the opaque invitation reference crosses sign-in.

### priv-15 · G02-web · note · confirmed

- **Rule:** T7 (token in the URL fragment, never reaching a server log); docs/TECH-DESIGN.md section 1, Web; CLAUDE.md (no third-party SDK seeing personal data); MILESTONES S6 ('Get Tadayo' is a placeholder until Gate E)
- **Finding:** Neither the App Store nor TestFlight carries a link's fragment through installation. Preserving the invitation intent would mean putting the token in a store URL, the clipboard or an attribution service, and each of those takes it out of the fragment.
- **Evidence:** IMPLEMENTATION.md l.78 "Get Tadayo uses the configured store destination; preserve the opaque invitation intent when supported."
- **Action:** The build follows T7: Get Tadayo carries no token, and after installing, the person opens the invitation link again.

### priv-16 · A02-age · note · confirmed

- **Rule:** spec 23 (retention); FQ13; T52
- **Finding:** By A02-age the code is verified, and Supabase Auth has already created the account with its email: signInWithOtp creates the user by default. Neither the guidance nor FQ13 says what happens to an account that leaves without confirming 18 or older, which may belong to a minor.
- **Evidence:** IMPLEMENTATION.md l.43 "Leave sign-in exits the restricted setup session and returns to Welcome; it does not mean the person confirmed being under 18."
- **Action:** Claude Code adds an FQ with a default for unconfirmed accounts' retention and flags it in the PR.

### priv-17 · G03-declined · note · confirmed

- **Rule:** book p30 ('Avoid claiming absolute secrecy about choices: explain that Tadayo does not identify who declined')
- **Finding:** Members get the explanation on 2.1's G03-approve. Leila, who receives the outcome, doesn't. The frame neither names anyone who declined nor claims secrecy, so no rule is broken.
- **Evidence:** G03-declined: "This invitation didn’t go ahead." / "You can close this invitation. Ben can start a new invitation later."; 2.1 G03-approve: "We don't identify who declined. Nobody is asked to give a reason."
- **Action:** The founder or Claude Design may add it. Nothing is needed for the build.

### priv-18 · A02-code · note · confirmed

- **Rule:** docs/TECH-DESIGN.md section 1, Identity (Supabase Auth)
- **Finding:** The guidance assumes the server returns a resend eligibility time. Supabase Auth's send returns none, and it refuses an early resend with a 429 from its SMTP.MaxFrequency check.
- **Evidence:** IMPLEMENTATION.md l.122 "The server returns a resend eligibility time."; supabase/auth master internal/api/mail.go: validateSentWithinFrequencyLimit(..., config.SMTP.MaxFrequency) and NewTooManyRequestsError(ErrorCodeOverEmailSendRateLimit, ...).
- **Action:** The app derives the 60 seconds from the instant its own send succeeded, keeping it across backgrounding as the guidance asks. On a 429 it shows the guidance's "A new code isn’t available yet. Try again shortly." No design change.

### priv-19 · G05-members · note · confirmed

- **Rule:** design/reference/INVENTORY.md row G05-members ('Roster with proposals'); brief design question 1
- **Finding:** G05-members draws the full Sunday people club with no proposal. The proposed state appears only as a component, which shows no weekday and no approval count, as the rules ask. Kitchen table's five members aren't drawn or named, so none were invented.
- **Evidence:** IMPLEMENTATION.md l.93 "In a five-member Kitchen table list, place Leila in one separate proposed row after the current roster: Leila, Proposed by Ben, Proposed."; brand-components: "Proposed member row ... One row after current members. No day assigned; no approval count."
- **Action:** Build G05-members' proposal state from the brand-components row and note in INVENTORY that its screen frame shows only the full club.

### priv-m1 · G01-invite-people, G01-pending · note · found by the verifier

- **Rule:** T7 ('A club activates once at least two people have approved the same roster'); spec 04; book p33 ('The club starts with two accepted people'); book p9 ('Everyone accepts the same roster before activation')
- **Finding:** The delivery pairs two states that can't hold at once under T7, and the reviewer's checked_ok calls the pairing consistent. G01-pending's "Review invitations" returns to G01-invite-people. There Debby is "Accepted", which means server-confirmed acceptance of the current revision. Ben proposed that revision, so two people have approved the same roster, and by T7, book p33 and the delivery's own l.58 the club activates. G01-pending would then be false. Book p9's "Everyone accepts the same roster before activation" is the only source that supports a pending club here, and it disagrees with T7 and book p33. No source says whether the creator's own proposal counts as Ben's approval.
- **Evidence:** IMPLEMENTATION.md l.53 "Accepted requires server-confirmed acceptance of the current roster revision."; l.57 "Review invitations returns the creator to G01-invite-people."; l.58 "Activation requires at least two people to mutually approve the same active roster. Invitees who have not accepted cannot become active members through that threshold."; G01-invite-people: "Debby" / "Accepted"; G01-pending: "Before the" / "club starts"; spec 31 "POST /v1/clubs | Create proposed club with owner membership".
- **Action:** The api lane builds activation from T7. G01-pending's snapshot fixture has no accepted invitee. Whether the creator's proposal counts as approval, and so whether Ben plus Debby activates the club, goes in docs/QUESTIONS.md with a default and is flagged in B1's PR. No redraw is needed.

### priv-m2 · G02-web · note · found by the verifier

- **Rule:** T7 (the token 'never reaches a server log'); docs/TECH-DESIGN.md section 1, Web ('/i#<token>, which never reaches a server or a log'); T51; CLAUDE.md (no third-party SDK that sees personal data without approval)
- **Finding:** The guidance allows analytics on the signed-out invitation page and limits it only to roster and club details. It is silent on the token. Page analytics that record the page URL capture location.hash, and with it the invitation token, sending it to a server.
- **Evidence:** IMPLEMENTATION.md l.78 / PDF p10 "The URL, social preview, HTML metadata and analytics must not expose roster or club details."
- **Action:** The build follows T7 and TECH-DESIGN. apps/web's invitation page sends no analytics that include the URL fragment or the token. The S6 spike checks that the token reaches no log or analytics.

### Checked and right

- G02-web shows only the wordmark, "Ben invited you / to a club on Tadayo" and "Get Tadayo": no club name, roster, photo or preview. The guidance also keeps the URL, preview metadata, analytics and accessibility tree free of club details (T7; TECH-DESIGN's /i#<token> with the name fetched with the token in the request body).
- G02-expired names only the inviter, with no club name, roster or count. The guidance lets it show in the app before sign-in, which stays within T7's limit of 'no more than the inviter's name'.
- G02-full is authenticated and leaves out the club name, roster and photos. 'It already has six members' describes capacity (A01). There is no Join anyway, waitlist or reserved place.
- G02-changed is available only after sign-in and eligibility. It lists the candidate once and doesn't distinguish accepted from pending people, so it shows no membership activity. A changed revision needs a new explicit acceptance (T7, spec 04, book p9).
- G03-declined never names who declined or why, and offers no retry or partial roster. The guidance keeps the earlier decisions out of detail screens, pushes and accessibility labels (brief, book p30).
- G03-waiting shows no approval list, count, percentage or chasing notification. 'Waiting for club approval' names no one (T15, T33). The guidance gives the candidate no club content or upload destination before activation (spec 07 'Invited but unaccepted person: No access').
- G01-invite-people: each state is a word plus a distinct symbol (link, share arrow, check), so colour is never the only signal (T44). It has no totals or progress meter, needs no contacts access (spec 04, book p9), and says 'Only you can see these link states.' The README and guidance say Shared is not a receipt (T33, T34).
- The activation rule is consistent: Debby 'Accepted' while G01-pending says the club hasn't started matches book p9's 'Everyone accepts the same roster before activation'. Acceptance and approvals bind to a revision id, a stale acceptance is invalidated, and repeated acceptance is idempotent (T7, T19).
- Drafts: G01-pending's 'Private Drafts / What you prepare stays only with you. Nothing is shared while the club is waiting to start.' and G06-no-club's row match book p33 and p46. The guidance says 'Activation never submits a draft', treats targets as hints not audience grants, and requires an explicit club, person and occurrence before Add (T30, T31, spec 04). This is compatible with FQ15's on-device storage.
- Fixtures: G05-members' days (Ben Monday, Maya Tuesday, Alex Wednesday, Sam Thursday, Debby Friday, Nina Saturday) match 2.1 F01-friends (Monday 9 to Friday 13 November, Nina Saturday 7 November) and book p7 and p13. No day is invented. Kitchen table has five current members and Leila is 'Proposed by Ben', as book p30 and 2.1 G03-approve have them.
- G05-members: the full club offers no invite action, and 'Sunday people has six members.' agrees with the roster (book p24). The order is the stable roster order, with 'Ben · You'.
- The proposed member row is one separate row after the current members, with 'Proposed by Ben' as 2.1 G03-approve has it, and no weekday, vote count or approver list.
- Sign-in uses a six-digit email code, not a magic link (FQ12, ADR-011, TECH-DESIGN Identity): one oneTimeCode field with paste and AutoFill. Resend appears after 60 seconds as static text, with no ticking countdown or disabled link. Change email keeps the address. A network failure is never called a wrong code, and typed digits are kept (T43).
- Age: one affirmative 'I'm 18 or older', with no birthdate, checkbox or second screen (FQ13). It comes after the code and before the profile. An unconfirmed session is limited to setup and exit, and the invitation is revalidated after eligibility. Going back can't skip it.
- A03-profile: the name is required and the photo optional, through the limited system picker with no library or contacts permission. Continue works without a photo (spec 04).
- The no-club tabs (G06, F01, M01) show no example people, placeholder avatars, suggested contacts, dates or history (T49, spec 18, book p23). No contacts permission is requested.
- The only person identifiers in the frames are fixture first names and the reserved ben@example.com.

## Brand, tokens and contrast

### brand-1 · all · blocker · adjusted

- **Rule:** FQ45 (default); ADR-006; docs/DESIGN-HANDOFF.md "Who does what"; T44
- **Finding:** Revision 1.1 tells the build to replace handoff 0's brand outright (IMPLEMENTATION.md l.186; "supersedes"). FQ45's default keeps design/reference/brand/ at handoff 0 and keeps building what the inventory builds until the founder answers; FQ45 is due at handoff 1's delivery, which is now.

Two states in the 17 screens use roles that exist only in 1.1 and have no source in handoff 0 or in the inventory's interim builds:
- the disabled "Verify code" (#4F5E55 on #E2E6DF) in A02-code and A02-code-error;
- the 2 pt #284CDB focus ring in A02-email and A02-code.
A02 is a B0 state, so those frames cannot be built as drawn, or from any token, until FQ45 is answered.

The 1.1 field border (#778579 in A02-email, A02-code and A03-profile) can fall back to handoff 0's #849185 as a Known difference. The photo label and avatars on covers are not in the 17 screens; they are on brand-components and matter for H01 and F02 (B4, B5), where the inventory's interim builds stand under the default.

The brief asked for changed brand assets to be re-sent whole, so the delivery did what it was asked. Because 1.1 only changes 3 values and adds the rest, Claude Code's FQ45 proposal (build from what handoff 1 changes or adds) gives exactly 1.1's values.
- **Evidence:** IMPLEMENTATION.md l.186: "Use the full replacement frames brand-tokens, brand-components and brand-icon-dark. Do not merge old and new token values."; brand-tokens.json "supersedes": "Handoff 0 colour, component and dark icon definitions only". In fact 1.1 also adds 22 type roles, 13 geometry values and wordmark usage (invitationWebWidth 144, where handoff 0 said "120 CSS px on invitations"). Frames using roles found only in 1.1: A02-code.svg and A02-code-error.svg "Verify code" #4F5E55 on #E2E6DF (onActionDisabled/actionDisabled); A02-email.svg and A02-code.svg <rect ... stroke="#284CDB" stroke-width="2"/> focus ring; field border #778579 in A02-email, A02-code and A03-profile (handoff 0: #849185). QUESTIONS.md FQ45 default: "Anything handoff 1 changes or adds stays as it arrived in design/reference/claude-design/handoff-1/ ... so nothing is built from it before the founder answers".
- **Action:** The founder answers FQ45 now: adopt 1.1 (Claude Code's proposal, which needs a new ADR and a DESIGN-HANDOFF.md rulebook PR) or keep handoff 0.

Until the founder answers:
- the unpack keeps 1.1 in claude-design/handoff-1/ as it arrived;
- INVENTORY names each 1.1 change beside the brand file it would change;
- A02's disabled and focus states are not built from 1.1.

### brand-2 · doc · change · adjusted

- **Rule:** FQ45 default (the inventory names each change beside the brand file); design/reference/INVENTORY.md "Known differences" and "Brand"
- **Finding:** Once handoff 1 is unpacked, INVENTORY needs updating whatever FQ45's answer is.

Under FQ45's default, lines (a) "keep book p35's palette" and (d) "secondaryText ... 4.06 to 4.21:1 light, 1.23 to 1.32:1 dark" stay true of what is built (handoff 0). They only need the 1.1 counterpart named beside them: light inputBorder #778579 instead of book p35's #849185, cover1 #EEDFC4/#DFCFB3, 11 new roles, and secondaryText on the covers at 3.99 to 4.21:1 light and 1.20 to 1.32:1 dark.

Lines (b) photo label, (c) avatar fill, (e) input border, (f) unnamed sizes, (g) status line, (h) card radius and (i) wordmark width and dark icon say a handoff will answer them, and handoff 1 now has:
- photoLabel #FAFBF8/#182B25;
- avatarOnCover #182B25/#FAFBF8;
- #778579 at 3.73 and 3.44:1;
- named roles, with cardStatus 13/18 and cardRadius 16 matching what is built;
- 144 CSS px and a transparent dark master.
The Brand table rows and the Counts line gain handoff-1 counterparts too.
- **Evidence:** Known differences: (a) "Colours: ... They keep book p35's palette and add a dark accent, a dark input border and the six cover colours": 1.1 moves the light inputBorder off book p35's #849185, changes cover1 and adds 11 roles. (b) "No token pair exists yet for a label on a photograph": 1.1 adds photoLabel #FAFBF8 / onPhotoLabel #182B25. (c) "The avatar fallback's circle is cover2 everywhere ... until a handoff gives a fill that shows on every cover": 1.1 gives avatarOnCover #182B25/#FAFBF8. (d) "secondaryText is under 4.5:1 on every cover (4.06 to 4.21:1 light, 1.23 to 1.32:1 dark": with cover1 #EEDFC4/#DFCFB3 it is 3.99 to 4.21:1 light and 1.20 to 1.32:1 dark (recomputed). (e) "The input border ... 3.17:1 on canvas and 2.92:1 on surface ... Handoff 1 asks": the answer is #778579, 3.73:1 and 3.44:1. (f) "Sizes no type role names", (g) "The card's status line" and (h) "The card radius": now named (cardStatus 13/18 and cardRadius 16, both matching what is built). (i) "120 CSS pixels on the invitation page ... The dark icon is an opaque square ... goes in the asset catalog as delivered": now 144 CSS px and a transparent master. Brand table: "Colour tokens", "Component sheet" and "App icon, light, dark and tinted" (the dark one) each gain a handoff 1 counterpart; Counts: "Brand assets: 4, all received (handoff 0)".
- **Action:** Build follows FQ45's default: in the unpack commit, update these INVENTORY lines to name the handoff-1 file beside each brand file and give the new ratios. Delete no row. What is built changes only after the founder answers FQ45.

### brand-3 · brand-components · change · confirmed

- **Rule:** T44 (every colour comes from a token); book p6 ("one consistent folded corner"); book p26 ("Semantic tokens include their foreground pairs")
- **Finding:** The new sheet draws the folded corner's line in a hex that is not in the 1.1 token set, light or dark, and gives no dark value for it. Handoff 0 drew the line in the cover ink at 15% opacity.
- **Evidence:** brand-components.svg, three times: <path d="M367 215 V233 H385" fill="none" stroke="#8C8F84" stroke-width="0.75" .../>. #8C8F84 appears in neither the "light" nor the "dark" set of brand-tokens.json. Handoff 0's brand-components.svg: <path d="M370,200 V218 H388" stroke="#182B25" stroke-opacity=".15" fill="none"/>. The dark cover specimens draw no fold.
- **Action:** Ask Claude Design for the fold line's colour as a named token, light and dark, or which existing role it uses. Until then, build follows FQ45's default (handoff 0's fold).

### brand-4 · brand-components · change · adjusted

- **Rule:** brief: brand question "A label on a photograph ... its colours, light and dark"; T44
- **Finding:** The sheet's photo-label specimen does not match the written specification of the same chip. It adds a 1 pt inputBorder outline and a fixed 100x28 box where the text gives 6/8 padding and no border. It is drawn on canvas, not on a photograph.
- **Evidence:** brand-components.svg: <rect x="32" y="1632" width="100" height="28" rx="6" fill="#FAFBF8" stroke="#778579" stroke-width="1"/>, with the 11 pt "Highlight" text centred (about 48 pt wide). PDF p25 and IMPLEMENTATION.md l.264: "Photo chip is opaque #FAFBF8 / #182B25 in both themes, 11/14 bold, radius 6 and padding 6 vertical / 8 horizontal", which gives about 64x26 and no border. The JSON holds no chip radius or padding. PDF p28 claims the preceding pages give "the same values" as the sheet.
- **Action:** Ask Claude Design which is right (an outline or none; 6/8 padding or a fixed 100 pt width) and for one specimen on a photograph, light and dark.

Under FQ45's default nothing is built from photoLabel yet; INVENTORY l.207 stands. If FQ45 adopts 1.1, build the written values (PDF p25, IMPLEMENTATION.md l.264) and list the sheet's outline as a Known difference until Claude Design answers.

### brand-5 · brand-components · change · confirmed

- **Rule:** book p6 ("A labelled star marks the sender's selected Highlight"); spec 24 ("Member names and text accompany avatar colours, status icons and star indicators"); INVENTORY Known differences "The star glyph"
- **Finding:** Revision 1.1's highlight label and highlight covers still have no star. The existing Known difference stays open.
- **Evidence:** brand-components.svg: the photo label is the word "Highlight" only (aria-label "Highlight", no glyph). The "Debby's pick" and "Deborah-Anne's pick" covers show only an 18 pt "D" avatar. INVENTORY: "The star glyph beside \"Highlight\" and on the star's pick cover is gone. It stays, beside the text (book p6, spec 24)."
- **Action:** Build follows book p6: the star beside the word. Keep the Known difference, and ask Claude Design to add the star in the next handoff that covers the label or the rail.

### brand-6 · tokens · note · adjusted

- **Rule:** T44 (every spacing, radius and size from tokens); T46 (reading token values is not designing)
- **Finding:** The new tokens frame says "JSON defines every role and dimension", but many of the delivery's dimensions appear only in its prose or on the sheet, and the JSON's geometry has 13 keys. Missing:
- fold 18 and card horizontal inset 18 (sheet);
- the collecting card's 353 × 151 minimum (l.264);
- the plaque's 45 × 55 (sheet);
- the highlight cover's 91 × 69, and the large-text row's 96 minimum with a 20/26 label (l.266);
- the photo chip's radius 6 and 6/8 padding (l.264);
- the field height, 54 (l.28);
- the proposed row's 76 minimum (l.173);
- the resend row's 353 × 44 (l.126);
- the card's 14 pt sender name ("Maya" on the sheet), which has no type role;
- book p35's spacing scale.
- **Evidence:** brand-tokens.png footer: "JSON defines every role and dimension." brand-tokens.json geometry has 13 keys only. Missing from it: fold 18 and card horizontal inset 18 (sheet), collecting card 353x151 minimum (IMPLEMENTATION l.264), plaque 45x55 (sheet), highlight cover 91x69 and the large-text row at 96 minimum with a 20/26 label (l.266), photo chip radius 6 and padding 6/8 (l.264), field height 54 (l.28), proposed row 76 minimum (l.173), resend row 353x44 (l.126), and the spacing scale 4, 8, 12, 16, 20, 24, 32 (book p35).
- **Action:** No action now. If FQ45 adopts 1.1, build the written values as named tokens (T46 allows reading them); spacing stays book p35's scale. Optionally, ask Claude Design to put these values in the JSON in its next revision.

### brand-7 · A02-email · note · adjusted

- **Rule:** brief: brand question on the primary button's focus ring; T45 (native focus)
- **Finding:** A02-email and A02-code draw the focusRing around the text field being typed in on the software keyboard. The sheet and PDF p25 describe the ring only for a button with visible keyboard focus, "not ... merely because a touch button was tapped". The brief asked for the primary button's ring "(A02-email and A02-code show them first)", but no screen shows it on a button. Fields and buttons may be meant to differ, but the delivery does not say so. Rule: spec 24 ("Visible focus and keyboard navigation"), and brief brand question 2.
- **Evidence:** A02-email.svg and A02-code.svg: <rect x="17" y="260" width="359" height="60" rx="13" fill="none" stroke="#284CDB" stroke-width="2"/> around the 353x54 field, with the software keyboard drawn. brand-components: "Focus: 2 pt ring, 2 pt canvas gap, 4 pt beyond the control. Only when keyboard focus is visible." PDF p25: "Do not show it merely because a touch button was tapped. Native accessibility focus and system focus effects take precedence". IMPLEMENTATION l.27: "The frame shows an entered, focused field".
- **Action:** Ask Claude Design to confirm whether a field being edited by touch shows focusRing, as A02-email and A02-code draw it. focusRing is a 1.1 role, so nothing is built from it before FQ45 is answered (brand-1). If FQ45 adopts 1.1, build the ring on the field as drawn, and on buttons only for visible keyboard focus.

### brand-8 · tokens · note · confirmed

- **Rule:** brief: brand question cover1 vs the plaque's accent; T44 (colour never the only signal)
- **Finding:** cover1 now differs from the accent by hue, but the change makes cover1 and cover4 one of the closest cover pairs. Names are always shown beside a cover, so no rule is broken.
- **Evidence:** CIEDE2000, recomputed: new cover1 vs accent 9.11 (light #EEDFC4 vs #F0E4A8) and 7.90 (dark #DFCFB3 vs #E4D8A2), where it was 0 before. cover1 vs cover4 is 8.47 light (third-closest pair, after cover2-cover6 6.57 and cover3-cover5 7.40) and 8.50 dark (second-closest, after cover2-cover6 8.27). WCAG ratio cover1 vs accent: 1.02 light, 1.07 dark.
- **Action:** None required. The founder may judge cover1 against cover4 on the sheet.

### brand-9 · tokens · note · adjusted

- **Rule:** brief: brand assets re-sent whole; diff against handoff 0's brand-tokens.json and design/reference/brand/brand-tokens.md
- **Finding:** Same list as the reviewer's. Add one item under coverAssignment: besides dropping "or reuse a historical slot for a different sender" and adding "Historical memberships retain their original slot. All author names remain visible.", the final sentence changes from "Colours carry no state or content metadata." to "Colour conveys no status, popularity or hidden-content information."
- **Evidence:** CHANGED: version 1.0->1.1; light.inputBorder #849185->#778579; light.cover1 #F0E4A8->#EEDFC4; dark.cover1 #E4D8A2->#DFCFB3 (the onCover1 ink is unchanged at #182B25). ADDED colours (light/dark): actionPressed #203FB7/#96A9F2, onActionPressed #FFFFFF/#18233B, actionDisabled #E2E6DF/#35463A, onActionDisabled #4F5E55/#BAC6BD, focusRing #284CDB/#AFBEFF, avatarCanvas #E1E5F6/#35463A, onAvatarCanvas #182B25/#F7F8F2, avatarOnCover #182B25/#182B25, onAvatarOnCover #FAFBF8/#FAFBF8, photoLabel #FAFBF8/#FAFBF8, onPhotoLabel #182B25/#182B25. ADDED type: utilityTitle 32/35 b, dayTitle 31/34 b, dateTitle 25/29 b, emptyTitle 25/30 b, body 17/23 r, row 17/22 b, metadata 13/18 r, cardStatus 13/18 r, caption 21/28 b, highlight 12/14 b, plaqueWeekday 10/12 b, plaqueDay 25/28 b, clubHeader 16/20 b, headerAdd 15/20 b, button 16/22 b, tab 11/14 r, allowance 12/17 r, photoLabel 11/14 b, avatar36 16/20 b, avatar28 13/18 b, avatar18 9/11 b, avatarProfile68 28/34 b. ADDED geometry: screen 393x852, contentInset 20, cardRadius 16, ticketRadius 18, photoRadius 14, surfaceRadius 12, buttonRadius 13, inputRadius 10, plaqueRadius 9, primaryButtonMinimumHeight 50, minimumTouchTarget 44, focusRingWidth 2, focusRingGap 2. ADDED avatar: sizes profile 68, row 36, card 28, rail 18; canvas and surface use avatarCanvas/onAvatarCanvas; all six covers use avatarOnCover/onAvatarOnCover. ADDED wordmark: welcomeWidth 144, invitationWebWidth 144, minimumWidth 96, clearSpaceUnitSource 44, viewBoxWidth 915, clearSpaceAt144 6.925, clearSpaceReference. ADDED "supersedes". coverAssignment: the string became {indexBase 0, rule}, which drops 1.0's "or reuse a historical slot for a different sender" and adds "Historical memberships retain their original slot. All author names remain visible." Note that light avatarCanvas (#E1E5F6) is the same hex as light cover2.
- **Action:** None. Script: `design/handoff-1/check/diff_tokens.py` in the project files. If FQ45 adopts 1.1, avatarCanvas must be its own token, not an alias of cover2.

### brand-10 · brand-tokens · note · confirmed

- **Rule:** brief: re-send changed brand assets whole, titled as in handoff 0
- **Finding:** The replacement brand-tokens frame (1100x1060 -> 1200x1570) is complete, and these are its visual changes.
- **Evidence:** Title "Final colour tokens" -> "Brand tokens", with the subtitle "Revision 1.1 · Complete replacement · Values in sRGB hex". 11 rows added after inputBorder (actionPressed to onPhotoLabel). The inputBorder light swatch is now #778579; cover1 is now cream #EEDFC4 / #DFCFB3. The footer "All 28 tested text pairings meet 4.5:1. Minimum 4.64:1." and "Separators and input borders are non-text roles. Never use them as caption ink." are replaced by four lines: "All specified text pairs ≥ 4.5:1. Input boundaries and focus indicators ≥ 3:1.", "cover1 is muted cream. The day plaque keeps the yellow accent. Cover colour is never a status.", "On every cover: avatar #182B25 with #FAFBF8 ink, in both themes.", "Arimo in frames; iOS system type in the app. JSON defines every role and dimension." The onAvatarOnCover swatches (#FAFBF8, no outline) are invisible on their #FAFBF8 row. The PNG is 1x, where main's brand/ PNGs are 2x renders.
- **Action:** None. If FQ45 adopts 1.1, render brand/ files from the SVG at 2x, as was done for handoff 0.

### brand-11 · brand-components · note · confirmed

- **Rule:** brief: re-send changed brand assets whole
- **Finding:** The replacement brand-components frame (1100x980 -> 1200x2410) changes these things.
- **Evidence:** Title "Component sizes in points" -> "Brand components" plus a subtitle. The app-icon specimens at 60 pt and 29 pt are removed. The plaque is now annotated "weekday 10/12 bold · day 25/28 bold". The collecting card moves from cover1 yellow to cover2 lavender (Maya's slot); its sender avatar goes from #E1E5F6 with a dark initial to #182B25 with #FAFBF8; it is annotated with radius 16, fold 18, inset 18 and status 13/18; the status line is drawn at 13 pt in ink. The "Debby's pick" cover and the large-text row move from yellow to cover5. Every cover avatar is now a dark circle. The fold line becomes #8C8F84 at 0.75 pt (see brand-3). Added: avatar fallback sizes 36/28/18; canvas and surface avatars, light and dark; 12 cover chips (6 light, 6 dark); primary button states Default, Pressed, Disabled and Keyboard focus in both themes, replacing the single "Add for Debby" button; the input with a #778579 border; the Highlight photo label; the proposed member row (Leila, "Proposed by Ben", outlined "Proposed"); a type and radii text block; the wordmark clear-space specimen. Footer: "Tap targets: 44 pt minimum on iOS. Fold is decorative..." -> "Minimum touch targets 44 × 44. Fold corners and small decorative initials are not separate buttons."
- **Action:** None.

### brand-12 · brand-icon-dark · note · confirmed

- **Rule:** brief: brand question on the dark icon; Apple, "Configuring your app icon"
- **Finding:** The dark icon now has a transparent background, as Apple asks. Only the background changed; the monogram is identical to handoff 0's.
- **Evidence:** brand-icon-dark.svg: handoff 0's <rect ... fill="#121D19"/> is removed. The PNG is 1024x1024 TrueColorAlpha: corners are alpha 0 and the glyph is opaque #F0D968 (alpha mean 0.134). Flattened onto #121D19, it matches main's brand/brand-icon-dark-1024.png within anti-aliasing (RMSE 0.24%). The SVG <title> is now "brand-icon-dark", and fill-rule="evenodd" was dropped, which changes nothing for a single simple subpath. Apple's page (fetched today): "Provide your dark app icon with a transparent background so the system-provided background can show through." Not re-sent and unchanged: brand-icon (cobalt) and brand-icon-tinted (opaque grayscale #202020/#E6E6E6; Apple asks only that it be grayscale).
- **Action:** None. A device check of the system mask at 60 and 29 pt stays on the TestFlight list.

### brand-13 · doc · note · adjusted

- **Rule:** FQ45 (which files would change if 1.1 is adopted); ADR-006
- **Finding:** If the founder adopts 1.1, these files on main go out of date. Under FQ45's default none of them is edited now.
- **Evidence:** design/reference/brand/brand-tokens.md: inputBorder light #849185; cover1 #F0E4A8/#E4D8A2; no rows for the 11 new roles, the type roles or the geometry; the Contrast note "28 text pairs ... the lowest 4.64:1" (now 58 checks: 38 text, 8 boundary, 12 avatar); and the quote "The tokens frame adds: 'Separators and input borders are non-text roles...'", a line no longer on the frame. brand/brand-components.png is handoff 0's sheet at 2x (2200x1960). brand/brand-icon-dark-1024.png is opaque. brand/README.md says "extracted from Design handoff 0's delivery". design/reference/screens/H01-open(-dark).png and F02-upcoming(-dark).png draw Ben's cover1 as #F0E4A8/#E4D8A2 (the rail cover at x=134; the F02 card at y=612, beside the #F0E4A8 plaque) and avatar circles #E1E5F6/#D4D9EC on covers and on dark canvas, where 1.1 draws #182B25, and #35463A on dark canvas. Unchanged: brand-icon-1024.png, brand-icon-tinted-1024.png and brand-wordmark(-dark).pdf (their sources are byte-identical or were not re-sent).
- **Action:** The founder decides FQ45. If the founder adopts 1.1, the brand/ files (brand-tokens.md, brand-components.png, brand-icon-dark-1024.png, README.md) change in that rulebook PR and its follow-up. design/reference/screens/H01-open(-dark).png and F02-upcoming(-dark).png stay as handoff 0 rendered them, because design/reference files are never edited. Their cover1 and avatar colours are listed in INVENTORY's Known differences instead.

### brand-14 · doc · note · confirmed

- **Rule:** docs/QUESTIONS.md FQ40 to FQ45
- **Finding:** This delivery answers none of FQ40 to FQ44. It touches FQ41's wording and FQ42's urgency, and it triggers FQ45.
- **Evidence:** FQ40: no H01 or F02 frames. If FQ45 adopts 1.1, FQ40's default ("handoff 0's colours, cover colours and components") would mean 1.1's. FQ41: 1.1's rule ("Do not compact slots after a departure. Historical memberships retain their original slot"; PDF p24 "Do not compact existing slots ... or recolour archived cards") drops handoff 0's ban on reusing a historical slot. That no longer conflicts with FQ41's default (a newcomer takes the lowest colour no current member holds), but it says nothing on how spec 32's member list carries a former member's colour, so FQ41 stays open (B4). FQ42: the boards' provenance is not addressed ("original Tadayo Brand Implementation Handoff assets" only), and G02-web now draws the wordmark at 144 CSS px, so the founder's confirmation is still needed before deploy-dev publishes it on tadayo.app (B1). FQ43 and FQ44: untouched; the sheet keeps "Opens Fri 13 Nov". FQ45: triggered (brand-1).
- **Action:** Founder answers FQ45 now and FQ42 before B1's invitation page goes live; FQ40, FQ41, FQ43 and FQ44 keep their defaults.

### brand-m1 · doc · note · found by the verifier

- **Rule:** T44 and T47 (tested contrast); the delivery's own claim on PDF p26
- **Finding:** The delivery says its contrast JSON records every pairing, but action used as text, which appears in at least 8 of the 17 screens, has no check in contrast-checks.json. Handoff 0's 28 checks had none either. The pair passes when measured, so this is a gap in the delivery's own record, not a contrast failure.
- **Evidence:** PDF p26: "Verified contrast ... The JSON records every pairing". The brand-tokens frame says "All specified text pairs ≥ 4.5:1." contrast-checks.json has 58 entries and none with foreground "action".

The screens draw #284CDB text on #FAFBF8 canvas:
- "Change email address" (A02-code-error);
- "Leave sign-in" (A02-age);
- "Add photo" (A03-profile);
- "Not now" (G02-changed);
- "Get Tadayo" (G02-web);
- action links in G01-invite-people, G01-pending, G06-no-club, F01-no-club and M01-no-club.

I recomputed with WCAG 2: action on canvas is 6.43 light and 9.57 dark, and on surface 5.92 light and 7.69 dark. All pass 4.5:1.
- **Action:** No design change is needed. When handoff 1 is recorded, write the measured action-as-text ratios beside the contrast note in INVENTORY or brand-tokens.md. Optionally, ask Claude Design to add the pair to contrast-checks.json in its next revision.

### Checked and right

- Contrast: all 58 checks in contrast-checks.json recomputed independently with the WCAG 2.x relative-luminance formula from the brand-tokens.json hex values. Every stated ratio matches to 3 decimals and every passed flag is right. Counts: 38 text >=4.5, 8 field/focus >=3, 12 avatar-on-cover >=3. Minima as stated: text 4.642 (light secondaryText on surface), input boundary 3.438. None of handoff 0's 28 pairs was dropped; only the cover1 ratios moved (light 11.60->11.33, dark 10.38->9.72). Script: /tmp/claude-0/-home-claude-tadayo/7ad06db5-d9b8-56e3-befa-0262075a1ed1/scratchpad/h1/agent-notes/contrast.py
- Pairs actually used in the 17 screens (from the SVGs' aria-label text groups and the shapes behind them) all pass: primaryText/canvas 14.33, secondaryText/canvas 5.04, secondaryText/surface 4.64 (G01-pending), primaryText/surface 13.19, onAction/action 6.67, onActionDisabled/actionDisabled 5.42 (Verify code), destructive/canvas 6.09 ("This code has expired."), the initial on avatarCanvas 11.86. Action used as link text (Send a new code, Change email address, Share link, I have an invite, Get Tadayo) has no text check of its own but measures 6.43 light and 9.57 dark. No placeholder text is drawn in any frame, no cover appears in the 17 screens, and secondaryText is never used on a cover in any 1.1 frame (the card status line is ink). The colours outside the token set are system chrome only (#090F0D Dynamic Island, #D4D6DC/#ABB1BA keyboard), plus the fold line in brand-3. Script: /tmp/claude-0/-home-claude-tadayo/7ad06db5-d9b8-56e3-befa-0262075a1ed1/scratchpad/h1/agent-notes/pairs.py
- Dark pairs: every new role has a dark value, and the dark ones not in the checks also pass (action on dark canvas 9.57, secondaryText on dark avatarCanvas 5.50). Pairs that fail but are never used: secondaryText on covers (light 3.99-4.21, dark 1.20-1.32) and action or destructive on dark covers (1.1-1.3). Separators, disabled fills and avatar fills on canvas are decorative or exempt (1.11-1.72).
- Brand Q1 (avatar fallback) answered in full: canvas and surface #E1E5F6/#182B25 light and #35463A/#F7F8F2 dark; all six covers #182B25/#FAFBF8 in both themes (circle against cover 9.72-11.98:1). Sizes: 36 (16/20), 28 (13/18), 18 (9/11) and profile 68 (28/34). The dark rail no longer uses a light value. Fits T44 and spec 24 (names accompany avatars).
- Brand Q2 (button states) answered: pressed #203FB7/#FFFFFF 8.55 and #96A9F2/#18233B 6.89; disabled #E2E6DF/#4F5E55 5.42 and #35463A/#BAC6BD 5.70, with no opacity multiplier (book p26: semantic pairs, not global opacity); focus ring 2 pt with a 2 pt gap and 4 pt beyond (light 6.43/5.92, dark 9.57/7.69). The sheet's ring rect sits at a 3 pt offset with a 2 pt stroke, which matches the text.
- Brand Q3 (unnamed sizes) answered: cardStatus 13/18, plaqueWeekday 10/12, plaqueDay 25/28, dateTitle 25/29, clubHeader 16/20, headerAdd 15/20, button 16/22. cardRadius is 16 and ticket 18 is a separate component, which matches the interim build (13/18, 16) and spec 24's card radius 16. The sheet's card path uses corner radius 16.
- Brand Q4 (label on a photograph): photoLabel #FAFBF8 / onPhotoLabel #182B25 in both themes, opaque, 11/14 bold (14.33:1). The PDF says "Never tint the photograph to support the chip. The literal word, not colour, identifies the state", which fits T44 and book p35 ("Photographs are never inverted or tinted"). The specimen's drawing and the star are covered in brand-4 and brand-5.
- Brand Q5 (field on surface): one border, #778579, on canvas or surface, at 3.73 and 3.44:1 (was 2.92:1 on surface). The dark border is unchanged at #8C9B90 (5.93/4.76). The A02 fields draw it as a 1 pt stroke on a surface fill.
- Brand Q6 (cover1 vs accent): the accent is kept at #F0E4A8/#E4D8A2 and cover1 becomes cream #EEDFC4/#DFCFB3, with ink contrast 11.33/9.72. Colour carries no status; names stay visible (coverAssignment rule).
- Brand Q7 (dark icon): a transparent RGBA 1024 master with the same #F0D968 monogram, which meets Apple's documented dark-icon requirement (fetched developer.apple.com, configuring-your-app-icon).
- Type roles and radii agree with book p35: day 31/34, utility 32/35, body 17/23, row 17/22, metadata 13/18, tab 11/14; photo 14, surface 12, ticket 18, primary action 13; inset 20. They also agree with handoff 0's prose: caption 21/28, highlight 12/14, allowance 12/17, plaque radius 9, card 16.
- Wordmark clear space verified. Rendered at the 915x290 source scale, the first t's lower stem at y=160 spans x=40-83, 44 units; 44x144/915 = 6.925 pt. G02-web places the wordmark at 144 wide (scale 0.157377), centred at x=124.5; G06-no-club at 96 (scale 0.104918). The wordmark SVGs are unchanged (#284CDB light, #AFBEFF dark).
- T44 'colour never the only signal' is held in the frames: G01-invite-people's link states use a glyph plus a word (share icon "Shared", link icon "Not shared", check "Accepted"); A02-code-error uses an icon, a #AD3529 border and literal text; Proposed is a word in an outlined chip; tab selection is a filled symbol plus label (IMPLEMENTATION l.282).
- The 1.1 text keeps the FQ21 rule: "Before reveal, only the viewer's own cards show Highlight" (IMPLEMENTATION l.266). Primary text values, the accent and the wordmark geometry are retained as stated.

## Visual fidelity, native iOS and accessibility

### vis-1 · A02-email · change · confirmed

- **Rule:** T45 (native keyboard and controls); book p26 (native controls and focus order); the delivery's own focusRing rule (brand-components, PDF p25)
- **Finding:** A02-email and A02-code put the keyboard-focus ring around a field that is being edited by touch, with the software keyboard up. The delivery's own rule shows that ring only for keyboard focus. A02-code-error also has the keyboard up and the field still focused, but draws no ring, so the frames don't say which state the ring marks.
- **Evidence:** A02-email.svg and A02-code.svg: <rect x="17" y="260" width="359" height="60" rx="13" fill="none" stroke="#284CDB" stroke-width="2"/> around the 353x54 field at (20,263), while the drawn keyboard fills y=561-852. A02-code-error.svg draws the same keyboard with no ring, only the #AD3529 border. brand-components: "Focus: 2 pt ring, 2 pt canvas gap, 4 pt beyond the control. Only when keyboard focus is visible." PDF p25: "Do not show it merely because a touch button was tapped. Native accessibility focus and system focus effects take precedence where the platform supplies them." IMPLEMENTATION A02-email: "The frame shows an entered, focused field".
- **Action:** Ask Claude Design whether a field being edited by touch carries the focusRing, and how it combines with the error border. Until then, build follows the delivery's rule: the native field's editing state (the system caret) for touch, and the system focus effect only for hardware-keyboard focus. Record it in INVENTORY's Known differences.

### vis-2 · F01-no-club · change · confirmed

- **Rule:** book p7 ("Private drafts has a prominent row at the top of Friends"); book p44 ("Friends begins with a labelled Private drafts row. The collection is global to the author."); book p46 (drafts are account-wide private preparation)
- **Finding:** With no club, the Friends tab has no Private drafts row, although drafts can exist with no club (the delivery says so itself) and the book puts that row first on Friends.
- **Evidence:** screen-copy.json F01-no-club: ["9:41","B","Friends","Your friends will","appear here.","Create a club or open an invitation","to choose your people.","Create a club","I have an invite","Home","Friends","Memories"]: there is no drafts entry. G06-no-club does have one ("Private Drafts"). IMPLEMENTATION, Private drafts: "Drafts are account-private and can exist with no club." IMPLEMENTATION, F01-no-club: "Switching tabs keeps the current setup context and any Drafts."
- **Action:** Ask Claude Design to redraw F01-no-club with the Private drafts row at the top (book p7, p44), or to give a reason the no-club Friends tab drops it. List it in Known differences until then.

### vis-3 · G06-no-club · change · confirmed

- **Rule:** book p7 ("Three stable destinations and one labelled Add action"); book p44 (in Add, "Private draft is the first choice"; "No recipient, club or reveal date is required"); book p41 (Global Add); book p46
- **Finding:** None of the three no-club tabs has the labelled Add action in its header. The header also changes between tabs: the wordmark sits top left on Home and that corner is empty on Friends and Memories. 2.1 and handoff 0 keep one header, with + Add, on every tab, and Add still has a target with no club: a private draft.
- **Evidence:** G06-no-club.svg header: the wordmark path at translate(20 65), 96 pt wide, and a 28 pt avatar circle at cx=359 cy=78. F01-no-club.svg and M01-no-club.svg headers: only the avatar circle at cx=359 cy=78. No "Add" string in any of the three in screen-copy.json. 2.1 H01-open, F01-friends and M01-empty, and handoff 0's screens/H01-open.png, all draw "+ Add" between the club name and the avatar.
- **Action:** The founder decides, or asks Claude Design, whether Add (opening Private draft and Open my drafts, book p44) stays in the no-club header, and what fills the header's top left on Friends and Memories. Build as drawn until the answer and record it in Known differences.

### vis-4 · all · change · adjusted

- **Rule:** T44 (every type size comes from the design system's tokens); book p35
- **Finding:** Revision 1.1 names handoff 0's unnamed sizes, but these frames add five text styles that no type role in brand-tokens.json names: 16 pt regular text actions, 15 pt regular row actions ("Share link", "Share again"), 13 pt bold field labels, a 13 pt bold #607067 eyebrow ("Kitchen table") and a 13 pt bold "Proposed" chip (102x28, rx 6). 2.1 is itself mixed on text-action weight. "Not now" (G02-invitation), "Decline" (G03-approve) and "See upcoming days" (M01-empty) are bold, and "Already here? Sign in" (A01-welcome) is regular. Handoff 1 makes every text action regular without naming the role.
- **Evidence:** SVG glyph scale x 2048, weight matched by glyph outline. (1) Text actions are 16 pt regular in #284CDB: "Not now" (G02-changed), "Leave sign-in" (A02-age), "Review invitations" (G01-pending), "Send a new code" and "Change email address" (A02-code, A02-code-error), "I have an invite" (G06, F01), "Go to Home" (M01), "Add photo" (A03), "Get Tadayo" (G02-web). (2) Row actions "Share link" and "Share again" (G01-invite-people) are 15 pt regular. (3) Field labels "Email address", "Six-digit code" and "Your name" are 13 pt bold. (4) The eyebrow "Kitchen table" (G03-waiting) is 13 pt bold #607067. (5) The "Proposed" chip on brand-components is 13 pt bold in a 102x28 rx 6 rect, fill #F0F2EC, stroke #778579. brand-tokens.json has button 16/22 bold, headerAdd 15/20 bold, metadata 13/18 regular and photoLabel 11/14 bold; none of them matches. 2.1 draws "Not now" (G02-invitation), "Decline" (G03-approve) and "See upcoming days" (M01-empty) in bold.
- **Action:** Ask Claude Design to name these five roles (size, line height, weight) in brand-tokens.json, and to say which weight text actions take, since 2.1 uses both. Until then, build them as provisional named tokens at the drawn values that scale with Dynamic Type, and list them in Known differences, as was done for handoff 0's unnamed sizes.

### vis-5 · all · change · confirmed

- **Rule:** T44 (spacing from tokens); T47 and book p26 (layouts grow, text wraps)
- **Finding:** Several titles and the empty-state bodies break well before the 353 pt content width, and nothing in the pack names a maximum text measure. Built with system wrapping at the content width, these lines will break differently from the frames.
- **Evidence:** Ink widths measured on the 2x PNGs (each line, plus a space of about 9 pt at 32 pt): "Before you / continue" (A02-age) is 163 + 131.5, about 303 pt on one line; "Before the / club starts" (G01-pending) about 323; "Review the / new roster" (G02-changed) about 332; "Your friends will / appear here." (F01, 25 pt) about 346. All are under 353. The empty-state bodies break at 248 to 272 pt: F01 "...open an invitation / to choose your people.", M01 "...will appear here / after you join a club.", and G06's two sentences. The G01-pending and G02-full bodies run to about 353. brand-tokens.json geometry has only contentInset 20, and screen-copy.json gives each line as a separate string.
- **Action:** Ask Claude Design whether titles and empty-state text have a maximum measure (named as a token) or whether the breaks are incidental. Until then the build wraps at the 353 pt content width, with no hard line breaks, and the line breaks go in Known differences.

### vis-6 · G06-no-club · change · confirmed

- **Rule:** book p9 ("Create a club and I have an invite are the primary routes"); book p34 ("A component has one shape, one meaning")
- **Finding:** The same pair of routes takes two forms. On A01-welcome (2.1, kept by this stage) "I have an invite" is a 50 pt secondary button; on G06-no-club and F01-no-club it is a regular-weight text link.
- **Evidence:** 2.1 A01-welcome: "I have an invite" is a 353x50 surface-filled button with a bold label at about y=729-779, under "Create a club". G06-no-club.svg and F01-no-club.svg: "I have an invite" is 16 pt regular #284CDB text, centred at baseline y=419 and y=550 below the 50 pt "Create a club" button. No frame in handoff 1 draws a secondary filled button.
- **Action:** Ask Claude Design which treatment "I have an invite" takes on Welcome and in the no-club tabs, so it has one shape. Build each as drawn until then and note the difference.

### vis-7 · G02-changed · change · confirmed

- **Rule:** book p34 (one shape, one meaning); the avatar table on PDF p26
- **Finding:** G02-changed shows the roster as a list of 28 pt initials. G02-invitation, the other state of the same screen (2.1, kept), shows it as a grid of about 58 pt avatars. The delivery's own avatar table gives member rows 36 pt, which G01 and G05 use, so the build would switch roster components between two states of one screen.
- **Evidence:** G02-changed.svg: <circle r="14"> (28 pt) with 13 pt initials, a row pitch of 51 pt and separators from x=62. G05-members.svg and G01-invite-people.svg: r="18" (36 pt), with pitches of 73 and 74. PDF p26: "Standard member row / component reference 36 x 36 pt; Card sender / header profile affordance 28 x 28 pt". 2.1 G02-invitation: a 3x2 grid of about 58 pt avatars, with photographs for Maya, Debby and Ben, a footer hairline and a bold "Not now".
- **Action:** Ask Claude Design for the one roster component both G02 states use, and its avatar size (36 per the table, or 28 as drawn). Until then build G02-changed as drawn and record the difference from G02-invitation.

### vis-8 · G01-invite-people · change · confirmed

- **Rule:** T47 (every control has a VoiceOver name); PDF p30 ("explicit control labels"); T42 (names, not pronouns)
- **Finding:** Three controls in the same list have the identical visible label "Share link", and the pack gives them no accessibility labels. In VoiceOver's controls list they can't be told apart.
- **Evidence:** screen-copy.json G01-invite-people: "Share link" appears three times (the Alex, Sam and Nina rows) and "Share again" once (Maya). IMPLEMENTATION and the PDF name accessibility labels only for the header avatar ("Account") and the resend announcement.
- **Action:** Ask Claude Design for the accessibility label of each per-person share control, naming the person (no pronouns, T42). Until then, the build groups each row so that VoiceOver reads the name, the link state and the action together, and flags this in the PR.

### vis-9 · G01-invite-people · change · confirmed

- **Rule:** T47 (Dynamic Type to the largest sizes, with layouts that grow); book p26, p27
- **Finding:** The generic large-text rules on PDF p30 cover the single-column screens, but not rows with a trailing element. G01-invite-people's "Share link" or "Share again" and the proposed-member row's "Proposed" chip have no arrangement for accessibility sizes. G02-web says nothing about a dark appearance or browser text zoom.
- **Evidence:** G01 row: a 36 pt avatar, a 17 pt name, a 14 pt glyph with a 13 pt status, and a trailing 15 pt action at x=292-365 in a 74 pt row. brand-components proposed row: a trailing 102x28 chip (IMPLEMENTATION: "a minimum 76 pt growing row"). PDF p30 says only: "Support Dynamic Type without truncating names, labels or dates... Allow buttons to grow beyond 50 pt. Code errors and the resend region may reflow vertically". 2.1's F01-friends-xl has no trailing action to follow. README: "No extra dark or XL screen frames are substituted."
- **Action:** Write a handoff asking Claude Design for G01-invite-people-xl, the proposed row at a large text size, and G02-web's dark and zoomed behaviour. Until then, build these from the spec and the book's contracts and mark them "built from spec" in INVENTORY.

### vis-10 · G01-pending · note · confirmed

- **Rule:** book p34 (one shape, one meaning); book p6 ("a lock appears only before reveal"); book p7 and p44 ("Private drafts")
- **Finding:** The Drafts entry now has three shapes and two glyphs. On G01-pending it is a non-interactive card whose icon is in the action colour.
- **Evidence:** 2.1 F01-friends: a surface card with a lock glyph, "Private drafts", "Only you · Saved for later" and a chevron. G06-no-club: a plain row with an #284CDB folder glyph, "Private Drafts", a chevron and a separator, and no subtitle. G01-pending: a 353x128 surface card with an #284CDB folder glyph, "Private Drafts" and "What you prepare stays only with you.", no chevron, with "Open Drafts" as a separate button. 2.1's info boxes (G01-create, G03-approve) use an ink-coloured shield glyph.
- **Action:** Ask Claude Design for one Drafts entry component and glyph, used on Friends, Home and G01-pending, and whether an icon in a non-interactive card should be in the action colour. Build each as drawn until then.

### vis-11 · G05-members · note · confirmed

- **Rule:** INVENTORY Known differences, "People appear only as initials" (spec 29 A03, book p8); CLAUDE.md "Nothing generic" (people's names and photographs)
- **Finding:** Every roster frame again shows only initial fallbacks, although the book's fixtures give Ben, Maya and Debby photographs. The known difference from handoff 0 still applies.
- **Evidence:** G05-members, G01-invite-people and G02-changed draw every member as an avatarCanvas circle (#E1E5F6) with an initial. 2.1 F01-friends and G02-invitation show photographs for Ben, Maya and Debby.
- **Action:** Build follows the existing Known difference: a member's photograph when they have one, the initial as the fallback. Keep the item listed.

### vis-12 · G06-no-club · note · confirmed

- **Rule:** CLAUDE.md "Nothing generic" (book p5); T49 (an example is labelled Example)
- **Finding:** The no-club tabs carry none of the book's own objects (the dated day, the weekday plaque, the folded card, people's photographs). Apart from the 96 pt wordmark on Home, they are a title, a sentence and two actions, the kind of shell book p5 warns could be reskinned into another app. T49 and the brief rule out invented content, so the only truthful book object left is a labelled Example.
- **Evidence:** G06-no-club: the wordmark, "Start your club.", "A private place for two to six people.", "Create a club or open an invitation.", "Create a club", "I have an invite" and "Private Drafts". F01-no-club and M01-no-club: a page title, an empty title, two lines of body text and actions. A01-welcome (2.1) uses a labelled Example card for the same two routes.
- **Action:** The founder decides whether to ask Claude Design for one of the book's objects on the no-club Home, for example A01's labelled Example. Otherwise build as drawn.

### vis-13 · doc · note · confirmed

- **Rule:** T47 (layouts that grow)
- **Finding:** IMPLEMENTATION.md calls the resend region "fixed" at 44 pt and says two error lines must not move it. Read alone, that conflicts with Dynamic Type. PDF p30 relaxes it, but IMPLEMENTATION.md does not.
- **Evidence:** IMPLEMENTATION.md: "The fixed 44 pt resend region sits below Verify code"; "Allow up to two metadata lines without moving the resend region"; "Reserve one 353 x 44 pt row ... baseline 465". PDF p30: "Code errors and the resend region may reflow vertically on smaller accessible layouts; keep their reading order and relation to the field."
- **Action:** Build follows T47 and PDF p30: 44 pt is a minimum height that grows with text, and the region holds its place between A02-code states at a given text size. No redraw needed.

### Checked and right

- Every primary button in the 17 frames is 353x50 at x=20 with rx 13, so book p34's 50 pt main button holds and A02-email has its single 50 pt primary button. The 2x PNGs show the label at button 16 pt bold.
- Content inset is 20 on every frame. Titles are 32 pt bold with a 35 pt line pitch (utilityTitle 32/35), body 17 pt with a 23 pt pitch, metadata 13 pt with an 18 pt pitch, row names 17 pt bold, emptyTitle 25 pt with a 30 pt pitch, and tab labels 11 pt. All match book p35 and revision 1.1's roles.
- Avatars match the delivery's size table: 68 pt with a 28 pt bold initial (A03), 36 pt with 16 pt (G01, G05), and 28 pt with 13 pt (G02-changed and the header). The header avatar at 28 pt matches handoff 0's H01-open, and the 44x44 hit region and the Account label are specified.
- Apart from the schematic keyboard (#D4D6DC, #ABB1BA, white keys) and the status-bar island (#090F0D), every colour in the 17 screen frames is a revision 1.1 token with a dark pair. These are #FAFBF8, #F0F2EC, #182B25, #607067, #284CDB, #FFFFFF, #E2E6DF, #4F5E55, #778579, #AD3529, #DCE2DA and #E1E5F6, so dark is buildable from the tokens.
- No state relies on colour alone (T44). The code error has an icon, the words "This code has expired." and a destructive border. The link states use share, link and check glyphs with words, all in #607067. Waiting has a clock and words. The selected tab is a filled symbol with a bold label, and You is a word.
- Resend: "You can send a new code after one minute." and "Send a new code" share baseline 465, and Verify code keeps the same position in A02-code and A02-code-error. The error line sits in a reserved gap of about 59 pt. There is no ticking countdown, and availability is announced once (T47).
- The code is one native field with textContentType oneTimeCode and the number pad, with no six boxes. Fields are 353x54 with radius 10, a 1 pt #778579 border and a visible label above.
- At default size the spacing leaves room for a 44 pt region around every text action, including Add photo between the avatar and "Optional". Rows are 74 pt (G01), 73 pt (G05) and 51 pt (G02-changed).
- Native pieces are deferred to the system, as T45 asks: the tab bar is not built as an overlay, the share sheet is UIActivityViewController, and the keyboards, the back button and the photo picker are the system's. The status bar and tab bar drawings are presentation only.
- The wordmark is 144 pt wide on G02-web (scale 0.157377 x 915) and 96 pt on G06-no-club (0.104918 x 915), the stated sizes and minimum. G02-web keeps well over u = 6.925 pt clear and shows only the inviter, the wordmark and Get Tadayo.
- For the single-column screens (A02, A03, G02, G03, G06, F01, M01), PDF p30's large-text rules are enough to build from: scroll the body, keep the primary action reachable above the keyboard or safe area, let buttons grow past 50 pt, and let the error and resend rows reflow.
- 2.1's titles are about 7% narrower than handoff 1's at the same 32 pt ("Sunday people": 210 pt against 225.5 pt of ink), from Arimo letter-spacing. No action is needed, because the app uses the system font (INVENTORY, "The type face").
