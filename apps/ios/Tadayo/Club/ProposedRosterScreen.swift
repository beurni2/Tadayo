import SwiftUI
import TadayoCore
import TadayoDesign

/// What the proposed roster does: read it again, decide on it while the viewer's decision is
/// pending, answer the approval's alerts, and open the setup list.
struct ProposedRosterActions {
    var retry: @MainActor () async -> Void = {}
    var approve: @MainActor () async -> Void = {}
    var decline: @MainActor () async -> Void = {}
    var reviewMembers: @MainActor () async -> Void = {}
    var seeMembers: @MainActor () -> Void = {}
    var manage: @MainActor () -> Void = {}
}

/// The proposed roster as a tab's stack shows it, bound to its model (`RootModel.proposedRoster`):
/// it reads the roster once each time it's pushed, and follows the model's roster, its approval's
/// action out, failure and alert as they change.
struct ProposedRosterDestination: View {
    let model: ProposedRosterModel
    let manage: @MainActor () -> Void
    @State private var asked = false

    var body: some View {
        ProposedRosterScreen(
            shown: asked ? model.shown : .loading, busy: model.approval?.busy,
            failed: model.approval?.failed, decided: model.approval?.isDecided ?? false,
            alert: Binding(get: { model.approval?.alert }, set: { model.approval?.alert = $0 }),
            actions: ProposedRosterActions(
                retry: { await model.retry() }, approve: { await model.approve() },
                decline: { await model.decline() }, reviewMembers: { await model.reviewMembers() },
                seeMembers: { Task { await model.seeMembers() } }, manage: manage),
            club: model.club
        )
        .task {
            guard !asked else { return }
            asked = true
            await model.load()
            if Task.isCancelled { asked = false }
        }
    }
}

/// G05-members-proposed (handoff 5's frame, with handoff 6's words, X-09), pushed from Review
/// members on H01-awaiting-activation and G01-pending with the inline title "Members", the
/// system's Back and no tab bar:
/// - "Proposed roster" in `utilityTitle` 32/35, as a heading, 20 under the bar (`SetupScroll`);
/// - 12 under it, the club's name in `row` 17/22 `primaryText`;
/// - 12 under that, "These names are a proposal, not an active member list." in `body`
///   `secondaryText` (book p33);
/// - 32 under that, one `RosterRow` per person in the server's order, the name alone: "Ben · You"
///   for the viewer, the others by name, each with the initial (the viewer's photograph waits for
///   avatars to be read, as on Home). No weekday, status, tag or count, and nothing about who has
///   accepted (handoff 5's brief, item 6; T7, T15, T33). VoiceOver reads each row's name;
/// - Manage invitations, the primary, pinned 44 above the safe area as the frame draws it (724 to
///   774), with the hint "Open your invitation list for {clubName}.", which opens the setup list
///   (`G01-invite-people`), the only place a link's state shows. Only the creator reaches this
///   screen: a club that hasn't started has no other member (spec 04).
///
/// The gaps are the frame's on the scale: its glyphs put the club's name and the line about 12.5
/// under the lines above them, and the first row about 28.5 under the line, whose nearest step is
/// 32 (handoff 5's V-17).
///
/// While the viewer's own decision on the open revision is pending, the screen is
/// G05-members-proposed-approve (handoff 10's frame 7; FQ145): the same column, with the first row
/// 24 under the line as frame 7 draws it, then Manage invitations as a leading text action 24 under
/// it, "Review and approve the updated roster before {clubName} can start." 24 under its target in
/// `body` `secondaryText`, G03-approve's shield note 24 under that, and a failed action's line 20
/// under the note, said once, politely, the column scrolled to it. Approve roster, the primary, and
/// Decline under it are pinned as G03-approve's are (704 and 766 in the frame), and follow the note
/// in the same column at the accessibility sizes. Each decides the whole revision: VoiceOver reads
/// "Approve roster for {clubName}." and "Decline roster for {clubName}.", hinted "No reason is
/// required.", and a failure says "this roster" (`handoff10.proposed.*`). Both wait while either is
/// out, Approve busy. Review members' read, after a changed roster, shows this screen's loading and
/// failure forms. Once the approval is done with its revision (a decision, See members, or a
/// revision that ended) the roster is read again, in the loading form, and shows what is true now;
/// a club that started closes the screen, and the club list is read again. Whenever the roster
/// replaces the loading form, VoiceOver's focus goes to the title.
///
/// While it loads, the proposed members' loading form, its label said once; after a failure,
/// frame 11's form with the proposed members' words and Retry (handoff 8's `load.proposed`).
struct ProposedRosterScreen: View {
    let shown: ProposedRosterModel.Shown
    var busy: RosterApprovalModel.Action?
    var failed: RosterApprovalModel.Failed?
    /// The answer held the viewer's own other decision (FQ146): both actions wait under the alert.
    var decided = false
    @Binding var alert: RosterApprovalModel.Alert?
    var actions = ProposedRosterActions()
    let club: ClubRef
    @AccessibilityFocusState private var titleFocused: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// The failed action's line, which the column is scrolled to as it shows.
    private static let failureID = "proposed.failure"

    var body: some View {
        content
            .navigationTitle(Text("proposed.nav"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .modifier(
                ApprovalAlerts(
                    alert: $alert, club: club, returnsTo: .proposedRoster,
                    reviewMembers: actions.reviewMembers, seeMembers: actions.seeMembers)
            )
            // The roster in place of the loading form (after the first read, Review members' or
            // the one after a decision): VoiceOver's focus goes to the title, so it isn't left on
            // the loading words that are gone.
            .onChange(of: isLoading) { was, now in
                if was, !now, case .roster = shown { titleFocused = true }
            }
    }

    private var isLoading: Bool { shown == .loading }

    @ViewBuilder private var content: some View {
        switch shown {
        case .loading:
            // Handoff 10's frame 3: G02-opening's wait, with the proposed members' words.
            InvitationWait(words: String(localized: "load.proposed.loading"), checksFirst: false)
        case .failed(let failure):
            ClubLoadFailure(
                title: "load.proposed.title", failure: failure,
                retryHint: "load.proposed.retryHint", retry: actions.retry)
        case .roster(let roster):
            loaded(roster)
        }
    }

    private func loaded(_ roster: ProposedRoster) -> some View {
        let line = roster.deciding.flatMap { _ in failed.map(Self.failure) }
        return ScrollViewReader { scroll in
            SetupScroll {
                Text("proposed.title")
                    .textRole(.utilityTitle)
                    .foregroundStyle(Palette.primaryText)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($titleFocused)
                Text(verbatim: roster.club.name)
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.m)
                Text("proposed.body")
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.m)
                VStack(spacing: 0) {
                    ForEach(roster.entries) { entry in
                        RosterRow(name: entry.name, isViewer: entry.isYou, days: nil)
                    }
                }
                .padding(.top, roster.deciding == nil ? Spacing.xxxl : Spacing.xxl)
                if roster.deciding != nil {
                    decision(line: line)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if roster.deciding == nil {
                    SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                        manage.buttonStyle(.tadayoPrimary)
                    }
                } else if !dynamicTypeSize.isAccessibilitySize {
                    SetupFooter(bottom: Spacing.s, spacing: Spacing.s) { decisionActions }
                }
            }
            // From the first draw too: a line the approval kept when the roster was opened again
            // would otherwise start under the pinned actions.
            .onChange(of: line, initial: true) { _, shown in
                guard shown != nil else { return }
                scroll.scrollTo(Self.failureID, anchor: .bottom)
                // Again in the main queue's next turn, once the line has its place.
                DispatchQueue.main.async { scroll.scrollTo(Self.failureID, anchor: .bottom) }
            }
        }
        .announcing(line, politely: true)
        // Once, as a decision starts (handoff 10's `decisionBusy.a11y`).
        .announcing(busy.map(ApproveWords.busy), politely: true)
    }

    /// Manage invitations: the setup list, the only place a link's state shows.
    private var manage: some View {
        Button(action: actions.manage) {
            Text("proposed.manage")
        }
        .disabled(busy != nil)
        .accessibilityHint(Text(verbatim: ApproveWords.words("proposed.manage.hint", club.name)))
    }

    /// The creator's decision under the list (handoff 10's frame 7): Manage invitations as a
    /// leading text action 24 under the last row, the explanation 24 under its target, the shield
    /// note 24 under that, then a failure's line 20 under the note; at the accessibility sizes
    /// the actions follow, 24 under, in the same column.
    @ViewBuilder private func decision(line: String?) -> some View {
        manage
            .buttonStyle(.tadayoText)
            .padding(.top, Spacing.xxl)
        Text(verbatim: ApproveWords.words("proposed.reviewRequired", club.name))
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxl)
        ShieldNote(Text("approve.note"))
            .padding(.top, Spacing.xxl)
        if let line {
            InlineError(Text(verbatim: line))
                .padding(.top, Spacing.xl)
                .id(Self.failureID)
        }
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: Spacing.s) { decisionActions }
                .padding(.top, Spacing.xxl)
        }
    }

    /// Approve roster, the primary, and Decline under it, each deciding the whole revision, with
    /// handoff 10's spoken names (`handoff10.proposed.approve.vo`, `.decline.vo`) and Voice
    /// Control still answering to the words they show (WCAG 2.5.3). Both wait while either is
    /// out, the one out busy and the other keeping its idle look (handoff 10's `decisionBusy`),
    /// and under the already decided alert (FQ146).
    @ViewBuilder private var decisionActions: some View {
        let name = club.name
        Button {
            Task { await actions.approve() }
        } label: {
            Text("proposed.approve")
        }
        .buttonStyle(.tadayoPrimary(isBusy: busy == .approve, waits: true))
        .disabled(busy != nil || decided)
        .accessibilityLabel(Text(verbatim: ApproveWords.words("proposed.approve.vo", name)))
        .accessibilityInputLabels([Text("proposed.approve")])
        Button {
            Task { await actions.decline() }
        } label: {
            Text("approve.decline")
        }
        .buttonStyle(.tadayoTextUnderPrimary(isBusy: busy == .decline, waits: true))
        .disabled(busy != nil || decided)
        .accessibilityLabel(Text(verbatim: ApproveWords.words("proposed.decline.vo", name)))
        .accessibilityHint(Text("approve.decline.hint"))
        .accessibilityInputLabels([Text("approve.decline")])
    }

    /// A failed decision's line in this roster's own words (handoff 10's
    /// `handoff10.proposed.failed.*`): "Couldn’t approve this roster." and the rest.
    static func failure(_ failed: RosterApprovalModel.Failed) -> String {
        switch (failed.action, failed.failure) {
        case (.approve, .network): String(localized: "proposed.failed.approve.network")
        case (.approve, .other): String(localized: "proposed.failed.approve.refused")
        case (.decline, .network): String(localized: "proposed.failed.decline.network")
        case (.decline, .other): String(localized: "proposed.failed.decline.refused")
        }
    }
}
