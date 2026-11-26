import Foundation
import Testing

@testable import TadayoCore

/// Maya's decision on Ben's proposal of Leila for Kitchen table (G03-approve,
/// G03-approve-failed; `docs/plans/ios-b1-approve.md` sections 2 and 3).
@MainActor @Suite struct RosterApprovalModelTests {
    typealias Keys = InvitationModelTests.Keys

    @MainActor final class Told {
        var gone = 0
        var signedOut = 0
    }

    func model(
        _ service: ScriptedClubs, revision: RosterRevision = Approval.revision(),
        keys: Keys = Keys(), session: SessionFlag = SessionFlag(), told: Told = Told()
    ) -> RosterApprovalModel {
        RosterApprovalModel(
            revision: revision, service: service, makeKey: { keys.next() },
            current: { session.current }, gone: { told.gone += 1 },
            signedOut: { told.signedOut += 1 })
    }

    // MARK: Deciding

    @Test func approvingSendsTheRosterOnScreenAndCloses() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.success(Approval.revision(decision: .approved))]
        let approval = model(service)
        await approval.approve()
        #expect(service.calls == ["approve rev_leila v3 \(Keys.key(1))"])
        #expect(approval.state == .finished)
        #expect(approval.failed == nil && approval.alert == nil && approval.busy == nil)
    }

    @Test func decliningSendsTheRosterOnScreenAndCloses() async {
        let service = ScriptedClubs()
        service.declineAnswers = [.success(Approval.revision(decision: .declined))]
        let approval = model(service)
        await approval.decline()
        #expect(service.calls == ["decline rev_leila v3 \(Keys.key(1))"])
        #expect(approval.state == .finished)
    }

    @Test func aNetworkFailureKeepsBothActionsAndItsRetrySendsTheSameKey() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.network), .success(Approval.revision())]
        let approval = model(service)
        await approval.approve()
        #expect(approval.failed == .init(action: .approve, failure: .network))
        #expect(approval.revision == Approval.revision())
        await approval.approve()
        #expect(
            service.calls == [
                "approve rev_leila v3 \(Keys.key(1))", "approve rev_leila v3 \(Keys.key(1))",
            ])
        #expect(approval.state == .finished)
        #expect(approval.failed == nil)
    }

    @Test func aBusyOrUnreadableAnswerKeepsTheKeyWithTheOtherLine() async {
        for failure in [APIFailure.unavailable, .unreadable] {
            let service = ScriptedClubs()
            service.declineAnswers = [.failure(failure), .failure(.network)]
            let approval = model(service)
            await approval.decline()
            #expect(approval.failed == .init(action: .decline, failure: .other), "\(failure)")
            await approval.decline()
            #expect(
                service.calls == [
                    "decline rev_leila v3 \(Keys.key(1))", "decline rev_leila v3 \(Keys.key(1))",
                ], "\(failure)")
        }
    }

    @Test func aRefusalCarriedNothingOutSoTheNextTapIsANewAction() async {
        for failure in [APIFailure.refused, .profileIncomplete, .notAllowed] {
            let service = ScriptedClubs()
            service.approveAnswers = [.failure(failure), .failure(.network)]
            let approval = model(service)
            await approval.approve()
            #expect(approval.failed == .init(action: .approve, failure: .other), "\(failure)")
            await approval.approve()
            #expect(
                service.calls == [
                    "approve rev_leila v3 \(Keys.key(1))", "approve rev_leila v3 \(Keys.key(2))",
                ], "\(failure)")
        }
    }

    @Test func eachActionHasItsOwnKey() async {
        // Decline lost on the way, then Approve, then Decline again: Approve is a new action,
        // and Decline's retry still sends the key the server may have carried out.
        let service = ScriptedClubs()
        service.declineAnswers = [.failure(.network), .failure(.network)]
        service.approveAnswers = [.failure(.network)]
        let approval = model(service)
        await approval.decline()
        await approval.approve()
        #expect(approval.failed == .init(action: .approve, failure: .network))
        await approval.decline()
        #expect(
            service.calls == [
                "decline rev_leila v3 \(Keys.key(1))", "approve rev_leila v3 \(Keys.key(2))",
                "decline rev_leila v3 \(Keys.key(1))",
            ])
    }

    @Test func oneActionAtATime() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.success(Approval.revision())]
        let approval = model(service)
        let gate = Gate()
        service.duringDecision = { await gate.wait() }
        async let first: Void = approval.approve()
        await gate.reached()
        #expect(approval.busy == .approve)
        // Neither a second Approve nor a Decline is sent while the first is out.
        service.duringDecision = {}
        await approval.approve()
        await approval.decline()
        gate.open()
        await first
        #expect(service.calls == ["approve rev_leila v3 \(Keys.key(1))"])
        #expect(approval.state == .finished)
    }

    // MARK: The approval's own outcomes

    @Test func aChangedRosterAsksToReviewItWithTheActionsOwnWords() async {
        let cases: [(RosterApprovalModel.Action, APIFailure)] = [
            (.approve, .rosterChanged), (.approve, .versionConflict),
            (.decline, .rosterChanged), (.decline, .versionConflict),
        ]
        for (action, failure) in cases {
            let service = ScriptedClubs()
            service.approveAnswers = [.failure(failure)]
            service.declineAnswers = [.failure(failure)]
            let approval = model(service)
            if action == .approve { await approval.approve() } else { await approval.decline() }
            #expect(approval.alert == .rosterChanged(action), "\(action) \(failure)")
            #expect(approval.failed == nil)
            #expect(approval.revision == Approval.revision())
        }
    }

    @Test func noActionWhileTheAlertShows() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.rosterChanged)]
        let approval = model(service)
        await approval.approve()
        await approval.decline()
        #expect(service.calls == ["approve rev_leila v3 \(Keys.key(1))"])
    }

    @Test func reviewMembersShowsTheNewerRosterAndReplaysNeitherDecision() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.network), .failure(.rosterChanged)]
        let newer = Approval.revision(id: "rev_leila_nina", version: 1, nina: true)
        service.memberAnswers = [.success(Approval.members(open: newer))]
        let approval = model(service)
        await approval.approve()
        await approval.approve()
        #expect(approval.alert == .rosterChanged(.approve))
        await approval.reviewMembers()
        #expect(approval.alert == nil)
        #expect(approval.state == .deciding(newer))
        // Nothing was sent for the newer revision: the person decides on it afresh.
        #expect(service.calls.last == "members club_kitchen")
        service.approveAnswers = [.success(newer)]
        await approval.approve()
        #expect(service.calls.last == "approve rev_leila_nina v1 \(Keys.key(2))")
    }

    @Test func reviewMembersWithNothingOpenIsNoLongerAvailable() async {
        let service = ScriptedClubs()
        service.declineAnswers = [.failure(.rosterChanged)]
        service.memberAnswers = [.success(Approval.members(open: nil))]
        let approval = model(service)
        await approval.decline()
        await approval.reviewMembers()
        #expect(approval.state == .unavailable)
    }

    @Test func reviewMembersOnARosterAlreadyDecidedCloses() async {
        // The newer revision is one the viewer proposed (FQ60): there's nothing to decide.
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.rosterChanged)]
        service.memberAnswers = [
            .success(Approval.members(open: Approval.revision(id: "rev_2", decision: .approved)))
        ]
        let approval = model(service)
        await approval.approve()
        await approval.reviewMembers()
        #expect(approval.state == .finished)
    }

    @Test func reviewMembersFailingHasItsRetry() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.rosterChanged)]
        let newer = Approval.revision(id: "rev_2", version: 1)
        service.memberAnswers = [
            .failure(.network), .failure(.unavailable), .success(Approval.members(open: newer)),
        ]
        let approval = model(service)
        await approval.approve()
        await approval.reviewMembers()
        #expect(approval.state == .reviewFailed(.network))
        await approval.reviewMembers()
        #expect(approval.state == .reviewFailed(.other))
        await approval.reviewMembers()
        #expect(approval.state == .deciding(newer))
    }

    @Test func aFullClubAsksToSeeMembers() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.clubFull)]
        let approval = model(service)
        await approval.approve()
        #expect(approval.alert == .clubFull)
        #expect(approval.failed == nil)
        approval.seeMembers()
        #expect(approval.alert == nil)
        #expect(approval.state == .finished)
    }

    @Test func notFoundIsNoLongerAvailableAndTheMembersDecide() async {
        for action in [RosterApprovalModel.Action.approve, .decline] {
            let service = ScriptedClubs()
            service.approveAnswers = [.failure(.notFound)]
            service.declineAnswers = [.failure(.notFound)]
            let told = Told()
            let approval = model(service, told: told)
            if action == .approve { await approval.approve() } else { await approval.decline() }
            #expect(approval.state == .unavailable, "\(action)")
            #expect(told.gone == 1)
        }
    }

    @Test func reviewMembersNotFoundIsNoLongerAvailableAndTheMembersDecide() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.rosterChanged)]
        service.memberAnswers = [.failure(.notFound)]
        let told = Told()
        let approval = model(service, told: told)
        await approval.approve()
        await approval.reviewMembers()
        #expect(approval.state == .unavailable)
        #expect(told.gone == 1)
    }

    @Test func signedOutEndsTheSession() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.signedOut)]
        let told = Told()
        let approval = model(service, told: told)
        await approval.approve()
        #expect(told.signedOut == 1)
        #expect(approval.failed == nil)
    }

    @Test func anAnswerAfterTheSessionEndedChangesNothing() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.success(Approval.revision())]
        let session = SessionFlag()
        service.duringDecision = { @MainActor in session.current = false }
        let approval = model(service, session: session)
        await approval.approve()
        #expect(approval.state == .deciding(Approval.revision()))
        #expect(approval.busy == nil)
    }

    // MARK: Members, under the screen

    @Test func membersReadAgainOnlyOnceTheScreenMovedOnFromTheirRoster() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.network), .failure(.rosterChanged)]
        let newer = Approval.revision(id: "rev_2", version: 1)
        service.memberAnswers = [.success(Approval.members(open: newer))]
        let approval = model(service)
        #expect(!approval.refreshesMembers)
        // A failure's line keeps the same roster: Back reads nothing.
        await approval.approve()
        #expect(!approval.refreshesMembers)
        // The roster changed: Members lists one the person no longer sees.
        await approval.approve()
        await approval.reviewMembers()
        #expect(approval.state == .deciding(newer))
        #expect(approval.refreshesMembers)
    }

    @Test func membersReadAgainAfterADecisionOrAnEnd() async {
        for (answer, action) in [
            (Result<RosterRevision, APIFailure>.success(Approval.revision()), "approve"),
            (.failure(.notFound), "approve"), (.success(Approval.revision()), "decline"),
        ] {
            let service = ScriptedClubs()
            service.approveAnswers = [answer]
            service.declineAnswers = [answer]
            let approval = model(service)
            if action == "approve" { await approval.approve() } else { await approval.decline() }
            #expect(approval.refreshesMembers, "\(answer) \(action)")
        }
    }

    /// Club details' model makes the approval in its own session, for its own club: a not found
    /// reads the members again, and their not found closes the club's screens.
    @Test func theClubsModelMakesTheApprovalAndItsNotFoundReadsTheMembers() async {
        let service = ScriptedClubs()
        service.declineAnswers = [.failure(.notFound)]
        service.memberAnswers = [.failure(.notFound)]
        let keys = Keys()
        let session = SessionFlag()
        let summary = ClubSummary(
            ref: Approval.ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
        let details = ClubDetailsModel(
            club: summary, service: service, current: { session.current })
        let approval = details.approval(of: Approval.revision(), makeKey: { keys.next() })
        #expect(approval.club == Approval.ref)
        #expect(approval.revision == Approval.revision())
        await approval.decline()
        #expect(approval.state == .unavailable)
        #expect(service.calls.first == "decline rev_leila v3 \(Keys.key(1))")
        #expect(service.calls.contains("members club_kitchen"))
        #expect(details.closed)
    }

    @Test func theClubsModelsApprovalCountsOnlyInItsSession() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.success(Approval.revision(decision: .approved))]
        let session = SessionFlag()
        service.duringDecision = { @MainActor in session.current = false }
        let summary = ClubSummary(
            ref: Approval.ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
        let details = ClubDetailsModel(
            club: summary, service: service, current: { session.current })
        let approval = details.approval(of: Approval.revision())
        await approval.approve()
        #expect(approval.state == .deciding(Approval.revision()))
    }

    @Test func aCancelledActionShowsNoFailure() async {
        let service = ScriptedClubs()
        service.approveAnswers = [.failure(.network)]
        let approval = model(service)
        let gate = Gate()
        service.duringDecision = { await gate.wait() }
        let task = Task { await approval.approve() }
        await gate.reached()
        task.cancel()
        gate.open()
        await task.value
        #expect(approval.failed == nil)
        #expect(approval.busy == nil)
    }
}

/// Kitchen table, active with five members, and Ben's proposal of Leila, as Maya sees it
/// (G03-approve: handoffs 4 and 8; FQ54, FQ60).
enum Approval {
    static let ref = ClubRef(
        id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
        myMembershipID: "mem_maya")
    static let ben = Person(membershipID: "mem_ben", displayName: "Ben", avatarVersion: nil)
    static let maya = Person(membershipID: "mem_maya", displayName: "Maya", avatarVersion: nil)
    static let alex = Person(membershipID: "mem_alex", displayName: "Alex", avatarVersion: nil)
    static let sam = Person(membershipID: "mem_sam", displayName: "Sam", avatarVersion: nil)
    static let debby = Person(membershipID: "mem_debby", displayName: "Debby", avatarVersion: nil)

    static func revision(
        id: String = "rev_leila", version: Int = 3, decision: RosterDecision = .pending,
        nina: Bool = false
    ) -> RosterRevision {
        var candidates = [
            Candidate(id: "cand_leila", name: "Leila", proposedBy: ben, invitation: nil)
        ]
        if nina {
            candidates.append(
                Candidate(id: "cand_nina", name: "Nina", proposedBy: alex, invitation: nil))
        }
        return RosterRevision(
            id: id, version: version, club: ref, state: .open, proposedBy: ben,
            members: [ben, maya, alex, sam, debby], candidates: candidates, myDecision: decision,
            supersededBy: nil)
    }

    static func members(open: RosterRevision?) -> MemberList {
        MemberList(
            serverClock: Sunday.clock, club: ref,
            members: [ben, maya, alex, sam, debby].enumerated().map {
                Member(person: $1, position: $0 + 1, cover: nil, nextDay: nil, nextUp: false)
            },
            openRevision: open)
    }
}
