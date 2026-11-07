import SwiftUI
import TadayoCore
import TadayoDesign

/// The three tabs of the product (spec 03, D04), each with what it says while the club list
/// loads or fails. Home's words are delivered; Friends' and Memories' are FQ90's defaults, until
/// handoff 7 gives them (its items 15 and 16).
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

/// The header every tab shares while the account has no club (handoff 2's `noClubRootHeader`),
/// with the account's initial. + Add and Account show and do nothing yet (FQ85, ADR-029): Add's
/// picker and the account screen come in later stages.
struct TabHeader: View {
    let name: String

    var body: some View {
        NoClubHeader(
            wordmark: Image("Wordmark"), wordmarkLabel: Text("brand.wordmark"),
            add: Text("header.add"), addHint: Text("header.add.hint"),
            account: Text("header.account"), name: name, onAdd: {}, onAccount: {})
    }
}

/// A tab's column: the header at the top, scrolling with the content under it (handoff 6's
/// FM-02), the content 20 points in from each edge, on `canvas`. Gaps are `handoff6.spacing`'s
/// where it names one, and otherwise book p35's step nearest the frame's, or past its largest
/// step a sum of its steps (`TabGap`); the PR and INVENTORY.md list each.
///
/// One column holds every state of a tab, so the header stays the same view as the club list
/// changes, and VoiceOver's focus on + Add or Account survives it (handoff 3's
/// `loadingAndCutoffFocus`: "preserve focus on surviving header/tab controls"). When `fills`,
/// the column is at least as tall as the space it's shown in, so the loading shell's spacers
/// share what the header leaves, and nothing scrolls.
struct TabScroll<Content: View>: View {
    let name: String
    var fills = false
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { space in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TabHeader(name: name)
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
    }
}

/// The no-club tabs' gaps that `handoff6.spacing` doesn't name, each book p35's step, or sum of
/// steps, nearest the frame's (handoff 4's `G06-no-club`, handoff 2's `F01-no-club` and
/// `M01-no-club`), measured between line boxes as `handoff6.spacing` measures.
enum TabGap {
    /// From the header to Friends' and Memories' page titles: 22 in the frames.
    static let pageTitle = Spacing.xxl
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
}

/// Where VoiceOver's focus is moved in a tab: the loading label, or the heading of what replaces
/// it.
enum TabFocus: Hashable {
    case loading, heading
}

/// What a tab shows for each state of the club list, in one `TabScroll`: its no-club screen
/// (G06, F01, M01); while the list loads, H01-loading's one neutral shell under the no-club header
/// (handoff 3's `loadingHome`); after it failed, H01-access-lost's form, its title 32 points
/// under the header and read with its line as one group, with Retry pinned at the foot (handoff
/// 7's brief, item 14); and when it holds a club this build has no screen for, its title alone:
/// neither empty nor a failure (T49). Friends and Memories take Home's form there, without their
/// page titles, as handoff 6's `M01-access-lost` does.
///
/// When the list answers while VoiceOver is on the loading label, focus moves to the heading of
/// what replaces it; anywhere else, it stays (`loadingAndCutoffFocus`: "move to the resolved
/// heading only if a focused placeholder was removed").
struct TabContent: View {
    let tab: ClubTab
    let clubs: RootModel.Clubs
    let name: String
    let retry: @MainActor () async -> Void
    let goHome: () -> Void
    @AccessibilityFocusState private var focus: TabFocus?
    @State private var labelHadFocus = false

    var body: some View {
        TabScroll(name: name, fills: clubs == .loading) {
            state
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if failed {
                SetupFooter(bottom: TabGap.footer) {
                    Button {
                        Task { await retry() }
                    } label: {
                        Text("common.retry")
                    }
                    .buttonStyle(.tadayoPrimary)
                }
            }
        }
        .onChange(of: focus) { _, now in
            // Focus leaving the label while it still shows is the person moving on; leaving it
            // because the list answered isn't.
            if now == .loading {
                labelHadFocus = true
            } else if clubs == .loading {
                labelHadFocus = false
            }
        }
        .onChange(of: clubs) { old, new in
            guard old == .loading, new != .loading, labelHadFocus else { return }
            labelHadFocus = false
            // After the heading is in the screen's tree.
            Task { focus = .heading }
        }
    }

    private var failed: Bool {
        if case .failed = clubs { true } else { false }
    }

    @ViewBuilder private var state: some View {
        switch clubs {
        case .noClub:
            switch tab {
            case .home: HomeNoClub(heading: $focus)
            case .friends: FriendsNoClub(heading: $focus)
            case .memories: MemoriesNoClub(heading: $focus, goHome: goHome)
            }
        case .loading:
            loading
        case .failed(let failure):
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
        case .notInThisBuild:
            title("tabs.notInThisBuild")
                .accessibilityFocused($focus, equals: .heading)
        }
    }

    /// The native indeterminate indicator in `secondaryText` over the label, 20 points apart
    /// (handoff 3's `loadingHome`: "UIActivityIndicatorView / indeterminate ProgressView",
    /// "tint": "secondaryText"; H01-loading draws the label about 21 points under the indicator),
    /// two fifths of the way down the space under the header, where H01-loading puts them (246
    /// points above, 365 below): two equal spacers above and three below. The indicator isn't an
    /// element of its own: the label is what VoiceOver reads (`loadingAndCutoffFocus`).
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
                .accessibilityFocused($focus, equals: .loading)
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    /// A state's title: handoff 6's denial screens' `emptyTitle` 25/30, as a heading, 32 points
    /// under the header (`homeContentTopAfterHeader`).
    private func title(_ words: LocalizedStringResource) -> some View {
        Text(words)
            .textRole(.emptyTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxxl)
    }
}
