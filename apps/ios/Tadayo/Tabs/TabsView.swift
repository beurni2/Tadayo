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
/// (`announcement(from:to:on:)`), and, once the screens pushed over it close, from what changed
/// under them (`TabAnnouncer`).
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
///
/// Create a club, on a tab with no club or in the switcher (which closes first), pushes
/// G01-create onto that tab, with the model `createClub` makes. Once the club is made its setup
/// list takes G01-create's place, with the model `invitations` makes, so Back returns to the tab,
/// where Home now shows the new club; Create an invitation pushes the name step over the list,
/// which returns to it once its share sheet closes; Done for now puts the waiting screen in the
/// list's place (`docs/plans/ios-b1-create.md` section 7). These screens are the new club's, not
/// the selected club's: they stay while the list is read again and another club is selected, and
/// close when the list's model says the club is no longer the caller's, or with the tabs.
///
/// I have an invite, on a tab with no club, pushes the paste step onto that tab, with the model
/// `linkEntry` makes, in place of any paste step on another tab. Continue checks the link there,
/// then pushes the invitation it found; Back returns to the field as it was. Not now, Done and
/// Close invitation close both, back to the tab; an Accept or a check that joins the club closes
/// them once the list has been read again, so Home opens on the club. These screens stay while the
/// list is read again, and go with the tabs (`docs/plans/ios-b1-invitation.md` section 5).
///
/// An accepted invitation's row, on Home with no club or in the switcher (which closes first),
/// asks the root to open it (`openAccepted`), and the invitation the root then shows is pushed
/// onto that tab (`.accepted`), with the tab bar hidden; one whose link this phone doesn't hold
/// (`reopenLink`, FQ136) opens the paste step instead. Done, Not now, Close invitation and Back
/// close it through the root, and the root closing it (a join, once the list has been read
/// again) takes it off the tab (`docs/plans/ios-b1-invitation.md` section 6).
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
        var accepted: [AcceptedInvitation] = []

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
    let createClub: @MainActor () -> CreateClubModel?
    let invitations: @MainActor (ClubRef) -> InvitationListModel?
    let linkEntry: @MainActor () -> InvitationLinkEntryModel?
    /// The invitation the root shows, from an accepted invitation's row, and how to open and close
    /// one.
    let invitation: InvitationModel?
    let openAccepted: @MainActor (MyInvitation) async -> Void
    let closeInvitation: @MainActor () -> Void
    @State private var selection: Selection
    @State private var switching = false
    /// Each club tab's pushed screens.
    @State private var paths: [ClubTab: [ClubRoute]] = [:]
    /// The selected club's Club details and members list: the last opened.
    @State private var shownDetails: ClubDetailsModel?
    /// The switcher's Club details was chosen: pushed once the sheet has closed.
    @State private var detailsChosen = false
    /// The switcher's Create a club was chosen: pushed once the sheet has closed.
    @State private var createChosen = false
    /// Naming the club being made, its setup list, and the name step's latest model.
    @State private var creating: CreateClubModel?
    @State private var inviting: InvitationListModel?
    @State private var naming: InviteNameModel?
    /// The waiting screen asks for the creator's review (`G01-pending-approve`).
    @State private var pendingReview = false
    /// I have an invite's paste step, and the invitation it last pushed, which stays drawn while
    /// it slides away.
    @State private var entering: InvitationLinkEntryModel?
    @State private var shownInvitation: InvitationModel?
    /// The tab whose accepted invitation's row was chosen, until the root shows the invitation;
    /// the switcher's row, until the sheet has closed; and the root's invitation last pushed,
    /// which stays drawn while it slides away.
    @State private var acceptedOn: ClubTab?
    @State private var acceptedChosen: MyInvitation?
    @State private var shownAccepted: InvitationModel?
    /// What VoiceOver has been told of the selected tab, across the screens pushed over it.
    @State private var announcer = TabAnnouncer()

    init(
        clubs: RootModel.Clubs, selected: ClubSummary? = nil, home: RootModel.Home = .loading,
        accepted: [AcceptedInvitation] = [], name: String, selection: Selection = .home,
        showsLab: Bool = true,
        retry: @escaping @MainActor () async -> Void,
        retryHome: @escaping @MainActor () async -> Void = {},
        select: @escaping @MainActor (String) async -> Void = { _ in },
        details: @escaping @MainActor () -> ClubDetailsModel? = { nil },
        createClub: @escaping @MainActor () -> CreateClubModel? = { nil },
        invitations: @escaping @MainActor (ClubRef) -> InvitationListModel? = { _ in nil },
        linkEntry: @escaping @MainActor () -> InvitationLinkEntryModel? = { nil },
        invitation: InvitationModel? = nil,
        openAccepted: @escaping @MainActor (MyInvitation) async -> Void = { _ in },
        closeInvitation: @escaping @MainActor () -> Void = {},
        logOut: @escaping @MainActor () async -> Void
    ) {
        self.state = Values(
            clubs: clubs, selected: selected, home: home, accepted: accepted)
        self.name = name
        self.showsLab = showsLab
        self.retry = retry
        self.retryHome = retryHome
        self.select = select
        self.details = details
        self.createClub = createClub
        self.invitations = invitations
        self.linkEntry = linkEntry
        self.invitation = invitation
        self.openAccepted = openAccepted
        self.closeInvitation = closeInvitation
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
        .overlay(alignment: .topLeading) { ProbeTraceView() }
        .onChange(of: seen, initial: true) { old, new in
            guard let said = announcer.saw(new, after: old == new ? nil : old) else { return }
            Announcement.post(said.words, politely: said.politely)
        }
        .onChange(of: state.clubs) { _, now in
            Probe.note("tabs clubs \(Probe.short(now, 14)) paths=\(paths)")
            // A list loaded again has no clubs to choose from until it answers, and nothing
            // pushed for a club stays while it's read.
            if case .listed = now {
            } else {
                switching = false
                closeClubScreens()
            }
        }
        .onChange(of: state.selected?.id) { _, now in
            Probe.note("tabs selected \(now ?? "nil") paths=\(paths)")
            closeClubScreens()
        }
        .onChange(of: shownDetails?.closed ?? false) { _, closed in
            if closed { closeClubScreens() }
        }
        .onChange(of: inviting?.closed ?? false) { _, closed in
            if closed { closeCreateScreens() }
        }
        .onChange(of: invitation.map(ObjectIdentifier.init)) { _, _ in
            rootInvitationChanged()
        }
        .sheet(isPresented: $switching, onDismiss: openChosen) {
            if case .listed(let list) = state.clubs {
                ClubSwitcher(
                    clubs: list.clubs, selectedID: state.selected?.id,
                    invitations: state.accepted,
                    select: { club in Task { await select(club) } },
                    openAccepted: { acceptedChosen = $0 },
                    openDetails: { detailsChosen = true },
                    createClub: { createChosen = true }
                )
                .fittedSheet()
            }
        }
    }

    /// What the selected tab shows, and whether a screen is pushed over it.
    private var seen: TabAnnouncer.Seen {
        let tab = selection.tab
        return TabAnnouncer.Seen(
            tab: tab, shown: state.shown(on: tab ?? .home),
            covered: tab.map { !(paths[$0]?.isEmpty ?? true) } ?? false)
    }

    /// Club details for the selected club, or G01-create, on the selected tab, once the switcher
    /// has closed.
    private func openChosen() {
        defer { (detailsChosen, createChosen, acceptedChosen) = (false, false, nil) }
        guard let tab = selection.tab else { return }
        if let acceptedChosen {
            open(acceptedChosen, on: tab)
        } else if createChosen {
            startCreating(on: tab)
        } else if detailsChosen, let model = details() {
            shownDetails = model
            paths[tab] = [.details]
        }
    }

    /// The selected club's pushed screens close; the club being made and I have an invite keep
    /// their own.
    private func closeClubScreens() {
        paths = paths.filter { _, route in
            guard let first = route.first else { return false }
            return first.isCreateFlow || first.isInvitationFlow
        }
        detailsChosen = false
    }

    private func closeCreateScreens() {
        paths = paths.filter { !($0.value.first?.isCreateFlow ?? false) }
    }

    /// I have an invite: the paste step on `tab`, in place of any on another tab, whose
    /// invitation is done with.
    private func openLinkEntry(on tab: ClubTab) {
        guard let model = linkEntry() else { return }
        closeInvitationScreens()
        entering = model
        paths[tab] = [.linkEntry]
    }

    /// Continue: the link checked on the paste step, then the invitation it found pushed over it,
    /// or, for a club the account is already in, the paste step closed once the list has been
    /// read again.
    private func proceed(on tab: ClubTab) async {
        // Only from the paste step on top: a Continue that lands once the invitation it found
        // is pushed (while it slides in) checks nothing and closes nothing.
        guard let model = entering, paths[tab]?.last == .linkEntry else { return }
        await model.proceed()
        guard entering === model, paths[tab]?.last == .linkEntry else {
            // The paste step was left while its link was checked: what it found is let go.
            model.left()
            return
        }
        if model.opened != nil {
            closeInvitationScreens()
        } else if let invitation = model.invitation {
            shownInvitation = invitation
            paths[tab, default: []].append(.invitation)
        }
    }

    /// After Accept or Retry has answered: a club joined (`opening`) closes the invitation and
    /// the paste step, the list having been read again. An invitation left with Back while its
    /// Accept was on its way opens nothing; when the server joined all the same, the root reads
    /// the list again (`RootModel`'s `joinedWhileClosed`), so Home shows the club.
    private func answered(_ model: InvitationModel) {
        guard entering?.invitation === model, case .opening = model.state else { return }
        closeInvitationScreens()
    }

    /// I have an invite's screens close, and the paste step and the invitation shown are done
    /// with.
    private func closeInvitationScreens() {
        Probe.note("tabs closeInvitationScreens paths=\(paths)")
        entering?.left()
        if paths.values.contains(where: { $0.contains(.accepted) }) { closeInvitation() }
        paths = paths.filter { !($0.value.first?.isInvitationFlow ?? false) }
    }

    /// An accepted invitation's row on `tab`: the root opens it, and `rootInvitationChanged`
    /// pushes what it shows. Any I have an invite screens close first.
    private func open(_ accepted: MyInvitation, on tab: ClubTab) {
        Probe.note("tabs open row on \(tab)")
        closeInvitationScreens()
        acceptedOn = tab
        Task { await openAccepted(accepted) }
    }

    /// The root's invitation came or went. One a row asked for is pushed onto the row's tab, or,
    /// with no link held for a changed roster, gives way to the paste step (FQ136). Gone, it's
    /// taken off every tab; a row chosen meanwhile still waits for its own.
    private func rootInvitationChanged() {
        Probe.note(
            "tabs rootChanged \(Probe.id(invitation)) \(invitation.map { Probe.short($0.state, 14) } ?? "-") on=\(acceptedOn.map { "\($0)" } ?? "nil") paths=\(paths)"
        )
        guard let model = invitation else {
            for tab in Array(paths.keys) where paths[tab]?.contains(.accepted) == true {
                paths[tab]?.removeAll { $0 == .accepted }
            }
            return
        }
        guard let tab = acceptedOn else { return }
        acceptedOn = nil
        if case .reopenLink = model.state {
            closeInvitation()
            openLinkEntry(on: tab)
            return
        }
        shownAccepted = model
        paths[tab] = [.accepted]
    }

    /// Once no tab shows I have an invite's screens and theirs have slid away, what they held
    /// goes from memory too: the text typed, which may be a link, and the invitation found.
    private func forgetInvitationScreensIfGone() {
        guard !paths.values.contains(where: { $0.first?.isInvitationFlow ?? false }) else {
            return
        }
        entering?.left()
        entering = nil
        shownInvitation = nil
        shownAccepted = nil
    }

    /// Create a club: G01-create on `tab`, in place of any club being made on another tab.
    private func startCreating(on tab: ClubTab) {
        guard let model = createClub() else { return }
        closeCreateScreens()
        (creating, inviting, naming) = (model, nil, nil)
        paths[tab] = [.create]
    }

    /// The club is made: its setup list in G01-create's place.
    private func showInvitations(for club: ClubRef, on tab: ClubTab) {
        guard paths[tab] == [.create], let model = invitations(club) else { return }
        inviting = model
        paths[tab] = [.invitations]
    }

    /// Create an invitation: the name step over the list, once however fast it's tapped.
    private func openNameStep(on tab: ClubTab) {
        guard paths[tab]?.last == .invitations, let model = inviting?.makeInvite() else { return }
        naming = model
        paths[tab, default: []].append(.inviteName)
    }

    /// The name step's share sheet closed: back to the list.
    private func closeNameStep(on tab: ClubTab) {
        guard paths[tab]?.last == .inviteName else { return }
        paths[tab]?.removeLast()
    }

    /// Done for now: the waiting screen in the list's place.
    private func showPending(review: Bool, on tab: ClubTab) {
        guard paths[tab]?.last == .invitations else { return }
        pendingReview = review
        paths[tab] = [.pending]
    }

    private func path(for tab: ClubTab) -> Binding<[ClubRoute]> {
        Binding(
            get: { paths[tab] ?? [] },
            set: { now in
                Probe.note("tabs set \(tab) \(paths[tab] ?? [])→\(now)")
                // Back from the invitation: the paste step is as it was.
                if paths[tab]?.last == .invitation, now.last != .invitation {
                    entering?.returned()
                }
                // Back from the paste step, even while its link is checked: it's done with.
                if paths[tab]?.contains(.linkEntry) == true, !now.contains(.linkEntry) {
                    entering?.left()
                }
                // Back from an accepted invitation: the root closes it.
                if paths[tab]?.contains(.accepted) == true, !now.contains(.accepted) {
                    closeInvitation()
                }
                paths[tab] = now
            })
    }

    @ViewBuilder private func destination(_ route: ClubRoute, on tab: ClubTab) -> some View {
        switch route {
        case .details:
            if let shownDetails {
                ClubDetailsDestination(model: shownDetails) {
                    // A second tap while Members slides in pushes nothing more.
                    guard paths[tab]?.last == .details else { return }
                    paths[tab, default: []].append(.members)
                }
            }
        case .members:
            if let shownDetails {
                MembersDestination(model: shownDetails)
            }
        case .create:
            if let creating {
                CreateClubDestination(model: creating) { club in
                    showInvitations(for: club, on: tab)
                }
            }
        case .invitations:
            if let inviting {
                InvitationsDestination(
                    model: inviting, invite: { openNameStep(on: tab) },
                    done: { review in showPending(review: review, on: tab) })
            }
        case .inviteName:
            if let naming {
                InviteNameScreen(model: naming) { closeNameStep(on: tab) }
            }
        case .pending:
            if let inviting {
                PendingScreen(club: inviting.club.name, review: pendingReview)
            }
        case .linkEntry:
            if let entering {
                LinkEntryScreen(model: entering) { await proceed(on: tab) }
                    .onDisappear { forgetInvitationScreensIfGone() }
            }
        case .invitation:
            if let shownInvitation {
                InvitationDestination(
                    model: shownInvitation, returnsTo: tab.title,
                    answered: { answered($0) }, leave: { closeInvitationScreens() }
                )
                .onDisappear { forgetInvitationScreensIfGone() }
            }
        case .accepted:
            if let shownAccepted {
                // A join closes it through the root, once the list has been read again.
                InvitationDestination(
                    model: shownAccepted, returnsTo: tab.title,
                    answered: { model in
                        Probe.note(
                            "tabs acceptedAnswered \(Probe.id(model)) \(Probe.short(model.state, 14)) closed=\(model.isClosed) root=\(Probe.id(invitation)) paths=\(paths)"
                        )
                    },
                    leave: { closeInvitation() }
                )
                .onDisappear { forgetInvitationScreensIfGone() }
            }
        }
    }

    private func tab(_ tab: ClubTab, label: LocalizedStringKey, symbol: String) -> some View {
        NavigationStack(path: path(for: tab)) {
            TabContent(
                tab: tab, clubs: state.clubs, selected: state.selected, home: state.home,
                invitations: state.accepted, name: name, retry: retry, retryHome: retryHome,
                switchClub: { switching = true }, createClub: { startCreating(on: tab) },
                openInvite: { openLinkEntry(on: tab) },
                openAccepted: { open($0, on: tab) }, goHome: { selection = .home }
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
    /// Changing tab says nothing more: each tab's words are on its screen. Nor does a change
    /// while a screen is pushed over the tab, which the person isn't looking at; once the screen
    /// closes, what changed under it is said (`returned(from:to:on:)`).
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

    /// What VoiceOver says when the last screen pushed over the selected `tab` closes, if what
    /// the tab shows changed under it from `before` to `now`: what `now` says when it has just
    /// loaded, as the tab itself would have said it, or its loading label while it still loads.
    /// So the list read again under G03-waiting says nothing while the screen shows, and once
    /// Done shows Home, "Home updated." for the club just joined, or the read's failure at once;
    /// and nothing when Home shows what it showed before.
    static func returned(
        from before: TabShown, to now: TabShown, on tab: ClubTab?
    ) -> (words: String, politely: Bool)? {
        guard before != now else { return nil }
        return announcement(from: now == .loading ? nil : .loading, to: now, on: tab)
    }
}

/// What VoiceOver is told as the selected tab changes (`TabsView.announcement(from:to:on:)`),
/// and across the screens pushed over it: nothing while one is, and once the last closes, what
/// changed under it since the first was pushed (`TabsView.returned(from:to:on:)`). One value
/// carries the tab, what it shows and whether it's covered, so a push or a close in the same
/// update as a change is read once, whatever order SwiftUI reports them in.
struct TabAnnouncer {
    /// What the selected tab (nil on the Lab) shows, and whether a screen is pushed over it.
    struct Seen: Equatable {
        var tab: ClubTab?
        var shown: TabShown
        var covered: Bool
    }

    /// What the selected tab showed when it was first covered, while it still is.
    private var hidden: TabShown?

    /// What to say as the tabs come to show `new`, from `old` (nil when they first show).
    mutating func saw(_ new: Seen, after old: Seen?) -> (words: String, politely: Bool)? {
        if let old, old.tab != new.tab {
            // Changing tab says nothing: each tab's words are on its screen.
            hidden = new.covered ? new.shown : nil
            return nil
        }
        if new.covered {
            if hidden == nil { hidden = old?.shown ?? new.shown }
            return nil
        }
        if let before = hidden {
            hidden = nil
            return TabsView.returned(from: before, to: new.shown, on: new.tab)
        }
        return TabsView.announcement(from: old?.shown, to: new.shown, on: new.tab)
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
