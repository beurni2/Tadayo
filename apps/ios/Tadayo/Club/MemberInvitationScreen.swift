import SwiftUI
import TadayoCore
import TadayoDesign

/// What the person's invitation page's controls do, given by its destination.
struct MemberInvitationActions {
    /// Share link or Share again: the share sheet for the person's link.
    var share: @MainActor () -> Void = {}
    /// Create new link, the primary or in More options.
    var createNewLink: @MainActor () -> Void = {}
    /// Revoke link, once its confirmation says so.
    var revoke: @MainActor () -> Void = {}
    /// The failure form's Retry.
    var retry: @MainActor () async -> Void = {}
}

/// The person's invitation page as a club tab's stack shows it, bound to its model
/// (`ClubDetailsModel.invitation(for:)`, the setup list's model made for one candidate): it reads
/// the page the first time it shows, and quietly again each time it shows again, keeping what's
/// on screen while it reads, as the setup list does (`InvitationsDestination`). Share link and
/// Share again get the link from the model, made and kept first if the person has none, then show
/// the share sheet and tell the model whether a share completed; Revoke link and Create new link
/// say what the setup list says as they start and once the server has answered (handoff 4's
/// `revokeLink` and `invite.createNew`). Once the model says the page has ended (the person
/// joined, or isn't the caller's open candidate any more) the tabs close it; while it slides away
/// it keeps drawing the last person it showed, its controls unavailable.
struct MemberInvitationDestination: View {
    let model: InvitationListModel
    @Environment(\.shareLink) private var shareLink
    @State private var asked = false
    @State private var revoking = false
    @State private var sharing = false
    @State private var drawn: InvitationRow?

    var body: some View {
        MemberInvitationScreen(
            state: model.state, row: row ?? drawn, closing: model.ended || model.closed,
            busy: row.map { model.busy.contains($0.candidateID) } ?? false, revoking: revoking,
            sharing: sharing, failure: model.actionFailure, actions: actions
        )
        .onChange(of: row, initial: true) { _, shown in
            if let shown { drawn = shown }
        }
        .task {
            guard !asked else { return await model.refresh() }
            asked = true
            await model.load()
            if Task.isCancelled { asked = false }
        }
    }

    /// The person's row in the last answer: the page's one candidate, while the caller proposed
    /// them and they're still an open candidate.
    private var row: InvitationRow? {
        guard case .loaded(let list) = model.state else { return nil }
        return list.rows.first { $0.candidateID == model.candidateID }
    }

    private var actions: MemberInvitationActions {
        MemberInvitationActions(
            share: share,
            createNewLink: { Task { await createNewLink() } },
            revoke: { Task { await revoke() } },
            retry: { await model.load() })
    }

    private func share() {
        guard !sharing, let row else { return }
        sharing = true
        Task {
            defer { sharing = false }
            guard let url = await model.linkToShare(for: row.candidateID) else { return }
            let completed = await shareLink(url)
            model.shareFinished(for: row.candidateID, completed: completed)
        }
    }

    private func revoke() async {
        guard let row else { return }
        revoking = true
        Announcement.post(String(localized: "revoke.pending"))
        await model.revoke(row.candidateID)
        revoking = false
        if model.actionFailure == nil, self.row?.status == .revoked {
            Announcement.post(InvitationsScreen.words("revoke.success", row.name))
        }
    }

    private func createNewLink() async {
        guard let row else { return }
        await model.createNewLink(for: row.candidateID)
        if model.actionFailure == nil, self.row?.action == .shareLink {
            Announcement.post(InvitationsScreen.words("invite.createNew.success", row.name))
        }
    }
}

/// G05-members-invite (handoff 8's frame 14; `docs/plans/ios-b1-approve.md` section 2, 7c), pushed
/// with the inline title "Members", the system's Back and no tab bar, as the frame draws it, for
/// the one person the caller proposed:
/// - "{name}’s invitation" in `utilityTitle` 32/35, as a heading, 20 under the bar
///   (`SetupScroll`);
/// - 16 under it the club's name in `row` 17/22 `primaryText`, and 8 under that "{count} current
///   members" in `metadata` `secondaryText`, counting the club's active members, never a candidate
///   (`getClub`'s `member_count`; the invitation's own words, `invitation.roster.count`);
/// - 28 under that, the person's block: the roster's proposed row (`RosterRow`), their initial,
///   name, "Proposed by {name}" and the Proposed tag, alone, with no separator; a candidate has no
///   photograph before joining (FQ47);
/// - 4 under the row (20 under the tag), the link's card (`InvitationLinkCard`);
/// - 28 under the card, "New members need everyone’s approval. {name} will see only drops shared
///   after joining." in `body` `secondaryText` (FQ20);
/// - the row's action as the primary (Share link, Share again or Create new link, spoken "Share
///   again for Nina" and so on), and More options 16 under it, the secondary button, spoken "More
///   options for Nina’s invitation", whose system menu (T45) holds the row's items: Revoke link,
///   with the setup list's confirmation, or Create new link. They're pinned 44 above the safe area,
///   as the setup list's Done for now is (frame 14 draws them 24 higher, with nothing under them),
///   with an action's failure line 24 above them, said once, politely, as it shows (handoff 9's
///   `mutationFailure`). At the accessibility sizes they follow the words in the column, 24 under
///   them, after the failure line, so they never cover the page.
///
/// What the row offers follows the setup list's row (handoff 8: "live local Not shared/Shared;
/// used Needs to accept again/Share again only; accepted Accepted with no share/revoke; revoked
/// Link revoked/Create new link; expired existing renewal recovery"); a person whose row offers
/// nothing has no buttons. While an action is on its way its controls wait, the primary busy;
/// while a revoke is, the card says "Revoking link…". Nothing counts who has approved or accepted
/// (T15, T33). The link's address goes to the share sheet alone: never a label, a log or the
/// screen (T52). While the page loads, and after it fails, the setup list's forms ("Loading
/// invitations…", "Couldn’t load invitations." and Retry; handoff 8's `loadStates.invitations`).
struct MemberInvitationScreen: View {
    let state: InvitationListModel.State
    /// The person's row, or the last one shown while the page slides away.
    let row: InvitationRow?
    /// The page has ended: everything waits while it closes.
    var closing = false
    /// The person's action is on its way.
    var busy = false
    /// Their link is being revoked.
    var revoking = false
    /// The share sheet is up.
    var sharing = false
    var failure: InvitationListModel.ActionFailure?
    var actions = MemberInvitationActions()
    @State private var confirming = false
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        content
            .navigationTitle(Text("members.title"))
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
            if let row {
                page(list, row)
            } else {
                Palette.canvas.ignoresSafeArea()
            }
        }
    }

    private func page(_ list: InvitationList, _ row: InvitationRow) -> some View {
        let inColumn = typeSize.isAccessibilitySize
        let line = failure?.words
        let offers = row.action != nil || !row.menu.isEmpty
        return SetupScroll {
            Text(verbatim: Self.title(row.name))
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: list.club.name)
                .textRole(.row)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.l)
            Text(verbatim: Self.count(list.memberCount))
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.s)
            RosterRow(
                name: row.name, isViewer: false, days: nil, proposal: .by(row.proposedBy),
                separated: false
            )
            .padding(.top, Spacing.xxl + Spacing.xs)
            InvitationLinkCard(row: row, revoking: revoking)
                .padding(.top, Spacing.xs)
            Text(verbatim: Self.body(row.name))
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxl + Spacing.xs)
            if inColumn {
                if let line {
                    InlineError(Text(verbatim: line))
                        .padding(.top, Spacing.xl)
                }
                if offers {
                    VStack(spacing: Spacing.l) { controls(row) }
                        .padding(.top, Spacing.xxl)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !inColumn, offers || line != nil {
                SetupFooter(
                    bottom: SetupGap.formFooterToSafeAreaBottom, spacing: Spacing.xxl,
                    top: line == nil ? Spacing.s : Spacing.xxl
                ) {
                    if let line {
                        InlineError(Text(verbatim: line))
                    }
                    if offers {
                        VStack(spacing: Spacing.l) { controls(row) }
                    }
                }
            }
        }
        // One polite announcement as the line shows (handoff 9's `mutationFailure.a11y`).
        .announcing(line, politely: true)
        .alert(
            Self.words("revoke.title", row.name), isPresented: $confirming
        ) {
            Button(role: .destructive) {
                actions.revoke()
            } label: {
                Text("revoke.confirm")
            }
            Button(role: .cancel) {
            } label: {
                Text("revoke.cancel")
            }
        } message: {
            Text(verbatim: Self.words("revoke.body", row.name, list.club.name))
        }
    }

    /// The row's action as the primary, and More options under it with the row's other items
    /// (`moreItems`).
    @ViewBuilder private func controls(_ row: InvitationRow) -> some View {
        let more = Self.moreItems(row)
        if let action = row.action {
            let words = InvitationRowView.actionWords(action)
            let button = Button {
                switch action {
                case .shareLink, .shareAgain: actions.share()
                case .createNewLink: actions.createNewLink()
                }
            } label: {
                Text(words)
            }
            .buttonStyle(.tadayoPrimary(isBusy: busy, waits: busy || revoking))
            .disabled(busy || revoking || sharing || closing)
            // Handoff 8's spoken names, with Voice Control still answering to the words shown
            // (WCAG 2.5.3).
            .accessibilityLabel(Text(verbatim: row.actionLabel(action)))
            .accessibilityInputLabels([Text(words)])
            if case .createNewLink = action, case .notOnThisPhone = row.status {
                button.accessibilityHint(Text("invite.notOnThisPhone.replacement"))
            } else {
                button
            }
        }
        if !more.isEmpty {
            Menu {
                ForEach(more, id: \.self) { item in
                    switch item {
                    case .revokeLink:
                        Button(role: .destructive) {
                            confirming = true
                        } label: {
                            Label {
                                Text("revoke.confirm")
                            } icon: {
                                Image(systemName: "trash")
                            }
                        }
                        .accessibilityLabel(
                            Text(verbatim: Self.words("invite.revoke.label", row.name)))
                    case .createNewLink:
                        Button {
                            actions.createNewLink()
                        } label: {
                            Text("invite.createNew")
                        }
                        .accessibilityLabel(
                            Text(verbatim: Self.words("invite.createNew.label", row.name)))
                    }
                }
            } label: {
                SecondaryButtonFace {
                    Text("memberInvite.more")
                }
            }
            .disabled(busy || revoking || closing)
            .accessibilityLabel(Text(verbatim: Self.words("invite.more.label", row.name)))
            .accessibilityInputLabels([Text("memberInvite.more")])
        }
    }

    /// More options' items: the row's menu without the primary's own action, so a revoked
    /// link's page, whose only item is the primary's Create new link, has no More options
    /// (handoff 8: "revoked Link revoked/Create new link"). Empty: no More options.
    static func moreItems(_ row: InvitationRow) -> [InvitationRow.MenuItem] {
        row.menu.filter { !($0 == .createNewLink && row.action == .createNewLink) }
    }

    /// "Nina’s invitation".
    static func title(_ name: String) -> String { words("memberInvite.title", name) }

    /// "5 current members", or "1 current member".
    static func count(_ members: Int) -> String {
        members == 1
            ? String(localized: "invitation.roster.count.one")
            : String(format: String(localized: "invitation.roster.count.other"), members)
    }

    /// "New members need everyone’s approval. Nina will see only drops shared after joining."
    static func body(_ name: String) -> String { words("memberInvite.body", name) }

    static func words(_ key: String.LocalizationValue, _ names: String...) -> String {
        String(format: String(localized: key), arguments: names)
    }
}

/// The link's card on the person's invitation page (frame 14): the status's glyph and words, the
/// setup list's (`InvitationRow.statusGlyph`, `statusWords`), over "Each person gets a separate
/// link." in `metadata` `secondaryText`, on a `surface` card of radius 12, at least 76 high, as the
/// Private drafts card is, and growing with the text. The words are in `row` 17/22 `primaryText`,
/// 49 from the card's edge, level with the person's name above; 16 above and under them. The glyph
/// is in `secondaryText`, in a 20-point box 16 in from the edge, at the size whose glyph matches
/// frame 14's share symbol (about 18 wide), the box and the glyph growing with the text, as
/// Private drafts' folder does. Centred on the card while it holds frame 14's two lines at a size
/// below the accessibility sizes, as the frame draws it; elsewhere on the status's first line, as
/// the setup list's status glyph sits, so it stays beside the words it stands for. A used link
/// the phone doesn't hold adds handoff 8's two lines under the status, and a live link not on this
/// phone handoff 9's "A new link replaces the previous link."; built from spec, since frame 14
/// draws Shared alone. While a revoke is on its way the words say "Revoking link…", with no
/// glyph, the words staying where they were.
///
/// VoiceOver reads the card as one element, its lines as sentences ("Shared. Each person gets a
/// separate link."); the glyph is decorative beside its words (handoff 4).
private struct InvitationLinkCard: View {
    let row: InvitationRow
    let revoking: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: centred ? .center : .firstTextBaseline, spacing: 0) {
            CardGlyph(name: row.statusGlyph)
                .opacity(revoking ? 0 : 1)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(verbatim: status)
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                ForEach(extra, id: \.self) { line in
                    Text(verbatim: line)
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                Text("invite.body")
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, Spacing.l)
        .padding(.trailing, Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.draftsRowMinHeight, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }

    /// The glyph centred on the card, as frame 14 draws its two lines.
    private var centred: Bool { extra.isEmpty && !typeSize.isAccessibilitySize }

    private var status: String {
        revoking ? String(localized: "revoke.pending") : row.statusWords
    }

    /// The lines a link the phone doesn't hold adds under the status.
    private var extra: [String] {
        if row.linkNotSaved {
            return [
                String(localized: "invite.used.missing"),
                InvitationsScreen.words("invite.used.reopen", row.name),
            ]
        }
        if row.status == .notOnThisPhone {
            return [String(localized: "invite.notOnThisPhone.replacement")]
        }
        return []
    }

    /// The lines as sentences: a status that ends in its own ellipsis takes no full stop after it.
    var spoken: String {
        let first = status.hasSuffix("…") ? status : status + "."
        return ([first] + extra + [String(localized: "invite.body")]).joined(separator: " ")
    }
}

/// The card's glyph in its column: centred in a 20-point box 16 in from the card's edge, the words
/// at least 12 after the box and 49 from the edge, the box and the glyph growing with the text.
private struct CardGlyph: View {
    let name: String
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var box = Size.draftsChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var size: CGFloat = 20

    var body: some View {
        Image(systemName: name)
            .font(.system(size: size))
            .foregroundStyle(Palette.secondaryText)
            .frame(width: box)
            .padding(.leading, Spacing.l)
            .padding(.trailing, Spacing.m)
            .frame(minWidth: Size.personRowTextInset, alignment: .leading)
            .accessibilityHidden(true)
    }
}
