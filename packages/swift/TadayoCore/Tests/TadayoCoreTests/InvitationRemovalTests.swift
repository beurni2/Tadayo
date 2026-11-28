import Foundation
import Testing

@testable import TadayoCore

/// Remove invitation on the setup list (FQ148; handoff 11's sections 2 to 4 and 8;
/// `docs/plans/ios-b1-remove-invitation.md` section 2).
@MainActor @Suite struct InvitationRemovalTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func model(
        _ clubs: ScriptedClubs, book: InvitationLinkBook? = nil,
        current: @escaping @MainActor () -> Bool = { true },
        signedOut: @escaping @MainActor () async -> Void = {}
    ) -> InvitationListModel {
        InvitationListModel(
            club: Sunday.ref, accountID: account, service: clubs,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            makeKey: { IdempotencyKey.make() }, current: current, signedOut: signedOut)
    }

    func loaded(_ list: InvitationListModel) -> InvitationList? {
        if case .loaded(let shown) = list.state { return shown }
        return nil
    }

    func row(_ list: InvitationListModel, _ candidateID: String) -> InvitationRow? {
        loaded(list)?.rows.first { $0.candidateID == candidateID }
    }

    func names(_ list: InvitationListModel) -> [String]? {
        loaded(list)?.rows.map(\.name)
    }

    /// The open revision: Ben's Maya with a live link, Nina with none and Debby accepted, and
    /// Leila's Omar, less `without`.
    func roster(without: Set<String> = [], debby: CandidateLinkState = .accepted) -> MemberList {
        let all = [
            Sunday.candidate("cand_maya", "Maya", .live),
            Sunday.candidate("cand_nina", "Nina", nil),
            Sunday.candidate("cand_debby", "Debby", debby),
            Sunday.candidate("cand_omar", "Omar", nil, by: Sunday.leila),
        ]
        return Sunday.members(all.filter { !without.contains($0.id) })
    }

    /// Maya's live link, kept on this phone.
    func keepingMaya() -> InvitationLinkBook {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_maya", for: "cand_maya", url: Sunday.url(1)), club: club,
            account: account)
        return book
    }

    func removals(_ clubs: ScriptedClubs) -> [String] {
        clubs.calls.filter { $0.hasPrefix("removeCandidate") }
    }

    func reads(_ clubs: ScriptedClubs) -> Int {
        clubs.calls.filter { $0.hasPrefix("members") }.count
    }

    @Test func theRemovalSendsTheCandidatesIDAndNothingElse() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = [.success(roster()), .success(roster(without: ["cand_nina"]))]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs)
        await list.load()
        await list.remove("cand_nina")
        // No key, no version: a repeat answers the same and changes nothing
        // (`removeCandidate`).
        #expect(removals(clubs) == ["removeCandidate cand_nina"])
        #expect(clubs.calls.count == 5)
    }

    @Test func onTheAnswerTheRowGoesWithItsKeptLinkThoughTheReadAgainFails() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .failure(.network), .failure(.network)]
        clubs.memberAnswers = Array(repeating: .success(roster()), count: 3)
        clubs.removeAnswers = [.success(())]
        let book = keepingMaya()
        let list = model(clubs, book: book)
        await list.load()
        #expect(names(list) == ["Maya", "Nina", "Debby"])
        await list.remove("cand_maya")
        #expect(names(list) == ["Nina", "Debby"])
        #expect(book.link(for: "cand_maya", club: club, account: account) == nil)
        #expect(loaded(list)?.invited == ["cand_nina", "cand_debby", "cand_omar"])
        #expect(list.notice == .init(kind: .removed(name: "Maya", position: 0), sequence: 1))
        #expect(list.actionFailure == nil)
        #expect(list.removing == nil && list.busy.isEmpty)
        #expect(reads(clubs) == 2)
        // Said once: another read changes nothing of it.
        await list.refresh()
        #expect(list.notice?.sequence == 1)
        #expect(names(list) == ["Nina", "Debby"])
    }

    @Test func theRowStaysGoneWhenTheListIsDrawnAgainFromTheAnswerBeforeIt() async {
        // Maya and Nina each with a live link kept; the read after the removal fails, so the
        // last answer still lists Maya, and a completed share draws the list again from it.
        let both = Sunday.members([
            Sunday.candidate("cand_maya", "Maya", .live),
            Sunday.candidate("cand_nina", "Nina", .live),
        ])
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .failure(.network)]
        clubs.memberAnswers = [.success(both), .success(both)]
        clubs.removeAnswers = [.success(())]
        let book = keepingMaya()
        book.keep(
            Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(2)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        await list.remove("cand_maya")
        #expect(names(list) == ["Nina"])
        list.shareFinished(for: "cand_nina", completed: true)
        #expect(row(list, "cand_nina")?.status == .shared)
        #expect(names(list) == ["Nina"])
        #expect(loaded(list)?.othersInvited(besides: "cand_nina") == false)
    }

    @Test func aReadAskedBeforeTheAnswerCantBringTheRowBackAndOneAskedAfterItDecides() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 4)
        // The members reads in the order they answer: the load; the read the removal asks for,
        // which fails; the read asked before the removal's answer, held till then; and one
        // asked after it, which still lists Maya.
        clubs.memberAnswers = [
            .success(roster()), .failure(.network), .success(roster()), .success(roster()),
        ]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let reading = Task { await list.refresh() }
        await gate.reached()
        await list.remove("cand_maya")
        #expect(row(list, "cand_maya") == nil)
        gate.open()
        await reading.value
        #expect(row(list, "cand_maya") == nil)
        #expect(list.notice?.kind == .removed(name: "Maya", position: 0))
        // The server's word, asked after the answer, decides.
        await list.refresh()
        #expect(names(list) == ["Maya", "Nina", "Debby"])
    }

    @Test func createAnInvitationAndTheOthersRowsComeOnlyFromTheReadAgain() async {
        // Debby accepted the earlier roster; the new one needs Debby's acceptance again (frame 3).
        for readAgain in [true, false] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [
                .success(Sunday.detail(canPropose: false)),
                readAgain ? .success(Sunday.detail(canPropose: true)) : .failure(.network),
            ]
            clubs.memberAnswers = [
                .success(roster()), .success(roster(without: ["cand_nina"], debby: .used)),
            ]
            clubs.removeAnswers = [.success(())]
            let list = model(clubs)
            await list.load()
            #expect(loaded(list)?.canInvite == false)
            await list.remove("cand_nina")
            #expect(row(list, "cand_nina") == nil, "\(readAgain)")
            #expect(loaded(list)?.canInvite == readAgain, "\(readAgain)")
            #expect((list.makeInvite() != nil) == readAgain, "\(readAgain)")
            let debby = row(list, "cand_debby")
            #expect(debby?.status == (readAgain ? .needsToAcceptAgain : .accepted), "\(readAgain)")
            #expect(debby?.menu == [.removeInvitation])
        }
    }

    @Test func theConfirmationFollowsTheOpenRevisionsOtherCandidatesAnotherMembersIncluded() async {
        let cases: [([Candidate], String, Bool)] = [
            // Leila's Omar is still invited: the others will review the roster again.
            (
                [
                    Sunday.candidate("cand_nina", "Nina", nil),
                    Sunday.candidate("cand_omar", "Omar", nil, by: Sunday.leila),
                ], "cand_nina", true
            ),
            ([Sunday.candidate("cand_nina", "Nina", nil)], "cand_nina", false),
            (
                [
                    Sunday.candidate("cand_nina", "Nina", nil),
                    Sunday.candidate("cand_debby", "Debby", .accepted),
                ], "cand_debby", true
            ),
        ]
        for (candidates, target, others) in cases {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [.success(Sunday.detail())]
            clubs.memberAnswers = [.success(Sunday.members(candidates))]
            let list = model(clubs)
            await list.load()
            #expect(loaded(list)?.othersInvited(besides: target) == others, "\(target)")
        }
    }

    @Test func noAnswerAnUnreadableAnswerAndARefusalEachKeepTheRowWithTheirLine() async {
        let cases: [(APIFailure, Bool)] = [
            (.network, true), (.unreadable, true), (.refused, false), (.unavailable, false),
            (.profileIncomplete, false),
        ]
        for (failure, uncertain) in cases {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
            clubs.memberAnswers = Array(repeating: .success(roster()), count: 2)
            clubs.removeAnswers = [.failure(failure)]
            let book = keepingMaya()
            let list = model(clubs, book: book)
            await list.load()
            await list.remove("cand_maya")
            #expect(names(list) == ["Maya", "Nina", "Debby"], "\(failure)")
            #expect(row(list, "cand_maya")?.menu == [.revokeLink, .removeInvitation])
            #expect(
                list.actionFailure
                    == .remove(name: "Maya", club: "Sunday people", uncertain: uncertain),
                "\(failure)")
            #expect(book.link(for: "cand_maya", club: club, account: account) != nil)
            #expect(list.notice == nil, "\(failure)")
            #expect(reads(clubs) == 2, "\(failure)")
            #expect(list.removing == nil && list.busy.isEmpty)
        }
    }

    @Test func anotherActionStartingClearsTheLine() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
        clubs.memberAnswers = Array(repeating: .success(roster()), count: 3)
        clubs.removeAnswers = [.failure(.refused)]
        clubs.revokeAnswers = [.success(())]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        await list.remove("cand_nina")
        #expect(list.actionFailure != nil)
        let held = Gate()
        clubs.duringRevoke = { await held.wait() }
        let revoking = Task { await list.revoke("cand_maya") }
        await held.reached()
        #expect(list.actionFailure == nil)
        held.open()
        await revoking.value
    }

    @Test func aNotFoundReadsAgainAndSaysTheListWasUpdatedOnlyOnceTheRowHasGone() async {
        for joined in [true, false] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
            clubs.memberAnswers = [
                .success(roster()),
                .success(joined ? roster(without: ["cand_nina"]) : roster()),
            ]
            clubs.removeAnswers = [.failure(.notFound)]
            let list = model(clubs)
            await list.load()
            await list.remove("cand_nina")
            #expect(reads(clubs) == 2)
            if joined {
                // Nina may have joined: the list never says Nina was removed.
                #expect(list.actionFailure == nil)
                #expect(list.notice == .init(kind: .updated, sequence: 1))
                #expect(row(list, "cand_nina") == nil)
            } else {
                // The server's last word, so never "Try again" (handoff 11's section 4).
                #expect(list.actionFailure == .removeUnavailable)
                #expect(list.notice == nil)
                #expect(row(list, "cand_nina") != nil)
            }
        }
    }

    @Test func aReadThatNoLongerOffersTheRemovalTakesTheLineAndNeverSaysRemoved() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = [.success(roster()), .success(roster(without: ["cand_maya"]))]
        clubs.removeAnswers = [.failure(.network)]
        let book = keepingMaya()
        let list = model(clubs, book: book)
        await list.load()
        await list.remove("cand_maya")
        #expect(list.actionFailure == nil)
        #expect(list.notice == .init(kind: .updated, sequence: 1))
        #expect(row(list, "cand_maya") == nil)
        // The members answer no longer lists Maya: Maya's link goes as the read settles it.
        #expect(book.link(for: "cand_maya", club: club, account: account) == nil)
    }

    @Test func signedOutEndsTheSessionAndReadsNothing() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(roster())]
        clubs.removeAnswers = [.failure(.signedOut)]
        var ended = 0
        let list = model(clubs, signedOut: { ended += 1 })
        await list.load()
        await list.remove("cand_nina")
        #expect(ended == 1)
        #expect(reads(clubs) == 1)
        #expect(list.actionFailure == nil && list.notice == nil)
    }

    @Test func aRemovalWaitsForALinkActionAndTheReverse() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
        clubs.memberAnswers = Array(repeating: .success(roster()), count: 3)
        clubs.revokeAnswers = [.success(())]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        // A revoke on its way: no removal starts, of that row or another.
        let revokeGate = Gate()
        clubs.duringRevoke = { await revokeGate.wait() }
        let revoking = Task { await list.revoke("cand_maya") }
        await revokeGate.reached()
        // Every row's Remove invitation waits (the screen's), not only Maya's.
        #expect(!list.removalCanStart)
        #expect(!list.canRemove("cand_nina") && !list.canRemove("cand_maya"))
        await list.remove("cand_nina")
        await list.remove("cand_maya")
        #expect(removals(clubs).isEmpty)
        revokeGate.open()
        await revoking.value
        #expect(list.canRemove("cand_nina") && list.removalCanStart)
        // A removal on its way: no link action (Nina's first link, Maya's new one), no other
        // removal, and no name step.
        let removeGate = Gate()
        clubs.duringRemove = { await removeGate.wait() }
        let removing = Task { await list.remove("cand_debby") }
        await removeGate.reached()
        #expect(list.removing == "cand_debby")
        #expect(list.busy == ["cand_debby"])
        #expect(await list.linkToShare(for: "cand_nina") == nil)
        await list.createNewLink(for: "cand_maya")
        await list.remove("cand_nina")
        #expect(list.makeInvite() == nil)
        removeGate.open()
        await removing.value
        // The scripted service records a call as it answers.
        #expect(removals(clubs) == ["removeCandidate cand_debby"])
        #expect(!clubs.calls.contains { $0.hasPrefix("createInvitation") })
        #expect(list.removing == nil)
        #expect(list.makeInvite() != nil)
    }

    @Test func anotherMembersCandidateAndAPagesRowAreNeverRemoved() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = Array(repeating: .success(roster()), count: 2)
        clubs.removeAnswers = [.success(()), .success(())]
        let list = model(clubs)
        await list.load()
        await list.remove("cand_omar")
        await list.remove("cand_nowhere")
        let page = InvitationListModel(
            club: Sunday.ref, accountID: account, service: clubs,
            book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()), candidate: "cand_nina",
            current: { true })
        await page.load()
        #expect(loaded(page)?.rows.first?.menu == [])
        await page.remove("cand_nina")
        #expect(removals(clubs).isEmpty)
        #expect(page.removing == nil && page.notice == nil)
    }

    @Test func anAnswerAfterTheSessionEndedChangesNothing() async {
        for answer: Result<Void, APIFailure> in [
            .success(()), .failure(.network), .failure(.notFound), .failure(.signedOut),
        ] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [.success(Sunday.detail())]
            clubs.memberAnswers = [.success(roster())]
            clubs.removeAnswers = [answer]
            let session = SessionFlag()
            clubs.duringRemove = { await MainActor.run { session.current = false } }
            var ended = 0
            let book = keepingMaya()
            let list = model(
                clubs, book: book, current: { session.current }, signedOut: { ended += 1 })
            await list.load()
            await list.remove("cand_maya")
            #expect(names(list) == ["Maya", "Nina", "Debby"], "\(answer)")
            // The server's removal still takes the person's kept links: they stop working
            // whatever the screen does (T24); any other answer keeps them.
            let kept = book.link(for: "cand_maya", club: club, account: account)
            if case .success = answer {
                #expect(kept == nil)
            } else {
                #expect(kept != nil, "\(answer)")
            }
            #expect(list.actionFailure == nil && list.notice == nil, "\(answer)")
            #expect(reads(clubs) == 1, "\(answer)")
            #expect(ended == 0, "\(answer)")
            #expect(list.removing == nil && list.busy.isEmpty)
        }
    }

    @Test func theNoticeKeepsTheRemovedRowsPlaceForFocus() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail(canPropose: false)), count: 2)
        clubs.memberAnswers = [.success(roster()), .success(roster(without: ["cand_nina"]))]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs)
        await list.load()
        await list.remove("cand_nina")
        guard case .removed(let name, let position)? = list.notice?.kind else {
            Issue.record("no removal notice")
            return
        }
        #expect(name == "Nina" && position == 1)
        #expect(loaded(list)?.focusAfterRemoval(at: position) == .row("cand_debby"))
    }

    @Test func focusGoesToCreateAnInvitationElseTheRowInItsPlaceElseTheOneBeforeElseDone() {
        func list(_ ids: [String], canInvite: Bool) -> InvitationList {
            InvitationList(
                club: Sunday.ref, state: .proposed, memberCount: 1,
                rows: ids.map {
                    InvitationRow(
                        Sunday.candidate($0, $0, nil), kept: nil, removable: true)
                }, canInvite: canInvite, awaitingMyApproval: false)
        }
        #expect(list(["a", "b"], canInvite: true).focusAfterRemoval(at: 0) == .createInvitation)
        #expect(list(["a", "b"], canInvite: false).focusAfterRemoval(at: 0) == .row("a"))
        #expect(list(["a", "b"], canInvite: false).focusAfterRemoval(at: 1) == .row("b"))
        #expect(list(["a", "b"], canInvite: false).focusAfterRemoval(at: 2) == .row("b"))
        #expect(list([], canInvite: false).focusAfterRemoval(at: 0) == .doneForNow)
    }
    /// The name step left by Back while it proposes someone or makes their link holds every
    /// removal (handoff 11's `busy.concurrency`), so nobody is removed while a link that would
    /// outlive them is on its way.
    @Test func aRemovalWaitsForTheNameStepLeftByBack() async throws {
        let lena = Sunday.candidate("cand_lena", "Lena", nil)
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
        clubs.memberAnswers = Array(repeating: .success(roster()), count: 3)
        clubs.proposeAnswers = [
            .success(Sunday.revision(roster().openRevision!.candidates + [lena]))
        ]
        clubs.linkAnswers = [.failure(.refused)]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs)
        await list.load()
        #expect(list.canRemove("cand_nina"))
        let naming = try #require(list.makeInvite())
        naming.name = "Lena"
        let gate = Gate()
        clubs.duringLink = { await gate.wait() }
        let creating = Task { await naming.createLinkAndShare() }
        await gate.reached()
        #expect(naming.isCreating)
        #expect(!list.removalCanStart && !list.canRemove("cand_nina"))
        await list.remove("cand_nina")
        #expect(removals(clubs).isEmpty)
        gate.open()
        _ = await creating.value
        #expect(list.removalCanStart && list.canRemove("cand_nina"))
    }

    /// The list loading again while a removal is out (the waiting screens' Manage invitations
    /// reuses its model), its read dropped by the read after the answer: that read loads it, as on
    /// Retry, and its failure shows the failure form, never the loading form with no read behind
    /// it.
    @Test func aListLoadingAgainDuringARemovalLoadsOnceItAnswers() async {
        for readAfter: Result<MemberList, APIFailure> in [.success(roster()), .failure(.network)] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
            clubs.memberAnswers = [.success(roster()), readAfter]
            clubs.removeAnswers = [.failure(.refused)]
            let list = model(clubs)
            await list.load()
            let removeGate = Gate()
            clubs.duringRemove = { await removeGate.wait() }
            let removing = Task { await list.remove("cand_nina") }
            await removeGate.reached()
            let readGate = Gate()
            clubs.duringMembers = { read in if read == 2 { await readGate.wait() } }
            let shownAgain = Task { await list.load() }
            await readGate.reached()
            #expect(list.state == .loading)
            removeGate.open()
            await removing.value
            readGate.open()
            await shownAgain.value
            switch readAfter {
            case .success: #expect(names(list) == ["Maya", "Nina", "Debby"])
            case .failure: #expect(list.state == .failed(.network))
            }
        }
    }

    /// VoiceOver's focus leaves the removed row on the answer, before the read after it, for the
    /// row now in its place (handoff 11's section 4: never on a More that has gone); the read
    /// freeing a place brings Create an invitation, where focus goes on to. A failure takes no
    /// row away and moves nothing.
    @Test func focusLeavesTheRemovedRowOnTheAnswerBeforeTheReadAfterIt() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [
            .success(Sunday.detail(canPropose: false)), .success(Sunday.detail(canPropose: true)),
        ]
        clubs.memberAnswers = [.success(roster()), .success(roster(without: ["cand_nina"]))]
        clubs.removeAnswers = [.success(())]
        let list = model(clubs)
        await list.load()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let removing = Task { await list.remove("cand_nina") }
        await gate.reached()
        #expect(list.removedRow?.position == 1)
        #expect(list.notice == nil)
        #expect(loaded(list)?.focusAfterRemoval(at: 1) == .row("cand_debby"))
        gate.open()
        await removing.value
        #expect(list.notice?.kind == .removed(name: "Nina", position: 1))
        #expect(loaded(list)?.focusAfterRemoval(at: 1) == .createInvitation)
        for failure in [APIFailure.network, .refused, .notFound] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
            clubs.memberAnswers = Array(repeating: .success(roster()), count: 2)
            clubs.removeAnswers = [.failure(failure)]
            let failing = model(clubs)
            await failing.load()
            await failing.remove("cand_nina")
            #expect(failing.removedRow == nil, "\(failure)")
        }
    }
}
