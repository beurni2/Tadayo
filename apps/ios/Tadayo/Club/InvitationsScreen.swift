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
    /// Remove invitation, once its confirmation says so.
    var remove: @MainActor (InvitationRow) -> Void = { _ in }
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
/// - 32 under the rows, or under the line when there are none, Create an invitation, the
///   secondary button, while the server allows a proposal and a place is free (`canInvite`:
///   frame 1's club of six draws none);
/// - 32 under that, "Only you can see this list." in `metadata` `secondaryText`;
/// - Done for now pinned 44 above the safe area's bottom, as a form's primary action, with an
///   action's failure line 24 above it, said once as it shows, and the list hidden from 24 above
///   the line (handoff 9's `mutationFailure.placement`: "scroll body ends24 above block").
///
/// Nothing counts who has accepted (T33). While the list loads, the loading form; after it fails,
/// frame 11's form with the list's words (`handoff8.loadStates.invitations`). Revoke link asks
/// the system's alert first (handoff 2: "Revoke link leads to the native confirmation"), its body
/// saying the person keeps their place (handoff 11's section 7).
///
/// Remove invitation (FQ148; handoff 11's sections 1 to 4 and 8) asks the system's alert first,
/// "Remove {name}’s invitation?", whose body adds that anyone else still invited reviews the
/// roster again when the open revision lists anyone else (`InvitationList.othersInvited`), with
/// Remove invitation (destructive, never the default) and Keep invitation. While it's on its way
/// the row says "Removing…" with the system's indicator and every row's controls and Create an
/// invitation wait; Done for now and Back don't. Its failure is the line above Done for now. On
/// the server's answer the row goes and VoiceOver's focus leaves it at once, for Create an
/// invitation if it shows, else the row now in the removed one's place, else the one before,
/// else Done for now (`InvitationList.focusAfterRemoval`); once the read after it answers,
/// "{name}’s invitation was removed." is said once, and focus goes on to Create an invitation if
/// the read brought it back. A confirmation whose row has gone closes with it.
struct InvitationsScreen: View {
    let state: InvitationListModel.State
    /// The people whose action is on its way: their controls wait.
    var busy: Set<String> = []
    /// The people whose link is being revoked: their row says "Revoking link…".
    var revoking: Set<String> = []
    var failure: InvitationListModel.ActionFailure?
    /// The person whose removal is on its way: their row says "Removing…", and every row's
    /// controls and Create an invitation wait.
    var removing: String?
    /// The last thing a removal has VoiceOver say.
    var notice: RemovalNotice?
    /// The last row a removal took away, where VoiceOver's focus leaves from at once.
    var removedRow: RemovedRow?
    /// Whether a removal could start (`InvitationListModel.removalCanStart`): the name step may
    /// still be proposing someone or making their link after Back.
    var removalCanStart = true
    var actions = InvitationActions()
    @State private var confirming: Confirming?
    @AccessibilityFocusState private var focus: InvitationList.RemovalFocus?

    /// The confirmation on screen: Revoke link's or Remove invitation's.
    enum Confirming: Equatable {
        case revoke(InvitationRow)
        case remove(InvitationRow)

        var row: InvitationRow {
            switch self {
            case .revoke(let row), .remove(let row): row
            }
        }
    }

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
                            row: row, busy: busy.contains(row.candidateID) || removing != nil,
                            revoking: revoking.contains(row.candidateID),
                            removing: removing == row.candidateID,
                            removalWaits: !busy.isEmpty || removing != nil || !removalCanStart,
                            actions: actions,
                            confirm: { confirming = $0 }, focus: $focus)
                    }
                }
                .padding(.top, Spacing.xl)
            }
            if list.canInvite {
                Button(action: actions.invite) {
                    Text("invite.createInvitation")
                }
                .buttonStyle(.tadayoSecondary)
                .disabled(removing != nil)
                .accessibilityFocused($focus, equals: .createInvitation)
                .padding(.top, Spacing.xxxl)
            }
            Text("invite.private")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(
                bottom: SetupGap.formFooterToSafeAreaBottom, spacing: Spacing.xxl,
                top: failure == nil ? Spacing.s : Spacing.xxl
            ) {
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
                .accessibilityFocused($focus, equals: .doneForNow)
            }
        }
        // One polite announcement as the line shows (handoff 9's `mutationFailure.a11y`); the line
        // stays as the list scrolls and changes, and isn't said again until a new failure.
        .announcing(failure?.words, politely: true)
        .onChange(of: notice) { _, notice in
            guard let notice else { return }
            said(notice, in: list)
        }
        .onChange(of: removedRow) { _, removed in
            // Never left on a More that has gone (handoff 11's section 4).
            guard let removed else { return }
            focus = list.focusAfterRemoval(at: removed.position)
        }
        .onChange(of: list.rows.map(\.candidateID)) { _, ids in
            // The person's row went while their confirmation was open: it goes with it.
            if let confirming, !ids.contains(confirming.row.candidateID) { self.confirming = nil }
        }
        .alert(
            confirming.map { title($0) } ?? "",
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            presenting: confirming
        ) { confirming in
            switch confirming {
            case .revoke(let row):
                Button(role: .destructive) {
                    actions.revoke(row)
                } label: {
                    Text("revoke.confirm")
                }
                Button(role: .cancel) {
                } label: {
                    Text("revoke.cancel")
                }
            case .remove(let row):
                Button(role: .destructive) {
                    actions.remove(row)
                } label: {
                    Text("remove.action")
                }
                .accessibilityLabel(Text(verbatim: Self.words("remove.action.label", row.name)))
                Button(role: .cancel) {
                } label: {
                    Text("remove.confirm.cancel")
                }
            }
        } message: { confirming in
            switch confirming {
            case .revoke(let row):
                Text(verbatim: Self.words("revoke.body", row.name, list.club.name))
            case .remove(let row):
                Text(
                    verbatim: Self.removalBody(
                        row.name, club: list.club.name,
                        others: list.othersInvited(besides: row.candidateID)))
            }
        }
    }

    private func title(_ confirming: Confirming) -> String {
        switch confirming {
        case .revoke(let row): Self.words("revoke.title", row.name)
        case .remove(let row): Self.words("remove.confirm.title", row.name)
        }
    }

    /// What a removal has VoiceOver say, once, after the read that follows its answer: the
    /// person's name, with focus going on to Create an invitation if the read brought it back;
    /// or the list's neutral update.
    private func said(_ notice: RemovalNotice, in list: InvitationList) {
        switch notice.kind {
        case .removed(let name, let position):
            if list.focusAfterRemoval(at: position) == .createInvitation, focus != .createInvitation
            {
                focus = .createInvitation
            }
            Announcement.post(Self.words("remove.success", name), politely: true)
        case .updated:
            Announcement.post(String(localized: "remove.listUpdated"), politely: true)
        }
    }

    /// Remove invitation's confirmation body (handoff 11's section 2): `withOthers` while anyone
    /// else is still invited, `last` otherwise.
    nonisolated static func removalBody(_ name: String, club: String, others: Bool) -> String {
        words(others ? "remove.confirm.body.withOthers" : "remove.confirm.body.last", name, club)
    }

    /// A catalog entry's words with the names in it.
    nonisolated static func words(_ key: String.LocalizationValue, _ names: String...) -> String {
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
///   (`link`, `square.and.arrow.up`, `checkmark`, `arrow.clockwise`, `xmark.circle`, and handoff
///   9's `clock` for Link expired and `iphone.slash` for Link not on this phone:
///   `setupLinks.statusGlyphs`), the glyph and the words saying the same, never colour alone;
/// - the action, if the row has one, in `rowAction` 15/20 `action` (`RowActionStyle`), a target at
///   least 44 square, its words ending at 328 and its target at 333, and More where the row has a
///   menu: `ellipsis` in `secondaryText`, as every frame draws it, in a 44-point target from 333
///   to 377 (handoff 4's `invitationRowActions`), the system's menu (T45) headed "{name}’s
///   invitation", with Revoke link (`link`) or Create new link, then Remove invitation
///   (destructive, `trash`) on every row (handoff 11's section 1); while the row's action is on
///   its way both are disabled, the action's words turn `secondaryText` and the status says so;
///   while its removal is, the status reads "Removing…" after the system's indicator, its value
///   "In progress" (handoff 11's section 8);
/// - a used link the app doesn't hold adds handoff 8's two lines under the status, and offers
///   nothing (`links.used.missing`);
/// - a live link the app doesn't hold reads Link not on this phone, offers Create new link, with
///   Revoke link in More, and says "A new link replaces the previous link." 8 under the status
///   and the action, from 49 to the trailing margin, in `metadata` `secondaryText` (handoff 9's
///   `setupLinks.missingLive`, frame 15); its avatar, action and More are centred on the line
///   between the name and the status, as frame 15 centres its avatar, however the status wraps;
/// - an expired link offers Create new link, its action where the others' are, and More with
///   Remove invitation alone (`setupLinks.expiredUnused`, frame 16, with handoff 11's More);
/// - at least 74 high, centred, growing with the text; a used row at least 84, its content where a
///   74 row puts it (`usedInvitationRow.defaultSamHeight`); a link not on this phone at least 112
///   (`missingLive.minimumHeight`), its content from the top; the separator from 49 to the
///   trailing edge.
///
/// At the accessibility sizes the status and the action go under the name, from the leading edge,
/// with More kept beside the name, and the separator runs the full width (handoff 2's AX5 rule,
/// frame `G01-invite-people-xl`); the action's target takes the full width, as a used row's Share
/// again must (`usedInvitationRow.largestText`); a link not on this phone's line goes under the
/// status, before the action. VoiceOver reads the name and the status as one element, "Maya.
/// Shared.", then each control by its own label ("Share again for Maya", "More options for
/// Maya’s invitation"), and a link not on this phone's line as its own text (handoff 9: "The
/// replacement helper remains separately reachable") and as Create new link's hint; the glyphs
/// and the avatar are decorative
/// (handoff 4: "Invitee glyphs … are decorative beside their words").
struct InvitationRowView: View {
    let row: InvitationRow
    let busy: Bool
    let revoking: Bool
    var removing = false
    /// Another row's link action, or a removal, is on its way: Remove invitation waits for it, as
    /// the model does (`InvitationListModel.removalCanStart`; one roster or link change in flight
    /// per club, handoff 11's section 8).
    var removalWaits = false
    let actions: InvitationActions
    /// Revoke link's or Remove invitation's confirmation, for this row.
    let confirm: (InvitationsScreen.Confirming) -> Void
    var focus: AccessibilityFocusState<InvitationList.RemovalFocus?>.Binding?
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
        VStack(alignment: .leading, spacing: Spacing.s) {
            // A link not on this phone's status wraps (frame 15): the avatar and the controls stay
            // centred on the line under the name, as frame 15 draws its avatar.
            HStack(alignment: notOnThisPhone ? .nameEnd : .center, spacing: 0) {
                Avatar(name: row.name, size: .row)
                    .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    name
                    status
                    missing
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let action = row.action {
                    actionButton(action, trailing: keepsMoreColumn ? Self.actionToMore : 0)
                        .padding(.leading, Spacing.s)
                }
                if !row.menu.isEmpty {
                    more
                } else if keepsMoreColumn {
                    // More's place, as More takes it past the margin.
                    Color.clear
                        .frame(width: Size.touchTarget - Self.moreOverhang, height: 1)
                        .accessibilityHidden(true)
                }
            }
            if notOnThisPhone {
                replacement
                    .padding(.leading, Size.personRowTextInset)
            }
        }
        .padding(.vertical, Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Self.minimumHeight)
        .frame(minHeight: tallMinimumHeight, alignment: .top)
    }

    /// A used row's 84 or a link not on this phone's 112, from the top; nil for the others.
    private var tallMinimumHeight: CGFloat? {
        switch row.status {
        case .needsToAcceptAgain: Self.usedMinimumHeight
        case .notOnThisPhone: Self.notOnThisPhoneMinimumHeight
        default: nil
        }
    }

    private var notOnThisPhone: Bool { row.status == .notOnThisPhone }

    /// The row keeps More's column: it has More, or it's an expired link, whose action frame 16
    /// keeps where the others' are.
    private var keepsMoreColumn: Bool { !row.menu.isEmpty || row.status == .expired }

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
            if notOnThisPhone {
                replacement
            }
            if let action = row.action {
                actionButton(action, fullWidth: true)
            }
        }
        .padding(.vertical, Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Self.minimumHeight, alignment: .leading)
    }

    /// `usedInvitationRow.rowMinimumHeight`; handoff 4's More target is 15 under the row's top
    /// and 44 high, so 74 holds it centred.
    static let minimumHeight: CGFloat = 74

    /// `usedInvitationRow.defaultSamHeight`: frame `G01-invite-people-accept-again` draws a used
    /// row 84 high at the default size, its name, status and Share again where a 74 row puts them
    /// and the 10 more under them. A row whose text needs more grows past it.
    static let usedMinimumHeight: CGFloat = 84

    /// `setupLinks.missingLive.minimumHeight`: frame 15 draws Alex's row 112 high, from 319 to
    /// 431, its status on two lines and its replacement line under them.
    static let notOnThisPhoneMinimumHeight: CGFloat = 112

    /// More's target past the screen's 20-point margin: handoff 4's
    /// `invitationRowActions.moreTarget` is [333, 15, 44, 44] on a 393-point screen, so it ends at
    /// 377, as the club header's Account target ends past the margin
    /// (`Size.clubHeaderTrailingInset`).
    static let moreOverhang: CGFloat = 4

    /// From the action's words to More's target: handoff 4's `invitationRowActions.shareRightEdge`
    /// is 328 and `moreTarget` starts at 333. The 5 is inside the action's target, so that target
    /// ends at 333, where More's starts, as the frames' Share link target ends there (Maya's,
    /// [237, 261, 96, 44]); where it starts is the words' own.
    static let actionToMore: CGFloat = 5

    /// The name, which VoiceOver reads with the status as one element, "In progress" its value
    /// while the row's removal is on its way.
    @ViewBuilder private var name: some View {
        let name = Text(verbatim: row.name)
            .textRole(.row)
            .foregroundStyle(Palette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(Text(verbatim: spoken))
            .accessibilityValue(removing ? Text("remove.busy.value") : Text(verbatim: ""))
            .alignmentGuide(.nameEnd) { $0[.bottom] }
        if let focus {
            name.accessibilityFocused(focus, equals: .row(row.candidateID))
        } else {
            name
        }
    }

    private var status: some View {
        StatusLine(
            glyph: revoking || removing ? nil : glyph, spinning: removing, words: statusWords
        )
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

    /// "A new link replaces the previous link.", under a link not on this phone (handoff 9's
    /// `links.missing.replacement`), read as its own text.
    private var replacement: some View {
        Text("invite.notOnThisPhone.replacement")
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The row's action; `trailing` is space inside its target after the words, `fullWidth` a
    /// target across the row. On a link not on this phone, Create new link also carries "A new
    /// link replaces the previous link." as its hint: handoff 9 explains the replacement "inline
    /// before action" (`missingLive.behavior`), and at the default sizes VoiceOver reaches the
    /// action before the line drawn under the row, which stays its own text too.
    @ViewBuilder private func actionButton(
        _ action: InvitationRow.Action, trailing: CGFloat = 0, fullWidth: Bool = false
    ) -> some View {
        let button = Button {
            switch action {
            case .shareLink, .shareAgain: actions.share(row)
            case .createNewLink: actions.createNewLink(row)
            }
        } label: {
            Text(Self.actionWords(action))
        }
        .buttonStyle(RowActionStyle(trailing: trailing, fullWidth: fullWidth))
        .disabled(busy)
        .accessibilityLabel(Text(verbatim: actionLabel(action)))
        if case .createNewLink = action, case .notOnThisPhone = row.status {
            button.accessibilityHint(Text("invite.notOnThisPhone.replacement"))
        } else {
            button
        }
    }

    /// More: the system's menu, headed "{name}’s invitation" (handoff 11's
    /// `remove.menu.heading`), Revoke link an ordinary item with `link` and Remove invitation the
    /// destructive one with `trash` (frame 1).
    private var more: some View {
        Menu {
            Section {
                ForEach(row.menu, id: \.self) { item in
                    menuItem(item)
                }
            } header: {
                Text(verbatim: InvitationsScreen.words("remove.menu.heading", row.name))
            }
        } label: {
            Image(systemName: "ellipsis")
                .textRole(.rowAction)
                .foregroundStyle(Palette.secondaryText)
                .frame(width: Size.touchTarget, height: Size.touchTarget)
                .contentShape(Rectangle())
        }
        .disabled(busy)
        .accessibilityLabel(Text(verbatim: InvitationsScreen.words("invite.more.label", row.name)))
        .padding(.trailing, -Self.moreOverhang)
    }

    @ViewBuilder private func menuItem(_ item: InvitationRow.MenuItem) -> some View {
        switch item {
        case .revokeLink:
            Button {
                confirm(.revoke(row))
            } label: {
                Label {
                    Text("revoke.confirm")
                } icon: {
                    Image(systemName: "link")
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
                Text(verbatim: InvitationsScreen.words("invite.createNew.label", row.name)))
        case .removeInvitation:
            Button(role: .destructive) {
                confirm(.remove(row))
            } label: {
                Label {
                    Text("remove.action")
                } icon: {
                    Image(systemName: "trash")
                }
            }
            .accessibilityLabel(
                Text(verbatim: InvitationsScreen.words("remove.action.label", row.name))
            )
            .disabled(removalWaits)
        }
    }

    private var glyph: String { row.statusGlyph }

    private var statusWords: String {
        if removing { return String(localized: "remove.busy") }
        return revoking ? String(localized: "revoke.pending") : row.statusWords
    }

    /// "Maya. Shared." (handoff 4's `invite.row.{name}.vo`, handoff 8's `links.used.row.vo`).
    var spoken: String {
        // A status that ends in its own ellipsis ("Revoking link…") takes no full stop after it.
        let key: String.LocalizationValue =
            statusWords.hasSuffix("…") ? "invite.row.label.ongoing" : "invite.row.label"
        return InvitationsScreen.words(key, row.name, statusWords)
    }

    static func actionWords(_ action: InvitationRow.Action) -> LocalizedStringResource {
        switch action {
        case .shareLink: "invite.shareLink"
        case .shareAgain: "invite.shareAgain"
        case .createNewLink: "invite.createNew"
        }
    }

    private func actionLabel(_ action: InvitationRow.Action) -> String {
        row.actionLabel(action)
    }
}

extension InvitationRow {
    /// The status's glyph (handoff 4's `invitationStatuses`; handoff 9's
    /// `setupLinks.statusGlyphs`).
    var statusGlyph: String {
        switch status {
        case .notShared: "link"
        case .shared: "square.and.arrow.up"
        case .accepted: "checkmark"
        case .needsToAcceptAgain: "arrow.clockwise"
        case .revoked: "xmark.circle"
        case .expired: "clock"
        case .notOnThisPhone: "iphone.slash"
        }
    }

    /// The status's words, the glyph saying the same.
    var statusWords: String {
        switch status {
        case .notShared: String(localized: "invite.notShared")
        case .shared: String(localized: "invite.shared")
        case .accepted: String(localized: "invite.accepted")
        case .needsToAcceptAgain: String(localized: "invite.used")
        case .revoked: String(localized: "invite.revoked")
        case .expired: String(localized: "invite.expired")
        case .notOnThisPhone: String(localized: "invite.notOnThisPhone")
        }
    }

    /// An action's spoken name, with the person's: "Share again for Maya" (handoff 8's
    /// `invitationControlAccessibilityLabels`).
    func actionLabel(_ action: Action) -> String {
        switch action {
        case .shareLink: InvitationsScreen.words("invite.share.label", name)
        case .shareAgain: InvitationsScreen.words("invite.shareAgain.label", name)
        case .createNewLink: InvitationsScreen.words("invite.createNew.label", name)
        }
    }
}

/// A status's glyph, 12 points at the default size and growing with the words, 4 before them, in
/// `metadata` 13/18 `secondaryText`; the words alone while a revoke is on its way; the system's
/// indeterminate indicator, its smallest, in the glyph's place while a removal is (handoff 11's
/// section 8: "a native indeterminate spinner and “Removing…” in the row's status line), centred
/// on the one word, since an indicator has no baseline to share with it.
private struct StatusLine: View {
    let glyph: String?
    var spinning = false
    let words: String
    @ScaledMetric(relativeTo: TypeRole.metadata.textStyle) private var size: CGFloat = 12

    var body: some View {
        HStack(alignment: spinning ? .center : .firstTextBaseline, spacing: Spacing.xs) {
            if spinning {
                ProgressView()
                    .controlSize(.mini)
                    .tint(Palette.secondaryText)
            } else if let glyph {
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
/// target at least 44 square, with `trailing` points of it after the words, and across the row
/// when `fullWidth`.
private struct RowActionStyle: ButtonStyle {
    var trailing: CGFloat = 0
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        RowActionFace(configuration: configuration, trailing: trailing, fullWidth: fullWidth)
    }
}

private struct RowActionFace: View {
    let configuration: ButtonStyleConfiguration
    let trailing: CGFloat
    let fullWidth: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .textRole(.rowAction)
            .multilineTextAlignment(.leading)
            .foregroundStyle(ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.trailing, trailing)
            .frame(
                minWidth: Size.touchTarget, maxWidth: fullWidth ? .infinity : nil,
                minHeight: Size.touchTarget, alignment: .leading
            )
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
        case .remove(let name, let club, let uncertain):
            InvitationsScreen.words(
                uncertain ? "remove.failed.network" : "remove.failed.refused", name, club)
        case .removeUnavailable:
            String(localized: "remove.unavailable")
        }
    }
}

extension VerticalAlignment {
    /// The bottom of a setup row's name, the line between it and the status: where a row whose
    /// status wraps centres its avatar, action and More.
    fileprivate enum NameEnd: AlignmentID {
        static func defaultValue(in context: ViewDimensions) -> CGFloat {
            context[VerticalAlignment.center]
        }
    }

    fileprivate static var nameEnd: VerticalAlignment { VerticalAlignment(NameEnd.self) }
}
