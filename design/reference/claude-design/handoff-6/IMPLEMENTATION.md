# Tadayo - handoff 6 implementation guidance

Date: November 4, 2026. Brand: adopted revision 1.1.

## Delivery, sources and precedence

Handoff 6 supplies fifteen requested 393 x 852-point phone frames in exact order, the whole brand-components at position 16, and eleven additional redraws. The frame manifest is authoritative for order, dimensions and fixture data. Every SVG has its exact state title and a 2x PNG. Dark and largest-text phone frames are not added; both themes appear on the component sheet.

Brand revision 1.1, both wordmarks, the transparent dark-icon masters, Arimo and its licence are byte-identical to the handoff 5 base. Every earlier key and value in both contract files remains unchanged. Additions and replacements exist only under handoff6. Resolve handoff6.replaces before handoff5.replaces, including for the same original key; replacement scope matters.

The linked repository was read for the book, v3 spec, INVARIANTS, QUESTIONS and brand README. The book, spec and invariants content hashes match the preceding handoff. QUESTIONS now records brand adoption at FQ45 but does not carry the current FQ46-FQ79 text. This brief supplies the current Defaults, including FQ2 adoption of the H5 pickers. No value is taken from the repository brand folder. The user brief wins where the old questions differ.

Each fixture is an independent data set. First-day proposals, the later confirmed week, the pair-change example, suspension and a paused club are not one timeline. Device snapshots use en-US region and 12-hour display. Travelling changes the IANA device zone, not the region. Native date/clock settings determine production formatting.

This delivery concerns days and Home only. Native iOS controls and the system font implement the production screens; Arimo outlines make these static frames portable. Server authorization, native navigation, VoiceOver and Dynamic Type require device/service testing. No live club, account or repository was changed.

## First days and the 24-hour opening rule

H01-confirm-days retains the H5 root header, tabs and primary action. Its corrected body is Your club’s next scheduled day will appear here. It keeps the existing Private drafts row between the body and primary action, so work can be prepared without an invented collecting target. Add offers Private draft then Open my drafts. No person, date, countdown, confirmation count or reminder appears.

FQ79 is a server scheduling rule: for each confirmed weekday, find the first of that weekday’s dates whose resolved 07:00 club instant is at least 24 elapsed hours after confirmed_at. Equality qualifies. Compare instants, not local dates or a rounded day count; resolve DST from the club IANA zone. A first confirmation can therefore defer that weekday by a week. It never fabricates an instant first reveal.

In the constructed first-days fixture, confirmation is Wednesday, November 4, 2026 at 9 AM New York. Thursday, November 5 at 7 AM is only 22 hours later, so Sam’s first opening is Thursday, November 12. Nina first opens Saturday, November 7; Maya Tuesday, November 10; Alex Wednesday, November 11. At Thursday, November 5, 2026 at 9:41 AM New York, Nina is Next up.

Once any confirmed occurrence exists, Home shows the next actual confirmed occurrence. Ben’s own confirmation route remains Friends -> See schedule -> Choose your day, or Club details -> Schedule. The Choose row is viewer-only. A member joining before the first confirmation joins the first proposal; a later membership change uses G04-change. No push, badge, reminder or Home notice names unfinished confirmations.

## One day picker, truthful contested states

Keep H5’s adopted vertical day-choice design. A single-line Available row is 48 points minimum with vertically centred content. A row with a real second line is 64 minimum. Individually filled rows have a 4-point canvas gap, retaining their own 12-point corners. Own choice uses cover2/onCover2, while a confirmed day uses surface/primaryText. Their words and accessories also differ, so colour is not the only state signal.

A proposed day uses exactly the existing proposedMemberTag: 13/18 bold, surface fill, inputBorder outline, primaryText, intrinsic width, 28-point minimum. It is the same Proposed tag as a proposed member; the H5 diamond-and-text specimen is superseded for current day pickers. Other confirmed days have check/Confirmed and no selector; the spoken final word is Taken, reserving Unavailable for access denial. Own confirmed days use Name · You plus check/Confirmed, with no edit or selection action.

The abandoned self-proposal says Proposed for you both visually and in VoiceOver. A free day has no other member’s name. G04-one-day’s instruction is Choose a day that works for you, then confirm. The day plaque remains absent: choosing an unconfirmed recurring assignment does not promise a dated occurrence.

The explanation template is The proposed days overlap on {weekday}. It stays true whether an overlapping holder actively chose the day or holds a current proposed assignment without visiting the screen. Do not claim all holders chose it. A chooser’s visible names use {chooserNameList} with native ListFormatter, actual names and Name · You for the viewer, in stable roster order. The row therefore reads Ben · You, Alex and Debby for the fixture’s stable roster order. Prose refers to the viewer as you; it need not repeat that list.

Only a chooser receives participant names. G04-contested-other shows Sam’s Thursday as Sam · You with the own-choice fill. Friday has a neutral outline, Contested and No reveal scheduled, and an empty selector; no names or count are serialized. Its label is {weekday}. Contested. No reveal scheduled. Can be chosen. Its hint is Choose {weekday}. You’ll then see the people in this contested choice. Choosing Friday joins the contested choice, permits its participant list, and still does not allow confirmation while another holder remains.

G04-confirm-refused retains Debby’s selection and replaces stale data with the contested state. The neutral refusal is Couldn’t confirm {weekday}. This day is contested. Your choice is kept. Ben is named on that row because Debby is a holder. Confirmation is disabled with no destructive ink. This is distinct from a race in which another person has actually confirmed the day; the existing confirmed-owner race copy remains scoped to that different result.

G04-two-days-one-chosen retains Monday and shows the set-aside Thursday as Available / Proposed for you. The disabled button says Confirm two days; its label is identical and hint is Choose two days before confirming. A selected row in a two-day picker uses Remove {weekday} from your choices. and tapping removes that choice. The single-day own row stays selected; its hint explains choosing another day. Contested own rows also point to changing the choice without telling anyone to give way.

Retain FQ55: while a day has multiple holders, none confirms; it becomes confirmable when only one remains and that holder explicitly confirms. Do not auto-move people, pick a winner or nudge. A contested day may remain unresolved. All confirmed other days proceed. No lock is used anywhere in the day picker.

## Confirmation, navigation and schedule comparison

G04-confirmed-many is a read-only G04 completion summary. Ben’s Monday and Thursday say Ben · You. Back and Done pop to the saved safe origin (Home or Schedule), removing the stale editable picker from the navigation stack. If the origin is no longer authorized, Home resolves its current denial. A later restored/deep-linked picker renders the viewer’s confirmed day as the read-only ownConfirmed component, never as an editable choice.

Not now is in the native navigation bar on every G04 screen that offers it, including G04-change. The change-specific hint is Leave this proposal without confirming it. Back returns to the immediately previous screen; Not now exits the G04 flow to its safe origin without confirming. In a one-level flow they legitimately lead to the same place. Neither discards the selected day choices or confirms a calendar revision.

G04-change keeps H5’s person grouping: two preserved person groups, then three future person groups, then SundayRow. The drawing and semantic groups match. The header divider returns in separator ink, with 12 points before/after. Club/zone metadata then hours metadata use the same arrangement as G04 pickers and G05. Nameless fixtures show New York alone on the context line; real clubs always supply their club name.

Sunday aligns at x=20 with the person groups. Its standard calendar version has content inset 16; in the person-group container it has zero extra inset. It remains the same weekday-leading, Revisit / No reveal scheduled component and the same spoken phrase. It is never a selectable seventh reveal day.

Kept-date templates support any count: {dateList} visually and {personSpeech}. {spokenDateList}. Announced dates unchanged. when spoken. Format every full date separately, then join a visible list with middle dots and a spoken list with native ListFormatter. At large text, dates stack within the same person group. Proposed starts, preservation boundaries and kept announced dates always carry the year; the frame therefore wraps preserved dates and scrolls rather than shrinking them.

After the viewer confirms a change, the G05 review row keeps Review the club’s days and the full proposed start, adding Your confirmation is saved. It says nothing about anyone else. Opening it reviews the same revision read-only for that viewer; it does not submit another confirmation. Current days continue until the change becomes effective under the existing all-active-member rule.

## The week and Friends without a dated occurrence

G05-schedule-choose-own has one viewer-only Choose your day row above the read-only week. Monday and Friday say No reveal scheduled and name nobody. That same row form handles an unused weekday and a not-yet-confirmed weekday outside the picker. G05 keeps nextDates=false, nextUp=false and contentSignals=false from G05WeekView. A membership-change review row and the initial viewer’s Choose row are distinct routes.

G04 summaries and G05 now use the identical assigned-week label: {weekday}. {personSpeech}. Confirmed. The hours/zone are a separate header group. A public contested row has two actual lines, Contested then No reveal scheduled; handoff6.calendar.publicContested contains a newline to match them. No public week row names the contested holders.

Friends keeps stable roster order. Ben’s own field is Ben · You. A member with no dated occurrence has avatar and name only, vertically centred in a 52-point minimum row. There is no date, placeholder, confirmation word, chevron or tap destination. Its label is {personSpeech}. and its hint template is the empty string (omit accessibilityHint). Tapping does nothing because there is no F02 occurrence to open. Ben’s day choice is reached through See schedule, not an invented F02.

Confirmed members’ Friends rows show the FQ79-resolved first dates, and Nina alone is Next up. While travelling, the local date/time/zone appears first and the club full date/time/zone appears underneath whenever dates differ. The new friends.date.club.dated template carries the missing club date. Rows grow and the list scrolls while See schedule and the tabs remain reachable.

## Times at home, while travelling and across the date line

View local times remains available in the club zone. When IANA zones are equal, each dated occurrence has one block labelled Club and your time · {clubZoneName} and the action hint is Show dated opening and closing times in {clubZoneName}. The sheet title stays Times in your time zone. Different IANA zones use two blocks, even if they happen to share today’s UTC offset.

During an open day, the sheet lists that open occurrence first, with its opening, closing and Open now, followed by the next collecting occurrence for each other member. It shows one current/next occurrence per member, not a second future entry for the already-open member. Thus the redrawn London sheet begins with Debby’s open Friday, November 6; the requested same-zone sheet has no open occurrence and starts with Nina’s Saturday, November 7.

H01-travelling-dateline uses the actual shared server instant: Saturday, November 7, 2026 at 1:01 AM New York is 7:01 PM in Auckland. Nina’s Saturday opens Saturday, November 7 at 7 AM New York, which is Sunday, November 8 at 1 AM Auckland. The wait is 5h 59m in both places. Both time lines carry their own date. The occasion remains Nina’s Saturday and the plaque remains SAT 07, the club occurrence date. A second plaque would confuse identity with local representation.

The whole waiting card is one spoken group. At home its label is {occasionTitle}. Opens {fullDateTime}, {clubZoneName}. While travelling it is {occasionTitle}. Opens {localFullDateTime}, {deviceZoneName}; {clubFullDateTime}, {clubZoneName}. Do not expose the nested countdown a second time. If a countdown is exposed independently elsewhere, use home.countdown.vo / home.countdown.travelling.vo, which announce the exact opening target, including year and zone(s), never durationSpoken. Do not re-announce every tick; only a meaningful state change may announce itself.

The travelling contextual Add hint is Add to {occasionInSentence}, opening {localFullDateTime} in {deviceZoneName}; {clubFullDateTime} in {clubZoneName}. so neither a date nor a time silently inherits the other zone’s meaning. The same exact occurrence is used by the hero, Add and See captions.

For a wait of at least 24 hours, the compact visible countdown includes days, hours and minutes. At Sunday, November 8, 2026 at 1:01 AM New York, Ben’s Monday opens in 29h 59m and displays 1d 5h 59m. The spoken group announces Monday, November 9, 2026 at 7 AM New York. No duration is spoken or repeated each minute.

Year policy: always in proposed start/boundary and kept-date lists, and always in spoken exact countdown targets. Other live Home/Friends dates include it if outside the contextual current year, crossing a year, or the context does not establish a year. Standalone specimens include it. Native wide weekday/month formatting and device clock settings apply in all cases. The two time-zone representations apply the same policy.

Own occasions start a title as Your {weekday}, but embedded sentences take your {weekday}. The templates taking occasionInSentence are home.revisit, home.addFor.hint, home.addFor.travelling.hint, home.captions.hint and friends.row.hint. Named other-person occasions use the actual name. Examples include Revisit your Monday and Add to your Monday; labels do not infer gender.

## Denied tabs, switcher and paused club details

The neutral denial applies to every tab in the same selected context: F01-unavailable and M01-unavailable use the suspended explanation; M01-access-lost and F01-access-lost use the access-lost explanation. No club name, roster, date, caption, media, archive search or cached history is rendered. The person shown at top right is only the viewer’s global account identity.

Resolve the duplicate Choose a club controls by removing the denied header’s club selector. Use the app wordmark (action ink), Add for private work, and the global account avatar. The body retains exactly one primary Choose a club button, action/onAction. There is therefore no header Choose a club ink to synchronize or second control for Voice Control to number. The ordinary authorized club header is unchanged.

Add in a denied context offers Private draft then Open my drafts, with no denied-club destination. Another club opens only after an explicit authorized selection. Get help remains on the suspended state and reaches the configured support contact; no contact address or moderation reason is invented.

G06-switcher-unavailable is over that denied Home. Sunday people is still in the authorized club list, selected, with Unavailable and no count, date or next person. Kitchen table is active and keeps the book row 5 people · Next: Maya. Selection is spoken once by the native selected trait; the label itself contains no Selected. A revoked club is omitted from an authorized listing rather than shown unavailable.

G05-club-details-paused shows Kitchen table and 1 member, counting active membership only. The zone is omitted because the book supplies none for this fixture; production uses the member-count/club-zone template with real data. The new authorized Invite someone row sits between Members and Schedule. It opens the contextual per-person invitation-name flow for this club, then exact-roster review and every current member’s approval. No permission to view a creator-only link-status list is implied.

Keep the unified Private drafts row and its Only you can see these. subtitle, including on Club details. FQ16 restarts the paused club only once an invitation is accepted and approved. This delivery adds no outcome for a departed member’s announced days. The paused Home’s View Memories hint becomes Show past days you can view in {clubName}. instead of using accessible in a potentially ambiguous way.

## Component sheet, spacing and replacement audit

Frame 16 preserves the whole H5 sheet, with H6 current specimens appended in light and dark: waiting hero, dated travelling lines, neutral denied header, Not started/Paused/Unavailable switcher rows, review row before and after the viewer’s confirmation, one-zone and two-zone local-time blocks, every day-choice form and SundayRow, plus the outlined past-day card. Historical H5 specimens stay in the upper sheet; current H6 replacements are clearly labelled.

The dark waiting hero uses accent/onAccent for its text, but its canvas-filled plaque uses primaryText, not onAccent. The fallback avatar uses avatarCanvas/onAvatarCanvas. Brand tokens remain unchanged. The report calculates contrast for both themes, including the formerly failing plaque and initial pairings, all at least 4.5:1. Photographs are the exact existing Ben/Maya/Debby fixtures, with no filter or tint.

The past-day card follows 2.1 everywhere: canvas fill, separator outline, a check in a surface circle, primary title, secondary date and action-coloured revisit link. H5’s filled card and Memories glyph are retired. No replacement over 2.1 is proposed.

Spacing measures line-box edges, not baselines. Day choice: title -> context 12, context -> hours 4, hours -> instruction 12, instruction -> help 4, help -> first row 16. Thus title -> first row is a composed interval that grows with wrapped content, not a fixed 77-point blank. G05: title -> context 12, context -> hours 4, hours -> review/Choose row 24. Friends: title -> subtitle 8, subtitle -> Private drafts 24. Inter-row canvas gap is 4; one-line choice rows are 48 minimum; real two-line rows 64. H5’s remaining spacing values stay in the cumulative H6 spacing object, including no-club button gap 16.

Component replacement scopes explicitly retain dayChoiceRow noLock and largest-text stacking, and weekRows nextDates/nextUp/contentSignals false. The copy replacement map includes each earlier key actually taken over, the previously omitted legacy keys named in the brief, and the Wednesday/Saturday corrections to change.proposedRow.new.vo. Do not render old fixture strings simply because history is retained.

Eleven extra redraws follow frame 16: G04-conflict, G04-one-day and G04-two-days (state geometry/shared tag); G04-change (Not now, divider, context, alignment and date wrapping); G05-schedule-review and G05-schedule (context arrangement and spacing); H01-travelling (2.1 past card); H01-unavailable and H01-access-lost (one chooser and neutral header); F01-friends (spacing); G05-local-times (open occurrence first). Preliminary wording-only changes do not cause separate redraws.

Dark checks use theme tokens and all listed dark component specimens. AX5 checks use Arimo metrics for long titles, exact dates and chooser names plus explicit native reflow contracts: full-width stacked content, growing rows, stable semantic groups, pinned controls and scrollable bodies. This is design-time verification, not a native accessibility audit. No unrequested dark or XL phone frames are exported.

## Source references

- [Design book 2.1](https://github.com/beurni2/Tadayo/blob/main/docs/tadayo-design-book-2.1.md)
- [Build spec v3](https://github.com/beurni2/Tadayo/blob/main/docs/tadayo-build-spec-v3.md)
- [INVARIANTS](https://github.com/beurni2/Tadayo/blob/main/docs/INVARIANTS.md)
- [QUESTIONS](https://github.com/beurni2/Tadayo/blob/main/docs/QUESTIONS.md)
- Local H5 pack: cumulative contracts and byte-identical brand base.
- Handoff 6 attached brief: authoritative Defaults and constructed fixtures.
