import SwiftUI
import TadayoCore
import TadayoDesign

/// What the invitation's screen does: check the link again, accept the roster shown, and leave
/// (Not now, Done and Close invitation, which grant nothing: handoff 1).
struct InvitationScreenActions {
    var retry: @MainActor () async -> Void = {}
    var accept: @MainActor () async -> Void = {}
    var leave: @MainActor () -> Void = {}
}

/// One invitation, in each of its model's states (`InvitationModel.State`;
/// `docs/plans/ios-b1-invitation.md` section 5), pushed over the paste step with the inline title
/// "Invitation", the system's Back and no tab bar, as every frame draws it:
/// - `G02-checking` and `G02-opening`: what's going on and nothing of the club, its inviter or its
///   roster before the server has answered (`InvitationWait`);
/// - `G02-checking-failed` (handoff 9's frame 1): what failed, with Retry, which stays in place,
///   busy, while it checks again (`InvitationCheckFailure`), and never that the link no longer
///   works (handoff 4);
/// - `G02-invitation`, `G02-changed` and `G02-changed-name`: the exact roster, with Accept this
///   roster and Not now (`InvitationRosterScreen`);
/// - `G03-waiting`, with Done (`InvitationWaiting`);
/// - `G02-expired`, `G02-full`, `G02-revoked` and `G03-declined`: what happened, and Close
///   invitation (`InvitationEnded`).
///
/// `.reopenLink` is the club list's (6d), which sends the person to I have an invite (FQ136):
/// nothing in 6b makes it, so it shows only the canvas.
///
/// When the check answers, VoiceOver's focus moves to the new screen's title, so it isn't left on
/// words that are gone.
struct InvitationScreen: View {
    let state: InvitationModel.State
    var isAccepting = false
    var acceptFailure: InvitationModel.Failure?
    /// The tab Close invitation returns to, for its hint.
    var returnsTo: LocalizedStringResource = "tabs.home"
    var actions = InvitationScreenActions()
    @AccessibilityFocusState private var titleFocused: Bool
    /// The failure a Retry is checking again after: its screen stays, Retry busy, so the focus
    /// stays on Retry (handoff 9: "On Retry keep focus on its initiating control").
    @State private var retryingAfter: InvitationModel.Failure?

    init(
        state: InvitationModel.State, isAccepting: Bool = false,
        acceptFailure: InvitationModel.Failure? = nil,
        returnsTo: LocalizedStringResource = "tabs.home",
        actions: InvitationScreenActions = InvitationScreenActions(),
        retryingAfter: InvitationModel.Failure? = nil
    ) {
        self.state = state
        self.isAccepting = isAccepting
        self.acceptFailure = acceptFailure
        self.returnsTo = returnsTo
        self.actions = actions
        _retryingAfter = State(initialValue: retryingAfter)
    }

    var body: some View {
        content
            .navigationTitle(Text("invitation.nav"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .onChange(of: Kind(state)) { old, _ in
                if old == .waiting { titleFocused = true }
            }
            .onChange(of: state, initial: true) { _, now in
                switch now {
                case .checkFailed(let failure): retryingAfter = failure
                case .checking: break
                default: retryingAfter = nil
                }
            }
    }

    /// The check's failure on screen: the one shown, or the one a Retry is checking again after.
    private var checkFailure: InvitationModel.Failure? {
        switch state {
        case .checkFailed(let failure): failure
        case .checking: retryingAfter
        default: nil
        }
    }

    /// One branch for the failure and its Retry, so a Retry that checks again keeps its control.
    @ViewBuilder private var content: some View {
        if let checkFailure {
            InvitationCheckFailure(
                failure: checkFailure, isRetrying: state == .checking, retry: actions.retry)
        } else {
            screen
        }
    }

    @ViewBuilder private var screen: some View {
        switch state {
        case .checking:
            InvitationWait(words: String(localized: "invitation.checking"), checksFirst: true)
        case .opening(let club):
            InvitationWait(
                words: String(format: String(localized: "invitation.opening"), club.name),
                checksFirst: false)
        case .checkFailed(let failure):
            InvitationCheckFailure(failure: failure, isRetrying: false, retry: actions.retry)
        case .open(let roster):
            InvitationRosterScreen(
                roster: roster, change: nil, isAccepting: isAccepting, failure: acceptFailure,
                titleFocused: $titleFocused, actions: actions)
        case .changed(let roster, let change):
            InvitationRosterScreen(
                roster: roster, change: .some(change), isAccepting: isAccepting,
                failure: acceptFailure, titleFocused: $titleFocused, actions: actions)
        case .waiting(let club):
            InvitationWaiting(club: club, titleFocused: $titleFocused, done: actions.leave)
        case .expired(let inviter):
            ended("invitation.expired.title", body: Self.words("invitation.expired.body", inviter))
        case .full(let inviter):
            ended("invitation.full.title", body: Self.words("invitation.full.body", inviter))
        case .unavailable:
            ended(
                "invitation.unavailable.title",
                body: String(localized: "invitation.unavailable.body"))
        case .didNotGoAhead:
            // Handoff 9's line, which promises nothing of the inviter (FQ137).
            ended("invitation.declined.title", body: String(localized: "invitation.declined.body"))
        case .reopenLink:
            Palette.canvas.ignoresSafeArea()
        }
    }

    private func ended(_ title: LocalizedStringKey, body: String) -> some View {
        InvitationEnded(
            title: title, line: body, returnsTo: returnsTo, titleFocused: $titleFocused,
            close: actions.leave)
    }

    /// The localized format `key` with `values` in its places.
    nonisolated static func words(
        _ key: String.LocalizationValue, _ values: any CVarArg...
    ) -> String {
        String(format: String(localized: key), arguments: values)
    }

    /// The kind of screen a state shows: a change of kind moves VoiceOver's focus.
    private enum Kind: Equatable {
        case waiting, screen

        init(_ state: InvitationModel.State) {
            switch state {
            case .checking, .opening: self = .waiting
            default: self = .screen
            }
        }
    }
}

/// `G02-checking` (handoff 8's frame 8) and `G02-opening` (handoff 9's frame 2): the system's
/// spinner, decorative, centred on the first line of the words in `emptyTitle` 25/30 beside it
/// (`firstLineCenter`, however far they wrap), as both frames draw it, 32 under the bar, and
/// for a check, "We’ll check the link before showing the club or its people." in `body`
/// `secondaryText` 32 under them. The words are said once, politely, as they show (handoff 8:
/// "Announce Checking invitation once"; `joined.loading`).
struct InvitationWait: View {
    let words: String
    let checksFirst: Bool
    @ScaledMetric(relativeTo: TypeRole.emptyTitle.textStyle) private var gap = Spacing.l

    var body: some View {
        SetupScroll {
            HStack(alignment: .firstLineCenter, spacing: gap) {
                ProgressView()
                    .tint(Palette.secondaryText)
                    .accessibilityHidden(true)
                Text(verbatim: words)
                    .textRole(.emptyTitle)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, Spacing.m)
            if checksFirst {
                Text("invitation.checkFirst")
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xxxl)
            }
        }
        .announcing(words, politely: true, initial: true)
    }
}

/// `G02-checking-failed` (handoff 9's frame 1, `handoff9.checkFailure`): "Couldn’t check the
/// invitation link." over "Check your connection and try again." when no answer came, or "Try
/// again." when the server answered with a refusal, a rate limit or a server error, in
/// `SetupHeading`'s form (the body's ink is the app's `secondaryText`: INVENTORY's Known
/// differences, "The body ink"), and Retry pinned 44 above the safe area's bottom, hinted "Try
/// checking this invitation link again.". Each failure is said once, politely. While Retry checks
/// again it stays in place in its busy form, and the title says "Checking invitation…", as handoff
/// 9's frame 12 draws the signed-out page (`G02-checking-failed-retrying`, built from spec);
/// nothing of the club shows until the server has answered.
struct InvitationCheckFailure: View {
    let failure: InvitationModel.Failure
    let isRetrying: Bool
    let retry: @MainActor () async -> Void

    var body: some View {
        SetupScroll {
            if isRetrying {
                Text("invitation.checking")
                    .textRole(.utilityTitle)
                    .foregroundStyle(Palette.primaryText)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                SetupHeading(title: "invitation.checkFailed.title", subtitle: Text(line))
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                Button {
                    Task { await retry() }
                } label: {
                    Text("common.retry")
                }
                .buttonStyle(.tadayoPrimary(isBusy: isRetrying))
                .accessibilityHint(Text("invitation.checkFailed.retry.hint"))
            }
        }
        .announcing(isRetrying ? nil : spoken, politely: true, initial: true)
    }

    private var line: LocalizedStringResource {
        switch failure {
        case .network: "load.network"
        case .other: "load.refused"
        }
    }

    /// The title, then the line.
    private var spoken: String {
        "\(String(localized: "invitation.checkFailed.title")) \(String(localized: line))"
    }
}

/// The invitation's roster: `G02-invitation` (2.1's frame, a stand-in, and handoff 8's frame 9),
/// `G02-changed` (handoff 2's frame) and `G02-changed-name` (handoff 8's frame 15):
/// - the title in `utilityTitle` 32/35, as a heading: "Join {clubName}", "Review the new roster"
///   or, for a name change, "Review the updated roster";
/// - 24 under it, who invited the person: "{inviterName} invited you." in `body` `primaryText`
///   and "You’ll see only drops shared after joining." in `metadata` `secondaryText` 12 under it;
///   for a changed roster, "The people in {clubName} have changed." then "{inviterName} invited
///   you to {clubName}." in `body` `secondaryText`; for a name change, "{inviterName} invited you
///   to {clubName}." in `body` `primaryText` and 16 under it, in `secondaryText`, the name this
///   app showed before ("The invitation was made for {previousName}. …") or, when it no longer
///   holds it, `nameChanged.explanationAfterRelaunch`, never a name read from the link;
/// - for a name change, "{clubName} · {count} current members" in `metadata` `secondaryText`
///   32 under that, counting the roster's members;
/// - 24 under the words, the roster (`invitationRoster`): every entry once, the viewer first, each
///   a `RosterRow`. Every candidate's row has the Proposed tag (handoff 9's `invitationRosterTag`,
///   which corrects frame 9): the viewer's says "Proposed by {inviterName}", as frame 15 and
///   handoff 9's frame 6 draw it; another candidate's has the tag alone, the roster naming no
///   proposer for it;
/// - for a changed roster, "Accept this exact roster to continue. …" in `metadata`
///   `secondaryText` 20 under the roster;
/// - a failed Accept's line 20 under that (`InlineError`), said once, politely, VoiceOver's focus
///   staying where it was (`failureStates.accept`), and the column scrolled to it, so it shows
///   above Accept as frame 9 draws it however long the roster is (handoff 9's tag makes a
///   candidate's row taller, and six people's rows put the line below the screen's edge).
///
/// Accept this roster, the primary action, and Not now, a text action, are pinned under the
/// scrolling roster, 8 apart. While Accept is on its way it shows its busy form and Not now waits.
struct InvitationRosterScreen: View {
    let roster: InvitationRoster
    /// Nil for `G02-invitation`; for a changed roster, the name change if there is one.
    let change: InvitationModel.NameChange??
    let isAccepting: Bool
    let failure: InvitationModel.Failure?
    let titleFocused: AccessibilityFocusState<Bool>.Binding
    let actions: InvitationScreenActions

    /// The failed Accept's line, which the column is scrolled to as it shows.
    private static let failureID = "invitation.acceptFailure"

    var body: some View {
        ScrollViewReader { scroll in
            column
                // A screen first laid out with the line (a snapshot) opens at the column's foot,
                // and stays there if its window is then resized, as a snapshot's host is.
                .defaultScrollAnchor(line == nil ? nil : .bottom, for: .initialOffset)
                .defaultScrollAnchor(line == nil ? nil : .bottom, for: .sizeChanges)
                .onChange(of: line) { _, shown in
                    guard shown != nil else { return }
                    scroll.scrollTo(Self.failureID, anchor: .bottom)
                    // Again in the main queue's next turn, once the line has its place.
                    DispatchQueue.main.async { scroll.scrollTo(Self.failureID, anchor: .bottom) }
                }
        }
        .announcing(line, politely: true)
    }

    private var column: some View {
        SetupScroll {
            Text(verbatim: title)
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityFocused(titleFocused)
            words
                .padding(.top, Spacing.xxl)
            VStack(spacing: 0) {
                ForEach(Array(roster.viewerFirst.enumerated()), id: \.offset) { _, entry in
                    RosterRow(
                        name: entry.name, isViewer: entry.isYou, days: nil,
                        proposal: proposal(for: entry))
                }
            }
            .padding(.top, Spacing.xxl)
            if change != nil {
                Text("invitation.changed.footer")
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xl)
            }
            if let line {
                InlineError(Text(verbatim: line))
                    .padding(.top, Spacing.xl)
                    .id(Self.failureID)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: Spacing.s, spacing: Spacing.s) {
                Button {
                    Task { await actions.accept() }
                } label: {
                    Text("invitation.accept")
                }
                .buttonStyle(.tadayoPrimary(isBusy: isAccepting))
                .disabled(isAccepting)
                Button("invitation.notNow", action: actions.leave)
                    .buttonStyle(.tadayoTextUnderPrimary)
                    .disabled(isAccepting)
            }
        }
    }

    private var title: String {
        switch change {
        case nil: InvitationScreen.words("invitation.title", roster.clubName)
        case .some(nil): String(localized: "invitation.changed.title")
        case .some(.some): String(localized: "invitation.nameChanged.title")
        }
    }

    @ViewBuilder private var words: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch change {
            case nil:
                Text(verbatim: InvitationScreen.words("invitation.inviter", roster.inviterName))
                    .textRole(.body)
                    .foregroundStyle(Palette.primaryText)
                Text("invitation.boundary")
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.top, Spacing.m)
            case .some(nil):
                Text(verbatim: InvitationScreen.words("invitation.changed.body", roster.clubName))
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                Text(verbatim: invitedTo)
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.top, Spacing.s)
            case .some(.some(let nameChange)):
                Text(verbatim: invitedTo)
                    .textRole(.body)
                    .foregroundStyle(Palette.primaryText)
                Text(verbatim: explanation(nameChange))
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.top, Spacing.l)
                Text(verbatim: clubLine)
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .padding(.top, Spacing.xxxl)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var invitedTo: String {
        InvitationScreen.words("invitation.inviterTo", roster.inviterName, roster.clubName)
    }

    private func explanation(_ change: InvitationModel.NameChange) -> String {
        switch change {
        case .from(let earlier):
            InvitationScreen.words("invitation.nameChanged.explanation", earlier)
        case .notHeld:
            String(localized: "invitation.nameChanged.afterRelaunch")
        }
    }

    /// "{clubName} · {count} current members", counting the roster's members.
    private var clubLine: String {
        let members = roster.roster.filter { $0.kind == .member }.count
        let count =
            members == 1
            ? String(localized: "invitation.roster.count.one")
            : InvitationScreen.words("invitation.roster.count.other", members)
        return InvitationScreen.words("invitation.roster.club", roster.clubName, count)
    }

    /// Every candidate's row has the Proposed tag (handoff 9's `invitationRosterTag`). The
    /// viewer's says who proposed them: the inviter, since only a candidate's proposer makes
    /// their link (FQ71). The roster names no proposer for anyone else, so their rows have the
    /// tag alone.
    private func proposal(for entry: InvitationRosterEntry) -> RosterRow.Proposal? {
        guard entry.kind == .candidate else { return nil }
        return entry.isYou ? .by(roster.inviterName) : .unnamed
    }

    private var line: String? {
        switch failure {
        case .network: String(localized: "invitation.accept.failed.network")
        case .other: String(localized: "invitation.accept.failed.refused")
        case nil: nil
        }
    }
}

/// `G03-waiting` (handoff 2's frame): the club's name as an eyebrow, `eyebrow` 13/18
/// `secondaryText`; 12 under it "Your acceptance is saved." in `utilityTitle` 32/35, as a
/// heading; 24 under that "The existing members need to approve before you can join." in `body`
/// `secondaryText`; 44 under it "Waiting for club approval" in `row` after the `clock` symbol,
/// decorative; 32 under that the boundary line in `metadata` `secondaryText`; and Done pinned 44
/// above the safe area's bottom, as the error screens' primary action is. No approval count, list
/// or name (book p30, T33).
struct InvitationWaiting: View {
    let club: String
    let titleFocused: AccessibilityFocusState<Bool>.Binding
    let done: @MainActor () -> Void

    var body: some View {
        SetupScroll {
            Text(verbatim: club)
                .textRole(.eyebrow)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("invitation.waiting.title")
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityFocused(titleFocused)
                .padding(.top, Spacing.m)
            Text("invitation.waiting.body")
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxl)
            Label {
                Text("invitation.waiting.status")
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "clock")
                    .textRole(.row)
                    .foregroundStyle(Palette.secondaryText)
                    .accessibilityHidden(true)
            }
            .padding(.top, SetupGap.field)
            Text("invitation.boundary")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                Button("invitation.done", action: done)
                    .buttonStyle(.tadayoPrimary)
            }
        }
    }
}

/// `G02-expired`, `G02-full` (handoff 1's frames), `G02-revoked` (handoff 4's) and
/// `G03-declined` (handoff 1's): a setup screen's title and line (`SetupHeading`, the line 24
/// under the title) and Close invitation pinned 44 above the safe area's bottom, with handoff 5's
/// hint, "Return to Home." or the tab it returns to. Nothing else: no name on `G02-revoked`
/// (FQ59), no waitlist on `G02-full`, never who declined on `G03-declined` (book p30).
struct InvitationEnded: View {
    let title: LocalizedStringKey
    let line: String
    let returnsTo: LocalizedStringResource
    let titleFocused: AccessibilityFocusState<Bool>.Binding
    let close: @MainActor () -> Void

    var body: some View {
        SetupScroll {
            Text(title)
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityFocused(titleFocused)
            Text(verbatim: line)
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxl)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                Button("invitation.close", action: close)
                    .buttonStyle(.tadayoPrimary)
                    .accessibilityHint(
                        Text(
                            verbatim: InvitationScreen.words(
                                "invitation.close.hint", String(localized: returnsTo))))
            }
        }
    }
}
