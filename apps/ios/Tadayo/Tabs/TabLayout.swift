import SwiftUI
import TadayoCore
import TadayoDesign

/// The three tabs of the product (spec 03, D04), each with what it says while the club list
/// loads or fails: handoff 7's words (`home.loading`, `friends.error.title` and the rest), which
/// are FQ90's defaults word for word.
enum ClubTab: Hashable, CaseIterable {
    case home, friends, memories

    /// The loading label, seen and spoken: handoff 5's `loading.label` on Home.
    var loading: LocalizedStringResource {
        switch self {
        case .home: "tabs.loading.home"
        case .friends: "tabs.loading.friends"
        case .memories: "tabs.loading.memories"
        }
    }

    /// The failure's title, naming what failed (T43): the first sentence of handoff 3's
    /// `H01.error.network` on Home.
    var failure: LocalizedStringResource {
        switch self {
        case .home: "tabs.error.home"
        case .friends: "tabs.error.friends"
        case .memories: "tabs.error.memories"
        }
    }

    /// The tab's name, as its tab item says it: where Close invitation returns to (handoff 5's
    /// `a11y.closeInvitation.hint`).
    var title: LocalizedStringResource {
        switch self {
        case .home: "tabs.home"
        case .friends: "tabs.friends"
        case .memories: "tabs.memories"
        }
    }

    /// Retry's hint after a failure, naming the tab it loads again (handoff 7's
    /// `vo.retryHome.hint` and the other two; the label stays Retry).
    var retryHint: LocalizedStringResource {
        switch self {
        case .home: "tabs.retry.home.hint"
        case .friends: "tabs.retry.friends.hint"
        case .memories: "tabs.retry.memories.hint"
        }
    }

    /// A failure as VoiceOver reads it, the title then the line, as one group (handoff 6's
    /// `denied.group.vo`, "{titleText}. {bodyText}", whose full stop the title already ends
    /// with), and as it's said when it shows.
    func spoken(_ failure: RootModel.Failure) -> String {
        "\(String(localized: self.failure)) \(String(localized: failure.line))"
    }
}

extension RootModel.Failure {
    /// The line under a failure's title: "Check your connection" only when no answer came (the
    /// second sentence of handoff 3's `H01.error.network`), and otherwise handoff 4's "Try again."
    var line: LocalizedStringResource {
        switch self {
        case .network: "common.error.network"
        case .other: "common.error.tryAgain"
        }
    }
}

/// The header every tab shares: while a club is selected, the selected club's header, whose
/// selector opens the switcher (handoff 3's `selectedClubHeader`, with handoff 8's); otherwise
/// the no-club header with the wordmark (handoff 7's `noClubRootHeader`), which is also the
/// denied header a suspended club's tabs take, with nothing of the club (handoff 6's
/// `deniedHeader`). Both have the account's initial. + Add and Account show and do nothing yet
/// (FQ85, ADR-029): Add's picker and the account screen come in later stages.
struct TabHeader: View {
    let name: String
    /// The selected club's name, or nil for the wordmark.
    var club: String?
    var switchClub: () -> Void = {}

    var body: some View {
        if let club {
            SelectedClubHeader(
                clubName: club,
                selectorLabel: Text(
                    verbatim: String(format: String(localized: "header.club.label"), club)),
                add: Text("header.add"), addHint: Text("header.add.hint"),
                account: Text("header.account"), accountHint: Text("header.account.hint"),
                name: name, onSelector: switchClub, onAdd: {}, onAccount: {})
        } else {
            NoClubHeader(
                wordmark: Image("Wordmark"), wordmarkLabel: Text("brand.wordmark"),
                add: Text("header.add"), addHint: Text("header.add.hint"),
                account: Text("header.account"), accountHint: Text("header.account.hint"),
                name: name, onAdd: {}, onAccount: {})
        }
    }
}

/// A tab's column: the header at the top, scrolling with the content under it (handoff 6's
/// FM-02), the content 20 points in from each edge, on `canvas`. Gaps are `handoff6.spacing`'s
/// where it names one, and otherwise book p35's step nearest the frame's, or past its largest
/// step a sum of its steps (`TabGap`); the PR and INVENTORY.md list each.
///
/// The status bar's safe area stays opaque `canvas` over what scrolls (handoff 7's
/// `noClubRootHeader.scroll`: "Status-bar safe area remains opaque canvas", "no custom glass or
/// extra scroll-edge effect"): a band exactly as high as that safe area, drawn over the scroll
/// view, which the header scrolls away under. It is no bar and carries nothing.
///
/// One column holds every state of a tab, so the header stays the same view as the club list
/// changes, and VoiceOver's focus on + Add or Account survives it (handoff 3's
/// `loadingAndCutoffFocus`: "preserve focus on surviving header/tab controls"). When `fills`,
/// the column is at least as tall as the space it's shown in, so the loading shell's spacers
/// share what the header leaves, and nothing scrolls.
struct TabScroll<Content: View>: View {
    let header: TabHeader
    var fills = false
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { space in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    VStack(alignment: .leading, spacing: 0) {
                        content
                    }
                    .padding(.horizontal, Spacing.inset)
                }
                .frame(
                    maxWidth: .infinity, minHeight: fills ? space.size.height : nil,
                    alignment: .topLeading
                )
                .padding(.bottom, fills ? 0 : Spacing.xxl)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background { Palette.canvas.ignoresSafeArea() }
        .overlay(alignment: .top) {
            // No height of its own: all of it is the safe area it reaches into.
            Palette.canvas
                .ignoresSafeArea(edges: .top)
                .frame(height: 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// The no-club tabs' gaps that `handoff6.spacing` doesn't name, each book p35's step, or sum of
/// steps, nearest the frame's (handoff 4's `G06-no-club`, handoff 2's `F01-no-club` and
/// `M01-no-club`), measured between line boxes as `handoff6.spacing` measures.
enum TabGap {
    /// From the header to Friends' and Memories' page titles, as to Home's: 32 (handoff 7's
    /// `noClubRootHeader.contentStart`, `homeContentTopAfterHeader`).
    static let pageTitle = Spacing.xxxl
    /// From G06's lines to Create a club: 70 in the frame.
    static let homeActions = Spacing.xxxl + Spacing.xxxl + Spacing.s
    /// From I have an invite to Private drafts on G06: 54 in the frame.
    static let homeDrafts = Spacing.xxxl + Spacing.xxl
    /// From Friends' title to Private drafts, and from Private drafts to the empty title: 27
    /// and 26 in the frame.
    static let friendsSection = Spacing.xxl
    /// From an empty title to its line, on Friends and Memories: 33 in the frames.
    static let emptyTitleToBody = Spacing.xxxl
    /// From Friends' line to Create a club: 66 in the frame.
    static let friendsActions = Spacing.xxxl + Spacing.xxxl + Spacing.xs
    /// From Memories' page title to its empty title: 93 in the frame.
    static let memoriesEmpty = Spacing.xxxl + Spacing.xxxl + Spacing.xxl + Spacing.xs
    /// From Memories' line to Go to Home's 44-point row: 57 in the frame.
    static let goHome = Spacing.xxxl + Spacing.xxl
    /// From a primary action pinned at a tab's foot to the tab bar: 27 in handoff 6's
    /// `H01-access-lost`.
    static let footer = Spacing.xxl
    /// From a primary action to the secondary one under it, target to target
    /// (`handoff6.spacing.primaryToSecondaryTargetGap`): Choose a club and Get help.
    static let primaryToSecondary = Spacing.s
    /// Handoff 9's frames 7 to 10, Home with no club and accepted invitations
    /// (`G06-no-club-invitation`), between line boxes, each line's top its baseline less 0.82 of
    /// its size, as handoff 7's and 9's frames draw them (which puts everything on whole points:
    /// "Invitations" 32 under the header, as G06-no-club's title): from "Invitations" to the
    /// first row, 24 in the frame.
    static let invitationRows = Spacing.xxl
    /// From the last row to "Start your club.", 32 in the frame.
    static let invitationsStart = Spacing.xxxl
    /// From "Start your club." to its first line, 16 in the frame.
    static let invitationsBody = Spacing.l
    /// Between its two lines, 8 in the frame.
    static let invitationsLines = Spacing.s
    /// From its lines to Create a club, 24 in the frame.
    static let invitationsActions = Spacing.xxl
    /// From I have an invite to Private drafts, 32 in the frame.
    static let invitationsDrafts = Spacing.xxxl
}

/// Where VoiceOver's focus is moved in a tab: the loading label, or the heading of what replaces
/// it.
enum TabFocus: Hashable {
    case loading, heading
}

/// What a tab shows, from the club list and, while it holds clubs, the selected club and its
/// Home (`RootModel.home`): the no-club screens; one loading shell, while the list or the
/// selected club's Home is read; a failure, the list's or Home's, each with its own Retry; a
/// club this build has no screen for; Home before the club starts; and a suspended club's
/// denial, on every tab (T9). Friends and Memories have no screen of their own for a club yet:
/// a suspended club's is the denial, and any other's is this build's (`F01-not-started` and
/// `M01-not-started` are missing; B2 builds the rest).
enum TabShown: Equatable {
    case noClub
    case loading
    case failed(RootModel.Failure)
    case notInThisBuild
    case awaiting(review: Bool)
    case unavailable
    case homeFailed(RootModel.Failure)

    init(
        _ clubs: RootModel.Clubs, selected: ClubSummary?, home: RootModel.Home, on tab: ClubTab
    ) {
        switch clubs {
        case .noClub: self = .noClub
        case .loading: self = .loading
        case .failed(let failure): self = .failed(failure)
        case .listed:
            guard let selected else {
                self = .loading
                return
            }
            if selected.state == .suspended {
                self = .unavailable
                return
            }
            guard tab == .home else {
                self = .notInThisBuild
                return
            }
            switch home {
            case .loading: self = .loading
            case .awaiting(let review): self = .awaiting(review: review)
            case .unavailable: self = .unavailable
            case .notInThisBuild: self = .notInThisBuild
            case .failed(let failure): self = .homeFailed(failure)
            }
        }
    }
}

/// What a tab shows for each state (`TabShown`), in one `TabScroll`: its no-club screen (G06,
/// F01, M01); while the list or Home loads, H01-loading's one neutral shell under the header
/// (handoff 3's `loadingHome`); after either failed, H01-access-lost's form, its title 32 points
/// under the header and read with its line as one group, with Retry pinned at the foot (handoff
/// 7's brief, item 14); when it holds a club this build has no screen for, its title alone:
/// neither empty nor a failure (T49); Home before the club starts (`HomeAwaiting`), with Review
/// members pinned at the foot; and a suspended club's denial (`ClubUnavailable`), with Choose a
/// club and Get help pinned there. Friends and Memories take Home's form for the shell, a failure
/// and this build's title, without their page titles, as handoff 6's `M01-access-lost` does.
///
/// The header is the selected club's while one is selected and not suspended, and otherwise the
/// wordmark's (`TabHeader`).
///
/// When the list or Home answers while VoiceOver is on the loading label, focus moves to the
/// heading of what replaces it; anywhere else, it stays (`loadingAndCutoffFocus`: "move to the
/// resolved heading only if a focused placeholder was removed").
struct TabContent: View {
    let tab: ClubTab
    let clubs: RootModel.Clubs
    let selected: ClubSummary?
    let home: RootModel.Home
    /// The account's accepted invitations, which Home with no club shows first.
    let invitations: [AcceptedInvitation]
    let name: String
    let retry: @MainActor () async -> Void
    let retryHome: @MainActor () async -> Void
    let switchClub: () -> Void
    let createClub: () -> Void
    let openInvite: () -> Void
    let openAccepted: (MyInvitation) -> Void
    let goHome: () -> Void
    /// Review members, under a club that hasn't started: its proposed roster.
    let reviewMembers: () -> Void
    @AccessibilityFocusState private var focus: TabFocus?
    @State private var labelHadFocus = false

    init(
        tab: ClubTab, clubs: RootModel.Clubs, selected: ClubSummary? = nil,
        home: RootModel.Home = .loading, invitations: [AcceptedInvitation] = [], name: String,
        retry: @escaping @MainActor () async -> Void,
        retryHome: @escaping @MainActor () async -> Void = {},
        switchClub: @escaping () -> Void = {}, createClub: @escaping () -> Void = {},
        openInvite: @escaping () -> Void = {},
        openAccepted: @escaping (MyInvitation) -> Void = { _ in }, goHome: @escaping () -> Void,
        reviewMembers: @escaping () -> Void = {}
    ) {
        self.tab = tab
        self.clubs = clubs
        self.selected = selected
        self.home = home
        self.invitations = invitations
        self.name = name
        self.retry = retry
        self.retryHome = retryHome
        self.switchClub = switchClub
        self.createClub = createClub
        self.openInvite = openInvite
        self.openAccepted = openAccepted
        self.goHome = goHome
        self.reviewMembers = reviewMembers
    }

    private var shown: TabShown {
        TabShown(clubs, selected: selected, home: home, on: tab)
    }

    /// The selected club's name, for the header and Home's words, unless it's suspended: then
    /// nothing of it shows (T9).
    private var club: String? {
        guard case .listed = clubs, let selected, selected.state != .suspended else { return nil }
        return selected.name
    }

    var body: some View {
        TabScroll(
            header: TabHeader(name: name, club: club, switchClub: switchClub),
            fills: shown == .loading
        ) {
            state
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
        }
        .onChange(of: focus) { _, now in
            // Focus leaving the label while it still shows is the person moving on; leaving it
            // because the list answered isn't.
            if now == .loading {
                labelHadFocus = true
            } else if shown == .loading {
                labelHadFocus = false
            }
        }
        .onChange(of: shown) { old, new in
            guard old == .loading, new != .loading, labelHadFocus else { return }
            labelHadFocus = false
            // After the heading is in the screen's tree.
            Task { focus = .heading }
        }
    }

    @ViewBuilder private var footer: some View {
        switch shown {
        case .failed:
            retryButton(hint: Text(tab.retryHint), action: retry)
        case .homeFailed:
            retryButton(
                hint: Text(
                    verbatim: String(
                        format: String(localized: "home.retry.hint"), club ?? "")),
                action: retryHome)
        case .awaiting(let review):
            SetupFooter(bottom: TabGap.footer) {
                ReviewMembersButton(club: club ?? "", review: review, action: reviewMembers)
            }
        case .unavailable:
            SetupFooter(bottom: TabGap.footer) {
                ClubUnavailableActions(chooseClub: switchClub)
            }
        case .noClub, .loading, .notInThisBuild:
            EmptyView()
        }
    }

    private func retryButton(
        hint: Text, action: @escaping @MainActor () async -> Void
    ) -> some View {
        SetupFooter(bottom: TabGap.footer) {
            Button {
                Task { await action() }
            } label: {
                Text("common.retry")
            }
            .buttonStyle(.tadayoPrimary)
            .accessibilityHint(hint)
        }
    }

    @ViewBuilder private var state: some View {
        switch shown {
        case .noClub:
            switch tab {
            case .home:
                HomeNoClub(
                    heading: $focus, invitations: invitations, openAccepted: openAccepted,
                    createClub: createClub, openInvite: openInvite)
            case .friends:
                FriendsNoClub(heading: $focus, createClub: createClub, openInvite: openInvite)
            case .memories: MemoriesNoClub(heading: $focus, goHome: goHome)
            }
        case .loading:
            loading
        case .failed(let failure), .homeFailed(let failure):
            // One spoken group, as handoff 6's denial screens read theirs, and a heading, so the
            // rotor still finds it.
            VStack(alignment: .leading, spacing: 0) {
                title(tab.failure)
                Text(failure.line)
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xxl)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(tab.spoken(failure)))
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($focus, equals: .heading)
            .padding(.top, Spacing.xxxl)
        case .notInThisBuild:
            title("tabs.notInThisBuild")
                .accessibilityFocused($focus, equals: .heading)
                .padding(.top, Spacing.xxxl)
        case .awaiting(let review):
            HomeAwaiting(club: club ?? "", review: review, heading: $focus)
        case .unavailable:
            ClubUnavailable(heading: $focus)
        }
    }

    /// The native indeterminate indicator in `secondaryText` over the label, 20 points apart
    /// (handoff 3's `loadingHome`: "UIActivityIndicatorView / indeterminate ProgressView",
    /// "tint": "secondaryText"; H01-loading draws the label about 21 points under the indicator),
    /// two fifths of the way down the space under the header, where H01-loading puts them (246
    /// points above, 365 below): two equal spacers above and three below. The indicator isn't an
    /// element of its own: the label is what VoiceOver reads (`loadingAndCutoffFocus`), with the
    /// selected club's name as its hint while that club's Home loads (handoff 5's
    /// `loading.hint`).
    private var loading: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            ProgressView()
                .tint(Palette.secondaryText)
                .accessibilityHidden(true)
            Text(tab.loading)
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xl)
                .accessibilityHint(loadingHint)
                .accessibilityFocused($focus, equals: .loading)
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    private var loadingHint: Text {
        guard let club else { return Text(verbatim: "") }
        return Text(verbatim: String(format: String(localized: "home.loading.hint"), club))
    }

    /// A state's title: handoff 6's denial screens' `emptyTitle` 25/30, as a heading. Each state
    /// sets it 32 points under the header (`homeContentTopAfterHeader`), outside what VoiceOver
    /// takes as the element, so the element starts where its words do.
    private func title(_ words: LocalizedStringResource) -> some View {
        Text(words)
            .textRole(.emptyTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
    }
}
