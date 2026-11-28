import Foundation
import Testing

@testable import TadayoCore

/// Remove invitation from Members (FQ148; handoff 11's sections 5 and 8;
/// `docs/plans/ios-b1-remove-invitation.md` section 2): Kitchen table as Ben reads it, five
/// members and two proposed people, Ben's Leila and Alex's Nina.
@MainActor @Suite struct MembersRemovalTests {
    static let ref = ClubRef(
        id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
        myMembershipID: "mem_ben")
    static let summary = ClubSummary(
        ref: ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
    let account = "acct_ben"

    func members(
        without: Set<String> = [], decision: RosterDecision = .approved
    ) -> MemberList {
        let candidates = [
            Sunday.candidate("cand_leila", "Leila", .live, by: Approval.ben),
            Candidate(id: "cand_nina", name: "Nina", proposedBy: Approval.alex, invitation: nil),
        ].filter { !without.contains($0.id) }
        let open = RosterRevision(
            id: "rev_2", version: 2, club: Self.ref, state: .open, proposedBy: Approval.ben,
            members: [Approval.ben, Approval.maya, Approval.alex, Approval.sam, Approval.debby],
            candidates: candidates, myDecision: decision, supersededBy: nil)
        return MemberList(
            serverClock: Sunday.clock, club: Self.ref,
            members: Approval.members(open: nil).members, openRevision: open)
    }

    var week: ClubWeek { ClubWeek(serverClock: Sunday.clock, club: Self.ref, assignments: []) }

    /// Kitchen table's details: `canPropose` while a place is free.
    func detail(canPropose: Bool) -> ClubDetail {
        ClubDetail(
            serverClock: Sunday.clock, club: Self.summary, rosterVersion: 2,
            canPropose: canPropose, openRevisionID: "rev_2")
    }

    /// Leila's live link (`inv_leila`), kept on this phone.
    func keepingLeila() -> InvitationLinkBook {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_leila", for: "cand_leila", url: Sunday.url(1)), club: Self.ref.id,
            account: account)
        return book
    }

    func model(
        _ clubs: FakeClubs, book: InvitationLinkBook? = nil,
        current: @escaping @MainActor () -> Bool = { true },
        signedOut: @escaping @MainActor () async -> Void = {}
    ) -> ClubDetailsModel {
        ClubDetailsModel(
            club: Self.summary, service: clubs,
            links: (book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()), account),
            current: current, signedOut: signedOut)
    }

    func roster(_ model: ClubDetailsModel) -> Roster? {
        if case .loaded(let roster) = model.members { return roster }
        return nil
    }

    func proposed(_ model: ClubDetailsModel) -> [String]? {
        roster(model)?.proposed.map(\.candidate.name)
    }

    func removals(_ clubs: FakeClubs) -> [String] {
        clubs.calls.filter { $0.hasPrefix("removeCandidate") }
    }

    func reads(_ clubs: FakeClubs) -> Int {
        clubs.calls.filter { $0.hasPrefix("members") }.count
    }

    @Test func onlyTheViewersOwnCandidateIsRemovableWhateverTheirDecision() {
        for decision in [RosterDecision.approved, .pending, .declined] {
            let roster = Roster(members(decision: decision), week: week)
            #expect(roster.proposed.map(\.removable) == [true, false], "\(decision)")
        }
        // The pending decision keeps its route to G03-approve beside the More.
        #expect(
            Roster(members(decision: .pending), week: week).proposed.map(\.opens)
                == [.approval, .approval])
        #expect(Roster(members(), week: week).proposed.map(\.opens) == [.invitation, .nothing])
    }

    /// Handoff 11's section 3 has the setup list's focus go to the row now in the removed one's
    /// place, else the one before; Members, with no Create an invitation or Done for now, ends on
    /// its last member's row.
    @Test func focusGoesToTheProposedRowInItsPlaceElseTheOneBeforeElseTheLastMember() {
        // Leila's row, first, gone: Nina's now stands in its place.
        let afterLeila = Roster(members(without: ["cand_leila"]), week: week)
        #expect(afterLeila.focusAfterRemoval(at: 0) == .proposed("cand_nina"))
        // Nina's row, last, gone: the one before it.
        let afterNina = Roster(members(without: ["cand_nina"]), week: week)
        #expect(afterNina.focusAfterRemoval(at: 1) == .proposed("cand_leila"))
        // No proposed row left: the last member's, Debby's.
        let afterBoth = Roster(members(without: ["cand_leila", "cand_nina"]), week: week)
        #expect(afterBoth.focusAfterRemoval(at: 0) == .member(Approval.debby.membershipID))
        // The row in the place, not the last one.
        let both = Roster(members(), week: week)
        #expect(both.focusAfterRemoval(at: 0) == .proposed("cand_leila"))
        // No row at all: nowhere.
        let empty = Roster(
            MemberList(serverClock: Sunday.clock, club: Self.ref, members: [], openRevision: nil),
            week: week)
        #expect(empty.focusAfterRemoval(at: 0) == nil)
    }

    @Test func onTheAnswerTheRowGoesAndMembersIsReadAgainQuietly() async {
        for readAgain in [true, false] {
            let clubs = FakeClubs(
                members: [
                    .success(members()),
                    readAgain ? .success(members(without: ["cand_leila"])) : .failure(.network),
                ],
                schedule: [.success(week), .success(week)], remove: [.success(())])
            let book = keepingLeila()
            let model = model(clubs, book: book)
            await model.loadMembers()
            let gate = Gate()
            clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
            let removing = Task { await model.remove("cand_leila") }
            await gate.reached()
            // The row went on the answer, before the read again answers.
            #expect(proposed(model) == ["Nina"], "\(readAgain)")
            #expect(model.notice == nil)
            gate.open()
            await removing.value
            #expect(proposed(model) == ["Nina"], "\(readAgain)")
            #expect(roster(model)?.rows.count == 5)
            #expect(model.notice == .init(kind: .removed(name: "Leila", position: 0), sequence: 1))
            #expect(book.link(for: "cand_leila", club: Self.ref.id, account: account) == nil)
            #expect(removals(clubs) == ["removeCandidate cand_leila"])
            #expect(model.removalFailure == nil && model.removing == nil)
        }
    }

    @Test func aReadAskedAfterTheAnswerDecides() async {
        let clubs = FakeClubs(
            members: [.success(members()), .failure(.network), .success(members())],
            schedule: Array(repeating: .success(week), count: 3), remove: [.success(())])
        let model = model(clubs)
        await model.loadMembers()
        await model.remove("cand_leila")
        #expect(proposed(model) == ["Nina"])
        await model.refreshMembers()
        #expect(proposed(model) == ["Leila", "Nina"])
    }

    @Test func aFailureKeepsTheRowWithItsLineUntilMembersShowsAgain() async {
        let cases: [(APIFailure, Bool)] = [
            (.network, true), (.unreadable, true), (.refused, false), (.unavailable, false),
        ]
        for (failure, uncertain) in cases {
            let clubs = FakeClubs(
                members: Array(repeating: .success(members()), count: 3),
                schedule: Array(repeating: .success(week), count: 3), remove: [.failure(failure)])
            let book = keepingLeila()
            let model = model(clubs, book: book)
            await model.loadMembers()
            await model.remove("cand_leila")
            #expect(proposed(model) == ["Leila", "Nina"], "\(failure)")
            #expect(
                model.removalFailure
                    == .init(
                        candidateID: "cand_leila", name: "Leila", club: "Kitchen table",
                        uncertain: uncertain), "\(failure)")
            #expect(book.link(for: "cand_leila", club: Self.ref.id, account: account) != nil)
            #expect(model.notice == nil)
            #expect(reads(clubs) == 2, "\(failure)")
            await model.loadMembers()
            #expect(model.removalFailure == nil, "\(failure)")
        }
    }

    @Test func aReadThatNoLongerOffersTheRemovalTakesTheLineAndNeverSaysRemoved() async {
        let clubs = FakeClubs(
            members: [.success(members()), .success(members(without: ["cand_leila"]))],
            schedule: [.success(week), .success(week)], remove: [.failure(.network)])
        let model = model(clubs)
        await model.loadMembers()
        await model.remove("cand_leila")
        #expect(model.removalFailure == nil)
        #expect(model.notice == .init(kind: .updated, sequence: 1))
        #expect(proposed(model) == ["Nina"])
    }

    /// A not found is the server's last word on this person, so a row Members still lists (its
    /// read failed, or raced) says the invitation is no longer available, never "Try again"
    /// (handoff 11's section 4).
    @Test func aNotFoundReadsAgainAndSaysMembersWasUpdatedOnlyOnceTheRowHasGone() async {
        for joined in [true, false] {
            let clubs = FakeClubs(
                members: [
                    .success(members()),
                    .success(joined ? members(without: ["cand_leila"]) : members()),
                ],
                schedule: [.success(week), .success(week)], remove: [.failure(.notFound)])
            let model = model(clubs)
            await model.loadMembers()
            await model.remove("cand_leila")
            #expect(reads(clubs) == 2)
            if joined {
                #expect(model.removalFailure == nil)
                #expect(model.notice == .init(kind: .updated, sequence: 1))
            } else {
                #expect(
                    model.removalFailure
                        == .init(
                            candidateID: "cand_leila", name: "Leila", club: "Kitchen table",
                            uncertain: false, unavailable: true))
                #expect(model.notice == nil)
            }
        }
    }

    @Test func aReadAskedBeforeTheAnswerCantBringTheRowBack() async {
        let clubs = FakeClubs(
            // Each read takes the next answer as it answers: the read again after the answer
            // (the third) answers before the earlier one (the second), which is held.
            members: [
                .success(members()), .success(members(without: ["cand_leila"])),
                .success(members()),
            ],
            schedule: Array(repeating: .success(week), count: 3), remove: [.success(())])
        let model = model(clubs)
        await model.loadMembers()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let earlier = Task { await model.refreshMembers() }
        await gate.reached()
        await model.remove("cand_leila")
        #expect(proposed(model) == ["Nina"])
        // The read asked before the answer lists Leila; the one after it decided.
        gate.open()
        await earlier.value
        #expect(proposed(model) == ["Nina"])
    }

    /// The probe of the review: Members shown again while a failure's read is out takes the
    /// line, and a roster still listing Leila says nothing changed.
    @Test func membersUpdatedIsSaidOnlyOnceTheRosterNoLongerListsThem() async {
        let clubs = FakeClubs(
            members: Array(repeating: .success(members()), count: 3),
            schedule: Array(repeating: .success(week), count: 3),
            remove: [.failure(.network)])
        let model = model(clubs)
        await model.loadMembers()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let removing = Task { await model.remove("cand_leila") }
        await gate.reached()
        #expect(model.removalFailure?.uncertain == true)
        await model.loadMembers()
        #expect(model.removalFailure == nil)
        gate.open()
        await removing.value
        #expect(proposed(model) == ["Leila", "Nina"])
        #expect(model.notice == nil)
    }

    /// One change in flight per club (handoff 11's `busy.concurrency`): a link action on the
    /// person's invitation page, or the name step's, left by Back while it goes on, holds every
    /// removal, and a removal holds every proposed row's route (the screen) and More.
    @Test func aRemovalWaitsForThePersonsPageAndTheNameStep() async throws {
        // The details, the page's two reads and the name step's first read each read the club.
        let clubs = FakeClubs(
            club: Array(repeating: .success(detail(canPropose: true)), count: 6),
            members: Array(repeating: .success(members()), count: 6),
            schedule: Array(repeating: .success(week), count: 6))
        let model = model(clubs, book: keepingLeila())
        await model.loadDetails()
        await model.loadMembers()
        #expect(model.removalCanStart && model.canRemove("cand_leila"))
        #expect(!model.canRemove("cand_nina"))
        // Leila's page revoking Leila's link.
        let page = try #require(model.invitation(for: "cand_leila"))
        await page.load()
        let revokeGate = Gate()
        clubs.duringRevoke = { await revokeGate.wait() }
        let revoking = Task { await page.revoke("cand_leila") }
        await revokeGate.reached()
        #expect(!model.removalCanStart && !model.canRemove("cand_leila"))
        await model.remove("cand_leila")
        #expect(removals(clubs).isEmpty)
        revokeGate.open()
        await revoking.value
        #expect(model.canRemove("cand_leila"))
        // The name step proposing someone.
        let naming = try #require(model.makeInvite())
        naming.name = "Omar"
        let proposeGate = Gate()
        clubs.duringPropose = { await proposeGate.wait() }
        let proposing = Task { await naming.createLinkAndShare() }
        await proposeGate.reached()
        #expect(!model.removalCanStart && !model.canRemove("cand_leila"))
        await model.remove("cand_leila")
        #expect(removals(clubs).isEmpty)
        proposeGate.open()
        _ = await proposing.value
        #expect(model.canRemove("cand_leila"))
    }

    /// Kitchen table full with Leila proposed: removing Leila frees the place, so the details read
    /// again after the answer bring Invite someone back (FQ148), whatever the answer was.
    @Test func theDetailsAreReadAgainAfterEveryAnswer() async {
        for answer: Result<Void, APIFailure> in [
            .success(()), .failure(.network), .failure(.notFound), .failure(.refused),
        ] {
            let clubs = FakeClubs(
                club: [.success(detail(canPropose: false)), .success(detail(canPropose: true))],
                members: Array(repeating: .success(members()), count: 2),
                schedule: Array(repeating: .success(week), count: 2), remove: [answer])
            let model = model(clubs)
            await model.loadDetails()
            await model.loadMembers()
            #expect(!model.canInvite)
            await model.remove("cand_leila")
            #expect(model.canInvite, "\(answer)")
            #expect(clubs.calls.filter { $0.hasPrefix("club ") }.count == 2, "\(answer)")
        }
        // A session ended reads nothing more.
        let clubs = FakeClubs(
            club: [.success(detail(canPropose: false))], members: [.success(members())],
            schedule: [.success(week)], remove: [.failure(.signedOut)])
        let model = model(clubs)
        await model.loadDetails()
        await model.loadMembers()
        await model.remove("cand_leila")
        #expect(clubs.calls.filter { $0.hasPrefix("club ") }.count == 1)
    }

    @Test func anotherMembersCandidateIsNeverRemovedAndOneRemovalAtATime() async {
        let clubs = FakeClubs(
            members: [.success(members()), .success(members(without: ["cand_leila"]))],
            schedule: [.success(week), .success(week)], remove: [.success(())])
        let model = model(clubs)
        await model.loadMembers()
        await model.remove("cand_nina")
        await model.remove("cand_nowhere")
        #expect(removals(clubs).isEmpty)
        let gate = Gate()
        clubs.duringRemove = { await gate.wait() }
        let removing = Task { await model.remove("cand_leila") }
        await gate.reached()
        #expect(model.removing == "cand_leila")
        await model.remove("cand_leila")
        gate.open()
        await removing.value
        #expect(removals(clubs) == ["removeCandidate cand_leila"])
    }

    @Test func signedOutEndsTheSessionAndReadsNothing() async {
        let clubs = FakeClubs(
            members: [.success(members())], schedule: [.success(week)],
            remove: [.failure(.signedOut)])
        var ended = 0
        let model = model(clubs, signedOut: { ended += 1 })
        await model.loadMembers()
        await model.remove("cand_leila")
        #expect(ended == 1)
        #expect(reads(clubs) == 1)
        #expect(model.removalFailure == nil && model.notice == nil)
    }

    @Test func anAnswerAfterTheSessionEndedChangesNothing() async {
        for answer: Result<Void, APIFailure> in [
            .success(()), .failure(.network), .failure(.notFound), .failure(.signedOut),
        ] {
            let clubs = FakeClubs(
                members: [.success(members())], schedule: [.success(week)], remove: [answer])
            let session = SessionFlag()
            clubs.duringRemove = { await MainActor.run { session.current = false } }
            var ended = 0
            let book = keepingLeila()
            let model = model(
                clubs, book: book, current: { session.current }, signedOut: { ended += 1 })
            await model.loadMembers()
            await model.remove("cand_leila")
            #expect(proposed(model) == ["Leila", "Nina"], "\(answer)")
            // The server's removal still takes the person's kept links: they stop working
            // whatever the screen does (T24); any other answer keeps them.
            let kept = book.link(for: "cand_leila", club: Self.ref.id, account: account)
            if case .success = answer {
                #expect(kept == nil)
            } else {
                #expect(kept != nil, "\(answer)")
            }
            #expect(model.removalFailure == nil && model.notice == nil, "\(answer)")
            #expect(reads(clubs) == 1 && ended == 0, "\(answer)")
            #expect(model.removing == nil)
        }
    }

    @Test func aQuietReadThatFailsKeepsTheRoster() async {
        for failure in [APIFailure.network, .refused, .unavailable] {
            let clubs = FakeClubs(
                members: [.success(members()), .failure(failure)],
                schedule: [.success(week), .success(week)])
            let model = model(clubs)
            await model.loadMembers()
            let shown = model.members
            await model.refreshMembers()
            #expect(model.members == shown, "\(failure)")
            #expect(!model.closed)
        }
    }
}
