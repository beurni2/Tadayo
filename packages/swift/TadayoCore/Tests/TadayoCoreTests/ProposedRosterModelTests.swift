import Foundation
import Testing

@testable import TadayoCore

/// Sunday people's proposed roster before it starts (G05-members-proposed), and Ben's decision on
/// the revision the server made for Debby's own name (G05-members-proposed-approve, FQ145's
/// default; `docs/plans/ios-b1-approve.md` section 2, 7b).
@MainActor @Suite struct ProposedRosterModelTests {
    typealias Keys = InvitationModelTests.Keys

    @MainActor final class Told {
        var gone = 0
        var signedOut = 0
    }

    func model(
        _ service: ScriptedClubs, keys: Keys = Keys(), session: SessionFlag = SessionFlag(),
        told: Told = Told()
    ) -> ProposedRosterModel {
        ProposedRosterModel(
            club: Sunday.ref, service: service, makeKey: { keys.next() },
            current: { session.current }, gone: { told.gone += 1 },
            signedOut: { told.signedOut += 1 })
    }

    static let proposed = ["Maya", "Alex", "Sam", "Debby", "Nina"].map {
        Sunday.candidate("cand_\($0.lowercased())", $0, .live)
    }

    /// The revision the server made when Debby accepted Leila's link under Debby's own name
    /// (FQ84), which Ben must approve.
    static func named(
        version: Int = 2, decision: RosterDecision = .pending, state: RosterRevisionState = .open
    ) -> RosterRevision {
        RosterRevision(
            id: "rev_debby", version: version, club: Sunday.ref, state: state,
            proposedBy: Sunday.ben, members: [Sunday.ben],
            candidates: [Sunday.candidate("cand_debby", "Debby", .accepted)],
            myDecision: decision, supersededBy: nil)
    }

    static func members(_ open: RosterRevision?) -> MemberList {
        MemberList(
            serverClock: Sunday.clock, club: Sunday.ref,
            members: [
                Member(person: Sunday.ben, position: 1, cover: nil, nextDay: nil, nextUp: false)
            ],
            openRevision: open)
    }

    static func started() -> ClubDetail {
        ClubDetail(
            serverClock: Sunday.clock,
            club: ClubSummary(
                ref: Sunday.ref, state: .active, memberCount: 2, openDay: nil, nextDay: nil),
            rosterVersion: 3, canPropose: true, openRevisionID: nil)
    }

    func names(_ roster: ProposedRosterModel) -> [String] {
        guard case .roster(let shown) = roster.shown else { return [] }
        return shown.entries.map { $0.isYou ? "\($0.name) · You" : $0.name }
    }

    // MARK: The roster

    @Test func theProposalByNameTheViewerFirstAsTheServerOrdersIt() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail())]
        service.memberAnswers = [.success(Sunday.members(Self.proposed))]
        let roster = model(service)
        await roster.load()
        #expect(service.calls.sorted() == ["club club_sunday", "members club_sunday"])
        #expect(names(roster) == ["Ben · You", "Maya", "Alex", "Sam", "Debby", "Nina"])
        // Ben's own proposal counts as Ben's approval (FQ60): nothing to decide.
        #expect(roster.approval == nil)
        #expect(roster.asksDecision == false)
        guard case .roster(let shown) = roster.shown else {
            Issue.record("no roster")
            return
        }
        #expect(shown.deciding == nil)
    }

    @Test func withNothingOpenTheMembersAlone() async {
        for open in [nil, Self.named(state: .didNotGoAhead), Self.named(state: .superseded)] {
            let service = ScriptedClubs()
            service.clubAnswers = [.success(Sunday.detail(revision: nil))]
            service.memberAnswers = [.success(Self.members(open))]
            let roster = model(service)
            await roster.load()
            #expect(names(roster) == ["Ben · You"], "\(String(describing: open?.state))")
            #expect(roster.approval == nil)
        }
    }

    @Test func aClubThatStartedIsNoLongerAProposal() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Self.started())]
        service.memberAnswers = [.success(Self.members(nil))]
        let told = Told()
        let roster = model(service, told: told)
        await roster.load()
        #expect(roster.closed)
        #expect(told.gone == 1)
        #expect(roster.shown == .loading)
    }

    @Test func notFoundFromEitherReadIsNoLongerTheCallers() async {
        for (club, members) in [
            (
                Result<ClubDetail, APIFailure>.failure(.notFound),
                Result<MemberList, APIFailure>.success(Self.members(nil))
            ),
            (.success(Sunday.detail()), .failure(.notFound)),
            (.failure(.network), .failure(.notFound)),
        ] {
            let service = ScriptedClubs()
            service.clubAnswers = [club]
            service.memberAnswers = [members]
            let told = Told()
            let roster = model(service, told: told)
            await roster.load()
            #expect(roster.closed)
            #expect(told.gone == 1)
        }
    }

    @Test func signedOutEndsTheSessionOverAnyOtherFailure() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.failure(.notFound)]
        service.memberAnswers = [.failure(.signedOut)]
        let told = Told()
        let roster = model(service, told: told)
        await roster.load()
        #expect(told.signedOut == 1)
        #expect(told.gone == 0)
        #expect(!roster.closed)
    }

    @Test func aFailureHasItsLineAndItsRetry() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .failure(.network), .success(Sunday.detail()), .success(Sunday.detail()),
        ]
        service.memberAnswers = [
            .success(Self.members(nil)), .failure(.unavailable),
            .success(Sunday.members(Self.proposed)),
        ]
        let roster = model(service)
        await roster.load()
        #expect(roster.shown == .failed(.network))
        await roster.retry()
        #expect(roster.shown == .failed(.refused))
        await roster.retry()
        #expect(names(roster).count == 6)
    }

    @Test func anAnswerAfterTheSessionEndedChangesNothing() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Self.started())]
        service.memberAnswers = [.success(Self.members(nil))]
        let session = SessionFlag()
        service.duringMembers = { @MainActor _ in session.current = false }
        let told = Told()
        let roster = model(service, session: session, told: told)
        await roster.load()
        #expect(roster.state == .loading)
        #expect(!roster.closed && told.gone == 0)
    }

    @Test func aLaterReadDropsAnEarliersAnswer() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        service.memberAnswers = [
            .success(Self.members(nil)), .success(Sunday.members(Self.proposed)),
        ]
        let gate = Gate()
        service.duringMembers = { read in if read == 1 { await gate.wait() } }
        let roster = model(service)
        let first = Task { await roster.load() }
        await gate.reached()
        await roster.load()
        gate.open()
        await first.value
        // The later read's members call answered first, with the members alone; the earlier
        // read's answer, the whole proposal, came after it and is dropped.
        #expect(names(roster) == ["Ben · You"])
    }

    // MARK: Ben's decision (FQ145)

    @Test func aPendingDecisionShowsTheRosterToDecideOn() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        service.memberAnswers = [.success(Self.members(Self.named()))]
        let roster = model(service)
        await roster.load()
        #expect(names(roster) == ["Ben · You", "Debby"])
        #expect(roster.approval?.revision == Self.named())
        #expect(roster.asksDecision == true)
        guard case .roster(let shown) = roster.shown else {
            Issue.record("no roster")
            return
        }
        #expect(shown.deciding == Self.named())
    }

    @Test func approvingReadsTheRosterAgainWithNothingCounted() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())),
            .success(Self.members(Self.named(decision: .approved))),
        ]
        service.approveAnswers = [.success(Self.named(decision: .approved))]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        #expect(service.calls.contains("approve rev_debby v2 \(Keys.key(1))"))
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 2)
        #expect(roster.approval == nil)
        #expect(names(roster) == ["Ben · You", "Debby"])
        #expect(roster.asksDecision == false)
        #expect(roster.takeUnderRead())
        #expect(!roster.takeUnderRead())
    }

    @Test func decliningReadsTheRosterAgain() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: nil)),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(nil)),
        ]
        service.declineAnswers = [.success(Self.named(decision: .declined, state: .didNotGoAhead))]
        let roster = model(service)
        await roster.load()
        await roster.decline()
        #expect(service.calls.contains("decline rev_debby v2 \(Keys.key(1))"))
        #expect(roster.approval == nil)
        #expect(names(roster) == ["Ben · You"])
        #expect(roster.takeUnderRead())
    }

    @Test func approvingIntoAClubThatStartsClosesIt() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")), .success(Self.started()),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(nil)),
        ]
        service.approveAnswers = [.success(Self.named(decision: .approved, state: .applied))]
        let told = Told()
        let roster = model(service, told: told)
        await roster.load()
        await roster.approve()
        #expect(roster.closed)
        #expect(told.gone == 1)
    }

    @Test func aFailedDecisionKeepsTheRosterAndItsLine() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        service.memberAnswers = [.success(Self.members(Self.named()))]
        service.approveAnswers = [.failure(.network)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        #expect(roster.approval?.failed == .init(action: .approve, failure: .network))
        #expect(names(roster) == ["Ben · You", "Debby"])
        // No read of its own: the roster stays to decide on.
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 1)
        // The server may have carried it out: what's under the screen reads again.
        #expect(roster.takeUnderRead())
    }

    @Test func aRefusalChangesNothingUnderTheScreen() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        service.memberAnswers = [.success(Self.members(Self.named()))]
        service.approveAnswers = [.failure(.refused)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        #expect(roster.approval?.failed == .init(action: .approve, failure: .other))
        #expect(!roster.takeUnderRead())
    }

    @Test func aDecisionThatChangedNothingSaysBensOwnAndReviewRosterReadsItAgain() async {
        // FQ146, as on G03-approve (handoff 10's alert, the founder's answer): Approve went
        // through, its answer lost; Decline is answered with Ben's approval in it. The roster
        // stays, both actions waiting under "You already approved this roster.", and its Review
        // roster reads the roster again, which shows Ben's decision read-only. Today's server
        // can't answer so here (Ben is the only member, so Ben's Approve applies the roster and
        // the Decline after it is a version conflict, as the next test has it); the mapping is
        // kept for a roster with more members to approve.
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())),
            .success(Self.members(Self.named(decision: .approved))),
        ]
        service.approveAnswers = [.failure(.network)]
        service.declineAnswers = [.success(Self.named(decision: .approved))]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        await roster.decline()
        #expect(roster.approval?.alert == .alreadyDecided(.approve))
        #expect(roster.approval?.state == .decided(Self.named(), .approve))
        #expect(roster.approval?.failed == nil)
        #expect(names(roster) == ["Ben · You", "Debby"])
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 1)
        // What's under the screen asks for a review still: it reads again.
        #expect(roster.takeUnderRead())
        await roster.seeMembers()
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 2)
        #expect(roster.approval == nil)
        #expect(roster.asksDecision == false)
        guard case .roster(let shown) = roster.shown else {
            Issue.record("no roster")
            return
        }
        #expect(shown.deciding == nil)
        #expect(names(roster) == ["Ben · You", "Debby"])
    }

    @Test func aDeclineAfterAnApproveThatStartedTheClubClosesItWithNoAlert() async {
        // What today's server answers: Ben's Approve, its answer lost, applied the roster and
        // moved its version, so the Decline after it is a version conflict. The roster is read
        // again, the club has started, and the screen closes; nothing says a decision.
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")), .success(Self.started()),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(nil)),
        ]
        service.approveAnswers = [.failure(.network)]
        service.declineAnswers = [.failure(.versionConflict)]
        let told = Told()
        let roster = model(service, told: told)
        await roster.load()
        await roster.approve()
        await roster.decline()
        #expect(roster.closed)
        #expect(told.gone == 1)
        #expect(roster.approval == nil)
    }

    @Test func aDecidedApprovalIsDroppedWhenTheRosterIsReadAgain() async {
        // A decision that answered after Back with the viewer's own other decision: opening the
        // roster again reads it, and the alert isn't said again over the read, even one that
        // fails.
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")), .failure(.network),
        ]
        service.memberAnswers = [.success(Self.members(Self.named())), .failure(.network)]
        service.approveAnswers = [.failure(.network)]
        service.declineAnswers = [.success(Self.named(decision: .approved))]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        await roster.decline()
        #expect(roster.approval?.alert == .alreadyDecided(.approve))
        await roster.load()
        #expect(roster.approval == nil)
        #expect(roster.shown == .failed(.network))
    }

    @Test func aChangedRosterShowsTheNewerOneOnReviewMembersReplayingNothing() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        let newer = RosterRevision(
            id: "rev_debby_nina", version: 1, club: Sunday.ref, state: .open,
            proposedBy: Sunday.ben, members: [Sunday.ben],
            candidates: [
                Sunday.candidate("cand_debby", "Debby", .accepted),
                Sunday.candidate("cand_nina", "Nina", .live),
            ], myDecision: .pending, supersededBy: nil)
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(newer)),
        ]
        service.approveAnswers = [.failure(.rosterChanged)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        #expect(roster.approval?.alert == .rosterChanged(.approve))
        await roster.reviewMembers()
        #expect(names(roster) == ["Ben · You", "Debby", "Nina"])
        guard case .roster(let shown) = roster.shown else {
            Issue.record("no roster")
            return
        }
        #expect(shown.deciding == newer)
        #expect(service.calls.last == "members club_sunday")
        #expect(service.calls.filter { $0.hasPrefix("approve") }.count == 1)
    }

    @Test func reviewMembersFailingRetriesTheReview() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .failure(.network),
            .success(Self.members(Self.named(version: 3))),
        ]
        service.declineAnswers = [.failure(.rosterChanged)]
        let roster = model(service)
        await roster.load()
        await roster.decline()
        await roster.reviewMembers()
        #expect(roster.shown == .failed(.network))
        await roster.retry()
        // Retry is Review members' read again, not the roster's.
        #expect(service.calls.filter { $0.hasPrefix("club") }.count == 1)
        #expect(roster.approval?.revision == Self.named(version: 3))
    }

    @Test func reviewMembersFindingItDecidedOrEndedReadsTheRosterAgain() async {
        for open in [Self.named(version: 3, decision: .approved), nil] {
            let service = ScriptedClubs()
            service.clubAnswers = [
                .success(Sunday.detail(revision: "rev_debby")), .success(Sunday.detail()),
            ]
            service.memberAnswers = [
                .success(Self.members(Self.named())), .success(Self.members(open)),
                .success(Self.members(open)),
            ]
            service.approveAnswers = [.failure(.rosterChanged)]
            let roster = model(service)
            await roster.load()
            await roster.approve()
            await roster.reviewMembers()
            #expect(roster.approval == nil, "\(String(describing: open))")
            #expect(service.calls.filter { $0.hasPrefix("club") }.count == 2)
            #expect(roster.state != .loading)
        }
    }

    @Test func aFullClubsSeeMembersReadsTheRosterAgain() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(Self.named())),
        ]
        service.approveAnswers = [.failure(.clubFull)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        #expect(roster.approval?.alert == .clubFull)
        await roster.seeMembers()
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 2)
        // Still pending on the same revision: a new decision, with no key kept from the refusal.
        #expect(roster.approval?.revision == Self.named())
        #expect(roster.approval?.alert == nil)
    }

    @Test func aDecisionNotFoundReadsTheRosterWhichDecides() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby")), .failure(.notFound)]
        service.memberAnswers = [.success(Self.members(Self.named())), .failure(.notFound)]
        service.approveAnswers = [.failure(.notFound)]
        let told = Told()
        let roster = model(service, told: told)
        await roster.load()
        await roster.approve()
        #expect(roster.closed)
        #expect(told.gone == 1)
    }

    @Test func theSameRevisionReadAgainKeepsTheDecisionAndItsKeys() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(Self.named())),
        ]
        service.approveAnswers = [.failure(.network), .failure(.network)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        let first = roster.approval
        // Back, and Review members again: the same revision, the same approval, its line kept.
        await roster.load()
        #expect(roster.approval === first)
        #expect(roster.approval?.failed == .init(action: .approve, failure: .network))
        await roster.approve()
        #expect(
            service.calls.filter { $0.hasPrefix("approve") } == [
                "approve rev_debby v2 \(Keys.key(1))", "approve rev_debby v2 \(Keys.key(1))",
            ])
    }

    @Test func aNewerRevisionReadAgainIsADecisionAfresh() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(Self.named(version: 3))),
        ]
        service.approveAnswers = [.failure(.network), .failure(.network)]
        let roster = model(service)
        await roster.load()
        await roster.approve()
        let first = roster.approval
        await roster.load()
        #expect(roster.approval !== first)
        #expect(roster.approval?.failed == nil)
        await roster.approve()
        #expect(service.calls.last == "approve rev_debby v3 \(Keys.key(2))")
    }

    @Test func aDecisionStillOutIsNotSentTwiceWhenTheRosterIsReadAgain() async {
        let service = ScriptedClubs()
        service.clubAnswers = [
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
            .success(Sunday.detail(revision: "rev_debby")),
        ]
        service.memberAnswers = [
            .success(Self.members(Self.named())), .success(Self.members(Self.named())),
            .success(Self.members(Self.named(decision: .approved))),
        ]
        service.approveAnswers = [.success(Self.named(decision: .approved))]
        let gate = Gate()
        service.duringDecision = { await gate.wait() }
        let roster = model(service)
        await roster.load()
        let approving = Task { await roster.approve() }
        await gate.reached()
        let first = roster.approval
        await roster.load()
        #expect(roster.approval === first)
        #expect(roster.approval?.busy == .approve)
        await roster.approve()
        gate.open()
        await approving.value
        #expect(service.calls.filter { $0.hasPrefix("approve") }.count == 1)
        #expect(roster.approval == nil)
        #expect(roster.asksDecision == false)
    }

    @Test func aDecisionAnsweredAfterTheSessionEndedReadsNothing() async {
        let service = ScriptedClubs()
        service.clubAnswers = [.success(Sunday.detail(revision: "rev_debby"))]
        service.memberAnswers = [.success(Self.members(Self.named()))]
        service.approveAnswers = [.success(Self.named(decision: .approved))]
        let session = SessionFlag()
        service.duringDecision = { @MainActor in session.current = false }
        let roster = model(service, session: session)
        await roster.load()
        await roster.approve()
        #expect(service.calls.filter { $0.hasPrefix("members") }.count == 1)
        #expect(!roster.takeUnderRead())
    }
}
