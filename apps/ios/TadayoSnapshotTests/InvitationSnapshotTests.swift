import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// The invitation's screens in each of their states (design/reference/INVENTORY.md;
/// `docs/plans/ios-b1-invitation.md` section 5): handoff 4's `G02-link-entry-signed-in` and
/// `G02-revoked`, handoff 8's `G02-checking`, `G02-invitation-failed` and `G02-changed-name`,
/// handoff 2's `G02-changed` and `G03-waiting`, handoff 1's `G02-expired`, `G02-full` and
/// `G03-declined`, 2.1's `G02-invitation`, and the states built from spec: the paste step typed,
/// checking and with each of its lines, the check failing, Accept on its way and refused, the name
/// change after a relaunch, and the club opening. Each is pushed onto a stack, as the tab pushes
/// it, so the system's Back shows as the frames draw it. The people are the frames' own: Debby's
/// invitation to Sunday people, Ben the viewer (frame 9), and Ben's to Kitchen table, Debby the
/// viewer in Leila's place (frame 15).
@MainActor
final class InvitationSnapshotTests: XCTestCase {
    // MARK: The paste step

    func testG02LinkEntrySignedIn() {
        snap(pushed(entryScreen(entry())), named: "G02-link-entry-signed-in")
    }

    func testG02LinkEntrySignedInTyped() {
        snap(
            pushed(entryScreen(entry(typed: Links.debby))), named: "G02-link-entry-signed-in-typed")
    }

    func testG02LinkEntrySignedInChecking() {
        let model = entry(typed: Links.debby, preview: .hangs)
        drive({ await model.proceed() }, until: { model.isChecking })
        snap(
            pushed(entryScreen(model)), named: "G02-link-entry-signed-in-checking", busy: true)
    }

    func testG02LinkEntrySignedInInvalid() {
        let model = entry(typed: "https://example.com/i#not-a-link")
        drive({ await model.proceed() }, until: { model.problem == .invalid })
        snap(pushed(entryScreen(model)), named: "G02-link-entry-signed-in-invalid")
    }

    func testG02LinkEntrySignedInClipboardEmpty() {
        let model = entry()
        model.pasted(nil)
        snap(pushed(entryScreen(model)), named: "G02-link-entry-signed-in-clipboard-empty")
    }

    func testG02LinkEntrySignedInCannotCheck() {
        let model = entry(typed: Links.debby, preview: .fails(.network))
        drive({ await model.proceed() }, until: { model.problem == .cannotCheck(.network) })
        snap(pushed(entryScreen(model)), named: "G02-link-entry-signed-in-cannot-check")
    }

    func testG02LinkEntrySignedInCannotCheckRefused() {
        let model = entry(typed: Links.debby, preview: .fails(.refused))
        drive({ await model.proceed() }, until: { model.problem == .cannotCheck(.other) })
        snap(pushed(entryScreen(model)), named: "G02-link-entry-signed-in-cannot-check-refused")
    }

    // MARK: Checking

    func testG02Checking() {
        snap(invitation(.checking), named: "G02-checking", busy: true)
    }

    func testG02CheckingFailed() {
        snap(invitation(.checkFailed(.network)), named: "G02-checking-failed")
    }

    func testG02CheckingFailedRefused() {
        snap(invitation(.checkFailed(.other)), named: "G02-checking-failed-refused")
    }

    func testG02Opening() {
        snap(invitation(.opening(Rosters.sundayRef)), named: "G02-opening", busy: true)
    }

    // MARK: The roster

    func testG02Invitation() {
        snap(invitation(.open(Rosters.sunday)), named: "G02-invitation")
    }

    func testG02InvitationAccepting() {
        snap(
            invitation(.open(Rosters.sunday), isAccepting: true),
            named: "G02-invitation-accepting", busy: true)
    }

    func testG02InvitationFailed() {
        snap(
            invitation(.open(Rosters.sunday), failure: .network), named: "G02-invitation-failed")
    }

    func testG02InvitationFailedRefused() {
        snap(
            invitation(.open(Rosters.sunday), failure: .other),
            named: "G02-invitation-failed-refused")
    }

    func testG02Changed() {
        snap(invitation(.changed(Rosters.sunday, nil)), named: "G02-changed")
    }

    func testG02ChangedName() {
        snap(
            invitation(.changed(Rosters.kitchen, .from("Leila"))), named: "G02-changed-name")
    }

    func testG02ChangedNameRelaunch() {
        snap(
            invitation(.changed(Rosters.kitchen, .notHeld)), named: "G02-changed-name-relaunch")
    }

    // MARK: Where it ends

    func testG03Waiting() {
        snap(invitation(.waiting(clubName: "Kitchen table")), named: "G03-waiting")
    }

    func testG02Expired() {
        snap(invitation(.expired(inviterName: "Ben")), named: "G02-expired")
    }

    func testG02Full() {
        snap(invitation(.full(inviterName: "Ben")), named: "G02-full")
    }

    func testG02Revoked() {
        snap(invitation(.unavailable), named: "G02-revoked")
    }

    func testG03Declined() {
        snap(invitation(.didNotGoAhead(inviterName: "Ben")), named: "G03-declined")
    }

    // MARK: What VoiceOver finds

    func testEachRosterRowIsOneElementWithTheViewerFirstSaidAsYou() {
        let elements = AccessibilityElements.of(invitation(.open(Rosters.sunday)))
        XCTAssertTrue(
            elements.contains { $0.label == "Join Sunday people" && $0.isHeader }, "\(elements)")
        let labels = elements.map(\.label)
        let rows = ["Ben, you.", "Maya.", "Alex.", "Sam.", "Debby.", "Nina."].map {
            labels.firstIndex(of: $0)
        }
        XCTAssertFalse(rows.contains(nil), "\(elements)")
        XCTAssertEqual(rows.compactMap { $0 }, rows.compactMap { $0 }.sorted(), "\(elements)")
        // The initials aren't read: each row's one element says the name.
        XCTAssertFalse(elements.contains { $0.label == "B" || $0.label == "Ben" }, "\(elements)")
    }

    func testANameChangeReadsWhoProposedTheViewer() {
        let elements = AccessibilityElements.of(
            invitation(.changed(Rosters.kitchen, .from("Leila"))))
        XCTAssertTrue(
            elements.contains { $0.label == "Debby, you. Proposed by Ben. Proposed." },
            "\(elements)")
        XCTAssertTrue(
            elements.contains {
                $0.label
                    == "The invitation was made for Leila. The updated roster now shows your name."
            }, "\(elements)")
        // The tag isn't read on its own: the row says it.
        XCTAssertFalse(elements.contains { $0.label == "Proposed" }, "\(elements)")
    }

    func testAnotherCandidateIsReadAsProposed() {
        let elements = AccessibilityElements.of(invitation(.open(Rosters.twoProposed)))
        XCTAssertTrue(elements.contains { $0.label == "Leila. Proposed." }, "\(elements)")
        // The viewer's own row has no tag outside a name change, as frame 9 draws it.
        XCTAssertTrue(elements.contains { $0.label == "Debby, you." }, "\(elements)")
    }

    func testAcceptAndNotNowAreButtons() {
        let elements = AccessibilityElements.of(
            invitation(.open(Rosters.sunday), failure: .network))
        for label in ["Accept this roster", "Not now"] {
            let element = elements.first { $0.label == label }
            XCTAssertTrue(element?.traits.contains(.button) ?? false, "\(label): \(elements)")
        }
        XCTAssertTrue(
            elements.contains {
                $0.label == "Couldn’t accept this roster. Check your connection and try again."
            }, "\(elements)")
    }

    func testCloseInvitationSaysWhereItReturns() {
        let home = AccessibilityElements.of(invitation(.unavailable))
        let close = home.first { $0.label == "Close invitation" }
        XCTAssertEqual(close?.hint, "Return to Home.", "\(home)")
        XCTAssertTrue(close?.traits.contains(.button) ?? false, "\(home)")
        let friends = AccessibilityElements.of(
            invitation(.expired(inviterName: "Ben"), returnsTo: "tabs.friends"))
        XCTAssertEqual(
            friends.first { $0.label == "Close invitation" }?.hint, "Return to Friends.",
            "\(friends)")
        // No name on a link that isn't available (FQ59).
        XCTAssertTrue(
            home.contains { $0.label == "This invitation isn’t available." && $0.isHeader },
            "\(home)")
    }

    func testWaitingNamesNobodyAndCountsNothing() {
        let elements = AccessibilityElements.of(invitation(.waiting(clubName: "Kitchen table")))
        XCTAssertTrue(
            elements.contains { $0.label == "Your acceptance is saved." && $0.isHeader },
            "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Waiting for club approval" }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Done" }, "\(elements)")
        // No approval count, list or name (book p30, T33).
        XCTAssertFalse(
            elements.contains {
                $0.label.contains("approved")
                    || $0.label.rangeOfCharacter(from: .decimalDigits) != nil
            }, "\(elements)")
    }

    func testThePasteStepsControlsReadTheirLabels() {
        let elements = AccessibilityElements.of(pushed(entryScreen(entry(typed: Links.debby))))
        XCTAssertTrue(
            elements.contains { $0.label == "Have an invitation?" && $0.isHeader }, "\(elements)")
        let field = elements.first { $0.label == "Invitation link" }
        XCTAssertNotNil(field, "\(elements)")
        let check = elements.first { $0.label == "Check the invitation link." }
        XCTAssertTrue(check?.traits.contains(.button) ?? false, "\(elements)")
        // The placeholder isn't read as well as the label.
        XCTAssertFalse(elements.contains { $0.label == "Paste invitation link" }, "\(elements)")
    }

    func testAnInvalidLinkMarksTheFieldWithItsLine() {
        let model = entry(typed: "https://example.com/i#not-a-link")
        drive({ await model.proceed() }, until: { model.problem == .invalid })
        let elements = AccessibilityElements.of(pushed(entryScreen(model)))
        let line =
            "That doesn’t look like a Tadayo invitation link. Check the link and try again."
        XCTAssertEqual(
            elements.first { $0.label == "Invitation link" }?.hint, line, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == line }, "\(elements)")
    }

    func testCheckingSaysNothingOfTheClub() {
        let elements = AccessibilityElements.of(invitation(.checking))
        XCTAssertTrue(elements.contains { $0.label == "Checking invitation…" }, "\(elements)")
        XCTAssertFalse(
            elements.contains { $0.label.contains("Sunday") || $0.label.contains("Debby") },
            "\(elements)")
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.invitation])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func invitation(
        _ state: InvitationModel.State, isAccepting: Bool = false,
        failure: InvitationModel.Failure? = nil, returnsTo: LocalizedStringResource = "tabs.home"
    ) -> some View {
        pushed(
            InvitationScreen(
                state: state, isAccepting: isAccepting, acceptFailure: failure,
                returnsTo: returnsTo))
    }

    private func entryScreen(_ model: InvitationLinkEntryModel) -> some View {
        LinkEntryScreen(model: model, proceed: {}, focus: false)
    }

    /// The paste step, with `typed` in its field, whose check gets `preview`'s answer.
    private func entry(typed: String = "", preview: Preview = .fails(.network))
        -> InvitationLinkEntryModel
    {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let service = PreviewOnly(preview: preview)
        let model = InvitationLinkEntryModel(
            make: { token in
                InvitationModel(
                    token: token, service: service, book: book, account: "acc_ben",
                    current: { true }, joined: { _ in }, signedOut: {})
            },
            released: { $0.close() })
        model.text = typed
        return model
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}

/// What a check gets: an answer, a failure, or none (a request still on its way).
private enum Preview: Sendable {
    case answers(InvitationPreview)
    case fails(APIFailure)
    case hangs
}

/// The club calls with the check answered as given; every other call is `NoClubs`'.
private struct PreviewOnly: ClubService {
    let preview: Preview
    private let none = UITestLaunch.NoClubs()

    func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
        switch preview {
        case .answers(let answer): return answer
        case .fails(let failure): throw failure
        case .hangs:
            try? await Task.sleep(for: .seconds(3600))
            throw .network
        }
    }

    func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance {
        try await none.accept(
            token, revisionID: revisionID, expectedVersion: expectedVersion, key: key)
    }

    func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
        async throws(APIFailure) -> ClubDetail
    { try await none.createClub(name: name, timezone: timezone, key: key) }

    func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
        try await none.club(clubID)
    }

    func members(of clubID: String) async throws(APIFailure) -> MemberList {
        try await none.members(of: clubID)
    }

    func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
        try await none.schedule(of: clubID)
    }

    func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision {
        try await none.propose(
            names, in: clubID, expectedRosterVersion: expectedRosterVersion, key: key)
    }

    func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    { try await none.createInvitation(for: candidateID, in: clubID, key: key) }

    func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
        try await none.revokeInvitation(invitationID)
    }

    func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
        try await none.rosterRevision(revisionID)
    }

    func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    { try await none.approve(revisionID, expectedVersion: expectedVersion, key: key) }

    func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    { try await none.decline(revisionID, expectedVersion: expectedVersion, key: key) }
}

/// A made-up link in the only form the app reads: no server made it, and it's drawn only in the
/// typed field's snapshot, where a real token would be redacted from the app switcher, not the
/// screen.
private enum Links {
    static let debby = "https://tadayo.app/i#" + String(repeating: "D", count: 43)
}

/// The frames' rosters.
private enum Rosters {
    static let sundayRef = ClubRef(
        id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
        myMembershipID: "mem_ben")

    /// Frame 9: Debby's invitation to Sunday people, Ben the viewer, first, then the five.
    static let sunday = roster(
        "Sunday people", inviter: "Debby",
        [
            ("Maya", .member, false), ("Ben", .candidate, true), ("Alex", .member, false),
            ("Sam", .member, false), ("Debby", .member, false), ("Nina", .member, false),
        ])

    /// Frame 15: Ben's invitation to Kitchen table, made for Leila, which Debby accepted under
    /// Debby's own name. The frame draws Debby, Ben and Maya and says "5 current members"; the
    /// book names no other member of Kitchen table, so this roster holds the frame's three and
    /// its line counts the two members it holds (a known difference in INVENTORY.md), rather
    /// than invent three people.
    static let kitchen = roster(
        "Kitchen table", inviter: "Ben",
        [("Ben", .member, false), ("Debby", .candidate, true), ("Maya", .member, false)])

    /// A roster with two people proposed, for the readings: Debby the viewer and Leila. No frame
    /// draws one.
    static let twoProposed = roster(
        "Kitchen table", inviter: "Ben",
        [("Ben", .member, false), ("Debby", .candidate, true), ("Leila", .candidate, false)])

    private static func roster(
        _ club: String, inviter: String, _ entries: [(String, InvitationRosterEntry.Kind, Bool)]
    ) -> InvitationRoster {
        InvitationRoster(
            invitationID: "inv_\(club)", inviterName: inviter, clubName: club,
            revisionID: "rev_\(club)", revisionVersion: 1,
            roster: entries.map { InvitationRosterEntry(name: $0.0, kind: $0.1, isYou: $0.2) },
            expiresAt: nil)
    }
}
