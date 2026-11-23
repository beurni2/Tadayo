import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// The create flow's screens in each of their states (design/reference/INVENTORY.md): 2.1's
/// `G01-create`, handoff 8's `G01-create-failed`, handoff 2's `G01-invite-name`, handoff 1's
/// `G01-invite-people` with handoff 4's statuses and More, handoff 2's `-add` and `-xl`, handoff
/// 4's `-revoked` and `G01-pending`, handoff 8's `-accept-again` and `G01-pending-approve`,
/// handoff 9's `-live-not-held`, `-expired` and `-action-failed` (frames 15 to 17), and the states
/// built from spec: the list before anyone is invited, a used link the app doesn't hold, the list
/// loading and failing, the name step's failure, and each name over 40 characters. Each is
/// pushed onto a stack, as the tab pushes it, so
/// the system's Back shows as the frames draw it. The people are the frames' own: Ben's Sunday
/// people, with Maya, Alex, Sam, Debby and Nina (`Invites`).
@MainActor
final class ClubCreateSnapshotTests: XCTestCase {
    // MARK: Naming the club

    func testG01Create() {
        snap(
            pushed(CreateClubScreen(model: naming(), focus: false, keyboard: false)),
            named: "G01-create")
    }

    func testG01CreateNameTooLong() {
        let model = naming()
        model.name = Invites.longClubName
        XCTAssertTrue(model.nameIsTooLong)
        snap(
            pushed(CreateClubScreen(model: model, focus: false, keyboard: false)),
            named: "G01-create-name-too-long")
    }

    func testG01CreateFailed() {
        let model = naming()
        drive({ await model.create() }, until: { model.failure != nil })
        snap(
            pushed(CreateClubScreen(model: model, focus: false, keyboard: false)),
            named: "G01-create-failed")
    }

    // MARK: The name step

    func testG01InviteName() {
        snap(
            pushed(InviteNameScreen(model: nameStep(), finished: {}, focus: true)),
            named: "G01-invite-name")
    }

    func testG01InviteNameTooLong() {
        let model = nameStep()
        model.name = Invites.longName
        XCTAssertTrue(model.nameIsTooLong)
        snap(
            pushed(InviteNameScreen(model: model, finished: {}, focus: false)),
            named: "G01-invite-name-too-long")
    }

    func testG01InviteNameFailed() {
        let model = nameStep()
        drive({ _ = await model.createLinkAndShare() }, until: { model.failure != nil })
        snap(
            pushed(InviteNameScreen(model: model, finished: {}, focus: false)),
            named: "G01-invite-name-failed")
    }

    // MARK: The setup list

    func testG01InvitePeople() {
        snap(list(Invites.five), named: "G01-invite-people")
    }

    func testG01InvitePeopleAdd() {
        snap(
            list(Invites.list([Invites.maya, Invites.alex], canInvite: true)),
            named: "G01-invite-people-add")
    }

    func testG01InvitePeopleRevoked() {
        snap(list(Invites.revoked), named: "G01-invite-people-revoked")
    }

    func testG01InvitePeopleAcceptAgain() {
        snap(list(Invites.acceptAgain), named: "G01-invite-people-accept-again")
    }

    func testG01InvitePeopleEmpty() {
        snap(list(Invites.list([], canInvite: true)), named: "G01-invite-people-empty")
    }

    func testG01InvitePeopleUsedMissing() {
        snap(list(Invites.usedMissing), named: "G01-invite-people-used-missing")
    }

    func testG01InvitePeopleLiveNotHeld() {
        snap(list(Invites.liveNotHeld), named: "G01-invite-people-live-not-held")
    }

    func testG01InvitePeopleExpired() {
        snap(list(Invites.expired), named: "G01-invite-people-expired")
    }

    func testG01InvitePeopleLoading() {
        snap(list(.loading), named: "G01-invite-people-loading", busy: true)
    }

    func testG01InvitePeopleFailed() {
        snap(list(.failed(.network)), named: "G01-invite-people-failed")
    }

    func testG01InvitePeopleActionFailed() {
        snap(
            list(Invites.revoked, failure: .revoke(name: "Maya", uncertain: true)),
            named: "G01-invite-people-action-failed")
    }

    // MARK: Waiting to start

    func testG01Pending() {
        snap(pushed(PendingScreen(club: "Sunday people", review: false)), named: "G01-pending")
    }

    func testG01PendingApprove() {
        snap(
            pushed(PendingScreen(club: "Sunday people", review: true)), named: "G01-pending-approve"
        )
    }

    // MARK: What VoiceOver finds

    func testEachRowReadsItsNameAndStatusAsOneAndEachControlByItsLabel() {
        let elements = AccessibilityElements.of(list(Invites.revoked))
        XCTAssertTrue(
            elements.contains { $0.label == "Invite your people" && $0.isHeader }, "\(elements)")
        for (spoken, controls) in [
            ("Maya. Shared.", ["Share again for Maya", "More options for Maya’s invitation"]),
            (
                "Alex. Link revoked.",
                ["Create new link for Alex", "More options for Alex’s invitation"]
            ),
            ("Sam. Not shared.", ["Share link for Sam", "More options for Sam’s invitation"]),
        ] {
            let row = elements.first { $0.label == spoken }
            XCTAssertNotNil(row, "\(elements)")
            XCTAssertFalse(row?.traits.contains(.button) ?? true, "\(elements)")
            for control in controls {
                let element = elements.first { $0.label == control }
                XCTAssertTrue(element?.traits.contains(.button) ?? false, "\(control): \(elements)")
            }
        }
        // The glyphs and the status alone aren't read: the row's one element says them.
        XCTAssertFalse(elements.contains { $0.label == "Shared" }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Link revoked" }, "\(elements)")
    }

    func testAnAcceptedRowOffersNothing() {
        let elements = AccessibilityElements.of(list(Invites.five))
        XCTAssertTrue(elements.contains { $0.label == "Debby. Accepted." }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Nina. Not shared." }, "\(elements)")
        XCTAssertFalse(
            elements.contains { $0.label.contains("for Debby") || $0.label.contains("Debby’s") },
            "\(elements)")
    }

    func testAUsedLinkKeptOffersShareAgainAndNoMenu() {
        let elements = AccessibilityElements.of(list(Invites.acceptAgain))
        XCTAssertTrue(
            elements.contains { $0.label == "Sam. Needs to accept again." }, "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "Share again for Sam" }?.traits.contains(.button) ?? false,
            "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.contains("Sam’s invitation") }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Create new link for Sam" }, "\(elements)")
    }

    func testAUsedLinkTheAppDoesntHoldSaysSoAndOffersNothing() {
        let elements = AccessibilityElements.of(list(Invites.usedMissing))
        XCTAssertTrue(
            elements.contains { $0.label == "Sam. Needs to accept again." }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "This invitation link isn’t saved on this device." },
            "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "Sam can reopen the invitation already received." },
            "\(elements)")
        XCTAssertFalse(
            elements.contains { $0.label.contains("for Sam") || $0.label.contains("Sam’s") },
            "\(elements)")
        // Maya's controls are there, so the tree was read.
        XCTAssertTrue(elements.contains { $0.label == "Share again for Maya" }, "\(elements)")
    }

    func testALinkNotOnThisPhoneSaysSoAndThatANewLinkReplacesIt() {
        let elements = AccessibilityElements.of(list(Invites.liveNotHeld))
        let row = elements.first { $0.label == "Alex. Link not on this phone." }
        XCTAssertNotNil(row, "\(elements)")
        XCTAssertFalse(row?.traits.contains(.button) ?? true, "\(elements)")
        // The replacement line is its own text (handoff 9: "The replacement helper remains
        // separately reachable").
        XCTAssertTrue(
            elements.contains { $0.label == "A new link replaces the previous link." },
            "\(elements)")
        for control in ["Create new link for Alex", "More options for Alex’s invitation"] {
            XCTAssertTrue(
                elements.first { $0.label == control }?.traits.contains(.button) ?? false,
                "\(control): \(elements)")
        }
        // It doesn't claim the link wasn't shared, and the glyph and the status alone aren't read.
        XCTAssertFalse(elements.contains { $0.label == "Alex. Not shared." }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Link not on this phone" }, "\(elements)")
    }

    func testAnExpiredLinkOffersCreateNewLinkAndNoMore() {
        let elements = AccessibilityElements.of(list(Invites.expired))
        XCTAssertTrue(elements.contains { $0.label == "Alex. Link expired." }, "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "Create new link for Alex" }?.traits.contains(.button)
                ?? false, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.contains("Alex’s invitation") }, "\(elements)")
        // Maya's More is there, so the tree was read.
        XCTAssertTrue(
            elements.contains { $0.label == "More options for Maya’s invitation" }, "\(elements)")
    }

    func testWhileARevokeGoesTheRowSaysSoAndItsControlsWait() {
        let elements = AccessibilityElements.of(
            list(Invites.five, busy: ["cand_alex"], revoking: ["cand_alex"]))
        XCTAssertTrue(elements.contains { $0.label == "Alex. Revoking link…" }, "\(elements)")
        let share = elements.first { $0.label == "Share link for Alex" }
        XCTAssertTrue(share?.traits.contains(.notEnabled) ?? false, "\(elements)")
        let sam = elements.first { $0.label == "Share link for Sam" }
        XCTAssertFalse(sam?.traits.contains(.notEnabled) ?? true, "\(elements)")
    }

    func testShareAgainSharesThatPersonsRow() {
        let shared = Taps()
        let view = list(
            Invites.five, actions: InvitationActions(share: { shared.ids.append($0.candidateID) }))
        XCTAssertTrue(AccessibilityElements.activate("Share again for Maya", in: view))
        XCTAssertEqual(shared.ids, ["cand_maya"])
    }

    func testCreateAnInvitationShowsOnlyWhileAPlaceIsFree() {
        let full = AccessibilityElements.of(list(Invites.five))
        XCTAssertFalse(full.contains { $0.label == "Create an invitation" }, "\(full)")
        XCTAssertTrue(full.contains { $0.label == "Only you can see this list." }, "\(full)")
        let open = AccessibilityElements.of(list(Invites.list([], canInvite: true)))
        XCTAssertTrue(
            open.first { $0.label == "Create an invitation" }?.traits.contains(.button) ?? false,
            "\(open)")
    }

    func testDoneForNowReadsHandoff4sLabel() {
        let elements = AccessibilityElements.of(list(Invites.five))
        let done = elements.first { $0.label == "Finish managing invitations for now." }
        XCTAssertTrue(done?.traits.contains(.button) ?? false, "\(elements)")
    }

    func testAnActionsFailureIsReadAboveDoneForNow() {
        let elements = AccessibilityElements.of(
            list(Invites.revoked, failure: .revoke(name: "Maya", uncertain: true)))
        let words =
            "Couldn’t confirm that Maya’s invitation link was revoked. Check your connection and try again."
        let line = elements.firstIndex { $0.label == words }
        let done = elements.firstIndex { $0.label == "Finish managing invitations for now." }
        XCTAssertNotNil(line, "\(elements)")
        XCTAssertNotNil(done, "\(elements)")
        if let line, let done { XCTAssertLessThan(line, done, "\(elements)") }
    }

    func testALoadFailureReadsItsTitleLineAndRetry() {
        let elements = AccessibilityElements.of(list(.failed(.refused)))
        XCTAssertTrue(
            elements.contains { $0.label == "Couldn’t load invitations." && $0.isHeader },
            "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Try again." }, "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "Retry" }?.hint, "Try loading invitations again.",
            "\(elements)")
        XCTAssertTrue(
            AccessibilityElements.of(list(.loading)).contains {
                $0.label == "Loading invitations…"
            })
    }

    func testCreateReadsItsHeadingFieldAndNoteAndNotTheShield() {
        let elements = AccessibilityElements.of(
            pushed(CreateClubScreen(model: naming(), focus: false, keyboard: false)))
        XCTAssertTrue(
            elements.contains { $0.label == "Your people, together." && $0.isHeader },
            "\(elements)")
        XCTAssertTrue(
            elements.contains {
                $0.label == "Before activation, anything you prepare stays in your private Drafts."
            }, "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "Continue to invitations" }?.traits.contains(.button)
                ?? false, "\(elements)")
        XCTAssertFalse(
            elements.contains { $0.label.lowercased().contains("shield") }, "\(elements)")
    }

    func testEachNameOverFortyCharactersSaysSoUnderItsField() {
        let create = naming()
        create.name = Invites.longClubName
        let club = AccessibilityElements.of(
            pushed(CreateClubScreen(model: create, focus: false, keyboard: false)))
        let clubLine = "Use 40 characters or fewer for the club name."
        XCTAssertTrue(club.contains { $0.label == clubLine }, "\(club)")
        XCTAssertEqual(club.first { $0.label == "Club name" }?.hint, clubLine, "\(club)")
        XCTAssertTrue(
            club.first { $0.label == "Continue to invitations" }?.traits.contains(.notEnabled)
                ?? false, "\(club)")
        let invite = nameStep()
        invite.name = Invites.longName
        let person = AccessibilityElements.of(
            pushed(InviteNameScreen(model: invite, finished: {}, focus: false)))
        let personLine = "Use 40 characters or fewer for this person’s name."
        XCTAssertTrue(person.contains { $0.label == personLine }, "\(person)")
        XCTAssertEqual(person.first { $0.label == "Person’s name" }?.hint, personLine, "\(person)")
        XCTAssertTrue(
            person.first { $0.label == "Create link and share" }?.traits.contains(.notEnabled)
                ?? false, "\(person)")
    }

    func testTheNameStepReadsItsHeadingAndLines() {
        let elements = AccessibilityElements.of(
            pushed(InviteNameScreen(model: nameStep(), finished: {}, focus: false)))
        XCTAssertTrue(
            elements.contains { $0.label == "Who is it for?" && $0.isHeader }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Sunday people" }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "No contacts access needed." }, "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "Create link and share" }?.traits.contains(.button)
                ?? false, "\(elements)")
    }

    func testEachFailureSaysItsOwnWords() {
        XCTAssertEqual(
            CreateClubModel.Failure.network.words,
            "Couldn’t create the club. Check your connection and try again.")
        XCTAssertEqual(CreateClubModel.Failure.other.words, "Couldn’t create the club. Try again.")
        XCTAssertEqual(
            InviteNameModel.Failure.network.words(for: "Sam"),
            "Couldn’t create the invitation link for Sam. Check your connection and try again.")
        XCTAssertEqual(
            InviteNameModel.Failure.other.words(for: "Sam"),
            "Couldn’t create the invitation link for Sam. Try again.")
        let actions: [(InvitationListModel.ActionFailure, String)] = [
            (
                .createLink(name: "Sam", network: true),
                "Couldn’t create the invitation link for Sam. Check your connection and try again."
            ),
            (
                .createLink(name: "Sam", network: false),
                "Couldn’t create the invitation link for Sam. Try again."
            ),
            (
                .createNewLink(name: "Sam", network: true),
                "Couldn’t create a new invitation link for Sam. Check your connection and try again."
            ),
            (
                .createNewLink(name: "Sam", network: false),
                "Couldn’t create a new invitation link for Sam. Try again."
            ),
            (
                .revoke(name: "Sam", uncertain: false),
                "Couldn’t revoke Sam’s invitation link. Try again."
            ),
            (
                .revoke(name: "Sam", uncertain: true),
                "Couldn’t confirm that Sam’s invitation link was revoked. Check your connection and try again."
            ),
        ]
        for (failure, words) in actions {
            XCTAssertEqual(failure.words, words)
        }
    }

    func testThePendingScreensReadTheirTitles() {
        let waiting = AccessibilityElements.of(
            pushed(PendingScreen(club: "Sunday people", review: false)))
        XCTAssertTrue(
            waiting.contains { $0.label == "Waiting for club confirmation" && $0.isHeader },
            "\(waiting)")
        let review = AccessibilityElements.of(
            pushed(PendingScreen(club: "Sunday people", review: true)))
        XCTAssertTrue(
            review.contains { $0.label == "Review the updated members" && $0.isHeader },
            "\(review)")
        // Nothing lists or counts who has accepted (book p30, T33).
        XCTAssertFalse(review.contains { $0.label.contains("accepted") }, "\(review)")
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.details])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func list(
        _ state: InvitationListModel.State, busy: Set<String> = [], revoking: Set<String> = [],
        failure: InvitationListModel.ActionFailure? = nil, actions: InvitationActions = .init()
    ) -> some View {
        pushed(
            InvitationsScreen(
                state: state, busy: busy, revoking: revoking, failure: failure, actions: actions))
    }

    /// `G01-create` with the frames' name, on a service that makes no club: Continue fails as if
    /// no answer came.
    private func naming() -> CreateClubModel {
        let model = CreateClubModel(
            service: UITestLaunch.NoClubs(), current: { true }, created: { _ in },
            signedOut: {})
        model.name = "Sunday people"
        return model
    }

    /// The name step with handoff 2's name, on a service that proposes no one: Create link and
    /// share fails as if no answer came.
    private func nameStep() -> InviteNameModel {
        let model = InviteNameModel(
            club: Invites.club, accountID: "acc_ben", rosterVersion: 1, known: [],
            service: UITestLaunch.NoClubs(),
            book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()), current: { true })
        model.name = "Sam"
        return model
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}

/// The rows a control was used for.
@MainActor private final class Taps {
    var ids: [String] = []
}

/// The frames' setup lists: Ben's Sunday people, each person with the link the app keeps for
/// them, if any. The links are made up: no server made them, and none is drawn or read.
private enum Invites {
    static let club = ClubRef(
        id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
        myMembershipID: "mem_Ben")

    static let maya = row("Maya", .live, shared: true)
    static let alex = row("Alex", .live)

    /// Handoff 1's five, with handoff 4's statuses: Maya shared, Debby accepted, the others'
    /// links made and not shared. A club of six has no place free.
    static let five = list([
        maya, alex, row("Sam", .live), row("Debby", .accepted), row("Nina", .live),
    ])

    /// Handoff 9's frame 15: Alex's link live, and not on this phone.
    static let liveNotHeld = list([
        maya, row("Alex", .live, kept: false), row("Sam", .live), row("Debby", .accepted),
        row("Nina", .live),
    ])

    /// Handoff 9's frame 16: Alex's link expired before anyone used it.
    static let expired = list([
        maya, row("Alex", .expired), row("Sam", .live), row("Debby", .accepted),
        row("Nina", .live),
    ])

    /// Book p27's two long names together, 45 characters, as A03-profile-name-too-long's.
    static let longName = "Alexandria-Rose Mensah Deborah-Anne Ouédraogo"

    /// The frames' club name three times, 41 characters: no source draws a long club name.
    static let longClubName = "Sunday people Sunday people Sunday people"

    /// Handoff 4's frame, and handoff 9's frame 17 under its failure line: Alex's link revoked.
    static let revoked = list([
        maya, row("Alex", .revoked), row("Sam", .live), row("Debby", .accepted), row("Nina", .live),
    ])

    /// Handoff 8's frame 12: Sam accepted an earlier roster, the link kept.
    static let acceptAgain = list([
        maya, alex, row("Sam", .used, shared: true), row("Debby", .accepted), row("Nina", .live),
    ])

    /// Frame 12's list where the app no longer holds Sam's used link.
    static let usedMissing = list([
        maya, alex, row("Sam", .used, kept: false), row("Debby", .accepted), row("Nina", .live),
    ])

    static func list(_ rows: [InvitationRow], canInvite: Bool = false) -> InvitationListModel.State
    {
        .loaded(
            InvitationList(
                club: club, state: .proposed, rows: rows, canInvite: canInvite,
                awaitingMyApproval: false))
    }

    /// `name`'s row, their link in `state`, kept, and shared or not.
    static func row(
        _ name: String, _ state: CandidateLinkState, kept: Bool = true, shared: Bool = false
    ) -> InvitationRow {
        let id = "cand_\(name.lowercased())"
        let invitation = CandidateInvitation(id: "inv_\(id)", state: state, expiresAt: expiry)
        let link = URL(string: "https://tadayo.app/i#" + String(repeating: "A", count: 43))
        let held = link.flatMap { url in
            kept
                ? KeptInvitationLink(
                    clubID: club.id, candidateID: id, invitationID: invitation.id, url: url,
                    shared: shared)
                : nil
        }
        return InvitationRow(
            Candidate(id: id, name: name, proposedBy: ben, invitation: invitation), kept: held)
    }

    private static let ben = Person(membershipID: "mem_Ben", displayName: "Ben", avatarVersion: nil)
    private static let expiry = Date(timeIntervalSince1970: 1_793_600_000)
}
