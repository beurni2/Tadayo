import SwiftUI
import TadayoCore
import TadayoDesign

/// What G03-approve does: decide on the roster shown, and the two alerts' actions.
struct ApproveActions {
    var approve: @MainActor () async -> Void = {}
    var decline: @MainActor () async -> Void = {}
    var reviewMembers: @MainActor () async -> Void = {}
    var seeMembers: @MainActor () -> Void = {}
}

/// The approval as a club tab's stack shows it, bound to its model (`ClubDetailsModel.approval`):
/// the screen follows the model's state, its action out, its failure and its alert as they
/// change. Once the model is finished (a decision, or the See members of the full club's alert or
/// of the already decided one) the tabs are told, once, and close it back to Members; while it
/// slides away it keeps drawing the last roster it showed, both actions waiting.
struct ApproveDestination: View {
    @Bindable var model: RosterApprovalModel
    let close: @MainActor () -> Void
    @State private var drawn: RosterRevision? = nil

    var body: some View {
        ApproveScreen(
            state: model.state, busy: model.busy, failed: model.failed, alert: $model.alert,
            club: model.club, lastShown: drawn,
            actions: ApproveActions(
                approve: { await model.approve() }, decline: { await model.decline() },
                reviewMembers: { await model.reviewMembers() }, seeMembers: { model.seeMembers() })
        )
        .onChange(of: model.revision, initial: true) { _, shown in
            if let shown { drawn = shown }
        }
        .onChange(of: model.state == .finished) { _, finished in
            if finished { close() }
        }
    }
}

/// G03-approve and G03-approve-failed (handoff 4's frame and handoff 8's frame 10;
/// `docs/plans/ios-b1-approve.md` section 2), pushed from Members with the inline title "New
/// member", the system's Back and no tab bar, as both frames draw it:
/// - "Invite {name}?" in `utilityTitle` 32/35, as a heading, 20 under the bar (`SetupScroll`);
/// - 20 under it, "To {clubName} · {n} current members" in `metadata` `secondaryText`, `n`
///   counting the revision's members, never its candidates (handoff 4's `approvalContext`:
///   `currentMemberCountIncludesCandidate: false`);
/// - 32 under that, the candidate: the 68-point avatar with the initial (a candidate has no
///   photograph before joining, FQ47), 16 before the name in `personDisplay` 28/34 and, 8 under
///   it, "Proposed by {name}" in `metadata` `secondaryText`, the two centred on the avatar, as
///   drawn, until the accessibility sizes, where they keep level with its top. VoiceOver reads
///   the name and the proposer as one element;
/// - 32 under that, "{name} must accept the exact roster. …" in `body` `primaryText`, and 40
///   under it "{name} will see only drops shared after joining." in `body` `secondaryText` (FQ20);
/// - 56 under that, the shield's note (`ShieldNote`): "We don’t identify who declined. Nobody is
///   asked to give a reason." (book p30);
/// - 20 under the note, a failed action's line (frame 10), which the column is scrolled to as it
///   shows, and VoiceOver reads once, politely, with its focus left where it was;
/// - in the footer, Approve {name}, the primary, and Decline 12 under it, 8 above the safe area
///   (handoff 10's `approvalRevision.actions`). Both wait while either is out, the one out busy
///   (`decisionBusy`). At the accessibility sizes, or wherever Approve's words don't fit on one
///   line in the button, the two follow the note (or a failure's line) in the same column, 24
///   under it, so a wrapped list of names is never pinned over the roster
///   (`approvalRevision.actions.large`).
///
/// The spacings are handoff 8's frame 10, the later frame of this screen, on the scale; handoff
/// 4's frame draws the boundary 12 and the note 21 lower (its `approvalNote.frameTop` 532 against
/// frame 10's 511). One layout serves both, so a failure's line moves nothing above it.
///
/// A revision with two or more candidates has no frame (FQ144's default, built from spec): one
/// candidate's block each, 16 apart, in the revision's order, and the title, the words and the
/// actions naming them all, joined as the phone's own list words them ("Leila and Nina").
///
/// Nothing on it counts approvals or says who else decided or hasn't (T15, T33), and a decline
/// names nobody (book p30). The approval's own outcomes are the system's alerts (handoff 8, and
/// handoff 10's `alreadyDecided`; `ApprovalAlerts`): the roster changed, with Review members, the
/// club full, with See members, and the viewer's own earlier decision (FQ146), with See members.
/// Review members reads the members again, in handoff 10's frame 3 loading form and the proposed
/// members' failure form (handoff 8's `load.proposed`), and shows the revision they now list.
/// "This invitation is no longer available." (handoff 8's `approval.unavailable`) is the neutral
/// end: a revision that ended, one that never was and one the caller can't see read the same
/// (T14); Back returns to Members.
struct ApproveScreen: View {
    let state: RosterApprovalModel.State
    var busy: RosterApprovalModel.Action?
    var failed: RosterApprovalModel.Failed?
    @Binding var alert: RosterApprovalModel.Alert?
    let club: ClubRef
    /// What `.finished` draws while the screen slides away.
    var lastShown: RosterRevision?
    var actions = ApproveActions()
    @AccessibilityFocusState private var titleFocused: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Whether Approve's words fit on one line in the pinned button (`OneLineProbe`).
    @State private var approveFits = true

    /// The failed action's line, which the column is scrolled to as it shows.
    private static let failureID = "approve.failure"

    init(
        state: RosterApprovalModel.State, busy: RosterApprovalModel.Action? = nil,
        failed: RosterApprovalModel.Failed? = nil, alert: Binding<RosterApprovalModel.Alert?>,
        club: ClubRef, lastShown: RosterRevision? = nil, actions: ApproveActions = ApproveActions()
    ) {
        self.state = state
        self.busy = busy
        self.failed = failed
        _alert = alert
        self.club = club
        self.lastShown = lastShown
        self.actions = actions
    }

    var body: some View {
        content
            .navigationTitle(Text("approve.nav"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .modifier(
                ApprovalAlerts(
                    alert: $alert, club: club, returnsTo: .members,
                    reviewMembers: actions.reviewMembers, seeMembers: actions.seeMembers)
            )
            // A newer roster after Review members: VoiceOver's focus goes to its title, so it
            // isn't left on the loading words that are gone.
            .onChange(of: revision?.id) { old, new in
                if old == nil, new != nil { titleFocused = true }
            }
    }

    private var revision: RosterRevision? {
        if case .deciding(let revision) = state { revision } else { nil }
    }

    /// The roster drawn and whether both actions wait for good: the one to decide on; under the
    /// alert saying the viewer's own decision (FQ146); or the last one shown as the screen slides
    /// away. One branch draws all three, so the column keeps its place as the state moves on.
    private var drawn: (revision: RosterRevision, closing: Bool)? {
        switch state {
        case .deciding(let revision): (revision: revision, closing: false)
        case .decided(let revision, _): (revision: revision, closing: true)
        case .finished: lastShown.map { (revision: $0, closing: true) }
        case .reviewing, .reviewFailed, .unavailable: nil
        }
    }

    @ViewBuilder private var content: some View {
        if let drawn {
            deciding(drawn.revision, closing: drawn.closing)
        } else {
            others
        }
    }

    @ViewBuilder private var others: some View {
        switch state {
        case .deciding, .decided:
            EmptyView()
        case .finished:
            Palette.canvas.ignoresSafeArea()
        case .reviewing:
            // Handoff 10's frame 3: G02-opening's wait, with the proposed members' words.
            InvitationWait(words: String(localized: "load.proposed.loading"), checksFirst: false)
        case .reviewFailed(let failure):
            ClubLoadFailure(
                title: "load.proposed.title", failure: failure == .network ? .network : .refused,
                retryHint: "load.proposed.retryHint", retry: actions.reviewMembers)
        case .unavailable:
            SetupScroll {
                Text("approve.unavailable")
                    .textRole(.utilityTitle)
                    .foregroundStyle(Palette.primaryText)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .announcing(String(localized: "approve.unavailable"), initial: true)
        }
    }

    private func deciding(_ revision: RosterRevision, closing: Bool) -> some View {
        let line = failed.map { ApproveWords.failure($0, revision) }
        let inColumn = dynamicTypeSize.isAccessibilitySize || !approveFits
        return ScrollViewReader { scroll in
            SetupScroll {
                Text(verbatim: ApproveWords.title(revision))
                    .textRole(.utilityTitle)
                    .foregroundStyle(Palette.primaryText)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($titleFocused)
                Text(verbatim: ApproveWords.context(revision))
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xl)
                VStack(alignment: .leading, spacing: Spacing.l) {
                    ForEach(revision.candidates) { candidate in
                        CandidateIdentity(candidate: candidate)
                    }
                }
                .padding(.top, Spacing.xxxl)
                Text(verbatim: ApproveWords.body(revision))
                    .textRole(.body)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xxxl)
                Text(verbatim: ApproveWords.boundary(revision))
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xxxl + Spacing.s)
                ShieldNote(Text("approve.note"))
                    .padding(.top, Spacing.xxxl + Spacing.xxl)
                if let line {
                    InlineError(Text(verbatim: line))
                        .padding(.top, Spacing.xl)
                        .id(Self.failureID)
                }
                if inColumn {
                    // At the accessibility sizes, or where Approve's words wrap, the actions
                    // follow in the same column (handoff 10's `approvalRevision.actions.large`).
                    VStack(spacing: Spacing.m) { actionPair(revision, closing: closing) }
                        .padding(.top, Spacing.xxl)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !inColumn {
                    SetupFooter(bottom: Spacing.s, spacing: Spacing.m) {
                        actionPair(revision, closing: closing)
                    }
                }
            }
            .background(alignment: .top) {
                OneLineProbe(words: ApproveWords.approve(revision), fits: $approveFits)
            }
            // From the first draw too: a line the approval kept when Members opened it again
            // would otherwise start under the pinned actions, as on the proposed roster.
            .onChange(of: line, initial: true) { _, shown in
                guard shown != nil else { return }
                scroll.scrollTo(Self.failureID, anchor: .bottom)
                // Again in the main queue's next turn, once the line has its place.
                DispatchQueue.main.async { scroll.scrollTo(Self.failureID, anchor: .bottom) }
            }
        }
        .announcing(line, politely: true)
        // Once, as a decision starts (handoff 10's `decisionBusy.a11y`); the action out has the
        // value "In progress" too.
        .announcing(busy.map(ApproveWords.busy), politely: true)
    }

    /// Approve {name}, the primary, and Decline under it, each deciding the whole revision. Both
    /// wait while either is out, the one out busy (handoff 10's `decisionBusy`) and the other
    /// keeping its idle look, unavailable; under the already decided alert and while the screen
    /// slides away both are unavailable in the disabled look.
    @ViewBuilder private func actionPair(_ revision: RosterRevision, closing: Bool) -> some View {
        Button {
            Task { await actions.approve() }
        } label: {
            Text(verbatim: ApproveWords.approve(revision))
        }
        .buttonStyle(.tadayoPrimary(isBusy: busy == .approve, waits: busy != nil))
        .disabled(busy != nil || closing)
        // Handoff 8's `approve.vo`, with Voice Control still answering to the words it shows
        // (WCAG 2.5.3, as Done for now does).
        .accessibilityLabel(Text(verbatim: ApproveWords.approveSpoken(revision)))
        .accessibilityInputLabels([Text(verbatim: ApproveWords.approve(revision))])
        Button {
            Task { await actions.decline() }
        } label: {
            Text("approve.decline")
        }
        .buttonStyle(.tadayoTextUnderPrimary(isBusy: busy == .decline, waits: busy != nil))
        .disabled(busy != nil || closing)
        .accessibilityLabel(Text(verbatim: ApproveWords.declineSpoken(revision)))
        .accessibilityHint(Text("approve.decline.hint"))
        .accessibilityInputLabels([Text("approve.decline")])
    }
}

/// Whether `words` fit on one line in the pinned primary button at this screen's width, between
/// the button's two busy slots (`PrimaryButtonFace`: the screen's inset, then the button's 16 and
/// its 24-point slots on each side), as Approve {names} must for the actions to be pinned (handoff
/// 10's `approvalRevision.actions.large`: "whenever either action label wraps"). Decline's one
/// word wraps only at the accessibility sizes, which put the actions in the column already. It
/// draws nothing and says nothing.
private struct OneLineProbe: View {
    let words: String
    @Binding var fits: Bool

    var body: some View {
        ViewThatFits(in: .horizontal) {
            Text(verbatim: words)
                .textRole(.button)
                .fixedSize()
                .padding(.horizontal, Spacing.l + Size.busySlot)
            // Chosen only when the words don't fit: no height.
            Color.clear.frame(width: 0, height: 0)
        }
        .background {
            GeometryReader { probe in
                Color.clear.onChange(of: probe.size.height > 0, initial: true) { _, one in
                    fits = one
                }
            }
        }
        .padding(.horizontal, Spacing.inset)
        .hidden()
        .accessibilityHidden(true)
    }
}

/// The approval's own outcomes as the system's alerts (handoff 8, "Changed roster and full club
/// outcomes"), on G03-approve and on the proposed roster where the creator decides (FQ145): "Review
/// the updated roster", with the action's own body and Review members, and "{clubName} is full.",
/// with See members, each with one action, spoken with the club's name. An answer holding the
/// viewer's own other decision (FQ146, handoff 10's `alreadyDecided`) is "You already approved
/// this roster." or "You already declined this roster.", with no body and one action that returns:
/// See members on G03-approve, Review roster on the proposed roster, each spoken with the club's
/// name. None has a Cancel: each action reads or returns, and decides nothing. The title stays
/// while the alert animates away after `alert` is cleared.
struct ApprovalAlerts: ViewModifier {
    /// Where the already decided alert's action returns.
    enum Return {
        /// G03-approve's See members: back to Members, read again.
        case members
        /// The proposed roster's Review roster: the roster read again.
        case proposedRoster
    }

    @Binding var alert: RosterApprovalModel.Alert?
    let club: ClubRef
    let returnsTo: Return
    let reviewMembers: @MainActor () async -> Void
    let seeMembers: @MainActor () -> Void
    /// The alert last shown.
    @State private var titled: RosterApprovalModel.Alert?

    func body(content: Content) -> some View {
        content
            .alert(
                Text(
                    verbatim: (alert ?? titled).map { ApproveWords.alertTitle($0, club: club) }
                        ?? ""),
                isPresented: Binding(get: { alert != nil }, set: { if !$0 { alert = nil } }),
                presenting: alert
            ) { shown in
                Button {
                    switch shown {
                    case .rosterChanged: Task { await reviewMembers() }
                    case .clubFull, .alreadyDecided: seeMembers()
                    }
                } label: {
                    Text(verbatim: ApproveWords.alertAction(shown, returnsTo: returnsTo))
                }
                .accessibilityLabel(
                    Text(
                        verbatim: ApproveWords.alertActionSpoken(
                            shown, club: club, returnsTo: returnsTo)))
            } message: { shown in
                if let body = ApproveWords.alertBody(shown, club: club) {
                    Text(verbatim: body)
                }
            }
            .onChange(of: alert, initial: true) { _, shown in
                if let shown { titled = shown }
            }
    }
}

/// One candidate on G03-approve: the 68-point avatar with the initial, 16 before the name in
/// `personDisplay` 28/34 `primaryText` and, 8 under it, "Proposed by {name}" in `metadata`
/// `secondaryText`, centred on the avatar, as drawn, until the accessibility sizes, where the
/// words keep level with its top. The avatar keeps its size (`dynamicTypePolicy.avatarMarks`).
/// VoiceOver reads one element: the name, then who proposed them.
struct CandidateIdentity: View {
    let candidate: Candidate
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: Spacing.l) {
            Avatar(name: candidate.name, size: .profile)
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text(verbatim: candidate.name)
                    .textRole(.personDisplay)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                Text(
                    verbatim: ApproveWords.words(
                        "approve.proposer", candidate.proposedBy.displayName)
                )
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// G03-approve's words, from handoff 4's, 5's and 8's copy keys, with the revision's names in
/// them: one candidate's name, or every candidate's joined as the phone's own list words them
/// (FQ144's default).
enum ApproveWords {
    /// "Leila", or "Leila and Nina".
    static func names(_ revision: RosterRevision) -> String {
        revision.candidates.map(\.name).formatted(.list(type: .and))
    }

    /// "Invite Leila?"
    static func title(_ revision: RosterRevision) -> String {
        words("approve.title", names(revision))
    }

    /// "To Kitchen table · 5 current members", counting the members, never the candidates.
    static func context(_ revision: RosterRevision) -> String {
        let members = revision.members.count
        let count =
            members == 1
            ? String(localized: "invitation.roster.count.one")
            : String(format: String(localized: "invitation.roster.count.other"), members)
        return words("approve.context", revision.club.name, count)
    }

    static func body(_ revision: RosterRevision) -> String {
        words("approve.body", names(revision))
    }

    static func boundary(_ revision: RosterRevision) -> String {
        words("approve.boundary", names(revision))
    }

    /// "Approve Leila"
    static func approve(_ revision: RosterRevision) -> String {
        words("approve.primary", names(revision))
    }

    /// "Approve Leila joining Kitchen table." (handoff 8's `approve.vo`)
    static func approveSpoken(_ revision: RosterRevision) -> String {
        words("approve.primary.vo", names(revision), revision.club.name)
    }

    /// "Decline Leila joining Kitchen table." (handoff 5's `a11y.decline`, which replaced handoff
    /// 4's at the founder's brief; its hint says "No reason is required.")
    static func declineSpoken(_ revision: RosterRevision) -> String {
        words("approve.decline.vo", names(revision), revision.club.name)
    }

    /// Frame 10's line: the network's, or any other failure's "Try again." (handoff 8's
    /// `approve.failed` and `decline.failed`). A decline's names nobody.
    static func failure(_ failed: RosterApprovalModel.Failed, _ revision: RosterRevision) -> String
    {
        switch (failed.action, failed.failure) {
        case (.approve, .network): words("approve.failed.network", names(revision))
        case (.approve, .other): words("approve.failed.refused", names(revision))
        case (.decline, .network): String(localized: "decline.failed.network")
        case (.decline, .other): String(localized: "decline.failed.refused")
        }
    }

    static func alertTitle(_ alert: RosterApprovalModel.Alert, club: ClubRef) -> String {
        switch alert {
        case .rosterChanged: String(localized: "approve.changed.title")
        case .clubFull: words("approve.full.title", club.name)
        case .alreadyDecided(.approve): String(localized: "approve.already.approved")
        case .alreadyDecided(.decline): String(localized: "approve.already.declined")
        }
    }

    /// The alert's body; the already decided alert has none.
    static func alertBody(_ alert: RosterApprovalModel.Alert, club: ClubRef) -> String? {
        switch alert {
        case .rosterChanged(.approve): String(localized: "approve.changed.body.approve")
        case .rosterChanged(.decline): String(localized: "approve.changed.body.decline")
        case .clubFull: words("approve.full.body", club.name)
        case .alreadyDecided: nil
        }
    }

    static func alertAction(
        _ alert: RosterApprovalModel.Alert, returnsTo: ApprovalAlerts.Return
    ) -> String {
        switch (alert, returnsTo) {
        case (.rosterChanged, _): String(localized: "approve.changed.action")
        case (.clubFull, _): String(localized: "approve.full.action")
        case (.alreadyDecided, .members): String(localized: "approve.already.action")
        case (.alreadyDecided, .proposedRoster): String(localized: "proposed.already.action")
        }
    }

    static func alertActionSpoken(
        _ alert: RosterApprovalModel.Alert, club: ClubRef, returnsTo: ApprovalAlerts.Return
    ) -> String {
        switch (alert, returnsTo) {
        case (.rosterChanged, _): words("approve.changed.action.vo", club.name)
        case (.clubFull, _): words("approve.full.action.vo", club.name)
        case (.alreadyDecided, .members): words("approve.already.action.vo", club.name)
        case (.alreadyDecided, .proposedRoster): words("proposed.already.action.vo", club.name)
        }
    }

    /// "Approving this roster." or "Declining this roster.", said once as the decision starts
    /// (handoff 10's `approval.approve.busy.announcement` and `.decline.busy.announcement`).
    static func busy(_ action: RosterApprovalModel.Action) -> String {
        switch action {
        case .approve: String(localized: "approve.busy.approve")
        case .decline: String(localized: "approve.busy.decline")
        }
    }

    /// A catalog entry's words with the values in it.
    static func words(_ key: String.LocalizationValue, _ values: String...) -> String {
        String(format: String(localized: key), arguments: values)
    }
}
