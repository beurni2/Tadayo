# `ios/b0-lab-rows`: plan (ios lane, B0, slice 11's last PR, "4b")

Written 2026-11-07 by the ios thread from `ios/b0-drop-card` at `c44529d`, before PR #28 merged, and brought into the repository on 2026-11-11 (ADR-032) for the branch that builds from it, which starts at `main` `a569278`, where #28 merged. Four readers mapped the sources and a critic checked them. The plan was then revised after four fresh critics, each followed by a skeptic (workflow `wf_5d94e96a-057`: 36 findings, 10 refuted; section 10). Only this paragraph, the needs list's path in section 6 and section 9's first step differ from the plan as written.

Scope: spec 09, 10, 24; book p6, p7, p8, p12, p13, p15, p26, p27, p34; T1, T2, T10, T12, T31, T33, T41 to T47; Q03 (the app half).

## 1. What this PR builds, and what it leaves

### Builds

In `TadayoDesign` and the Lab, with the `TadayoCore` they need:

1. **The day header, in both its forms.** Book p34: "person, exact date and availability". Book p12 calls Open Home's header "the day header" too.
    - **Collecting**, as F02 draws it: the weekday plaque, the date title and the opening line. Sources: `screens/F02-upcoming.png` (handoff 0), and 2.1's `F02-upcoming` and `F02-added`.
    - **Open**, as Home draws the day while it's open: the date in capitals, the day's title, and "Until 1 AM · Kept in Memories". The title is "Debby’s Friday", or "Your Monday" for the star. Sources: `screens/H01-open.png` (handoff 0), and 2.1's `H01-open` and `H01-your-day`.
2. **The person row** (`handoff6.friendsRow`, which replaces `handoff3.friendsRow`), in each of its forms:
    - dated;
    - the viewer;
    - Next up;
    - no occurrence;
    - travelling, with the dates the same and with the dates different;
    - long names.
3. **The target block**, in its targeted form only. Sources: book p8 and p15; TECH-DESIGN section 4; 2.1's `C02-photo`, `C02-keyboard` and `C04-link`.
4. **The plaque's spoken date gets its year.**
    - FQ44: "so does every spoken full date". Handoff 6's `travellingRows.targetYear`: "exact VO targets always include year".
    - Today `WeekdayPlaque(date:labels:)` reads "Friday, November 6". No test pins it, so a hosted test will.

### Leaves

Each goes to its own stage, with a needs item (section 7):

- **The past day's header (`R01-past-day`) and the quiet day's (`H01-quiet`), both B5.**
    - `R01-past-day` is 2.1 only: "6 NOVEMBER 2026 / Debby’s Friday / In Memories".
    - `H01-quiet` has "Kept in Memories after 1 AM" and a plaque.
    - Each is a different arrangement with words of its own.
- **The open day's 44-point star photo.** 2.1 draws it; handoff 0 doesn't.
    - Revision 1.1's avatar sizes are 68, 36, 28 and 18. No 44 size or initial role is delivered.
    - Handoff 6's B2 waiting card draws a 44-point disc with a 19-point initial (INVENTORY.md:370), so it will need the same.
    - Built without the photo, as handoff 0 draws it, until a size is delivered.
- **The day header travelling.** `F02-upcoming-travelling` is words only (B4); `H01-open-travelling` is B5.
    - Handoff 5's `upcoming.local`, "Opens {fullDate} · …", puts the date in the travelling line. That leaves open whether the travelling header's title stays the date: a placement question, not a conflict.
    - `upcoming.title` has no placement, and INVENTORY.md:297 gives F02 the system title "Debby’s Friday".
- **The target block's other forms (B4):**
    - no target: `C05-private-draft`'s lock has no glyph in the brand;
    - the star's own day (`C02-star`): no words;
    - travelling: no contract;
    - the target closing while the composer is open (`C05-retarget`);
    - a target whose member left (`MEMBERSHIP_CHANGED`).

    The block shows only an occurrence the server named (T3, T4). A `next_target` enters it only once the person confirms, which is B4's flow.
- **The waiting card's canvas plaque with centred text** (`handoff6.waitingHero`, B2).
- **No inventory state changes status.** The screens are B2's, B4's and B5's (PR #28's precedent, INVENTORY.md:409).

One new question, **FQ92** (reserved through the coordinator at 09:54 UTC): what the day header and the target block say to VoiceOver (section 5).

## 2. Decisions

Each is noted in the PR.

### All three

- **The year follows one rule, handoff 6's `travellingRows.targetYear`:** "include year if … standalone specimen … exact VO targets always include year. Snapshot current-year live Home/Friends omit year".
    - The day header and the target block are standalone specimens, so they have the year, plus one current-year specimen each.
    - The person row is drawn as the live Friends roster, without the year, as `F01-friends` and the sheet draw it, plus one standalone row with the year.
    - Every spoken date has the year.
    - **A roster that crosses a year is the screen's call (B2).** A travelling local date can fall in the next year: 7 AM on 31 December in New York is 1 AM on 1 January in Auckland. Then the screen's single `includingYear` must count the local dates too (FQ44: "when the dates shown cross a year … Both zones' times follow the same rule"). This is tested on Linux, and written into B2's notes and the T2 audit row.
- **Spoken labels use the delivered templates where they exist.**
    - The person row has them: `handoff5.friends.row.vo` and `.travelling.vo`, `handoff6.friends.row.hint` and `.noDate.vo`.
    - The two day headers and the target block have none, so they take FQ92's default (section 5).
    - FQ91 stays the drop card's question.
- **Nothing is counted or computed on the phone.**
    - No counts, contributors, "added", confirmation status or ticking countdown (T5, T33, T47; `waitingHero.spokenGroup`). So `Countdown` stays out.
    - Dates and times come from the server's `local_date`, `reveal_at`, `close_at` and the club's zone (T1).
    - The device's zone is used only to write a travelling member's second line: `DateLabels.fullDate(of:in:)` writes the instant there. `LocalDate` stays the server's date only.
    - Next up is the contract's `Member.next_up` flag ("marks the member whose day opens first", openapi.yaml:11655–11676), taken as given.
    - No colour comes from a person or a cover (`coverColour: false`).
- **Words go in the package catalog** (`TadayoDesign/Localizable.xcstrings`).
    - Each is looked up exactly with `bundle: .module` (`DesignCatalogTests`).
    - Each has its own key and source, even where another key has the same shape (`drop.when` and `friends.date` are both "%1$@ · %2$@").
    - The copy lint reads the catalog.
    - Names are drawn with `Text(verbatim:)`, never parsed as Markdown, and `DesignCatalogTests` refuses a literal in the package.
- **New `LabSection` cases:**
    - `day`, after `plaque`;
    - `people` (the roster and first days) and `people-more` (travelling, long names, Ben as Next up, and one row standing alone), after `avatars`;
    - `target`, after `receipt`.

    `header` is already taken by the no-club header. The roster sections are split and drawn at 2x, because at AX5 on 320 points one section would be taller than the image comparison can draw (Metal textures stop at 16,384 pixels; the tallest reference so far is 8,282). No existing reference changes.
- **The 320-point images get a test of their own,** `testTheRowsKeepInsideA320PointScreenAtTheLargestSize`. It gives `Lab-day-320-xl`, `Lab-people-320-xl`, `Lab-people-more-320-xl` and `Lab-target-320-xl`.
    - With the cast, none of the three components changes form by width alone at the default size.
    - Next up's second form appears in `-xl` and `-320-xl`.
    - The default-size fallback for a long name beside Next up has no specimen (needs item 48). So there's no 430-point image.
- **Single lines keep the system font's own height.** Handoff 4's `dynamicTypePolicy.lineHeight`: "production follows scaled font line metrics with natural leading". INVENTORY.md:410 records this too. So a one-line `row` text is about 20.3 points high and a `metadata` text about 15.5, and two lines 4 apart sit about 20.5 apart at the baseline. The geometry below is stated in those terms.
- **Pressed looks the same** (`UnchangedWhenPressed`), as needs item 34. No source draws a pressed row or block.
- **Avatars keep a fixed size** (`handoff4.dynamicTypePolicy.avatarMarks`) and are hidden from VoiceOver, as `Avatar` already is.
    - Photographs are the person's profile photo, never anything of a drop (T12).
    - An avatar beside several lines is placed with `TypeRole.firstLineMiddle(atSize:)`, the formula `CompactReceipt`'s `discDrop` already uses, which moves into `TypeRole`. `firstLineCenter` isn't used here: a stack's custom alignment is the mean of its children's (Apple's `combineExplicit`), so beside a column of several `textRole` lines it doesn't land on the first line.

### The day header (`DayHeader`)

- **Inputs:**
    - `DayHeader(collecting: Occasion, labels:)` reuses PR #28's `Occasion`.
    - `DayHeader(open: DayHeader.OpenDay, labels:)` takes the star, whether they're the viewer, the date, `closesAt` (the contract's required `close_at`), the club's zone and `includingYear`.
- **Collecting:**
    - The `WeekdayPlaque`, then the words 12 after it. That is 2.1's gap, under FQ40; handoff 0 draws 15.
    - The date title in `dateTitle` 25/29 `primaryText` ("Friday, November 13, 2026", FQ44's form). Its top is level with the plaque's, as measured on 2.1.
    - 4 points under it (`Spacing.xs`), the opening line in `metadata` 13/18 `secondaryText`: "Opens at {time}, {clubZoneName}". These are the words handoff 0's `F02-upcoming` and 2.1 draw, and book p8's "Opens at 7 AM". New key `day.opens`.
    - At accessibility sizes (`isAccessibilitySize`) the plaque sits 8 above the words, so the date title has the whole width. At AX5 the plaque is 106 points wide and the title about 59. This is built from spec, by analogy with `handoff3.largeTextHeader`. It's keyed on the size, not on what fits, so the default size never stacks just because the year makes the title long.
    - The person is F02's system nav title (INVENTORY.md:297), which VoiceOver reads just before the header.
- **Open:**
    - The date in capitals, "FRIDAY, NOVEMBER 6". FQ44 settles the words: its text lists "FRIDAY, 6 NOVEMBER" among the render forms the region rule replaces. A new `DateLabels.fullDateInCapitals`, upper-cased by `plaque`'s precedent.
    - The capitals take `eyebrow` 13/18 bold `secondaryText`, the brand's line above a title (handoff 2). Handoff 0 draws 11, and no role is delivered for it.
    - Then the title in `dayTitle` 31/34 `primaryText`: `DateLabels.personDay` ("Debby’s Friday"), or `occasion.self` "Your {weekday}" for the viewer. That is handoff 6's `selfName`, which wins over 2.1's "It’s your Monday.".
    - Then "Until {closeTime} · Kept in Memories" in `metadata` `secondaryText`. These are handoff 0's and 2.1's words, and INVENTORY.md:113 already treats "Until 1 AM" as the state's. New key `day.until`.
    - 4 points between each line.
    - No photo (section 1).
- **Not in either form:**
    - FQ43's audience line (spec 09's sentence, under F02's header);
    - the countdown;
    - any count.
- **Spoken:** one heading, with the plaque inside it unread (FQ92).

### The person row (`PersonRow`)

- **Input** (`PersonRow.Member`): `name`, `photo: Image?`, `isViewer`, `isNextUp`, and `day: PersonRow.Day?`. `Day` holds the club's `LocalDate`, `opensAt`, the club's zone and `includingYear`. The device's zone is passed beside the member.
    - Nothing else: no position (the screen keeps the server's order), no cover, nothing from drops.
    - A `fields` tripwire pins the shape.
- **Geometry, as the contract names it** (`handoff6.friendsRow`):
    - minimum heights: 68 (`personRowMinHeight`), 52 with no occurrence, and 100 when travelling (the contract's "100-point minimum in fixture"; the frame draws 108);
    - avatar 36 (`AvatarSize.row`);
    - text inset 49 (`personRowTextInset`: 36 plus 13);
    - chevron box 20.
- **Geometry the contract doesn't name**, built from handoff 6's frames and sheet:
    - 12 above the words, and the lines 4 apart. At the default size, the 68 minimum, not the padding, sets the height.
    - A dated row's content sits at the top, as the frames draw it. A row with no date is centred (`noOccurrence`: "vertically centered").
    - The chevron box is 4 in from the trailing edge. The sheet draws 2, which isn't a step of book p35's scale. The text is 12 before it, the nearest step to the sheet's 14.
    - The chevron glyph is `Size.personRowChevron` (13: the 6-by-12 glyph handoff 3's 20-point box holds), and it grows with the text, as `PrivateDraftsEntry`'s does.
- **The avatar and the chevron:**
    - In a dated row, the avatar's top meets the name line's top. That's how handoff 6's frames draw every row, the 108-point travelling row included (avatar centre at top+28, against the sheet's centred 68-point specimen). Once the name's first line is taller than the avatar, the avatar stays level with that line instead (`friendsRow.AX5`: "Avatar aligns to first line"). This is the compact receipt's rule.
    - The chevron keeps the avatar's middle.
    - A row with no date centres its avatar on the name's first line.
- **The separator: the row draws it.**
    - The contract gives the separator to the row: `separatorToken`, `separatorLeadingInset` 49, `separatorTrailingInset` 0. It's 1 point wide, as `invitationRosterRow.separatorWidth` gives it (`Size.separatorWidth`).
    - The frames draw one under every row, the last row and the dateless ones included.
    - B2's native `List` (T45) then hides its own separator for these rows, so there's only one. Recorded in INVENTORY and B2's notes, and asked in needs item 48.
- **Roles and inks:**
    - name in `row` 17/22 bold `primaryText`;
    - date lines in `metadata` 13/18 `secondaryText`;
    - Next up in `nextUp` 13/18 bold `secondaryText`, with no chip and no fill (`nextUpLabel`);
    - the chevron in `secondaryText`.
- **The viewer:** "Ben · You" (`person.self`; `youLabel`: in the row's own role, no small tag, no ring).
- **Next up** (`handoff3.F01.nextUp`; new key `friends.nextUp`):
    - It sits on the name line, trailing and on its baseline, while the name and the label both fit on one line (`ViewThatFits(in: .horizontal)`).
    - It takes its own leading-aligned line under the name, before the date, when they don't fit, and at every accessibility size (`nextUpLabel.largeText`, `friendsRow.AX5`). At those sizes the name is the column's first child.
- **The date line:** `friends.date` "{fullDate} · {openTime}".
- **Travelling** (`friendsRow.travelling`; `travellingRows.Friends`):
    - A member counts as travelling when the device's zone identifier differs from the club's (`localTimesSheet.selection`: "Compare IANA zone identifiers, not current UTC offsets"; handoff 6's IMPLEMENTATION.md: "Travelling changes the IANA device zone").
    - First line: `friends.date.travelling` "{fullDate} · {localOpenTime} · {deviceZoneName}", with the date written by `DateLabels.fullDate(of:in:)`.
    - Second line, when the two dates are the same: `friends.date.club` "{clubOpenTime} · {clubZoneName}".
    - Second line, when they differ: `friends.date.club.dated` "{clubFullDate} · {clubOpenTime} · {clubZoneName}".
    - Whether the member is travelling, and whether the dates differ, is `TadayoCore`'s `LocalOpening`, tested on Linux.
    - A legacy alias of the club's zone on the phone would read as travelling, with two true lines that say the same thing. That needs a cross-version alias rename, which is unlikely in the trial. Noted in the PR.
- **No occurrence** (`friendsRow.noOccurrence`; FQ48): the name and the avatar only, 52 minimum. No date, status, placeholder, chevron or tap action, so it isn't a button.
    - Who hasn't confirmed shows by elimination, as drawn (INVENTORY.md:343; FQ48). The row adds no word, glyph or placeholder.
- **Spoken:** one element, with the avatar and the chevron unread, and the button trait when dated.
    - Label: `friends.row.vo` "{personSpeech}. {nextUpText}{fullDateTime}, {clubZoneName}.", or travelling `friends.row.travelling.vo`. `personSpeech` is `person.self.vo` or the name. `nextUpText` is `friends.nextUp.vo` "Next up. " or nothing.
    - Hint: `friends.row.hint` "Open {occasionInSentence}.". That's `occasion.self.inSentence` "your {weekday}" for the viewer, or `personDay` for others. The weekday is always the club date's.
    - No occurrence: `friends.row.noDate.vo` "{personSpeech}.", with no hint and no trait.
    - **Oracles** (handoff 6's `screen-copy.json`, with ICU's narrow no-break space before AM and PM):
        - "Ben, you. Monday, November 9, 2026 at 7 AM, New York." / "Open your Monday."
        - "Nina. Next up. Saturday, November 7, 2026 at 7 AM, New York." / "Open Nina’s Saturday."
        - "Ben, you. Tuesday, November 10, 2026 at 1 AM, Auckland; Monday, November 9, 2026 at 7 AM, New York." / "Open your Monday."
        - "Ben, you." and "Debby."
- **The action** is inert in the Lab (FQ85). B2 passes the action that opens `next_day.id` (T1, T49).

### The target block (`TargetBlock`)

- **Input:** `TargetBlock(for: Occasion, photo: Image?, club:, labels:, action:)`.
    - The person's name comes from the occasion alone (`Occasion.star`), so a name and a date from two people can't be mixed (T31).
    - The photo is the star's profile photo (T12).
    - "No target" will be B4's own case, so a remembered recipient can't fill the block silently.
    - A `fields` tripwire pins the shape.
- **Visible:**
    - A `surface` box at `Radius.surface` (12), with content 12 in on every side. 2.1 draws 14 at the leading edge, not a step. 12 is `privateDraftsEntry`'s inset for the same anatomy.
    - The 36-point avatar (`.canvas` placement: brand-tokens.md:100–101 gives surface the canvas pair), 12 before the text.
    - The title in `row` `primaryText`, "For Debby · Friday, November 13, 2026" (key `target.title` "For %1$@ · %2$@").
    - 4 under it, the line in `metadata` `secondaryText`, "Sunday people · Opens at 7 AM" (key `target.audience` "%1$@ · Opens at %2$@"). That's about 20.5 between baselines (2.1: 20), and about 64 high (2.1: 64).
    - A `chevron.down` in `secondaryText`, the brand's chevron ink, in a 20-point box (`Size.targetChevronBox`). Its glyph is `Size.targetChevron` (9), the size whose glyph matches 2.1's 8 by 5, to be checked on the first run's image. It grows with the text.
    - The avatar's top meets the title's until the title's first line outgrows it, then stays level with that line. The chevron keeps the avatar's middle.
- **The date is written whole.**
    - The handoffs write every date with wide weekday and month names: handoff 6's IMPLEMENTATION.md:83, "Native wide weekday/month formatting … in all cases"; handoff 3, "grow rows rather than abbreviate dates".
    - The repo already moved the folded card off "Opens Fri, Nov 13" for the same reason.
    - Book p15, the block's own page, says "Friday 13 November". Book p8, 2.1 and TECH-DESIGN's quote of p8 shorten the month ("Friday 13 Nov"): recorded as a known difference.
    - No new `DateLabels` function is needed.
- **The words:** `drop.for` "For %@" is the upload row's ("For Debby’s Friday"). The block's title names the person and the date separately, as book p8 does, so it takes its own key. `receipt.opens` has the audience line's shape but a date in the first slot, so the audience line takes its own key too.
- **Spoken:** one button with no hint (FQ92). It keeps the upload row's order: the person, then the opening.
- **The action** (changing the recipient, spec 10) is inert in the Lab (FQ85). The allowance never enters the block; it stays in `AllowanceLine` (T33).

## 3. `TadayoCore`, tests first (Linux, Swift Testing)

- **`DateLabels.fullDate(of: Date, in: TimeZone, includingYear:)`:** the date an instant falls on in a zone, written as `fullDate` writes a date.
    - Ben's Monday (1_794_225_600, 12:00 UTC) is "Tuesday, November 10" in Auckland, and "Monday, November 9" in London and New York.
    - Nina's Saturday is "Sunday, November 8" in Auckland.
    - en-GB with the year is checked by prefix and suffix, as `fullDateFollowsTheRegionWithWords` checks it.
    - Midnight in the zone's own clock across a change of offset: New York on 1 November, London on 25 October.
    - 31 December 2026 at 7 AM in New York is "Friday, January 1, 2027" in Auckland.
- **`DateLabels.fullDateInCapitals(_:includingYear:)`:** en-US "FRIDAY, NOVEMBER 6", en-GB "FRIDAY 6 NOVEMBER", and the year when asked.
- **`LocalOpening(opensAt:clubDate:clubZone:device:)`:** the device's zone and whether the dates differ, or `nil` when the zone identifiers are equal.
    - Auckland: the dates differ.
    - London: the same date.
    - America/Toronto against America/New_York: the same offset, but counted as travelling.
    - The year's end: the dates differ.
    - Midnight in Kolkata decides: 20:00 UTC in London is the next date there, and a second before Kolkata's midnight isn't.
- **`DateLabelsDeviceZoneTests`** (the process zone set to Kiritimati, Auckland and Kolkata) gains `fullDateInCapitals` and `fullDate(of:in:)`.
- **Nothing for "next" or "Next up":** the server says both (T1, T4).

`swift test` stays green: 134 tests today, 144 with these. So does `swift format lint --strict`.

## 4. The Lab, the snapshots and the hosted tests

### Fixtures (`FixtureCast`)

- **The book's week,** each day at 7 AM in New York (12:00 UTC; New York is on standard time after 1 November): Nina Sat Nov 7 (1_794_052_800, Next up), Ben Mon 9 (1_794_225_600), Maya Tue 10 (1_794_312_000), Alex Wed 11 (1_794_398_400), Sam Thu 12 (1_794_484_800), Debby Fri 13 (`collectingDay`). The dates come from handoff 3's six `F01.row.vo.*` labels and handoff 6's `screen-copy.json`.
- **Open days:**
    - Debby's Friday, November 6, open until 1 AM on the 7th (1_794_031_200), with and without the year.
    - Ben's Monday, November 9, open until 1 AM on the 10th (1_794_290_400).
- **Alex's Wednesday as an `Occasion`,** and the same day for Alexandria-Rose Mensah (a test-data choice: the cast gives her no day).
- **Zones:** `Pacific/Auckland` and `Europe/London`. These are handoff 6's travelling frames, plus the London variant built from spec (INVENTORY.md:376, X-11). The viewer is Ben.

### Specimens

- **`day`:**
    - collecting: Debby with the year, Debby in the current year, and Alex's Wednesday (the longest weekday);
    - open: Debby's Friday with the year, the same in the current year, and Ben's own Monday ("Your Monday").
- **`people`:**
    - the roster as `F01-friends` draws it, in the current year and in roster order (Ben, Maya, Alex, Sam, Debby, Nina);
    - first days, as `F01-friends-first-days`: Ben · You and Debby with no date, in the same order.
- **`people-more`:**
    - travelling to Auckland with the dates different (Ben · You, and Nina with Next up);
    - travelling to London with the same date (Nina);
    - long names, as 2.1's `F01-long-names`: Alexandria-Rose Mensah on Wednesday the 11th with an initial, and Deborah-Anne Ouédraogo on Friday the 13th with Debby's photograph. That photograph is built in the Lab; `FixtureCast.deborahAnne` keeps `photo: nil`, which PR #28's references use;
    - Ben · You as Next up. This is a test-data choice the contract allows; the sheet's "You and Next up" panel shows the two type samples apart;
    - one standalone row with the year.
- **`target`:**
    - Debby with her photograph, with the year;
    - the same in the current year;
    - Alex with his initial (Wednesday the 11th, 2.1's `C01-picker` date);
    - Alexandria-Rose Mensah.

### Snapshots

- `testLabSections` draws each new section in light, `-dark`, `-large` (xxxLarge) and `-xl` (AX5) at 393 points: sixteen images.
- The new 320-point test adds four. That's twenty new references.
- References are taken from the run's images only after I've viewed them (CI never records), and each image's pixel height is checked.
- Each is compared with what it stands in for, and every difference is listed in the PR:
    - `Lab-day` with `screens/F02-upcoming.png`, `2.1/F02-upcoming.png`, `screens/H01-open.png`, `2.1/H01-open.png` and `2.1/H01-your-day.png`;
    - `Lab-day-dark` with `screens/F02-upcoming-dark.png` and `screens/H01-open-dark.png`;
    - `Lab-people` with `screens/F01-friends.png`, `screens/F01-friends-first-days.png` and the sheet's row;
    - `Lab-people-dark` with `screens/F01-friends-dark.png` and the sheet's dark row;
    - `Lab-people-more` with `screens/F01-friends-travelling.png` and `2.1/F01-long-names.png`;
    - `-xl` with `2.1/F01-friends-xl.png`;
    - `Lab-target` with `2.1/C02-photo.png`, `C02-keyboard.png` and `C04-link.png`.

### Hosted tests

These are in `TadayoTests`, so they also run on iOS 18.6 and 17.5.

- **Move `DropCardTests`' private helpers** (`Read`, `assertReads`, `labels`, `fields`, `seven`) into `apps/ios/TadayoTests/Reading.swift`, shared by the new files. This moves code without changing a test.
- **`DayHeaderTests`:**
    - the plaque alone reads "Friday, November 6, 2026";
    - each header is one element with the header trait (checked on `AccessibilityElements.Element.isHeader`, as the tabs' tests do), with FQ92's labels;
    - the current-year specimens and the stacked AX5 header read the same;
    - "Your Monday";
    - a `fields` tripwire on `OpenDay`.
- **`PersonRowTests`:**
    - section 2's oracles exactly, on current-year rows, which proves the spoken year survives when the visible date drops it;
    - London's reading, "Nina. Next up. Saturday, November 7, 2026 at 12 PM, London; Saturday, November 7, 2026 at 7 AM, New York.";
    - the no-occurrence rows, with no hint and no trait;
    - the standalone row;
    - the `fields` tripwire.
- **`TargetBlockTests`:**
    - the label, the button trait and no hint;
    - the spoken year for the current-year specimen;
    - an initial not read;
    - the `fields` tripwire.
- **`DesignCatalogTests`** passes with the new keys.

## 5. Questions

**FQ92. What the day header and the target block say to VoiceOver.**

No template is delivered for either. FQ91 is the drop card's question, and handoff 7 answers only that. The nearest delivered template is handoff 6's `home.waiting.group.vo`, "{occasionTitle}. Opens {fullDateTime}, {clubZoneName}.", but it belongs to Home's waiting card, which has no navigation title.

Default: one element each, as below.

- **(a) The collecting header.** One heading, the plaque unread. It reads the title's date and the opening line as one opening, in `card.status.vo`'s form, rather than reading the two lines in order: "Opens Friday, November 13, 2026 at 7 AM, New York." The person is left to F02's system navigation title, "Debby’s Friday", which VoiceOver reads just before it.
- **(b) The open header.** One heading, read in its visible order, with each date in full with its year and the club's city: "Friday, November 6, 2026. Debby’s Friday. Until Saturday, November 7, 2026 at 1 AM, New York. Kept in Memories." The star's own day reads "Your Monday".
- **(c) The target block.** One button with no hint. It reads the person, the club, then the date and time as one opening: "For Debby. Sunday people. Opens Friday, November 13, 2026 at 7 AM, New York."

Needed by: B0 (`ios/b0-lab-rows`, the Lab); B4 (F02, the composer, the share extension); B5 (Home while open).

The other gaps have a delivered rule or an existing question:

- The year: `travellingRows.targetYear`.
- When a member counts as travelling: `localTimesSheet.selection` and IMPLEMENTATION.md:13.
- Next up: the contract's flag.
- The opening and closing lines' words: handoff 0's and 2.1's renders, and book p8.
- Geometry with no contract: 2.1's layout under FQ40, at the nearest steps, marked built from spec, with needs items.

## 6. Records

- **INVENTORY:** a Known-differences group, "The day header, the person row and the target block in the Lab", after PR #28's.
    - **The day header:** 12 against handoff 0's 15; the plaque's 8-point inset against the sheet's 10 for the weekday (PR #15's decision, JOURNAL.md:2111, unchanged); the stacking; the open form's `eyebrow` against handoff 0's 11 points; the photo left out; "Your Monday" against 2.1's "It’s your Monday.".
    - **The person row:** the natural line heights; the 100-point travelling minimum; the chevron's place and scaling; the separator drawn by the row; Next up's move; the avatar rule (the frames' top against the sheet's centred specimen); the long-name row's photograph.
    - **The target block:** 12 against 2.1's 14; the date written whole against book p8 and 2.1.
    - No status changes.
    - A note on `F01-friends-first-days`: the contract's `Member.position` ("then members with no day yet in the order they joined") against the frame's order.
    - Notes on the missing rows whose form the Lab now builds from spec: `F02-upcoming-xl`, `H01-open-xl`, `C02-photo-dark`, `C02-photo-xl`, `F01-friends-unconfirmed`.
    - Block 1.3's design line follows.
- **QUESTIONS:** FQ92, with its default, under a new heading, "Raised by the Lab's rows".
- **PROGRESS:** under the ios lane's "Needs from the other lane", for B2's contract PR. Ask whether `position` places a member by a proposed day (FQ48), as `F01-friends-first-days` draws it, so no row moves when its member confirms, and ask for the description to say so.
- **Audit map** (JOURNAL section 2):
    - T1, the device side (`fullDate(of:in:)` and `LocalOpening` take `reveal_at` and zones, never the device's clock);
    - T2 and Q03, an app half (the travelling rows and `LocalOpening`'s tests, plus the year rule for B2);
    - T10 and T12, the app side (the `fields` tripwires; the profile photo as an `Image`);
    - T31, the component half;
    - T33;
    - T41 (the new `DateLabels`);
    - T42 (the self forms);
    - T44 (the new sizes with their sources);
    - T45 (the separator);
    - T46 (the fixtures' sources);
    - T47 (the labels, traits and 320-point images);
    - **new rows** for spec 09 and spec 10;
    - spec 24's component list.
- **The journal:** block 1.3, a 3.3 entry per commit, and the 4.2 row. Block 1.3's Next adds VoiceOver checks for the day header, the person rows (label and hint; no-date rows aren't buttons) and the target block to slice 12's TestFlight notes. Also PROGRESS, and `journal_check.py --branch`.
- **The needs list** (`docs/design/handoff-7/ios-lane-needs.md`, which is on `main` once #30 has merged): a new section 9, items 47 onwards (section 7). Until #30 merges, section 7 below holds the items, and the branch adds them to the list in the commit after `main` has it.
- **The PR's Design handoff section:** "None for this PR". The states are B2's, B4's and B5's, and the needs items wait for the next brief that covers the component sheet.

## 7. Needs items (47 onwards)

- **47. The day header in the brand.** Light, dark, AX5 and 320.
    - **Collecting:**
        - the gap from the plaque (2.1's 12, handoff 0's 15), the title's top against the plaque's, the line's gap, and the stacking at accessibility sizes;
        - book p12 (line 239): "The day header and compact highlight rail leave the whole first feed preview visible at default size";
        - where the travelling header's title goes, since handoff 5's `upcoming.local` carries the date.
    - **Open:**
        - a role for the capitals (FQ44 settles the words);
        - the line's words ("Until 1 AM · Kept in Memories", or `local.closes`'s form);
        - the star's photo: 2.1's 44 points, the same size as handoff 6's waiting card, with an initial role;
        - "It’s your Monday." against "Your Monday";
        - an `unavailable` occurrence showing nothing (T9).
    - **The past day's and the quiet day's headers**, and where a past day's header gets the name of a star who left.
    - **Their spoken forms** (FQ92).
- **48. The person row at larger sizes and pressed.**
    - when Next up leaves the name line, including a long name beside it at the default size on a narrow screen;
    - the avatar's place: the frames' top against the sheet's centre, at larger sizes, and in the no-occurrence row;
    - the chevron's glyph and place (handoff 6's `F01-friends` draws it 5 by 9, 4 in from the row's edge and centred on the two lines; handoff 3's `F01-friends-dark` 7.5 by 13, 8 in; the sheet's box 2 in; the build keeps the Private drafts row's, about 6 by 11), and whether its box grows (at AX5 it is 56 points wide and leaves the words about 139 on a 320-point screen);
    - the travelling row's minimum (the contract's 100, the frame's 108);
    - the pressed form;
    - the separator under a native list;
    - Friends' use of `localTimesSheet.selection`;
    - words breaking inside themselves at AX5 on 320 points (as items 38 and 45).
- **49. The target block in the brand, and its B4 forms.**
    - light, dark, AX5 and 320; its inset (2.1's 14); the `chevron.down`'s size and growth;
    - its words at the largest sizes: at AX5 on 393 points "November" and "Wednesday," break inside themselves, and on 320 points the words get about 150 and break every few letters, beside an avatar that keeps its size and a chevron box that grows to 56 points;
    - its date form (the handoffs' whole date against book p8's "Friday 13 Nov");
    - its spoken form (FQ92);
    - pressed.
    - **The forms with no frame:**
        - before a person is chosen (the share extension, T31);
        - no target (the lock);
        - the star's own day (`C02-star`: "For Ben" or "For you"; needs item 43);
        - "next Friday" (book p8; 2.1's `H01-first-drop` is the only "next" title: "Debby’s next Friday");
        - travelling;
        - the target closing in place (`C05-retarget`);
        - the member who left (`MEMBERSHIP_CHANGED`).

## 8. Risks

- **Size.** About 1,000 lines with tests and records, over the 400-line target (`docs/GITHUB.md`). It stays one PR: the three share the Lab, the moved helpers and the new `DateLabels`, and they close slice 11 together. The review runs by dimension: privacy and rules, design fidelity, platform and accessibility, tests and records.
- **Image heights.** The roster sections are split and drawn at 2x. Each image's height is checked on the first run.
- **Words breaking at AX5 on 320 points** ("Wednesday,", "Ouédraogo", "Alexandria-Rose"), as in needs items 38, 45 and 46. They're listed in the PR, not hidden.
- **The avatar rule depends on `TypeRole.firstLineMiddle`.** That is the formula `CompactReceipt` already proved at AX5. Checked in `-xl` and `-320-xl`.
- **Each `ios` run costs about 15 macOS minutes,** so pushes are batched (TadayoDesign compiles only on CI).
- **Merging `main`:** if the api lane merges first, `main` is merged in and pushed at once.

## 9. Order of work

1. `git fetch origin`, then `git switch -c ios/b0-lab-rows origin/main` (`a569278`, with #28 merged). The first commit of this branch records nothing of #28's merge: #30's section 4.2 row does.
2. `TadayoCore`: drafted with its tests (144 pass); copy it in.
3. `TadayoDesign` and the app: drafted; copy them in.
4. Records: FQ92, INVENTORY, PROGRESS, the audit map, the needs list, the journal.
5. Push. Read the run's images, compare them with the renders, fix, take the references, push again.
6. The review workflow (dimensions, then skeptics), fixes, two green runs plus iOS 18.6 and 17.5, the PR, and the founder's approval.

## 10. Changes after the critique (`wf_5d94e96a-057`)

Each finding and what became of it. "Refuted" means its skeptic showed it wrong or already handled.

| Finding | Disposition |
|---|---|
| rules-fq91-scope | Fixed. FQ92 reserved and written; FQ91 left as it is; the receipt quote corrected (its line is "November 13 · Opens at 7 AM") |
| rules-year-crossing | Fixed. A Linux test for 31 December into 1 January in Auckland; the screen's `includingYear` counts local dates (B2's notes, the T2 row) |
| rules-header-person | Refuted. `home.waiting.group.vo` is Home's waiting card; F02's nav title names the person (INVENTORY.md:297). Recorded in FQ92 |
| rules-travel-alias | Refuted. The delivered rule compares identifiers. Noted in the PR |
| rules-localdate-device | Fixed. No `LocalDate(_:in:)`; `DateLabels.fullDate(of:in:)` writes the instant, and `LocalOpening` compares inside itself |
| rules-target-two-names | Fixed. The block takes its name from the occasion alone, and the photo beside it |
| rules-first-days-order | Fixed. A PROGRESS item for the api lane, and an INVENTORY note |
| design-1 | Fixed. The target date is written whole (`fullDate`); `weekdayDayMonth` dropped |
| design-2 | Fixed. The avatar meets the name's top as handoff 6's frames draw it, then stays level with the first line; the chevron keeps its middle |
| design-3 | Fixed in part. The travelling lines 4 apart, and a 100-point travelling minimum. Next up keeps 68 (the contract and the sheet's own Next up specimen) |
| design-4 | Fixed. The chevron box 4 in (the sheet: 2) and the text 12 before it (the sheet: about 14) |
| design-5 | Refuted. Already ruled at INVENTORY.md:297 |
| design-6 | Refuted. The brand's chevron ink is `secondaryText` |
| design-7 | Refuted. 12 is `privateDraftsEntry`'s, the same anatomy, and it is recorded |
| design-8 | Fixed. The comparison list in section 4 |
| design-9 | Fixed. "Ben as Next up" is called test data |
| design-10 | Fixed (the claim). The default-size fallback has no specimen; needs item 48 |
| platform-1 | Fixed. `firstLineCenter` isn't used beside a column; `TypeRole.firstLineMiddle` places the avatar |
| platform-2 | Fixed. Natural line heights stated; the block's lines 4 apart |
| platform-3 | Fixed. Next up has its own line at every accessibility size |
| platform-4 | Refuted. The header trait is checked on `Element.isHeader` |
| platform-5 | Fixed. The Markdown checks are dropped; `Text(verbatim:)` and the catalog test pin it |
| platform-6 | Refuted. The contract gives the separator to the row; recorded for B2 |
| platform-7 | Fixed. `Size.targetChevron` 9, to be checked on the first image |
| platform-8 | Fixed. The roster split into two sections, drawn at 2x |
| scope-1 | Fixed. The open day's header is built; the past and quiet headers are left with a needs item |
| scope-2 | Fixed. en-GB with the year is checked by prefix and suffix |
| scope-3 | Fixed. The device-zone suite gains the new functions |
| scope-4 | Refuted. As platform-4 |
| scope-5 | Fixed. The oracles are current-year rows; London is pinned |
| scope-6 | Fixed (the sentence) |
| scope-7 | Fixed. No F02 title conflict; a placement question in needs item 47 |
| scope-8 | Fixed. The audit map gains T1, T10 and T12, with new spec 09 and 10 rows; T4, T49 and T55 aren't claimed |
| scope-9 | Fixed. Slice 12's TestFlight notes gain the VoiceOver checks |
| scope-10 | Fixed. As platform-8 |
| scope-11 | Refuted. The two rules differ for a stated reason |

## 11. Changes after the first run (`ios` run 42931366048 at `aae627c`)

The first push compiled on the first try: 129 tests passed and 3 failed: `testLabSections` and `testTheRowsKeepInsideA320PointScreenAtTheLargestSize`, each for the twenty new images that have no reference yet (CI never records), and the catalog's middle-dot test. All twenty new images were read against the renders they stand in for (INVENTORY.md's Known differences, "The day header, the person row and the target block in the Lab").

| Finding | Disposition |
|---|---|
| `DesignCatalogTests.testEveryMiddleDotIsBoundToTheWordBeforeIt` | Fixed. Seven keys (`day.until`, `friends.date`, `friends.date.club`, `friends.date.club.dated`, `friends.date.travelling`, `target.audience`, `target.title`) had an ordinary space before "·"; each is bound with a no-break space, as the check of handoff 7's V-19 asks |
| A pronoun in a Lab label, "For Debby, with her photo" | Fixed. The label reads "For Debby, with a photograph" (T42); the Lab's own words follow the rules too |
| The roster chevron against handoff 6's frame (5 by 9, 4 in) | Kept. The critic's ruling (INVENTORY.md, the Friends group: "the row chevron 20 points, where the frames draw them regular and 14") makes it the Private drafts row's, so both chevrons on the Friends tab are one size; the three measurements are recorded, and needs item 48 asks |
| Next up bold against the frame's regular | Kept, by the same ruling |
| The target block's title on two lines at 393 points, and its words breaking at AX5 | Kept. The date is written whole (the plan's section 2); recorded, and needs item 49 asks |
| Everything else | The row pitch, separators, text and avatar columns and the date line match `F01-friends` at the default size to within 1.5 points; the day header matches handoff 0's `F02-upcoming` apart from the recorded gap (12 against 15) and date form |
