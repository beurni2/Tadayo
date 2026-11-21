import SwiftUI
import TadayoCore
import TadayoDesign

/// The tabs (spec 03, D04: Home, Friends and Memories; book p7): the system's tab bar (T45), with
/// handoff 0's SF Symbols `house`, `person.2` and `photo.on.rectangle`, and the selected tab in
/// `action`. Each tab asks for its symbol filled when selected and outlined otherwise, as handoff 0
/// names them and every frame draws them, so the symbol and not only its colour shows which is
/// selected (T44). iOS 26.5 draws that; iOS 27.2's tab bar fills every symbol, whether `.fill` or
/// `.none` is asked, so there the glass selection and the selected tab's tint, `action` as the
/// system draws it through the glass, show which is selected (`docs/LIMITATIONS.md`, 2026-11-13,
/// the tab symbols; `docs/design/handoff-7/ios-lane-needs.md`, item 60).
/// Builds with the Lab (LAB: Debug and Dev, which point at `dev`) add a fourth tab holding it,
/// with Log out (TECH-DESIGN section 4); the snapshots leave it out.
///
/// Each tab shows the club list's state and, while it holds clubs, the selected club's, under the
/// header with the account's initial (`TabContent`). The header's selector, and a suspended
/// club's Choose a club, open the switcher (`ClubSwitcher`) in the system's sheet. It takes
/// values, not the root model, so the snapshot tests can draw it in any state. What VoiceOver
/// says, without moving its focus, comes from what the selected tab shows as it changes
/// (`announcement(from:to:on:)`).
///
/// Each club tab holds its own navigation stack, its root's bar hidden, so the tab looks as it
/// did without one. The switcher's Club details closes the sheet, then pushes Club details for
/// the selected club onto the selected tab (`ClubRoute`), with the model `details` makes; Members
/// is pushed from there, once however fast it's tapped. Back returns to the tab as it was. The
/// pushed screens close when the club they show stops being the selected one (another is chosen,
/// or the list is read again) and as soon as a read says the club is no longer the caller's
/// (`ClubDetailsModel.closed`), whenever the list's own read answers. The model stays after they
/// close, so a screen sliding away keeps drawing what it showed, until the next Club details
/// replaces it or the tabs go with the session.
struct TabsView: View {
    enum Selection: Hashable {
        case home, friends, memories, lab

        init(_ tab: ClubTab) {
            switch tab {
            case .home: self = .home
            case .friends: self = .friends
            case .memories: self = .memories
            }
        }

        var tab: ClubTab? {
            switch self {
            case .home: .home
            case .friends: .friends
            case .memories: .memories
            case .lab: nil
            }
        }
    }

    /// What the tabs are drawn from: the club list, and while it holds clubs the selected club
    /// and its Home.
    struct Values: Equatable {
        var clubs: RootModel.Clubs
        var selected: ClubSummary?
        var home: RootModel.Home

        func shown(on tab: ClubTab) -> TabShown {
            TabShown(clubs, selected: selected, home: home, on: tab)
        }
    }

    let state: Values
    let name: String
    let showsLab: Bool
    let retry: @MainActor () async -> Void
    let retryHome: @MainActor () async -> Void
    let select: @MainActor (String) async -> Void
    let logOut: @MainActor () async -> Void
    let details: @MainActor () -> ClubDetailsModel?
    @State private var selection: Selection
    @State private var switching = false
    /// Each club tab's pushed screens.
    @State private var paths: [ClubTab: [ClubRoute]] = [:]
    /// The selected club's Club details and members list: the last opened.
    @State private var shownDetails: ClubDetailsModel?
    /// The switcher's Club details was chosen: pushed once the sheet has closed.
    @State private var detailsChosen = false

    init(
        clubs: RootModel.Clubs, selected: ClubSummary? = nil, home: RootModel.Home = .loading,
        name: String, selection: Selection = .home, showsLab: Bool = true,
        retry: @escaping @MainActor () async -> Void,
        retryHome: @escaping @MainActor () async -> Void = {},
        select: @escaping @MainActor (String) async -> Void = { _ in },
        details: @escaping @MainActor () -> ClubDetailsModel? = { nil },
        logOut: @escaping @MainActor () async -> Void
    ) {
        self.state = Values(clubs: clubs, selected: selected, home: home)
        self.name = name
        self.showsLab = showsLab
        self.retry = retry
        self.retryHome = retryHome
        self.select = select
        self.details = details
        self.logOut = logOut
        _selection = State(initialValue: selection)
    }

    var body: some View {
        TabView(selection: $selection) {
            tab(.home, label: "tabs.home", symbol: "house")
            tab(.friends, label: "tabs.friends", symbol: "person.2")
            tab(.memories, label: "tabs.memories", symbol: "photo.on.rectangle")
            #if LAB
                if showsLab {
                    LabView(logOut: logOut)
                        .tabItem {
                            Label("Lab", systemImage: "wrench.and.screwdriver")
                                .environment(
                                    \.symbolVariants, selection == .lab ? .fill : .none)
                        }
                        .tag(Selection.lab)
                }
            #endif
        }
        .tint(Palette.action)
        .onChange(of: state, initial: true) { old, new in
            guard let tab = selection.tab else { return }
            let initial = old == new
            guard
                let said = Self.announcement(
                    from: initial ? nil : old.shown(on: tab), to: new.shown(on: tab), on: tab)
            else { return }
            Announcement.post(said.words, politely: said.politely)
        }
        .onChange(of: state.clubs) { _, now in
            // A list loaded again has no clubs to choose from until it answers, and nothing
            // pushed for a club stays while it's read.
            if case .listed = now {
            } else {
                switching = false
                closeClubScreens()
            }
        }
        .onChange(of: state.selected?.id) { _, _ in
            closeClubScreens()
        }
        .onChange(of: shownDetails?.closed ?? false) { _, closed in
            if closed { closeClubScreens() }
        }
        .sheet(isPresented: $switching, onDismiss: openChosenDetails) {
            if case .listed(let list) = state.clubs {
                ClubSwitcher(
                    clubs: list.clubs, selectedID: state.selected?.id,
                    select: { club in Task { await select(club) } },
                    openDetails: { detailsChosen = true }
                )
                .fittedSheet()
            }
        }
    }

    /// Club details for the selected club, on the selected tab, once the switcher has closed.
    private func openChosenDetails() {
        guard detailsChosen else { return }
        detailsChosen = false
        guard let tab = selection.tab, let model = details() else { return }
        shownDetails = model
        paths[tab] = [.details]
    }

    private func closeClubScreens() {
        paths = [:]
        detailsChosen = false
    }

    private func path(for tab: ClubTab) -> Binding<[ClubRoute]> {
        Binding(
            get: { paths[tab] ?? [] },
            set: { paths[tab] = $0 })
    }

    @ViewBuilder private func destination(_ route: ClubRoute, on tab: ClubTab) -> some View {
        if let shownDetails {
            switch route {
            case .details:
                ClubDetailsDestination(model: shownDetails) {
                    // A second tap while Members slides in pushes nothing more.
                    guard paths[tab]?.last == .details else { return }
                    paths[tab, default: []].append(.members)
                }
            case .members:
                MembersDestination(model: shownDetails)
            }
        }
    }

    private func tab(_ tab: ClubTab, label: LocalizedStringKey, symbol: String) -> some View {
        NavigationStack(path: path(for: tab)) {
            TabContent(
                tab: tab, clubs: state.clubs, selected: state.selected, home: state.home,
                name: name, retry: retry, retryHome: retryHome, switchClub: { switching = true },
                goHome: { selection = .home }
            )
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: ClubRoute.self) { route in
                destination(route, on: tab)
            }
        }
        .tabItem {
            Label(label, systemImage: symbol)
                .environment(\.symbolVariants, selection == Selection(tab) ? .fill : .none)
        }
        .tag(Selection(tab))
    }

    /// What VoiceOver says when the selected `tab` (nil on the Lab) comes to show `new`, from
    /// `old` (nil when the tabs first show it), or nothing:
    /// - the tab's loading label, politely, once: when the tabs show while the list loads, or
    ///   Retry loads it, or Home, again, or another club is chosen (handoff 3's
    ///   `loadingAndCutoffFocus`: "One polite loading announcement after the shell is visible");
    ///   the list's answer, while the selected club's Home is still read, says nothing more;
    /// - "Home updated.", politely, when Home comes back from loading empty or before its club
    ///   starts (handoff 3's `H01.loading.resolvedVO`); Friends and Memories have no such words
    ///   (FQ90);
    /// - a failure's title and line, the title of a club this build can't show, or a suspended
    ///   club's denial (handoff 6's `denied.group.vo`), as soon as it shows, as sign-in says its
    ///   failures.
    /// Changing tab says nothing more: each tab's words are on its screen.
    static func announcement(
        from old: TabShown?, to new: TabShown, on tab: ClubTab?
    ) -> (words: String, politely: Bool)? {
        guard let tab, old != new else { return nil }
        switch new {
        case .loading:
            return (String(localized: tab.loading), true)
        case .noClub, .awaiting:
            guard tab == .home, old == .loading else { return nil }
            return (String(localized: "tabs.updated.home"), true)
        case .failed(let failure), .homeFailed(let failure):
            return (tab.spoken(failure), false)
        case .notInThisBuild:
            return (String(localized: "tabs.notInThisBuild"), false)
        case .unavailable:
            return (ClubUnavailable.spoken, false)
        }
    }
}

extension View {
    /// The system's sheet, as high as what it holds, up to the screen, with its grabber
    /// (G06-switcher's sheet).
    func fittedSheet() -> some View {
        modifier(FittedSheet())
    }
}

private struct FittedSheet: ViewModifier {
    @State private var height: CGFloat?

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentSize.height
            } action: { _, now in
                height = now
            }
            .presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationBackground(Palette.canvas)
    }

    private var detents: Set<PresentationDetent> {
        if let height { [.height(height)] } else { [.medium] }
    }
}
