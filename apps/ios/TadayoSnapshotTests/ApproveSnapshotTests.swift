import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Maya's approval of Ben's proposal of Leila for Kitchen table (`ApproveScreen`;
/// `docs/plans/ios-b1-approve.md` sections 2 and 4) in each of its states: handoff 4's
/// `G03-approve` and handoff 8's `G03-approve-failed`, and the states built from spec: two
/// candidates (FQ144), the neutral end, Review members' read and its failure. Then an active
/// club's Members with Leila's proposed row (`G05-members-with-proposed`, built from spec). Each
/// is pushed onto a stack, as the tab pushes it, so the system's Back shows as the frames draw
/// it. The two alerts are the system's: their words are read here, not drawn.
@MainActor
final class ApproveSnapshotTests: XCTestCase {
    func testG03Approve() {
        snap(approve(.deciding(ClubFixtures.kitchenRevision())), named: "G03-approve")
    }

    func testG03ApproveFailed() {
        snap(
            approve(
                .deciding(ClubFixtures.kitchenRevision()),
                failed: .init(action: .approve, failure: .network)),
            named: "G03-approve-failed")
    }

    func testG03ApproveTwo() {
        snap(approve(.deciding(ClubFixtures.kitchenRevision(nina: true))), named: "G03-approve-two")
    }

    func testG03ApproveUnavailable() {
        snap(approve(.unavailable), named: "G03-approve-unavailable")
    }

    func testG03ApproveReviewing() {
        snap(approve(.reviewing), named: "G03-approve-reviewing", busy: true)
    }

    func testG03ApproveReviewFailed() {
        snap(approve(.reviewFailed(.network)), named: "G03-approve-review-failed")
    }

    func testG05MembersWithProposed() {
        snap(
            members(ClubFixtures.kitchenRoster(open: ClubFixtures.kitchenRevision())),
            named: "G05-members-with-proposed")
    }

    // MARK: What VoiceOver finds

    func testTheApprovalReadsTheRosterOnScreenAndNamesTheCandidateInEachAction() {
        let elements = AccessibilityElements.of(approve(.deciding(ClubFixtures.kitchenRevision())))
        XCTAssertTrue(
            elements.contains { $0.label == "Invite Leila?" && $0.isHeader }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "To Kitchen table · 5 current members" },
            "\(elements)")
        // The name and its proposer, one element; the avatar isn't read.
        XCTAssertTrue(elements.contains { $0.label == "Leila, Proposed by Ben" }, "\(elements)")
        for words in [
            "Leila must accept the exact roster. Every existing member must approve the same "
                + "roster. Either can happen first.",
            "Leila will see only drops shared after joining.",
            "We don’t identify who declined. Nobody is asked to give a reason.",
        ] {
            XCTAssertTrue(elements.contains { $0.label == words }, "\(words) \(elements)")
        }
        let approve = elements.first { $0.label == "Approve Leila joining Kitchen table." }
        XCTAssertTrue(approve?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertFalse(approve?.traits.contains(.notEnabled) ?? true, "\(elements)")
        let decline = elements.first { $0.label == "Decline Leila joining Kitchen table." }
        XCTAssertTrue(decline?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertEqual(decline?.hint, "No reason is required.", "\(elements)")
        // Nothing counts a decision or names who made one (T15, T33, book p30).
        XCTAssertFalse(
            elements.contains { $0.label.contains("approved") || $0.label.contains("waiting") },
            "\(elements)")
    }

    func testAFailureReadsItsLineAndKeepsBothActions() {
        for (failed, line) in [
            (
                RosterApprovalModel.Failed(action: .approve, failure: .network),
                "Couldn’t approve Leila. Check your connection and try again."
            ),
            (.init(action: .approve, failure: .other), "Couldn’t approve Leila. Try again."),
            (
                .init(action: .decline, failure: .network),
                "Couldn’t decline this invitation. Check your connection and try again."
            ),
            (
                .init(action: .decline, failure: .other),
                "Couldn’t decline this invitation. Try again."
            ),
        ] {
            let elements = AccessibilityElements.of(
                approve(.deciding(ClubFixtures.kitchenRevision()), failed: failed))
            XCTAssertTrue(elements.contains { $0.label == line }, "\(line) \(elements)")
            for action in [
                "Approve Leila joining Kitchen table.", "Decline Leila joining Kitchen table.",
            ] {
                let button = elements.first { $0.label == action }
                XCTAssertNotNil(button, "\(action) \(elements)")
                XCTAssertFalse(button?.traits.contains(.notEnabled) ?? true, "\(elements)")
            }
        }
    }

    func testBothActionsWaitWhileOneIsOut() {
        for busy in [RosterApprovalModel.Action.approve, .decline] {
            let elements = AccessibilityElements.of(
                approve(.deciding(ClubFixtures.kitchenRevision()), busy: busy))
            for action in [
                "Approve Leila joining Kitchen table.", "Decline Leila joining Kitchen table.",
            ] {
                let button = elements.first { $0.label == action }
                XCTAssertTrue(button?.traits.contains(.notEnabled) ?? false, "\(busy) \(elements)")
            }
        }
    }

    func testApproveAndDeclineDecideOnTheRosterShown() {
        var told: [String] = []
        let actions = ApproveActions(
            approve: { told.append("approve") }, decline: { told.append("decline") })
        let view = approve(.deciding(ClubFixtures.kitchenRevision()), actions: actions)
        XCTAssertTrue(
            AccessibilityElements.activate("Approve Leila joining Kitchen table.", in: view))
        XCTAssertTrue(
            AccessibilityElements.activate("Decline Leila joining Kitchen table.", in: view))
        XCTAssertEqual(told, ["approve", "decline"])
    }

    func testTwoCandidatesAreNamedTogetherInTheListsOwnWords() {
        let elements = AccessibilityElements.of(
            approve(.deciding(ClubFixtures.kitchenRevision(nina: true))))
        XCTAssertTrue(
            elements.contains { $0.label == "Invite Leila and Nina?" && $0.isHeader },
            "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Leila, Proposed by Ben" }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Nina, Proposed by Alex" }, "\(elements)")
        // The count is the members', never the candidates'.
        XCTAssertTrue(
            elements.contains { $0.label == "To Kitchen table · 5 current members" },
            "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "Approve Leila and Nina joining Kitchen table." },
            "\(elements)")
    }

    func testTheNeutralEndAndReviewMembersFormsReadTheirWords() {
        XCTAssertTrue(
            AccessibilityElements.of(approve(.unavailable)).contains {
                $0.label == "This invitation is no longer available." && $0.isHeader
            })
        XCTAssertTrue(
            AccessibilityElements.of(approve(.reviewing)).contains {
                $0.label == "Loading proposed members…"
            })
        let failed = AccessibilityElements.of(approve(.reviewFailed(.other)))
        XCTAssertTrue(
            failed.contains { $0.label == "Couldn’t load proposed members." && $0.isHeader },
            "\(failed)")
        XCTAssertTrue(failed.contains { $0.label == "Try again." }, "\(failed)")
        XCTAssertEqual(
            failed.first { $0.label == "Retry" }?.hint, "Try loading proposed members again.",
            "\(failed)")
        // Nothing of the roster in any of them.
        for view in [AnyView(approve(.unavailable)), AnyView(approve(.reviewFailed(.network)))] {
            XCTAssertFalse(
                AccessibilityElements.of(view).contains { $0.label.contains("Leila") })
        }
    }

    func testTheAlertsWords() {
        let club = ClubFixtures.kitchenRevision().club
        XCTAssertEqual(
            ApproveWords.alertTitle(.rosterChanged(.approve), club: club),
            "Review the updated roster")
        XCTAssertEqual(
            ApproveWords.alertBody(.rosterChanged(.approve), club: club),
            "The members have changed. Review the updated roster before approving.")
        XCTAssertEqual(
            ApproveWords.alertBody(.rosterChanged(.decline), club: club),
            "The members have changed. Review the updated roster before declining.")
        XCTAssertEqual(ApproveWords.alertAction(.rosterChanged(.decline)), "Review members")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(.rosterChanged(.approve), club: club),
            "Review the updated members of Kitchen table.")
        XCTAssertEqual(ApproveWords.alertTitle(.clubFull, club: club), "Kitchen table is full.")
        XCTAssertEqual(
            ApproveWords.alertBody(.clubFull, club: club), "Kitchen table already has six members.")
        XCTAssertEqual(ApproveWords.alertAction(.clubFull), "See members")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(.clubFull, club: club), "See members of Kitchen table.")
    }

    // MARK: Members with a proposed row

    func testAProposedRowFollowsTheMembersAndTheFooterCountsTheMembers() {
        let elements = AccessibilityElements.of(
            members(ClubFixtures.kitchenRoster(open: ClubFixtures.kitchenRevision())))
        let leila = elements.firstIndex { $0.label == "Leila. Proposed by Ben. Proposed." }
        let debby = elements.firstIndex { $0.label == "Debby. Friday." }
        XCTAssertNotNil(leila, "\(elements)")
        XCTAssertNotNil(debby, "\(elements)")
        XCTAssertLessThan(debby ?? .max, leila ?? .min, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "5 members\u{00A0}· New York" }, "\(elements)")
    }

    func testAPendingDecisionsProposedRowOpensTheApproval() {
        var opened: [String] = []
        let roster = ClubFixtures.kitchenRoster(open: ClubFixtures.kitchenRevision())
        let view = pushed(
            MembersScreen(
                members: .loaded(roster), retry: {}, openApproval: { opened.append($0.id) }))
        let leila = AccessibilityElements.of(view).first {
            $0.label == "Leila. Proposed by Ben. Proposed."
        }
        XCTAssertTrue(leila?.traits.contains(.button) ?? false, "\(String(describing: leila))")
        XCTAssertTrue(
            AccessibilityElements.activate("Leila. Proposed by Ben. Proposed.", in: view))
        XCTAssertEqual(opened, ["rev_leila"])
    }

    func testADecidedMembersProposedRowOpensNothing() {
        // FQ143: approved and declined read alike, and neither is a button.
        for decision in [RosterDecision.approved, .declined] {
            let roster = ClubFixtures.kitchenRoster(
                open: ClubFixtures.kitchenRevision(decision: decision))
            let elements = AccessibilityElements.of(members(roster))
            let leila = elements.first { $0.label == "Leila. Proposed by Ben. Proposed." }
            XCTAssertNotNil(leila, "\(decision) \(elements)")
            XCTAssertFalse(leila?.traits.contains(.button) ?? true, "\(decision) \(elements)")
        }
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.members])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func approve(
        _ state: RosterApprovalModel.State, busy: RosterApprovalModel.Action? = nil,
        failed: RosterApprovalModel.Failed? = nil, actions: ApproveActions = ApproveActions()
    ) -> some View {
        pushed(
            ApproveScreen(
                state: state, busy: busy, failed: failed, alert: .constant(nil),
                club: ClubFixtures.kitchenRevision().club, actions: actions))
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
