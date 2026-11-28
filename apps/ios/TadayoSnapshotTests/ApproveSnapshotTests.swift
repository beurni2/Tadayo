import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Maya's approval of Ben's proposal of Leila for Kitchen table (`ApproveScreen`;
/// `docs/plans/ios-b1-approve.md` sections 2 and 4) in each of its states: handoff 4's
/// `G03-approve` and handoff 8's `G03-approve-failed`, and the states built from spec: two
/// candidates (FQ144), the neutral end, Review members' read and its failure. Then an active
/// club's Members with Leila's proposed row (`G05-members-with-proposed`, built from spec), and
/// the same Members as Ben, Leila's proposer, sees it, with Leila's own More (handoff 11's frame
/// 5, `G05-members-with-proposed-remove`), the removal on its way and its failure (built from
/// spec). Each is pushed onto a stack, as the tab pushes it, so the system's Back shows as the
/// frames draw it. The alerts and the menus are the system's: their words are read here, not
/// drawn.
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

    func testG03ApproveDeclining() {
        // Built from handoff 10's `decisionBusy` (no frame): Decline busy, its words where they
        // were; Approve unavailable in its idle look.
        snap(
            approve(.deciding(ClubFixtures.kitchenRevision()), busy: .decline),
            named: "G03-approve-declining", busy: true)
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

    func testG05MembersWithProposedDecided() {
        // Handoff 10's frame 6: the same row after Maya decided, no chevron, its room kept.
        snap(
            members(
                ClubFixtures.kitchenRoster(
                    open: ClubFixtures.kitchenRevision(decision: .approved))),
            named: "G05-members-with-proposed-decided")
    }

    func testG05MembersWithProposedRemove() {
        // Frame 5 as drawn, with the menu closed: the row opens nothing here, so More stands
        // alone (`G05-members-with-proposed-own` draws it after #146's chevron).
        snap(members(Self.asBen), named: "G05-members-with-proposed-remove")
    }

    func testG05MembersRemoving() {
        snap(members(Self.asBen, removing: "cand_leila"), named: "G05-members-removing", busy: true)
    }

    func testG05MembersRemoveFailed() {
        snap(
            members(Self.asBen, failure: Self.leilaFailed(uncertain: true)),
            named: "G05-members-remove-failed")
    }

    // MARK: What VoiceOver finds

    func testTheApprovalReadsTheRosterOnScreenAndNamesTheCandidateInEachAction() {
        let elements = AccessibilityElements.of(approve(.deciding(ClubFixtures.kitchenRevision())))
        XCTAssertTrue(
            elements.contains { $0.label == "Invite Leila?" && $0.isHeader }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "To Kitchen table\u{00A0}· 5 current members" },
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
            // The decision out keeps its label and says "In progress" (handoff 10's
            // `decisionBusy`), Decline too; the other says nothing of being at work.
            let out = busy == .approve ? "Approve" : "Decline"
            let other = busy == .approve ? "Decline" : "Approve"
            XCTAssertEqual(
                elements.first { $0.label == "\(out) Leila joining Kitchen table." }?.value,
                "In progress", "\(elements)")
            XCTAssertEqual(
                elements.first { $0.label == "\(other) Leila joining Kitchen table." }?.value, "",
                "\(elements)")
        }
    }

    func testTheBusyAnnouncementSaysWhichDecisionIsOut() {
        // Handoff 10's `decisionBusy.a11y`: one announcement as the decision starts, on both
        // decision screens. That it is said once is a device check (VoiceOver).
        XCTAssertEqual(ApproveWords.busy(.approve), "Approving this roster.")
        XCTAssertEqual(ApproveWords.busy(.decline), "Declining this roster.")
    }

    func testTheActionsArePinned12ApartWhenApprovesWordsFitOnOneLine() {
        // Handoff 10's `approvalRevision.actions`: Decline 12 under Approve, the pair 8 above the
        // safe area's bottom.
        let layout = AccessibilityElements.layout(
            of: approve(.deciding(ClubFixtures.kitchenRevision())))
        let approve = layout.elements.first { $0.label == "Approve Leila joining Kitchen table." }
        let decline = layout.elements.first { $0.label == "Decline Leila joining Kitchen table." }
        guard let approve, let decline else { return XCTFail("\(layout.elements)") }
        XCTAssertEqual(decline.frame.minY - approve.frame.maxY, 12, accuracy: 0.5, "\(layout)")
        XCTAssertEqual(
            layout.size.height - layout.safeArea.bottom - decline.frame.maxY, 8, accuracy: 0.5,
            "pinned \(layout)")
    }

    func testApprovesWordsThatWrapPutTheActionsInTheColumn() {
        // Handoff 10's `approvalRevision.actions.large`: "whenever either action label wraps,
        // move both actions to the end of the same scroll column", even at the default size: 24
        // under the note's box (its words 16 inside it), 12 apart.
        let base = ClubFixtures.kitchenRevision()
        let long = RosterRevision(
            id: base.id, version: base.version, club: base.club, state: .open,
            proposedBy: base.proposedBy, members: base.members,
            candidates: [
                Candidate(
                    id: "cand_alexandra", name: "Alexandra Montgomery-Fitzwilliam",
                    proposedBy: base.members[0], invitation: nil)
            ],
            myDecision: .pending, supersededBy: nil)
        let layout = AccessibilityElements.layout(of: approve(.deciding(long)))
        let note = layout.elements.first {
            $0.label == "We don’t identify who declined. Nobody is asked to give a reason."
        }
        let approve = layout.elements.first {
            $0.label == "Approve Alexandra Montgomery-Fitzwilliam joining Kitchen table."
        }
        let decline = layout.elements.first {
            $0.label == "Decline Alexandra Montgomery-Fitzwilliam joining Kitchen table."
        }
        guard let note, let approve, let decline else { return XCTFail("\(layout.elements)") }
        XCTAssertEqual(
            approve.frame.minY - note.frame.maxY, 40, accuracy: 1,
            "in the column \(layout)")
        XCTAssertEqual(decline.frame.minY - approve.frame.maxY, 12, accuracy: 0.5, "\(layout)")
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
            elements.contains { $0.label == "To Kitchen table\u{00A0}· 5 current members" },
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
        XCTAssertEqual(
            ApproveWords.alertAction(.rosterChanged(.decline), returnsTo: .members),
            "Review members")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(
                .rosterChanged(.approve), club: club, returnsTo: .members),
            "Review the updated members of Kitchen table.")
        XCTAssertEqual(ApproveWords.alertTitle(.clubFull, club: club), "Kitchen table is full.")
        XCTAssertEqual(
            ApproveWords.alertBody(.clubFull, club: club), "Kitchen table already has six members.")
        XCTAssertEqual(ApproveWords.alertAction(.clubFull, returnsTo: .members), "See members")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(.clubFull, club: club, returnsTo: .members),
            "See members of Kitchen table.")
    }

    func testTheAlreadyDecidedAlertSaysTheViewersOwnDecisionAndWhereItReturns() {
        // FQ146, the founder's answer (handoff 10's `alreadyDecided`): the title from the
        // viewer's own decision, no body, and the action that returns to the screen under it.
        let kitchen = ClubFixtures.kitchenRevision().club
        let sunday = ClubFixtures.sundayProposal.club
        XCTAssertEqual(
            ApproveWords.alertTitle(.alreadyDecided(.approve), club: kitchen),
            "You already approved this roster.")
        XCTAssertEqual(
            ApproveWords.alertTitle(.alreadyDecided(.decline), club: kitchen),
            "You already declined this roster.")
        XCTAssertNil(ApproveWords.alertBody(.alreadyDecided(.approve), club: kitchen))
        XCTAssertEqual(
            ApproveWords.alertAction(.alreadyDecided(.decline), returnsTo: .members),
            "See members")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(
                .alreadyDecided(.decline), club: kitchen, returnsTo: .members),
            "See members of Kitchen table.")
        XCTAssertEqual(
            ApproveWords.alertAction(.alreadyDecided(.approve), returnsTo: .proposedRoster),
            "Review roster")
        XCTAssertEqual(
            ApproveWords.alertActionSpoken(
                .alreadyDecided(.approve), club: sunday, returnsTo: .proposedRoster),
            "Review the proposed roster for Sunday people.")
    }

    func testBothActionsWaitUnderTheAlreadyDecidedAlert() {
        // The roster stays drawn under the alert, with no line and neither action available.
        let elements = AccessibilityElements.of(
            approve(.decided(ClubFixtures.kitchenRevision(), .approve)))
        XCTAssertTrue(elements.contains { $0.label == "Invite Leila?" }, "\(elements)")
        for action in [
            "Approve Leila joining Kitchen table.", "Decline Leila joining Kitchen table.",
        ] {
            let button = elements.first { $0.label == action }
            XCTAssertTrue(button?.traits.contains(.notEnabled) ?? false, "\(elements)")
        }
        XCTAssertFalse(elements.contains { $0.label.hasPrefix("Couldn’t") }, "\(elements)")
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
        // Handoff 10's frame 5: the hint says where it goes.
        XCTAssertEqual(
            leila?.hint, "Review the proposed roster for Kitchen table.",
            "\(String(describing: leila))")
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
            XCTAssertEqual(leila?.hint, "", "\(decision) \(elements)")
        }
    }

    // MARK: Removing an invitation from Members

    func testTheProposersOwnCandidateHasItsOwnMoreBesideTheRow() {
        let elements = AccessibilityElements.of(members(Self.asBen))
        let leila = elements.firstIndex { $0.label == "Leila. Proposed by Ben. Proposed." }
        let more = elements.firstIndex { $0.label == "More options for Leila’s invitation" }
        XCTAssertNotNil(leila, "\(elements)")
        XCTAssertNotNil(more, "\(elements)")
        XCTAssertLessThan(leila ?? .max, more ?? .min, "\(elements)")
        XCTAssertTrue(more.map { elements[$0].traits.contains(.button) } ?? false, "\(elements)")
        // The row itself opens nothing for Ben here: the More is separate from it.
        XCTAssertFalse(leila.map { elements[$0].traits.contains(.button) } ?? true, "\(elements)")
    }

    func testAnotherMembersCandidateAndTheMembersRowsHaveNoMore() {
        // Maya's view of Ben's Leila, decided or not: no More anywhere (handoff 11's section 5).
        for decision in [RosterDecision.pending, .approved] {
            let elements = AccessibilityElements.of(
                members(
                    ClubFixtures.kitchenRoster(
                        open: ClubFixtures.kitchenRevision(decision: decision))))
            XCTAssertTrue(
                elements.contains { $0.label == "Leila. Proposed by Ben. Proposed." },
                "\(decision) \(elements)")
            XCTAssertFalse(
                elements.contains { $0.label.hasPrefix("More options") }, "\(decision) \(elements)")
        }
    }

    func testThePendingRouteStaysBesideTheMore() {
        // FQ147: Ben's own decision pending keeps the row's route to G03-approve; More follows it.
        let roster = ClubFixtures.kitchenRoster(
            open: ClubFixtures.kitchenRevision(decision: .pending), viewer: "Ben")
        let elements = AccessibilityElements.of(
            pushed(MembersScreen(members: .loaded(roster), retry: {}, openApproval: { _ in })))
        let leila = elements.first { $0.label == "Leila. Proposed by Ben. Proposed." }
        XCTAssertTrue(leila?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "More options for Leila’s invitation" }?.traits.contains(
                .button) ?? false, "\(elements)")
    }

    func testWhileTheRemovalGoesTheRowIsInProgressAndMoreWaits() {
        let elements = AccessibilityElements.of(members(Self.asBen, removing: "cand_leila"))
        let leila = elements.first { $0.label == "Leila. Proposed by Ben. Proposed." }
        XCTAssertEqual(leila?.value, "In progress", "\(elements)")
        XCTAssertTrue(
            elements.first { $0.label == "More options for Leila’s invitation" }?.traits.contains(
                .notEnabled) ?? false, "\(elements)")
        // "Removing…" is the row's look; VoiceOver reads the value instead.
        XCTAssertFalse(elements.contains { $0.label == "Removing…" }, "\(elements)")
    }

    func testAFailuresLineIsReadUnderTheRowAndBeforeTheFooter() {
        for uncertain in [true, false] {
            let elements = AccessibilityElements.of(
                members(Self.asBen, failure: Self.leilaFailed(uncertain: uncertain)))
            let words =
                uncertain
                ? "Couldn’t confirm that Leila’s invitation to Kitchen table was removed. Check "
                    + "your connection and try again."
                : "Couldn’t remove Leila’s invitation to Kitchen table. Try again."
            let leila = elements.firstIndex { $0.label == "Leila. Proposed by Ben. Proposed." }
            let line = elements.firstIndex { $0.label == words }
            let footer = elements.firstIndex { $0.label == "5 members\u{00A0}· New York" }
            XCTAssertNotNil(line, "\(uncertain) \(elements)")
            XCTAssertLessThan(leila ?? .max, line ?? .min, "\(elements)")
            XCTAssertLessThan(line ?? .max, footer ?? .min, "\(elements)")
        }
    }

    func testTheConfirmationsBodyFollowsWhetherAnyoneElseIsProposed() {
        XCTAssertEqual(
            InvitationsScreen.removalBody("Leila", club: "Kitchen table", others: false),
            "Any links for Leila will stop working. Leila won’t be able to join Kitchen table "
                + "from this invitation.\n\nYou can invite Leila again later with a new invitation."
        )
        XCTAssertEqual(
            InvitationsScreen.removalBody("Leila", club: "Kitchen table", others: true),
            "Any links for Leila will stop working. Leila won’t be able to join Kitchen table "
                + "from this invitation.\n\nYou can invite Leila again later with a new invitation."
                + "\n\nAnyone else still invited will review and accept the updated roster again.")
    }

    // MARK: Helpers

    /// Kitchen table as Ben, Leila's proposer, sees it once Ben has decided (handoff 11's frame 5).
    private static let asBen = ClubFixtures.kitchenRoster(
        open: ClubFixtures.kitchenRevision(decision: .approved), viewer: "Ben")

    private static func leilaFailed(uncertain: Bool) -> ClubDetailsModel.RemovalFailure {
        ClubDetailsModel.RemovalFailure(
            candidateID: "cand_leila", name: "Leila", club: "Kitchen table", uncertain: uncertain)
    }

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

    private func members(
        _ roster: Roster, removing: String? = nil,
        failure: ClubDetailsModel.RemovalFailure? = nil
    ) -> some View {
        pushed(
            MembersScreen(
                members: .loaded(roster), retry: {}, removing: removing,
                removalFailure: failure))
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}
