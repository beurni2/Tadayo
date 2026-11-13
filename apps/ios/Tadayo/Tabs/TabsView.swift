import SwiftUI
import TadayoCore
import TadayoDesign

/// The tabs (spec 03, D04: Home, Friends and Memories; book p7): the system's tab bar (T45), with
/// handoff 0's SF Symbols `house`, `person.2` and `photo.on.rectangle`, the selected one filled
/// and the others outlined, as handoff 0 names them and every frame draws them, so the symbol
/// and not only its colour shows which is selected (T44), and the selected tab in `action`. Builds
/// with the Lab (LAB: Debug and Dev, which point at `dev`) add a fourth tab holding it, with Log
/// out (TECH-DESIGN section 4); the snapshots leave it out.
///
/// Each tab shows the club list's state under the no-club header with the account's initial
/// (`TabContent`). It takes values, not the root model, so the snapshot tests can draw it in any
/// state. What VoiceOver says, without moving its focus, comes from the club list's changes, for
/// the selected tab (`announcement(from:to:on:)`).
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

    let clubs: RootModel.Clubs
    let name: String
    let showsLab: Bool
    let retry: @MainActor () async -> Void
    let logOut: @MainActor () async -> Void
    @State private var selection: Selection

    init(
        clubs: RootModel.Clubs, name: String, selection: Selection = .home, showsLab: Bool = true,
        retry: @escaping @MainActor () async -> Void,
        logOut: @escaping @MainActor () async -> Void
    ) {
        self.clubs = clubs
        self.name = name
        self.showsLab = showsLab
        self.retry = retry
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
                    Tab(value: Selection.lab) {
                        LabView(logOut: logOut)
                    } label: {
                        Label("Lab", systemImage: "wrench.and.screwdriver")
                            .environment(\.symbolVariants, selection == .lab ? .fill : .none)
                    }
                }
            #endif
        }
        .tint(Palette.action)
        .onChange(of: clubs, initial: true) { old, new in
            let initial = old == new
            guard
                let said = Self.announcement(
                    from: initial ? nil : old, to: new, on: selection.tab)
            else { return }
            Announcement.post(said.words, politely: said.politely)
        }
    }

    /// PROBE (never merges): each tab is a `Tab(value:content:label:)`. Home and Memories set
    /// `\.symbolVariants` on the `Label`; Friends sets it on the icon's `Image` alone. The 27.2
    /// snapshots show which, if either, keeps an unselected symbol outlined.
    private func tab(
        _ tab: ClubTab, label: LocalizedStringKey, symbol: String
    ) -> some SwiftUI.TabContent<Selection> {
        let variants: SymbolVariants = selection == Selection(tab) ? .fill : .none
        return Tab(value: Selection(tab)) {
            TabContent(
                tab: tab, clubs: clubs, name: name, retry: retry, goHome: { selection = .home })
        } label: {
            if tab == .friends {
                Label {
                    Text(label)
                } icon: {
                    Image(systemName: symbol).environment(\.symbolVariants, variants)
                }
            } else {
                Label(label, systemImage: symbol).environment(\.symbolVariants, variants)
            }
        }
    }

    /// What VoiceOver says when the club list becomes `new`, from `old` (nil when the tabs first
    /// show it), on the selected `tab` (nil on the Lab), or nothing:
    /// - the tab's loading label, politely, once: when the tabs show while the list loads, or
    ///   Retry loads it again (handoff 3's `loadingAndCutoffFocus`: "One polite loading
    ///   announcement after the shell is visible");
    /// - "Home updated.", politely, when the list comes back empty on Home (handoff 3's
    ///   `H01.loading.resolvedVO`); Friends and Memories have no such words (FQ90);
    /// - a failure's title and line, or the title of a club this build can't show, as soon as
    ///   it shows, as sign-in says its failures.
    /// Changing tab says nothing more: each tab's words are on its screen.
    static func announcement(
        from old: RootModel.Clubs?, to new: RootModel.Clubs, on tab: ClubTab?
    ) -> (words: String, politely: Bool)? {
        guard let tab, old != new else { return nil }
        switch new {
        case .loading:
            return (String(localized: tab.loading), true)
        case .noClub:
            guard tab == .home, old == .loading else { return nil }
            return (String(localized: "tabs.updated.home"), true)
        case .failed(let failure):
            return (tab.spoken(failure), false)
        case .notInThisBuild:
            return (String(localized: "tabs.notInThisBuild"), false)
        }
    }
}
