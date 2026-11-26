# Tadayo · Design handoff 10

Stage B1 · 26 November 2026

This pack supplies the requested 11 frames and the written decisions for approving a whole roster revision, reviewing a newer revision, the proposed rows in Members, and the creator’s approval before activation. It follows design book 2.1, build spec v3, new direction addendum r1, and handoffs 1–9.

Brand revision 1.1, cover colours, wordmarks and handoff 7’s whole component sheet remain unchanged. The SVG text is outlined Arimo; Arimo and its licence are included. Use the system font and native iOS navigation, alerts, buttons, activity indicators and Dynamic Type in production. These exports do not claim native simulator or VoiceOver certification.

## Decisions to apply

| Topic | Decision | Implementation effect |
|---|---|---|
| FQ144: several candidates | One candidate block each; one decision for the entire revision. | Retain the built revision-wide model. Names use the phone’s list formatter. |
| FQ143: proposed row | Pending: disclosure chevron and review hint. Decided: static row with no decision status. | Add the missing affordance; remove button/chevron/hint when it opens nothing. |
| FQ145: creator’s approval | Approve roster and Decline directly below the proposed roster. | Review members leads to the place where Ben can act; no extra approval screen. |
| FQ146: an earlier own decision went through | State the confirmed own decision in a native informational alert, then return to the roster. | Replace the impossible Try again loop; never claim the opposite action succeeded. |
| Decline | Keep handoff 5’s label plus separate hint; add a working indicator. | Same named-candidate label as Approve, no silent busy state. |
| Recovery alerts | No Cancel on either existing alert. | Their one action reads/navigates; neither makes a decision. |
| H9 row questions | Keep built symbol growth, unchanged shared Drafts inset, and no inviter line. | No new visual branch or extra row text. |

## Deliverables and precedence

Open index.html to browse the ordered frames, or the implementation PDF for proofs and this guide. Each SVG is 393 × 852 points; each PNG is 786 × 1704. frame-manifest.json records order, coordinates, accessible controls, semantic groups, scroll offsets and fixture notes. screen-copy.json records the text of each proof.

The JSON contracts are cumulative: every existing handoff 9 structured entry remains intact. Implement only the explicit handoff10 replacement scopes over conflicting older guidance. copy-contracts.json contains 68 new keys, including every new written-only string. component-contracts.json defines conditional actions, row behavior, busy states, outcomes, spacing and accessibility. Source Git blob hashes are recorded in source-provenance.json.

The first seven frames are the base states in the brief’s order. The four requested variants follow in the exact order listed at the end of the brief. There is no extra custom frame for native alerts or written-only variants.

| Order | Exact frame title | Purpose |
|---|---|---|
| 01 | G03-approve-two | Maya reviews Leila and Nina as one revision. |
| 02 | G03-approve-unavailable | The neutral end for missing, ended or inaccessible revision. |
| 03 | G03-approve-reviewing | Review members is reading the current proposed members. |
| 04 | G03-approve-review-failed | That read failed, with Retry. |
| 05 | G05-members-with-proposed | Kitchen table’s five active members, then Leila’s actionable proposed row. |
| 06 | G05-members-with-proposed-decided | The same proposed row is static, without a decision status. |
| 07 | G05-members-proposed-approve | Ben can approve the server-made name revision before activation. |
| 08 | G03-approve-two-dark | Frame 1 in adopted dark tokens. |
| 09 | G03-approve-two-xl | Frame 1 at accessibility 5, scrolled to both candidates. |
| 10 | G05-members-with-proposed-dark | Frame 5 in adopted dark tokens. |
| 11 | G05-members-with-proposed-xl | Frame 5 at accessibility 5, scrolled to Leila and the footer. |

## Fixture boundaries

The requested frame 1 scene has five current members plus two candidates. That totals seven, while the existing ProposeRosterRequest limits active members plus open candidates to six. Frames 1, 8 and 9 retain the brief’s exact names and “5 current members” as layout stress proofs only. They are not valid API fixtures, and their presentation does not authorize a seventh member. Do not relax capacity or silently remove a current member to make the scene pass. A real multi-candidate test must reserve enough places; this handoff does not invent a replacement roster.

Frame 6 illustrates a static proposed row while the proposal remains in the server’s Members response, such as after Maya’s approval. An actual successful decline ends the revision; a fresh response can remove its candidates for everyone. The requirement that approved and declined rows disclose no decision is a presentation rule, not an instruction to preserve a row after its proposal ended. Never keep a stale Leila row merely to force identical screenshots after a decline.

Kitchen table’s Members fixture follows this brief: Ben, Maya, Alex, Sam and Debby, with the familiar Monday–Friday assignments in that order. Its New York zone comes from the repository’s shared fixture zone; that source’s alternate Kitchen table roster is not substituted into this brief. Frame 7 uses only Ben and Debby, the supplied names for the preactivation scene; Debby’s former invitation label and additional people are not invented. Every frame is an independent fixture, not a shared timeline.

## A1. Two or more candidates: G03-approve-two

Adopt the default’s structure. The title is “Invite Leila and Nina?”, followed by “To Kitchen table · 5 current members.” That count is the current members only. Each candidate has one 68-point initial-avatar block, name in personDisplay 28/34 bold and “Proposed by {name}” in metadata 13/18 secondaryText. The text starts 16 after the avatar; proposer is 8 below the name. Blocks are 16 apart in the revision’s order. Leila is proposed by Ben; Nina is proposed by Alex. No candidate photo appears before joining.

Use the existing flow: title-to-context 16, context-to-candidates 32, candidates-to-body 32, body-to-boundary 40 and boundary-to-shield-note 56, measured between line boxes. Heights are intrinsic. The note keeps handoff 4’s surface, shield, 16-point inset, 12-point symbol gap and metadata text. It has no fixed 89-point minimum. A failure line appears 20 below the note and scrolls into view; the content above it does not jump.

The body is “Leila and Nina must accept the exact roster. Every existing member must approve the same roster. Either can happen first.” The boundary is “Leila and Nina will see only drops shared after joining.” The shield note is unchanged: “We don’t identify who declined. Nobody is asked to give a reason.”

There is one Approve Leila and Nina button and one Decline action. Every candidate belongs to the same revision id/version; tapping either action decides the entire exact roster. There is no per-candidate selector, carousel or decision. Use Foundation ListFormatter for two or more names in the title, body, boundary, primary label, action labels and approval failure text. Do not replace names with a numeric count or silently omit the later candidates.

Default-size actions sit in the existing safe-area footer: 50-point minimum primary at y704, then Decline’s 44-point minimum target after a 12-point gap. The pinned group ends 8 above the native safe-area bottom; measured target heights plus the gap determine its top, and the body ends 16 above it. Pin only outside accessibility categories while both labels fit one line. At accessibility sizes, or whenever either label wraps, both actions move to the end of the same scrolling column, so a growing list of names cannot consume the viewport as a pinned footer. Full names, body, boundary, note and actions grow without a text cap. Decorative avatar images stay their component sizes; the separately visible names carry the scalable meaning.

Frame 9 is deliberately scrolled to the candidate blocks to show both at accessibility 5. The title/context remain above and the explanation/actions below in that same document. First arrival starts at the top. This proof does not establish an automatic jump past the explanation.

VoiceOver encounters the heading, context, each candidate summary, body, boundary, note and both actions. A candidate summary reads “Leila. Proposed by Ben.” or “Nina. Proposed by Alex.” Avatars and shield are decorative. Actions read “Approve Leila and Nina joining Kitchen table.” and “Decline Leila and Nina joining Kitchen table.”, the latter with hint “No reason is required.” Both act on the whole roster.

## A2. The approval’s neutral end

Keep the built screen: “This invitation is no longer available.” as utilityTitle, and the system’s Back to Members. Add no line, candidate identity, reason, Retry or second primary action. The one existing way back is sufficient, and extra explanation could imply a cause the server intentionally does not reveal.

Use this identical state when the revision ended, never existed, or is no longer available to this account. Clear its old roster. The title is announced once; the Back control reads “Back to Members”. Back reads the current authorized Members list; if the club is also unavailable, existing navigation closes the club’s screens. Do not restore cached hidden content to explain the failure.

## A3–A4. Review members’ read and failure

Keep the New member native bar and Back to Members. While reading, show “Loading proposed members…” with a decorative native spinner. Its neutral progress role is emptyTitle 25/30 bold in primaryText, as the earlier opening/checking progress forms; the spinner is secondaryText. No candidate, proposer, old roster or synthetic loading row shows during this read.

The read is the current Members response and its open_revision, following the existing B1 model. A successful answer opens the returned revision explicitly with its current id/version and fresh action keys. VoiceOver focuses the new review’s title. Neither Approve nor Decline is replayed. If no eligible revision remains, show the neutral end. If a request fails, do not turn it into an unavailable claim.

| Branch | Exact visible wording | Exact VoiceOver announcement |
|---|---|---|
| Loading | Loading proposed members… | Loading proposed members… |
| No connection / no usable answer | Couldn’t load proposed members. / Check your connection and try again. | Couldn’t load proposed members. Check your connection and try again. |
| Answered nonterminal refusal / server error | Couldn’t load proposed members. / Try again. | Couldn’t load proposed members. Try again. |

The slash above separates title and body; it is not displayed. The failure title is utilityTitle 32/35 bold primaryText; body is body 17/23 regular secondaryText. Retry is the existing 50-point primary footer control. Its label is “Retry” and hint “Try loading proposed members again.” It repeats the read, not a decision. Announce each new progress/failure once politely; keep Back and Retry reachable and do not repeatedly announce a spinner.

## A5–A6. Proposed row in an active club’s Members

Keep current members static, in their stable order with weekday underneath. Maya’s name is “Maya · You”. After the five members, put Leila’s existing proposed row: initial avatar 36, Leila, Proposed by Ben, and the unchanged Proposed pill. The footer remains handoff 4’s two lines: “5 members · New York”, then “7 AM to 1 AM the next morning.” Leila is not counted. Footer stays after the list in the scroll, 32 after the last row.

When Maya’s my_decision is pending, make Leila’s entire row a button with the native trailing disclosure chevron, secondaryText. Its accessible label stays “Leila. Proposed by Ben. Proposed.” and its new hint is “Review the proposed roster for Kitchen table.” The chevron is decorative, never its own target. The row opens G03-approve for the current whole revision. If there are several proposed rows, each reaches that same revision, not a candidate-only action.

After Maya has a recorded decision, keep the same name, proposer, pill, ink, dimensions and reserved trailing text column. Remove the chevron, button trait, action and hint. The combined static element still reads “Leila. Proposed by Ben. Proposed.” It does not say approved, declined, already decided or waiting on anyone. Do not dim it as an unavailable button. The same static presentation applies where the viewer is not eligible to decide. Only the viewer’s own conditional navigation differs; nobody’s decision is exposed to others.

This adopts FQ143’s static-row default. It does not remove the separate authorized proposer’s link-management route already designed for stage 7c: a pending own decision is reviewed first, and the proposer’s later invitation controls remain permission-gated. Maya’s frames are not that case.

At accessibility 5 the row grows for the full name, proposer and Proposed pill; the chevron grows with the native disclosure style. The 36-point decorative avatar aligns to the name’s first line. Frame 11 is scrolled to the proposed row and footer so the affordance and count can be inspected; the full heading/current roster remain in the same scroll above it.

## B1. Where Ben approves the name revision

Keep Review members on G01-pending-approve and H01-awaiting-activation pointing to the proposed-roster review. Frame 7 adds the missing approval pair to that screen, instead of asking Ben to find a second page.

The screen remains unmistakably preactivation: “Proposed roster”, “Sunday people”, and “These names are a proposal, not an active member list.” It lists Ben · You and Debby without weekdays, an active member count, acceptance status, or approval progress. Ben’s own supplied photo is permitted; Debby uses the initial. The earlier name Ben typed is not guessed. This names-only whole-proposal presentation is the existing handoff 5 component; handoff 9’s Proposed tags still belong to candidate rows in active Members and G02 invitation review, not every name in this preactivation list.

Manage invitations stays a creator-only leading text route with hint “Open your invitation list for Sunday people.” Under the roster, show the existing pending explanation and shield note, then Approve roster and Decline. Their labels are “Approve roster for Sunday people.” and “Decline roster for Sunday people.”; Decline keeps the hint “No reason is required.” Manage invitations does not substitute for the decision.

Show this pair only for an authorized existing member whose own decision is pending on the current open revision. FQ84 means Ben’s creation of the earlier roster does not approve the replacement name. Candidate acceptance and member approval can happen in either order; Debby’s earlier action does not bypass Ben’s new review. After Ben’s decision, refresh and follow the actual activation/end state; if still preactivation, this proposal is read-only for Ben’s recorded decision and has no decision pair.

Use the same exact-revision mutation model, idempotency, busy state, inline failure form and native stale/full alerts as G03. On this whole-roster screen the errors say “Couldn’t approve this roster…” or “Couldn’t decline this roster…”; the exact branches are below. At accessibility sizes the complete document and both actions scroll together.

## B2. Decline label and working state

Handoff 5’s label and separate hint stand. Handoff 8 frame 10’s generic “Decline this invitation for…” label is superseded in this scope. For one candidate it is “Decline Leila joining Kitchen table.” with the separate hint “No reason is required.” For the frame’s two candidates it is “Decline Leila and Nina joining Kitchen table.” Preserve “Decline” as a native Voice Control input label. The full accessible name begins with the visible action’s word, just as Approve does.

Decline needs a busy form. Keep its visible label and action ink, adding a native 16-point activity indicator 8 before the measured label. Reserve symmetric accessory slots so the text does not jump; at large text the indicator can use its own reserved row and the target grows. While Decline is out, both decisions are unavailable, Approve keeps its idle primary appearance and has no spinner. Do not falsely show Approve as the action in progress. While Approve is out, its existing busy form is used and Decline remains idle-looking but unavailable.

The initiating control retains its own accessible label/hint and gets value “In progress”. Use one progress-announcement source only: “Declining this roster.” or “Approving this roster.” once as that action starts. Avoid a duplicate native plus manual announcement. A response restores idle actions only if the caller still has a pending decision. Native Back remains governed by the existing request model; leaving cannot undo a mutation that may already have committed.

## B3. The two recovery alerts

Neither alert needs Cancel. These are informational recovery alerts whose single actions are reads/navigation, not confirmation of Approve or Decline. Cancel would dismiss the only recovery over controls known to be stale. There is no consent choice being forced: after the action, Back remains available during the read and on its failure.

| Alert | Exact wording | Single action |
|---|---|---|
| New revision after Approve | Review the updated roster / The members have changed. Review the updated roster before approving. | Review members; VO: Review the updated members of Kitchen table. |
| New revision after Decline | Review the updated roster / The members have changed. Review the updated roster before declining. | Review members; VO: Review the updated members of Kitchen table. |
| Club full during Approve | Kitchen table is full. / Kitchen table already has six members. | See members; VO: See members of Kitchen table. |

Use the existing native alert presentation. Review members reads and shows the new revision without carrying a prior decision or key into it. See members closes back to Members and refreshes; it claims no approval and suggests removing nobody. A version conflict that means the old revision ended still uses the neutral end, not a fabricated “members changed” message.

## B4. A decision that changed nothing: FQ146

Classify the authenticated response, not the requested button. In the stated example, Decline returns Maya’s earlier my_decision=approved for that same revision. The decline did not happen and another Decline cannot change it. Clear the old failure and immediately make both decision controls unavailable.

Show a native informational alert titled “You already approved this roster.” No body or Cancel is needed. Its one action is “See members”, accessible “See members of Kitchen table.” This makes the truth visible before the screen closes, rather than allowing a silent return to suggest Decline succeeded. See members dismisses the alert, closes the approval and reads Members once. Do not leave the stale pair available for further attempts.

If the actual authoritative HTTP 200 instead confirms the caller’s own earlier decline, the title is “You already declined this roster.” The same private return applies. These words are never chosen from another member’s state or cached assumptions. Native alert speech announces the title once; do not post another duplicate announcement. Focus on return belongs to the roster destination’s heading.

If the returned own decision matches the action just attempted, keep the ordinary successful return without this extra alert. If the API answers neutral not-found or a version conflict, keep the existing neutral end; do not infer a recorded own choice from that error. Current decline semantics usually end the revision, so an opposite action after that may follow the version-conflict path rather than the HTTP 200 alert path.

The same already-decided safeguard on frame 7 uses a context-appropriate “Review roster” action, accessible “Review the proposed roster for Sunday people.” It refreshes the proposed roster read-only for the saved own decision, or follows authoritative activation/end state. It must not label a preactivation list as active Members.

This changes FQ146’s default only for the confirmed already-decided outcome. Keep one idempotency key per action/revision and reuse it for a retry of the same intent. An opposite action has its own key. A fresh revision gets new keys and a fresh review. No loop, replacement refusal string or automatic opposite mutation is introduced.

## Exact decision-failure words

These remain ordinary uncertain/network or refused operations, distinct from the confirmed-own-decision alert. Announce the exact line once, politely, keep the reviewed roster, and retain both idle actions if the decision remains pending. Use the existing exclamationmark.circle and metadata/destructive inline component 20 after the note, within the scroll; its glyph is decorative. Do not change which roster is shown or claim a decision was saved on a failed response.

| Screen / action | No connection or no usable answer | Answered refusal |
|---|---|---|
| G03 Approve, two candidates | Couldn’t approve Leila and Nina. Check your connection and try again. | Couldn’t approve Leila and Nina. Try again. |
| G03 Decline | Couldn’t decline this invitation. Check your connection and try again. | Couldn’t decline this invitation. Try again. |
| G05 proposed roster: Approve | Couldn’t approve this roster. Check your connection and try again. | Couldn’t approve this roster. Try again. |
| G05 proposed roster: Decline | Couldn’t decline this roster. Check your connection and try again. | Couldn’t decline this roster. Try again. |

One-candidate G03 Approve substitutes “Leila”; any longer candidate list uses the same locale-formatted names. Retrying keeps that action’s original key/revision and reconciles uncertain outcomes. Only a fresh explicit review can change the target roster.

## C. Handoff 9’s three row questions

Keep the current native build’s symbol growth. The accepted invitation envelope and chevron grow with Dynamic Type as Private drafts’ folder and chevron do. Neither row freezes its symbols near default at accessibility sizes. Use the same existing semantic UIFontMetrics policies as the built Drafts entry rather than a new multiplier or palette token. The given accessibility 5 ink bounds, about 56 × 40 for the envelope and 16.5 × 30 for the chevron, are useful references, not fixed boxes to force across iOS versions. Grow the leading/accessory columns and whole row so symbols do not overlap or compress the names. Symbols remain decorative; the whole row is one button. This supersedes only handoff 9’s small illustrative AX glyphs.

Private drafts moves nowhere. Use the same handoff 7/current built component on G06-no-club and beneath accepted invitations: row x20, width 353, existing 16-point internal leading inset and title origin x76. Do not add or remove 4 points conditionally to make it align with another row’s words. The frame’s font ink bounds and the native symbol bounds need not match exactly; preserve the shared component’s layout anchors. No new invitation-only inset branch is introduced.

Keep accepted invitation rows without an inviter-name line, as built. Their visible and spoken content remains club name, current state and the missing-link helper only when applicable. These are already accepted, account-owned invitations; the row is a return route to their club/status. The inviter stays on the authorized invitation review/status destination where already specified. The mere presence of inviter_name in the DTO does not require another row line. Nothing is guessed or added to VoiceOver.

## Verification and limits

The pack validates exact 11-frame order/titles; SVG/PNG sizes; outlined typography and supplied fonts; byte-identical brand tokens/assets; cumulative earlier JSON entries; key references and curly apostrophes; minimum 44-point targets and native navigation names; no identity/cause on neutral/review loading failures; candidate order and revision-wide actions; footer counts excluding proposals; pending/static row affordances; and note/action separation. It renders the PDF and inspects every screen proof, including dark and AX5 variants.

Static design checks do not prove actual UIKit/SwiftUI system-font metrics, screen-reader announcements or server races. The implementation still needs native snapshots and VoiceOver checks, same-account/revision idempotency and late-response isolation, and the stated lost-Approve-then-Decline recovery. Do not run the seven-person stress scene as a valid API fixture. No request or consent behavior in this handoff expands membership, hidden-media access or access before joining.
