import SwiftUI
import TadayoCore
import TadayoDesign

/// What the setup list's controls do, given by the tabs (`InvitationsDestination`).
struct InvitationActions {
    /// Share link or Share again: the share sheet for the row's link.
    var share: @MainActor (InvitationRow) -> Void = { _ in }
    /// Create new link, from the row or its More menu.
    var createNewLink: @MainActor (InvitationRow) -> Void = { _ in }
    /// Revoke link, once its confirmation says so.
    var revoke: @MainActor (InvitationRow) -> Void = { _ in }
    /// Create an invitation: the name step.
    var invite: @MainActor () -> Void = {}
    /// Done for now: the waiting screen.
    var done: @MainActor () -> Void = {}
    /// The failure's Retry.
    var retry: @MainActor () async -> Void = {}
}

/// G01-invite-people and its states (handoff 1's frame with handoff 4's footer and statuses,
/// handoff 2's `-add` and `-xl`, handoff 4's `-revoked`, handoff 8's `-accept-again`), pushed
/// onto the tab with the inline title "Create a club", the system's Back and no tab bar:
/// - "Invite your people" in `utilityTitle` 32/35, as a heading, the club's name 12 under it in
///   `row` 17/22, and "Each person gets a separate link." 4 under that in `body`
///   `secondaryText` (`ClubSetupHeading`);
/// - 20 under that, a row for each person the caller proposed, in the server's order
///   (`InvitationRowView`); none before anyone is invited (`G01-invite-people-empty`, built from
///   spec);
/// - 32 under the rows, or under the line when there are none, Create an invitation, the secondary button, while the server allows a
///   proposal and a place is free (`canInvite`: frame 1's club of six draws none);
/// - 32 under that, "Only you can see this list." in `metadata` `secondaryText`;
/// - Done for now pinned 44 above the safe area's bottom, as a form's primary action, with an
///   action's failure line 24 above it, said once as it shows.
///
/// Nothing counts who has accepted (T33). While the list loads, the loading form; after it fails,
/// frame 11's form with the list's words (`handoff8.loadStates.invitations`). Revoke link asks
/// the system's alert first (handoff 2: "Revoke link leads to the native confirmation").
struct InvitationsScreen: View {
    let state: InvitationListModel.State
    /// The people whose action is on its way: their controls wait.
    var busy: Set<String> = []
    /// The people whose link is being revoked: their row says "Revoking link…".
    var revoking: Set<String> = []
    var failure: InvitationListModel.ActionFailure?
    var actions = InvitationActions()
    @State private var confirming: InvitationRow?

    var body: some View {
        content
            .navigationTitle(Text("create.navTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            ClubLoading(label: "load.invitations.loading")
        case .failed(let failure):
            ClubLoadFailure(
                title: "load.invitations.title", failure: failure == .network ? .network : .refused,
                retryHint: "load.invitations.retryHint", retry: actions.retry)
        case .loaded(let list):
            loaded(list)
        }
    }

    private func loaded(_ list: InvitationList) -> some View {
        SetupScroll {
            ClubSetupHeading(title: "invite.title", club: list.club.name, line: "invite.body")
            if !list.rows.isEmpty {
                VStack(spacing: 0) {
                    ForEach(list.rows) { row in
                        InvitationRowView(
                            row: row, busy: busy.contains(row.candidateID),
                            revoking: revoking.contains(row.candidateID), actions: actions,
                            confirmRevoke: { confirming = $0 })
                    }
                }
                .padding(.top, Spacing.xl)
            }
            if list.canInvite {
                Button(action: actions.invite) {
                    Text("invite.createInvitation")
                }
                .buttonStyle(.tadayoSecondary)
                .padding(.top, Spacing.xxxl)
            }
            Text("invite.private")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom, spacing: Spacing.xxl) {
                if let failure {
                    InlineError(Text(verbatim: failure.words))
                }
                Button(action: actions.done) {
                    Text("invite.done")
                }
                .buttonStyle(.tadayoPrimary)
                // Handoff 4's `invite.done.vo`, with Voice Control still answering to the words it
                // shows (WCAG 2.5.3, as Home's Review members does).
                .accessibilityLabel(Text("invite.done.label"))
                .accessibilityInputLabels([Text("invite.done")])
            }
        }
        .announcing(failure?.words)
        .alert(
            confirming.map { Self.words("revoke.title", $0.name) } ?? "",
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            presenting: confirming
        ) { row in
            Button(role: .destructive) {
                actions.revoke(row)
            } label: {
                Text("revoke.confirm")
            }
            Button(role: .cancel) {
            } label: {
                Text("revoke.cancel")
            }
        } message: { row in
            Text(verbatim: Self.words("revoke.body", row.name, row.name))
        }
    }

    /// A catalog entry's words with the names in it.
    static func words(_ key: String.LocalizationValue, _ names: String...) -> String {
        String(format: String(localized: key), arguments: names)
    }
}

/// A create screen's title, the club's name and a line (G01-invite-people, G01-invite-name): the
/// title in `utilityTitle` 32/35, as a heading; the club's own name 12 under it in `row` 17/22
/// `primaryText`; the line 4 under that in `body` `secondaryText`, each wrapping naturally.
struct ClubSetupHeading: View {
    let title: LocalizedStringResource
    let club: String
    let line: LocalizedStringResource

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
            Text(verbatim: club)
                .textRole(.row)
                .foregroundStyle(Palette.primaryText)
                .padding(.top, Spacing.m)
            Text(line)
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .padding(.top, Spacing.xs)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// One person in the setup list (handoff 4's `invitationStatuses` and `invitationRowActions`,
/// handoff 8's `usedInvitationRow`; `docs/plans/ios-b1-create.md` section 2):
/// - the 36-point avatar with their initial, their name in `row` 17/22 49 from the leading edge,
///   and 4 under it the status in `metadata` 13/18 `secondaryText` after its 12-point glyph
///   (`link`, `square.and.arrow.up`, `checkmark`, `arrow.clockwise`, `xmark.circle`), the glyph
///   and the words saying the same, never colour alone;
/// - the action, if the row has one, in `rowAction` 15/20 `action` (`RowActionStyle`), a target at
///   least 44 square, and More where the row has a menu: `ellipsis` in a 44-point target, the
///   system's menu (T45), with Revoke link (destructive) or Create new link;
/// - a used link the app doesn't hold adds handoff 8's two lines under the status, and offers
///   nothing (`links.used.missing`);
/// - at least 74 high, centred, growing with the text; the separator from 49 to the trailing edge.
///
/// At the accessibility sizes the status and the action go under the name, from the leading edge,
/// with More kept beside the name, and the separator runs the full width (handoff 2's AX5 rule,
/// frame `G01-invite-people-xl`); a used row's Share again takes the full width
/// (`usedInvitationRow.largestText`). VoiceOver reads the name and the status as one element,
/// "Maya. Shared.", then each control by its own label ("Share again for Maya", "More options for
/// Maya’s invitation"); the glyphs and the avatar are decorative (handoff 4: "Invitee glyphs … are
/// decorative beside their words").
struct InvitationRowView: View {
    let row: InvitationRow
    let busy: Bool
    let revoking: Bool
    let actions: InvitationActions
    let confirmRevoke: (InvitationRow) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                stacked
            } else {
                inline
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Palette.separator)
                .frame(height: Size.separatorWidth)
                .padding(.leading, typeSize.isAccessibilitySize ? 0 : Size.personRowTextInset)
                .accessibilityHidden(true)
        }
    }

    private var inline: some View {
        HStack(spacing: 0) {
            Avatar(name: row.name, size: .row)
                .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                name
                status
                missing
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let action = row.action {
                actionButton(action)
                    .padding(.leading, Spacing.s)
            }
            if !row.menu.isEmpty {
                more
            }
        }
        .padding(.vertical, Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Self.minimumHeight)
    }

    private var stacked: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(alignment: .top, spacing: 0) {
                Avatar(name: row.name, size: .row)
                    .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
                name
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !row.menu.isEmpty {
                    more
                }
            }
            status
            missing
            if let action = row.action {
                actionButton(action)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Self.minimumHeight, alignment: .leading)
    }

    /// `usedInvitationRow.rowMinimumHeight`; handoff 4's More target is 15 under the row's top
    /// and 44 high, so 74 holds it centred.
    static let minimumHeight: CGFloat = 74

    /// The name, which VoiceOver reads with the status as one element.
    private var name: some View {
        Text(verbatim: row.name)
            .textRole(.row)
            .foregroundStyle(Palette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(Text(verbatim: spoken))
    }

    private var status: some View {
        StatusLine(glyph: revoking ? nil : glyph, words: statusWords)
            .accessibilityHidden(true)
    }

    @ViewBuilder private var missing: some View {
        if row.linkNotSaved {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("invite.used.missing")
                Text(verbatim: InvitationsScreen.words("invite.used.reopen", row.name))
            }
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xs)
        }
    }

    private func actionButton(_ action: InvitationRow.Action) -> some View {
        Button {
            switch action {
            case .shareLink, .shareAgain: actions.share(row)
            case .createNewLink: actions.createNewLink(row)
            }
        } label: {
            Text(Self.actionWords(action))
        }
        .buttonStyle(RowActionStyle())
        .disabled(busy)
        .accessibilityLabel(Text(verbatim: actionLabel(action)))
    }

    private var more: some View {
        Menu {
            ForEach(row.menu, id: \.self) { item in
                switch item {
                case .revokeLink:
                    Button(role: .destructive) {
                        confirmRevoke(row)
                    } label: {
                        Label {
                            Text("revoke.confirm")
                        } icon: {
                            Image(systemName: "trash")
                        }
                    }
                    .accessibilityLabel(
                        Text(verbatim: InvitationsScreen.words("invite.revoke.label", row.name)))
                case .createNewLink:
                    Button {
                        actions.createNewLink(row)
                    } label: {
                        Text("invite.createNew")
                    }
                    .accessibilityLabel(
                        Text(verbatim: InvitationsScreen.words("invite.createNew.label", row.name))
                    )
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .textRole(.rowAction)
                .foregroundStyle(busy ? Palette.secondaryText : Palette.primaryText)
                .frame(width: Size.touchTarget, height: Size.touchTarget)
                .contentShape(Rectangle())
        }
        .disabled(busy)
        .accessibilityLabel(Text(verbatim: InvitationsScreen.words("invite.more.label", row.name)))
    }

    private var glyph: String {
        switch row.status {
        case .notShared: "link"
        case .shared: "square.and.arrow.up"
        case .accepted: "checkmark"
        case .needsToAcceptAgain: "arrow.clockwise"
        case .revoked, .expired: "xmark.circle"
        }
    }

    private var statusWords: String {
        guard !revoking else { return String(localized: "revoke.pending") }
        return switch row.status {
        case .notShared: String(localized: "invite.notShared")
        case .shared: String(localized: "invite.shared")
        case .accepted: String(localized: "invite.accepted")
        case .needsToAcceptAgain: String(localized: "invite.used")
        case .revoked: String(localized: "invite.revoked")
        case .expired: String(localized: "invite.expired")
        }
    }

    /// "Maya. Shared." (handoff 4's `invite.row.{name}.vo`, handoff 8's `links.used.row.vo`).
    var spoken: String {
        InvitationsScreen.words("invite.row.label", row.name, statusWords)
    }

    static func actionWords(_ action: InvitationRow.Action) -> LocalizedStringResource {
        switch action {
        case .shareLink: "invite.shareLink"
        case .shareAgain: "invite.shareAgain"
        case .createNewLink: "invite.createNew"
        }
    }

    private func actionLabel(_ action: InvitationRow.Action) -> String {
        switch action {
        case .shareLink: InvitationsScreen.words("invite.share.label", row.name)
        case .shareAgain: InvitationsScreen.words("invite.shareAgain.label", row.name)
        case .createNewLink: InvitationsScreen.words("invite.createNew.label", row.name)
        }
    }
}

/// A status's glyph, 12 points at the default size and growing with the words, 4 before them, in
/// `metadata` 13/18 `secondaryText`; the words alone while a revoke is on its way.
private struct StatusLine: View {
    let glyph: String?
    let words: String
    @ScaledMetric(relativeTo: TypeRole.metadata.textStyle) private var size: CGFloat = 12

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
            if let glyph {
                Image(systemName: glyph)
                    .font(.system(size: size))
            }
            Text(verbatim: words)
                .textRole(.metadata)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Palette.secondaryText)
    }
}

/// A row's link action (handoff 2: "Row link actions use rowAction 15/20 regular"): `action` ink,
/// `actionPressed` while pressed and `secondaryText` while unavailable, as a text action's, in a
/// target at least 44 square.
private struct RowActionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        RowActionFace(configuration: configuration)
    }
}

private struct RowActionFace: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .textRole(.rowAction)
            .multilineTextAlignment(.leading)
            .foregroundStyle(ink)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minWidth: Size.touchTarget, minHeight: Size.touchTarget)
            .contentShape(Rectangle())
    }

    private var ink: Color {
        guard isEnabled else { return Palette.secondaryText }
        return configuration.isPressed ? Palette.actionPressed : Palette.action
    }
}

extension InvitationListModel.ActionFailure {
    /// The line above Done for now: the action and the person it failed for, with "Check your
    /// connection" only when no answer came (handoff 4's `revokeLink` and `invite.createNew`,
    /// handoff 8's `createInvitation.createFailure` and its rule for network failures).
    var words: String {
        switch self {
        case .createLink(let name, let network):
            InvitationsScreen.words(
                network ? "inviteName.failed.network" : "inviteName.failed.refused", name)
        case .createNewLink(let name, let network):
            InvitationsScreen.words(
                network ? "invite.createNew.failed.network" : "invite.createNew.failed.refused",
                name)
        case .revoke(let name, let uncertain):
            InvitationsScreen.words(uncertain ? "revoke.uncertain" : "revoke.failed", name)
        }
    }
}
