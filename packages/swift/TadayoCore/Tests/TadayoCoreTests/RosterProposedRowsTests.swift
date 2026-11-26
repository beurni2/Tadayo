import Foundation
import Testing

@testable import TadayoCore

/// An active club's proposed people in Members, and what each row opens
/// (`docs/plans/ios-b1-approve.md` section 2's table).
@Suite struct RosterProposedRowsTests {
    func roster(_ list: MemberList) -> Roster {
        Roster(list, week: ClubWeek(serverClock: Sunday.clock, club: list.club, assignments: []))
    }

    @Test func theCandidatesFollowTheMembersInTheRevisionsOrder() {
        let open = Approval.revision(nina: true)
        let roster = roster(Approval.members(open: open))
        #expect(roster.rows.map(\.person.displayName) == ["Ben", "Maya", "Alex", "Sam", "Debby"])
        #expect(roster.proposed.map(\.candidate.name) == ["Leila", "Nina"])
        // Each "Proposed by" is the candidate's own proposer, never the revision's.
        #expect(roster.proposed.map(\.candidate.proposedBy.displayName) == ["Ben", "Alex"])
        #expect(roster.openRevision == open)
    }

    @Test func aMemberWhoseDecisionIsPendingOpensTheApproval() {
        let roster = roster(Approval.members(open: Approval.revision(decision: .pending)))
        #expect(roster.proposed.map(\.opens) == [.approval])
    }

    @Test func aMemberWhoHasDecidedOpensNothing() {
        for decision in [RosterDecision.approved, .declined] {
            let roster = roster(Approval.members(open: Approval.revision(decision: decision)))
            #expect(roster.proposed.map(\.opens) == [.nothing], "\(decision)")
        }
    }

    @Test func theProposerWhoHasDecidedOpensTheInvitation() {
        // Alex proposed Nina; the viewer here is Alex, whose own decision is approved (FQ60).
        let list = asAlex(Approval.revision(decision: .approved, nina: true))
        #expect(roster(list).proposed.map(\.opens) == [.nothing, .invitation])
        #expect(roster(list).rows.filter(\.isViewer).map(\.person.displayName) == ["Alex"])
    }

    @Test func aPendingDecisionOpensTheApprovalEvenForTheProposer() {
        // A revision the server made for Nina's own name keeps Alex as her proposer, and Alex's
        // decision on it is pending (FQ84): without the approval it could never go ahead.
        let list = asAlex(Approval.revision(decision: .pending, nina: true))
        #expect(roster(list).proposed.map(\.opens) == [.approval, .approval])
    }

    /// Kitchen table's members as Alex reads them, with `open` open.
    private func asAlex(_ open: RosterRevision) -> MemberList {
        let alex = ClubRef(
            id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
            myMembershipID: "mem_alex")
        return MemberList(
            serverClock: Sunday.clock, club: alex, members: Approval.members(open: nil).members,
            openRevision: open)
    }

    @Test func noRevisionOpenListsNobodyProposed() {
        #expect(roster(Approval.members(open: nil)).proposed.isEmpty)
        for state in [RosterRevisionState.applied, .didNotGoAhead, .superseded] {
            let ended = Approval.revision()
            let revision = RosterRevision(
                id: ended.id, version: ended.version, club: ended.club, state: state,
                proposedBy: ended.proposedBy, members: ended.members,
                candidates: ended.candidates, myDecision: ended.myDecision, supersededBy: nil)
            let roster = roster(Approval.members(open: revision))
            #expect(roster.proposed.isEmpty, "\(state)")
            #expect(roster.openRevision == nil)
        }
    }

    @Test func theMembersCountNobodyProposed() {
        let roster = roster(Approval.members(open: Approval.revision(nina: true)))
        #expect(roster.rows.count == 5)
    }
}
