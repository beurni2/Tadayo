import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Inviting someone into an active club (7c; `docs/plans/ios-b1-approve.md` section 2): Club
/// details with Invite someone (handoff 8's frame 16, `G05-club-details-active`), the person's
/// invitation page (frame 14, `G05-members-invite`) in each of its link's states, its failure and
/// loading forms, and Members with the proposer's own proposed row. Ben, the viewer, proposed
/// Nina into Sunday people's five, as frame 14 draws it. The links are made up: no server made
/// them, and none is drawn or read.
@MainActor
final class InviteLaterSnapshotTests: XCTestCase {
    func testG05ClubDetailsActive() {
        snap(details(canInvite: true), named: "G05-club-details-active")
    }

    func testG05MembersInvite() {
        snap(page(Later.nina(.live, shared: true)), named: "G05-members-invite")
    }

    func testG05MembersInviteNotShared() {
        snap(page(Later.nina(.live)), named: "G05-members-invite-not-shared")
    }

    func testG05MembersInviteUsed() {
        snap(page(Later.nina(.used, shared: true)), named: "G05-members-invite-used")
    }

    func testG05MembersInviteAccepted() {
        snap(page(Later.nina(.accepted)), named: "G05-members-invite-accepted")
    }

    func testG05MembersInviteRevoked() {
        snap(page(Later.nina(.revoked)), named: "G05-members-invite-revoked")
    }

    func testG05MembersInviteExpired() {
        snap(page(Later.nina(.expired)), named: "G05-members-invite-expired")
    }

    func testG05MembersInviteFailed() {
        snap(
            page(Later.nina(.revoked), failure: .createNewLink(name: "Nina", network: true)),
            named: "G05-members-invite-failed")
    }

    func testG05MembersInviteLoading() {
        snap(
            pushed(MemberInvitationScreen(state: .loading, row: nil)),
            named: "G05-members-invite-loading", busy: true)
    }

    func testG05MembersWithProposedOwn() {
        snap(members(Later.sundayWithNina), named: "G05-members-with-proposed-own")
    }

    // MARK: Club details' Invite someone

    func testInviteSomeoneShowsOnlyWhenOfferedBetweenMembersAndSchedule() {
        let elements = AccessibilityElements.of(details(canInvite: true))
        let members = elements.firstIndex { $0.label.hasPrefix("Members") }
        let invite = elements.firstIndex { $0.label == "Invite someone" }
        let schedule = elements.firstIndex { $0.label.hasPrefix("Schedule") }
        XCTAssertNotNil(invite, "\(elements)")
        XCTAssertLessThan(members ?? .max, invite ?? .min, "\(elements)")
        XCTAssertLessThan(invite ?? .max, schedule ?? .min, "\(elements)")
        let row = invite.map { elements[$0] }
        XCTAssertEqual(row?.hint, "Propose a new member for Sunday people.", "\(elements)")
        XCTAssertTrue(row?.traits.contains(.button) ?? false, "\(elements)")

        let without = AccessibilityElements.of(details(canInvite: false))
        XCTAssertFalse(without.contains { $0.label.contains("Invite") }, "\(without)")
    }

    func testInviteSomeoneOpensTheNameStep() {
        var opened = 0
        let view = NavigationStack {
            ClubDetailsScreen(
                details: .loaded(Later.sundayDetail), retry: {}, openMembers: {},
                canInvite: true, invite: { opened += 1 })
        }
        XCTAssertTrue(AccessibilityElements.activate("Invite someone", in: view))
        XCTAssertEqual(opened, 1)
    }

    // MARK: The person's invitation page

    func testThePageReadsItsTitleThePersonTheCardAndTheWords() {
        let elements = AccessibilityElements.of(page(Later.nina(.live, shared: true)))
        let title = elements.first { $0.label == "Nina’s invitation" }
        XCTAssertTrue(title?.isHeader ?? false, "\(elements)")
        for words in [
            "Sunday people", "5 current members",
            "Shared. Each person gets a separate link.",
            "New members need everyone’s approval. Nina will see only drops shared after joining.",
        ] {
            XCTAssertTrue(elements.contains { $0.label == words }, "\(words) \(elements)")
        }
        // The person is one element, as Members' proposed row reads, and opens nothing.
        let nina = elements.first { $0.label == "Nina. Proposed by Ben. Proposed." }
        XCTAssertNotNil(nina, "\(elements)")
        XCTAssertFalse(nina?.traits.contains(.button) ?? true, "\(elements)")
        // Handoff 8's spoken names for the two controls.
        let share = elements.first { $0.label == "Share again for Nina" }
        let more = elements.first { $0.label == "More options for Nina’s invitation" }
        XCTAssertTrue(share?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertNotNil(more, "\(elements)")
        XCTAssertFalse(share?.traits.contains(.notEnabled) ?? true, "\(elements)")
        // The link's address is never read (T52), and nothing counts who has decided (T33).
        XCTAssertFalse(
            elements.contains { $0.label.contains("tadayo.app") || $0.label.contains("http") },
            "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.contains("approved") }, "\(elements)")
    }

    func testEachLinkStateOffersTheSetupListsActions() {
        let cases: [(InvitationRow, String?, Bool, String)] = [
            (Later.nina(.live), "Share link for Nina", true, "Not shared."),
            (Later.nina(.live, shared: true), "Share again for Nina", true, "Shared."),
            (
                Later.nina(.live, kept: false), "Create new link for Nina", true,
                "Link not on this phone. A new link replaces the previous link."
            ),
            (
                Later.nina(.used, shared: true), "Share again for Nina", false,
                "Needs to accept again."
            ),
            (
                Later.nina(.used, kept: false), nil, false,
                "Needs to accept again. This invitation link isn’t saved on this device. Nina can "
                    + "reopen the invitation already received."
            ),
            (Later.nina(.accepted), nil, false, "Accepted."),
            (Later.nina(.revoked), "Create new link for Nina", true, "Link revoked."),
            (Later.nina(.expired), "Create new link for Nina", false, "Link expired."),
        ]
        for (row, primary, more, card) in cases {
            let elements = AccessibilityElements.of(page(row))
            let state = "\(row.status)"
            XCTAssertTrue(
                elements.contains { $0.label == "\(card) Each person gets a separate link." },
                "\(state) \(elements)")
            let buttons = elements.filter {
                $0.traits.contains(.button) && $0.label != "Back" && !$0.label.isEmpty
            }
            XCTAssertEqual(
                buttons.map(\.label),
                [primary, more ? "More options for Nina’s invitation" : nil].compactMap { $0 },
                "\(state) \(elements)")
        }
        // A live link not on this phone says what Create new link does (handoff 9).
        let notHeld = AccessibilityElements.of(page(Later.nina(.live, kept: false)))
        XCTAssertEqual(
            notHeld.first { $0.label == "Create new link for Nina" }?.hint,
            "A new link replaces the previous link.", "\(notHeld)")
    }

    func testThePrimaryActsForThePerson() {
        var done: [String] = []
        let actions = MemberInvitationActions(
            share: { done.append("share") }, createNewLink: { done.append("new") })
        XCTAssertTrue(
            AccessibilityElements.activate(
                "Share again for Nina", in: page(Later.nina(.live, shared: true), actions: actions))
        )
        XCTAssertTrue(
            AccessibilityElements.activate(
                "Create new link for Nina", in: page(Later.nina(.revoked), actions: actions)))
        XCTAssertEqual(done, ["share", "new"])
    }

    func testAFailureReadsItsLineAndKeepsTheActions() {
        let elements = AccessibilityElements.of(
            page(Later.nina(.revoked), failure: .createNewLink(name: "Nina", network: true)))
        XCTAssertTrue(
            elements.contains {
                $0.label
                    == "Couldn’t create a new invitation link for Nina. Check your connection and "
                    + "try again."
            }, "\(elements)")
        let retry = elements.first { $0.label == "Create new link for Nina" }
        XCTAssertFalse(retry?.traits.contains(.notEnabled) ?? true, "\(elements)")
    }

    func testWhileAnActionIsOutBothControlsWaitAndThePrimarySaysSo() {
        let elements = AccessibilityElements.of(page(Later.nina(.live, shared: true), busy: true))
        let share = elements.first { $0.label == "Share again for Nina" }
        XCTAssertTrue(share?.traits.contains(.notEnabled) ?? false, "\(elements)")
        XCTAssertEqual(share?.value, "In progress", "\(elements)")
        let more = elements.first { $0.label == "More options for Nina’s invitation" }
        XCTAssertTrue(more?.traits.contains(.notEnabled) ?? false, "\(elements)")
    }

    func testWhileARevokeIsOutTheCardSaysSo() {
        let elements = AccessibilityElements.of(
            page(Later.nina(.live, shared: true), revoking: true))
        XCTAssertTrue(
            elements.contains { $0.label == "Revoking link… Each person gets a separate link." },
            "\(elements)")
        let share = elements.first { $0.label == "Share again for Nina" }
        XCTAssertTrue(share?.traits.contains(.notEnabled) ?? false, "\(elements)")
        XCTAssertNotEqual(share?.value, "In progress", "\(elements)")
    }

    func testTheLoadingAndFailureFormsAreTheSetupLists() {
        XCTAssertTrue(
            AccessibilityElements.of(pushed(MemberInvitationScreen(state: .loading, row: nil)))
                .contains { $0.label == "Loading invitations…" })
        let failed = AccessibilityElements.of(
            pushed(MemberInvitationScreen(state: .failed(.network), row: nil)))
        XCTAssertTrue(
            failed.contains { $0.label == "Couldn’t load invitations." && $0.isHeader },
            "\(failed)")
        XCTAssertEqual(
            failed.first { $0.label == "Retry" }?.hint, "Try loading invitations again.",
            "\(failed)")
    }

    // MARK: Members' way back

    func testTheProposersOwnRowOpensThePage() {
        var opened: [String] = []
        let view = pushed(
            MembersScreen(
                members: .loaded(Later.sundayWithNina), retry: {},
                openInvitation: { opened.append($0) }))
        let nina = AccessibilityElements.of(view).first {
            $0.label == "Nina. Proposed by Ben. Proposed."
        }
        XCTAssertTrue(nina?.traits.contains(.button) ?? false, "\(String(describing: nina))")
        XCTAssertTrue(AccessibilityElements.activate("Nina. Proposed by Ben. Proposed.", in: view))
        XCTAssertEqual(opened, ["cand_nina"])
    }

    func testAnotherMembersCandidateStillOpensNothing() {
        // Leila, proposed by Maya, whom Ben has approved: nothing to open (FQ143).
        let elements = AccessibilityElements.of(members(Later.sundayWithNina))
        let leila = elements.first { $0.label == "Leila. Proposed by Maya. Proposed." }
        XCTAssertNotNil(leila, "\(elements)")
        XCTAssertFalse(leila?.traits.contains(.button) ?? true, "\(elements)")
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.details])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func details(canInvite: Bool) -> some View {
        pushed(
            ClubDetailsScreen(
                details: .loaded(Later.sundayDetail), retry: {}, openMembers: {},
                canInvite: canInvite))
    }

    private func page(
        _ row: InvitationRow, failure: InvitationListModel.ActionFailure? = nil,
        busy: Bool = false, revoking: Bool = false,
        actions: MemberInvitationActions = MemberInvitationActions()
    ) -> some View {
        pushed(
            MemberInvitationScreen(
                state: Later.list(row), row: row, busy: busy, revoking: revoking,
                failure: failure, actions: actions))
    }

    private func members(_ roster: Roster) -> some View {
        pushed(MembersScreen(members: .loaded(roster), retry: {}))
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}

/// Sunday people active with Ben, Maya, Alex, Sam and Debby, Ben the viewer, and Ben's proposal
/// of Nina open (handoff 8's frames 14 and 16).
private enum Later {
    static let club = ClubRef(
        id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
        myMembershipID: "mem_Ben")
    private static let now = Date(timeIntervalSince1970: 1_793_000_000)
    private static let expiry = Date(timeIntervalSince1970: 1_793_600_000)
    private static let names = ["Ben", "Maya", "Alex", "Sam", "Debby"]
    private static let people = names.map {
        Person(membershipID: "mem_\($0)", displayName: $0, avatarVersion: nil)
    }

    /// Club details for the five, a place free (frame 16).
    static let sundayDetail = ClubDetail(
        serverClock: ServerClock(serverNow: now, receivedAt: .now),
        club: ClubSummary(ref: club, state: .active, memberCount: 5, openDay: nil, nextDay: nil),
        rosterVersion: 5, canPropose: true, openRevisionID: nil)

    /// The page's list: Nina's row alone, as the model makes it for Nina.
    static func list(_ row: InvitationRow) -> InvitationListModel.State {
        .loaded(
            InvitationList(
                club: club, state: .active, memberCount: 5, rows: [row], canInvite: true,
                awaitingMyApproval: false))
    }

    /// Nina's row, the link in `state`, kept or not, shared or not.
    static func nina(_ state: CandidateLinkState, kept: Bool = true, shared: Bool = false)
        -> InvitationRow
    {
        let invitation = CandidateInvitation(id: "inv_nina", state: state, expiresAt: expiry)
        let link = URL(string: "https://tadayo.app/i#" + String(repeating: "A", count: 43))
        let held = link.flatMap { url in
            kept
                ? KeptInvitationLink(
                    clubID: club.id, candidateID: "cand_nina", invitationID: invitation.id,
                    url: url, shared: shared)
                : nil
        }
        return InvitationRow(
            Candidate(id: "cand_nina", name: "Nina", proposedBy: people[0], invitation: invitation),
            kept: held)
    }

    /// Members with Ben's Nina, decided by proposing (FQ60), and Maya's Leila, both proposed in
    /// the open revision Ben has approved, one weekday each for the five.
    static let sundayWithNina: Roster = {
        let revision = RosterRevision(
            id: "rev_nina", version: 6, club: club, state: .open, proposedBy: people[0],
            members: people,
            candidates: [
                Candidate(id: "cand_nina", name: "Nina", proposedBy: people[0], invitation: nil),
                Candidate(id: "cand_leila", name: "Leila", proposedBy: people[1], invitation: nil),
            ],
            myDecision: .approved, supersededBy: nil)
        return ClubFixtures.roster(
            "club_sunday", "Sunday people",
            [
                ("Ben", [.monday]), ("Maya", [.tuesday]), ("Alex", [.wednesday]),
                ("Sam", [.thursday]), ("Debby", [.friday]),
            ], open: revision)
    }()
}
