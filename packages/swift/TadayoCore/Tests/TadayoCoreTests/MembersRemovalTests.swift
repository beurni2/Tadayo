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
        without: Set<String> = [], adding: [Candidate] = [], decision: RosterDecision = .approved
    ) -> MemberList {
        let candidates =
            ([
                Sunday.candidate("cand_leila", "Leila", .live, by: Approval.ben),
                Candidate(
                    id: "cand_nina", name: "Nina", proposedBy: Approval.alex, invitation: nil),
            ] + adding).filter { !without.contains($0.id) }
        return MemberList(
            serverClock: Sunday.clock, club: Self.ref,
            members: Approval.members(open: nil).members,
            openRevision: revision(candidates, decision: decision))
    }

    func revision(
        _ candidates: [Candidate], version: Int = 2, decision: RosterDecision = .approved
    ) -> RosterRevision {
        RosterRevision(
            id: "rev_\(version)", version: version, club: Self.ref, state: .open,
            proposedBy: Approval.ben,
            members: [Approval.ben, Approval.maya, Approval.alex, Approval.sam, Approval.debby],
            candidates: candidates, myDecision: decision, supersededBy: nil)
    }

    /// Members read through a script, for the name step's and G03-approve's calls.
    func model(_ clubs: ScriptedClubs) -> ClubDetailsModel {
        clubs.week = week
        return ClubDetailsModel(
            club: Self.summary, service: clubs,
            links: (InvitationLinkBook(vault: InMemoryInvitationLinkVault()), account))
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
    /// Ben's name step proposed Omar but lost his link (it may be made yet: T19); Omar is then
    /// removed from Members, or a removal's not found and the read after it say he's gone:
    /// Invite someone starts a new name step, never Omar's again, whose every link the server
    /// would refuse, and Omar's invitation page isn't the one opened again.
    @Test func aRemovedPersonsNameStepAndPageArentOpenedAgain() async throws {
        let omar = Candidate(
            id: "cand_omar", name: "Omar", proposedBy: Approval.ben, invitation: nil)
        for answer: Result<Void, APIFailure> in [.success(()), .failure(.notFound)] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(detail(canPropose: true)), count: 4)
            clubs.memberAnswers = [
                .success(members()),  // the name step's first read
                .success(members(adding: [omar])),  // Members
                .success(members()),  // the read after the answer
            ]
            clubs.proposeAnswers = [
                .success(revision(members(adding: [omar]).openRevision!.candidates, version: 3))
            ]
            clubs.linkAnswers = [.failure(.network)]
            clubs.removeAnswers = [answer]
            let model = model(clubs)
            await model.loadDetails()
            let naming = try #require(model.makeInvite())
            naming.name = "Omar"
            #expect(await naming.createLinkAndShare() == nil)
            #expect(naming.candidate?.id == "cand_omar" && naming.isUnfinished)
            #expect(model.makeInvite() === naming)
            await model.loadMembers()
            let page = try #require(model.invitation(for: "cand_omar"))
            #expect(model.invitation(for: "cand_omar") === page)
            #expect(model.canRemove("cand_omar"))
            await model.remove("cand_omar")
            #expect(clubs.calls.contains("removeCandidate cand_omar"), "\(answer)")
            let again = try #require(model.makeInvite(), "\(answer)")
            #expect(again !== naming, "\(answer)")
            #expect(again.candidate == nil && again.name.isEmpty, "\(answer)")
            #expect(model.invitation(for: "cand_omar") !== page, "\(answer)")
        }
    }

    /// A removal whose person is still listed after it keeps their name step and page: a failure
    /// changes nothing the server said.
    @Test func aPersonStillListedKeepsTheirNameStepAndPage() async throws {
        let omar = Candidate(
            id: "cand_omar", name: "Omar", proposedBy: Approval.ben, invitation: nil)
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(detail(canPropose: true)), count: 4)
        clubs.memberAnswers = [
            .success(members()), .success(members(adding: [omar])),
            .success(members(adding: [omar])),
        ]
        clubs.proposeAnswers = [
            .success(revision(members(adding: [omar]).openRevision!.candidates, version: 3))
        ]
        clubs.linkAnswers = [.failure(.network)]
        clubs.removeAnswers = [.failure(.refused)]
        let model = model(clubs)
        await model.loadDetails()
        let naming = try #require(model.makeInvite())
        naming.name = "Omar"
        _ = await naming.createLinkAndShare()
        await model.loadMembers()
        let page = try #require(model.invitation(for: "cand_omar"))
        await model.remove("cand_omar")
        #expect(model.removalFailure?.candidateID == "cand_omar")
        #expect(model.makeInvite() === naming)
        #expect(model.invitation(for: "cand_omar") === page)
    }

    /// The server's removed answer alone takes the person's name step: with Members loading again
    /// while the removal was out and the read after the answer failing, nothing lists Omar either
    /// way, and Invite someone still starts a new name step.
    @Test func aRemovedAnswerAloneTakesThePersonsNameStep() async throws {
        let omar = Candidate(
            id: "cand_omar", name: "Omar", proposedBy: Approval.ben, invitation: nil)
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(detail(canPropose: true)), count: 4)
        // The name step's first read, then Members; every read after fails as the network does.
        clubs.memberAnswers = [.success(members()), .success(members(adding: [omar]))]
        clubs.proposeAnswers = [
            .success(revision(members(adding: [omar]).openRevision!.candidates, version: 3))
        ]
        clubs.linkAnswers = [.failure(.network)]
        clubs.removeAnswers = [.success(())]
        let model = model(clubs)
        await model.loadDetails()
        let naming = try #require(model.makeInvite())
        naming.name = "Omar"
        _ = await naming.createLinkAndShare()
        await model.loadMembers()
        let removeGate = Gate()
        clubs.duringRemove = { await removeGate.wait() }
        let removing = Task { await model.remove("cand_omar") }
        await removeGate.reached()
        let readGate = Gate()
        clubs.duringMembers = { read in if read == 3 { await readGate.wait() } }
        let shownAgain = Task { await model.loadMembers() }
        await readGate.reached()
        removeGate.open()
        await removing.value
        readGate.open()
        await shownAgain.value
        #expect(model.members == .failed(.network))
        let again = try #require(model.makeInvite())
        #expect(again !== naming)
    }

    /// One roster change in flight per club (handoff 11's `busy.concurrency`): Club details'
    /// Invite someone isn't offered while a removal from Members is out, and comes back after.
    @Test func inviteSomeoneIsHeldWhileARemovalIsOut() async {
        let clubs = FakeClubs(
            club: Array(repeating: .success(detail(canPropose: true)), count: 2),
            members: Array(repeating: .success(members()), count: 2),
            schedule: Array(repeating: .success(week), count: 2), remove: [.failure(.refused)])
        let model = model(clubs)
        await model.loadDetails()
        await model.loadMembers()
        #expect(model.canInvite)
        let gate = Gate()
        clubs.duringRemove = { await gate.wait() }
        let removing = Task { await model.remove("cand_leila") }
        await gate.reached()
        #expect(!model.canInvite)
        #expect(model.makeInvite() == nil)
        gate.open()
        await removing.value
        #expect(model.canInvite)
        #expect(model.makeInvite() != nil)
    }

    /// A decision on G03-approve left by Back while it goes on holds every removal.
    @Test func aRemovalWaitsForADecisionLeftByBack() async throws {
        let clubs = ScriptedClubs()
        clubs.memberAnswers = [.success(members(decision: .pending))]
        clubs.approveAnswers = [.failure(.refused)]
        let model = model(clubs)
        await model.loadMembers()
        let open = try #require(roster(model)?.openRevision)
        #expect(model.canRemove("cand_leila"))
        let approval = model.approval(of: open)
        let gate = Gate()
        clubs.duringDecision = { await gate.wait() }
        let deciding = Task { await approval.approve() }
        await gate.reached()
        #expect(!model.removalCanStart && !model.canRemove("cand_leila"))
        await model.remove("cand_leila")
        #expect(!clubs.calls.contains { $0.hasPrefix("removeCandidate") })
        gate.open()
        await deciding.value
        #expect(model.removalCanStart && model.canRemove("cand_leila"))
    }

    /// Members shown again while a removal is out (its loading form, its read dropped by the read
    /// after the answer): the read after the answer loads it, as on Retry, and its failure shows
    /// the failure form with Retry, never the loading form with no read behind it.
    @Test func membersShownAgainDuringARemovalLoadOnceItAnswers() async {
        for readAfter: Result<MemberList, APIFailure> in [
            .success(members(without: ["cand_leila"])), .failure(.network),
        ] {
            let clubs = FakeClubs(
                members: [.success(members()), readAfter],
                schedule: Array(repeating: .success(week), count: 3), remove: [.success(())])
            let model = model(clubs)
            await model.loadMembers()
            let removeGate = Gate()
            clubs.duringRemove = { await removeGate.wait() }
            let removing = Task { await model.remove("cand_leila") }
            await removeGate.reached()
            let readGate = Gate()
            clubs.duringMembers = { read in if read == 2 { await readGate.wait() } }
            let shownAgain = Task { await model.loadMembers() }
            await readGate.reached()
            #expect(model.members == .loading)
            removeGate.open()
            await removing.value
            readGate.open()
            await shownAgain.value
            switch readAfter {
            case .success: #expect(proposed(model) == ["Nina"])
            case .failure: #expect(model.members == .failed(.network))
            }
            #expect(model.notice?.kind == .removed(name: "Leila", position: 0))
        }
    }

    /// VoiceOver's focus leaves the removed row on the answer, before the read after it (handoff
    /// 11's section 4: never on a More that has gone); a failure takes no row away and moves
    /// nothing.
    @Test func focusLeavesTheRemovedRowOnTheAnswerBeforeTheReadAfterIt() async {
        let clubs = FakeClubs(
            members: [.success(members()), .success(members(without: ["cand_leila"]))],
            schedule: [.success(week), .success(week)], remove: [.success(())])
        let model = model(clubs)
        await model.loadMembers()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let removing = Task { await model.remove("cand_leila") }
        await gate.reached()
        #expect(model.removedRow?.position == 0)
        #expect(model.notice == nil)
        #expect(roster(model)?.focusAfterRemoval(at: 0) == .proposed("cand_nina"))
        gate.open()
        await removing.value
        #expect(model.notice?.kind == .removed(name: "Leila", position: 0))
        let moved = model.removedRow
        for failure in [APIFailure.network, .refused, .notFound] {
            let clubs = FakeClubs(
                members: [.success(members()), .success(members())],
                schedule: [.success(week), .success(week)], remove: [.failure(failure)])
            let failing = self.model(clubs)
            await failing.loadMembers()
            await failing.remove("cand_leila")
            #expect(failing.removedRow == nil, "\(failure)")
        }
        #expect(moved?.position == 0)
    }
}
