import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Sunday people's proposed roster as Ben, its creator, reads it from Review members
/// (`ProposedRosterScreen`; `docs/plans/ios-b1-approve.md` section 2, 7b): handoff 5's
/// `G05-members-proposed`; Ben's pending decision on the revision the server made for Debby's
/// name, with Approve roster and Decline (handoff 10's `G05-members-proposed-approve`); and the
/// states built from spec: the loading and failure forms (handoff 8's `load.proposed`) and the
/// decision's failed line (handoff 10's words). Each is pushed onto a stack, as the tab pushes
/// it, so the system's Back shows as the frames draw it.
@MainActor
final class ProposedRosterSnapshotTests: XCTestCase {
    func testG05MembersProposed() {
        snap(roster(.roster(ClubFixtures.sundayProposal)), named: "G05-members-proposed")
    }

    func testG05MembersProposedLoading() {
        snap(roster(.loading), named: "G05-members-proposed-loading", busy: true)
    }

    func testG05MembersProposedFailed() {
        snap(roster(.failed(.network)), named: "G05-members-proposed-failed")
    }

    func testG05MembersProposedApprove() {
        snap(roster(.roster(ClubFixtures.sundayRenamed)), named: "G05-members-proposed-approve")
    }

    func testG05MembersProposedApproveDeclining() {
        // Built from handoff 10's `decisionBusy` (no frame), as on G03-approve.
        snap(
            roster(.roster(ClubFixtures.sundayRenamed), busy: .decline),
            named: "G05-members-proposed-approve-declining", busy: true)
    }

    func testG05MembersProposedApproveFailed() {
        snap(
            roster(
                .roster(ClubFixtures.sundayRenamed),
                failed: .init(action: .approve, failure: .network)),
            named: "G05-members-proposed-approve-failed")
    }

    // MARK: What VoiceOver finds

    func testTheProposedRosterReadsEachNameOnceAndNothingElse() {
        let elements = AccessibilityElements.of(roster(.roster(ClubFixtures.sundayProposal)))
        XCTAssertTrue(
            elements.contains { $0.label == "Proposed roster" && $0.isHeader }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Sunday people" }, "\(elements)")
        XCTAssertTrue(
            elements.contains {
                $0.label == "These names are a proposal, not an active member list."
            }, "\(elements)")
        // Each person once, by name, in the server's order, the viewer's own row marked.
        let names = ["Ben, you.", "Maya.", "Alex.", "Sam.", "Debby.", "Nina."]
        XCTAssertEqual(elements.filter { names.contains($0.label) }.map(\.label), names)
        for name in names {
            let row = elements.first { $0.label == name }
            XCTAssertFalse(row?.traits.contains(.button) ?? true, "\(name) \(elements)")
        }
        let manage = elements.first { $0.label == "Manage invitations" }
        XCTAssertTrue(manage?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertFalse(manage?.traits.contains(.notEnabled) ?? true, "\(elements)")
        XCTAssertEqual(manage?.hint, "Open your invitation list for Sunday people.", "\(elements)")
        // Nothing counts, nothing says who has accepted or approved, and with Ben's decision
        // counted by proposing there is nothing to decide (T7, T15, T33, book p30, p33).
        XCTAssertFalse(
            elements.contains { $0.label.rangeOfCharacter(from: .decimalDigits) != nil },
            "\(elements)")
        for word in [
            "accepted", "approved", "waiting", "Proposed by", "Approve", "Decline", "Review and",
        ] {
            XCTAssertFalse(elements.contains { $0.label.contains(word) }, "\(word) \(elements)")
        }
    }

    func testAPendingDecisionReadsTheExplanationTheNoteAndTheWholeRostersActions() {
        let elements = AccessibilityElements.of(roster(.roster(ClubFixtures.sundayRenamed)))
        let names = ["Ben, you.", "Debby."]
        XCTAssertEqual(elements.filter { names.contains($0.label) }.map(\.label), names)
        // In the frame's order: the rows, Manage invitations, the explanation, the note.
        let order = [
            "Debby.", "Manage invitations",
            "Review and approve the updated roster before Sunday people can start.",
            "We don’t identify who declined. Nobody is asked to give a reason.",
        ].map { label in elements.firstIndex { $0.label == label } }
        XCTAssertFalse(order.contains(nil), "\(elements)")
        XCTAssertEqual(order.compactMap { $0 }, order.compactMap { $0 }.sorted(), "\(elements)")
        let approve = elements.first { $0.label == "Approve roster for Sunday people." }
        XCTAssertTrue(approve?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertFalse(approve?.traits.contains(.notEnabled) ?? true, "\(elements)")
        let decline = elements.first { $0.label == "Decline roster for Sunday people." }
        XCTAssertTrue(decline?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertFalse(decline?.traits.contains(.notEnabled) ?? true, "\(elements)")
        XCTAssertEqual(decline?.hint, "No reason is required.", "\(elements)")
        // Manage invitations stays, a text action now, with its hint.
        let manage = elements.first { $0.label == "Manage invitations" }
        XCTAssertTrue(manage?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertEqual(manage?.hint, "Open your invitation list for Sunday people.", "\(elements)")
        for word in ["accepted", "approved", "waiting", "Proposed by"] {
            XCTAssertFalse(elements.contains { $0.label.contains(word) }, "\(word) \(elements)")
        }
    }

    func testAFailureReadsItsLineAndKeepsEveryAction() {
        for (failed, line) in [
            (
                RosterApprovalModel.Failed(action: .approve, failure: .network),
                "Couldn’t approve this roster. Check your connection and try again."
            ),
            (.init(action: .approve, failure: .other), "Couldn’t approve this roster. Try again."),
            (
                .init(action: .decline, failure: .network),
                "Couldn’t decline this roster. Check your connection and try again."
            ),
            (
                .init(action: .decline, failure: .other),
                "Couldn’t decline this roster. Try again."
            ),
        ] {
            let elements = AccessibilityElements.of(
                roster(.roster(ClubFixtures.sundayRenamed), failed: failed))
            XCTAssertTrue(elements.contains { $0.label == line }, "\(line) \(elements)")
            for action in [
                "Approve roster for Sunday people.", "Decline roster for Sunday people.",
                "Manage invitations",
            ] {
                let button = elements.first { $0.label == action }
                XCTAssertNotNil(button, "\(action) \(elements)")
                XCTAssertFalse(button?.traits.contains(.notEnabled) ?? true, "\(elements)")
            }
        }
    }

    func testAFailedLineNeverShowsWithNothingToDecide() {
        // A failure the approval still holds after the roster was read again, with nothing left
        // to decide, has no line here.
        let elements = AccessibilityElements.of(
            roster(
                .roster(ClubFixtures.sundayProposal),
                failed: .init(action: .approve, failure: .network)))
        XCTAssertFalse(elements.contains { $0.label.hasPrefix("Couldn’t") }, "\(elements)")
    }

    func testEveryActionWaitsWhileADecisionIsOut() {
        for busy in [RosterApprovalModel.Action.approve, .decline] {
            let elements = AccessibilityElements.of(
                roster(.roster(ClubFixtures.sundayRenamed), busy: busy))
            for action in [
                "Approve roster for Sunday people.", "Decline roster for Sunday people.",
                "Manage invitations",
            ] {
                let button = elements.first { $0.label == action }
                XCTAssertNotNil(button, "\(action) \(elements)")
                XCTAssertTrue(button?.traits.contains(.notEnabled) ?? false, "\(busy) \(elements)")
            }
            // The decision out keeps its label and says "In progress" (handoff 10's
            // `decisionBusy`); the other says nothing of being at work.
            let out = busy == .approve ? "Approve" : "Decline"
            let other = busy == .approve ? "Decline" : "Approve"
            XCTAssertEqual(
                elements.first { $0.label == "\(out) roster for Sunday people." }?.value,
                "In progress", "\(elements)")
            XCTAssertEqual(
                elements.first { $0.label == "\(other) roster for Sunday people." }?.value, "",
                "\(elements)")
            XCTAssertEqual(
                elements.filter { $0.label.contains("In progress") || $0.value == "In progress" }
                    .count, 1, "said once \(elements)")
        }
    }

    func testBothDecisionsWaitUnderTheAlreadyDecidedAlert() {
        // FQ146: the roster stays drawn, both decisions unavailable; Manage invitations stays.
        let elements = AccessibilityElements.of(
            roster(.roster(ClubFixtures.sundayRenamed), decided: true))
        for action in ["Approve roster for Sunday people.", "Decline roster for Sunday people."] {
            let button = elements.first { $0.label == action }
            XCTAssertTrue(button?.traits.contains(.notEnabled) ?? false, "\(elements)")
        }
        let manage = elements.first { $0.label == "Manage invitations" }
        XCTAssertFalse(manage?.traits.contains(.notEnabled) ?? true, "\(elements)")
    }

    func testTheActionsAreTheScreens() {
        var told: [String] = []
        let actions = ProposedRosterActions(
            approve: { told.append("approve") }, decline: { told.append("decline") },
            manage: { told.append("manage") })
        let view = roster(.roster(ClubFixtures.sundayRenamed), actions: actions)
        XCTAssertTrue(
            AccessibilityElements.activate("Approve roster for Sunday people.", in: view))
        XCTAssertTrue(
            AccessibilityElements.activate("Decline roster for Sunday people.", in: view))
        XCTAssertTrue(AccessibilityElements.activate("Manage invitations", in: view))
        XCTAssertEqual(told, ["approve", "decline", "manage"])
    }

    func testTheLoadingAndFailureFormsReadTheirWords() {
        XCTAssertTrue(
            AccessibilityElements.of(roster(.loading)).contains {
                $0.label == "Loading proposed members…"
            })
        for (failure, line) in [
            (ProposedRosterModel.Failure.network, "Check your connection and try again."),
            (.refused, "Try again."),
        ] {
            let elements = AccessibilityElements.of(roster(.failed(failure)))
            XCTAssertTrue(
                elements.contains { $0.label == "Couldn’t load proposed members." && $0.isHeader },
                "\(elements)")
            XCTAssertTrue(elements.contains { $0.label == line }, "\(line) \(elements)")
            XCTAssertEqual(
                elements.first { $0.label == "Retry" }?.hint,
                "Try loading proposed members again.", "\(elements)")
            // Nothing of the roster, and no Manage invitations, until it's read.
            XCTAssertFalse(
                elements.contains { $0.label == "Ben, you." || $0.label == "Manage invitations" },
                "\(elements)")
        }
        var retried = 0
        let actions = ProposedRosterActions(retry: { retried += 1 })
        let failed = roster(.failed(.network), actions: actions)
        XCTAssertTrue(AccessibilityElements.activate("Retry", in: failed))
        XCTAssertEqual(retried, 1)
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.proposedRoster])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func roster(
        _ shown: ProposedRosterModel.Shown, busy: RosterApprovalModel.Action? = nil,
        failed: RosterApprovalModel.Failed? = nil, decided: Bool = false,
        actions: ProposedRosterActions = ProposedRosterActions()
    ) -> some View {
        pushed(
            ProposedRosterScreen(
                shown: shown, busy: busy, failed: failed, decided: decided, alert: .constant(nil),
                actions: actions, club: ClubFixtures.sundayProposal.club))
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}
