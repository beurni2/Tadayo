import Foundation
import Testing

@testable import TadayoCore

/// A candidate's row (`docs/plans/ios-b1-create.md` section 2).
@Suite struct InvitationRowTests {
    func kept(_ invitation: String, shared: Bool = false) -> KeptInvitationLink {
        KeptInvitationLink(
            clubID: Sunday.ref.id, candidateID: "cand_sam", invitationID: invitation,
            url: Sunday.url(1), shared: shared)
    }

    func row(_ state: CandidateLinkState?, kept: KeptInvitationLink? = nil) -> InvitationRow {
        InvitationRow(Sunday.candidate("cand_sam", "Sam", state, invitation: "inv_sam"), kept: kept)
    }

    @Test func eachStateAndKeptLinkGivesItsStatusActionAndMenu() {
        typealias Expected = (
            InvitationRow.Status, InvitationRow.Action?, [InvitationRow.MenuItem], Bool
        )
        let cases: [(InvitationRow, Expected)] = [
            (row(nil), (.notShared, .shareLink, [], false)),
            (row(.live, kept: kept("inv_sam")), (.notShared, .shareLink, [.revokeLink], false)),
            (
                row(.live, kept: kept("inv_sam", shared: true)),
                (.shared, .shareAgain, [.revokeLink], false)
            ),
            // A live link the app doesn't hold: "Link not on this phone" (handoff 9's
            // `setupLinks.missingLive`, frame 15).
            (row(.live), (.notOnThisPhone, .createNewLink, [.revokeLink], false)),
            // A kept link that isn't this invitation's isn't held.
            (
                row(.live, kept: kept("inv_old")),
                (.notOnThisPhone, .createNewLink, [.revokeLink], false)
            ),
            (row(.accepted, kept: kept("inv_sam")), (.accepted, nil, [], false)),
            (row(.accepted), (.accepted, nil, [], false)),
            (row(.used, kept: kept("inv_sam")), (.needsToAcceptAgain, .shareAgain, [], false)),
            (row(.used), (.needsToAcceptAgain, nil, [], true)),
            (row(.revoked), (.revoked, .createNewLink, [.createNewLink], false)),
            // An expired link has no More: its action is the only one (handoff 9's
            // `setupLinks.expiredUnused`, frame 16).
            (row(.expired), (.expired, .createNewLink, [], false)),
        ]
        for (index, (row, expected)) in cases.enumerated() {
            #expect(row.status == expected.0, "case \(index)")
            #expect(row.action == expected.1, "case \(index)")
            #expect(row.menu == expected.2, "case \(index)")
            #expect(row.linkNotSaved == expected.3, "case \(index)")
            #expect(row.name == "Sam")
        }
    }
}

/// The setup list (`G01-invite-people` and its states; `docs/plans/ios-b1-create.md`
/// section 1).
@MainActor @Suite struct InvitationListModelTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func model(
        _ clubs: ScriptedClubs, book: InvitationLinkBook? = nil,
        keys: NumberedKeys = NumberedKeys(),
        current: @escaping @MainActor () -> Bool = { true },
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) -> InvitationListModel {
        InvitationListModel(
            club: Sunday.ref, accountID: account, service: clubs,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            makeKey: { keys.make() }, current: current, gone: gone, signedOut: signedOut)
    }

    func loaded(_ list: InvitationListModel) -> InvitationList? {
        if case .loaded(let shown) = list.state { return shown }
        return nil
    }

    func row(_ list: InvitationListModel, _ candidateID: String) -> InvitationRow? {
        loaded(list)?.rows.first { $0.candidateID == candidateID }
    }

    @Test func theRowsAreTheCallersCandidatesInTheServersOrder() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail(version: 3))]
        clubs.memberAnswers = [
            .success(
                Sunday.members([
                    Sunday.candidate("cand_maya", "Maya", .live),
                    Sunday.candidate("cand_leila", "Leila", nil, by: Sunday.leila),
                    Sunday.candidate("cand_alex", "Alex", nil),
                ]))
        ]
        let list = model(clubs)
        #expect(list.state == .loading)
        await list.load()
        let shown = loaded(list)
        #expect(shown?.rows.map(\.name) == ["Maya", "Alex"])
        #expect(shown?.club == Sunday.ref)
        #expect(shown?.state == .proposed)
        #expect(shown?.canInvite == true)
        #expect(shown?.awaitingMyApproval == false)
        #expect(Set(clubs.calls) == ["club club_sunday", "members club_sunday"])
    }

    @Test func createAnInvitationShowsOnlyWhileAPlaceIsFree() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail(canPropose: false))]
        clubs.memberAnswers = [.success(Sunday.members([]))]
        let list = model(clubs)
        await list.load()
        #expect(loaded(list)?.canInvite == false)
        #expect(list.makeInvite() == nil)
    }

    @Test func thePendingScreenAsksForReviewWhenTheCreatorsDecisionIsPending() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(
                Sunday.members([Sunday.candidate("cand_debby", "Debby", .used)], decision: .pending)
            )
        ]
        let list = model(clubs)
        await list.load()
        #expect(loaded(list)?.awaitingMyApproval == true)
    }

    @Test func aFailedReadIsTheListsFailureUntilRetried() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.failure(.network), .failure(.unavailable), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([])), .success(Sunday.members([])),
            .success(Sunday.members([])),
        ]
        let list = model(clubs)
        await list.load()
        #expect(list.state == .failed(.network))
        await list.load()
        #expect(list.state == .failed(.refused))
        await list.load()
        #expect(loaded(list) != nil)
    }

    @Test func aReadAgainKeepsWhatsShownWhenItFails() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .failure(.network)]
        clubs.memberAnswers = [.success(Sunday.members([])), .success(Sunday.members([]))]
        let list = model(clubs)
        await list.load()
        let shown = list.state
        await list.refresh()
        #expect(list.state == shown)
    }

    @Test func aNotFoundClosesTheListPurgesItsLinksAndReadsTheClubListAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.failure(.notFound)]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        var gone = 0
        let list = model(clubs, book: book, gone: { gone += 1 })
        await list.load()
        #expect(list.closed)
        #expect(gone == 1)
        #expect(list.state == .loading)
        #expect(book.link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aSignedOutAnswerEndsTheSession() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.failure(.notFound)]
        clubs.memberAnswers = [.failure(.signedOut)]
        var ended = 0
        let list = model(clubs, signedOut: { ended += 1 })
        await list.load()
        #expect(ended == 1)
        #expect(!list.closed)
    }

    @Test func anAnswerAfterTheListWentAwayIsDropped() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .live)]))
        ]
        var showing = true
        let list = model(clubs, current: { showing })
        clubs.duringMembers = { _ in await MainActor.run { showing = false } }
        await list.load()
        #expect(list.state == .loading)
    }

    @Test func aMembersAnswerSettlesTheKeptLinks() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .revoked)]))
        ]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        #expect(book.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(row(list, "cand_sam")?.status == .revoked)
    }

    @Test func shareLinkGivesTheKeptLinkAndACompletedShareMarksItShared() async throws {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .live)]))
        ]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        #expect(row(list, "cand_sam")?.action == .shareLink)
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        // A cancelled share changes nothing.
        list.shareFinished(for: "cand_sam", completed: false)
        #expect(row(list, "cand_sam")?.status == .notShared)
        list.shareFinished(for: "cand_sam", completed: true)
        #expect(row(list, "cand_sam")?.status == .shared)
        #expect(row(list, "cand_sam")?.action == .shareAgain)
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        #expect(!clubs.calls.contains { $0.hasPrefix("createInvitation") })
    }

    @Test func aLinkGoneSinceTheRowWasShownShowsTheRowAsItIsNow() async {
        // Another read (the name step's, Club details') purged Sam's link after the list showed
        // Share link: the tap shares nothing, the row says what can be done now, and the list is
        // read again.
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .live)])),
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .live)])),
        ]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        #expect(row(list, "cand_sam")?.action == .shareLink)
        book.drop("inv_sam", account: account)
        #expect(await list.linkToShare(for: "cand_sam") == nil)
        #expect(row(list, "cand_sam")?.action == .createNewLink)
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 2)
        #expect(!clubs.calls.contains { $0.hasPrefix("createInvitation") })
    }

    @Test func aCandidateWithNoLinkGetsOneMadeAndKeptBeforeItsShared() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let list = model(clubs, book: book)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        #expect(book.link(for: "cand_sam", club: club, account: account)?.invitationID == "inv_sam")
        #expect(clubs.calls.last == "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))")
        // Its share cancelled and tapped again: the same link, never a second one.
        list.shareFinished(for: "cand_sam", completed: false)
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        #expect(clubs.calls.filter { $0.hasPrefix("createInvitation") }.count == 1)
    }

    @Test func aRetryAfterNoAnswerSendsTheSameKeyAndALinklessReplayMakesOneMore() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [
            .failure(.network),
            .success(Sunday.link("inv_sam", for: "cand_sam", url: nil)),
            .success(Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(2))),
        ]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == nil)
        #expect(list.actionFailure == .createLink(name: "Sam", network: true))
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(2))
        #expect(list.actionFailure == nil)
        #expect(
            clubs.calls.filter { $0.hasPrefix("createInvitation") } == [
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func anUnreadableLinkAnswerKeepsTheKeyForTheRetry() async {
        // The server answered 2xx and the build couldn't read it: the link may be made, so the
        // retry sends the same key, and its replay, which has no link, makes one more (T19;
        // audit A8). Like a busy server's answer, it reads the list no sooner.
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [
            .failure(.unreadable),
            .success(Sunday.link("inv_sam", for: "cand_sam", url: nil)),
            .success(Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(2))),
        ]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == nil)
        #expect(list.actionFailure == .createLink(name: "Sam", network: false))
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 1)
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(2))
        #expect(list.actionFailure == nil)
        #expect(
            clubs.calls.filter { $0.hasPrefix("createInvitation") } == [
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func createNewLinkMakesOneUnderANewKeyAndReadsTheListAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .revoked)])),
            .success(
                Sunday.members([
                    Sunday.candidate("cand_alex", "Alex", .live, invitation: "inv_alex_2")
                ])
            ),
        ]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_alex_2", for: "cand_alex", url: Sunday.url(2)))
        ]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let list = model(clubs, book: book)
        await list.load()
        #expect(row(list, "cand_alex")?.action == .createNewLink)
        #expect(await list.linkToShare(for: "cand_alex") == nil)
        await list.createNewLink(for: "cand_alex")
        #expect(
            book.link(for: "cand_alex", club: club, account: account)?.invitationID == "inv_alex_2")
        #expect(row(list, "cand_alex")?.status == .notShared)
        #expect(row(list, "cand_alex")?.action == .shareLink)
        #expect(await list.linkToShare(for: "cand_alex") == Sunday.url(2))
    }

    @Test func aRefusedLinkSaysSoAndReadsTheListAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .expired)])),
            // Revoked meanwhile: the row changes, and still offers Create new link.
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .revoked)])),
        ]
        clubs.linkAnswers = [.failure(.notAllowed)]
        let list = model(clubs)
        await list.load()
        await list.createNewLink(for: "cand_sam")
        // A new link in place of the expired one: handoff 4's words for Create new link, not the
        // first link's. The read again reached the row, which still offers Create new link, so
        // the line stays.
        #expect(row(list, "cand_sam")?.status == .revoked)
        #expect(row(list, "cand_sam")?.action == .createNewLink)
        #expect(list.actionFailure == .createNewLink(name: "Sam", network: false))
    }

    @Test func aNewLinkWithNoAnswerSaysSoInItsOwnWordsAndKeepsTheRow() async {
        for (state, invitation) in [
            (CandidateLinkState.revoked, "inv_alex"), (.expired, "inv_alex"),
            (.live, "inv_alex"),
        ] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [.success(Sunday.detail())]
            clubs.memberAnswers = [
                .success(
                    Sunday.members([
                        Sunday.candidate("cand_alex", "Alex", state, invitation: invitation)
                    ]))
            ]
            clubs.linkAnswers = [.failure(.network)]
            // A live link the app doesn't hold offers Create new link too (section 2).
            let list = model(clubs)
            await list.load()
            let before = row(list, "cand_alex")
            await list.createNewLink(for: "cand_alex")
            #expect(
                list.actionFailure == .createNewLink(name: "Alex", network: true), "\(state)")
            #expect(row(list, "cand_alex") == before, "\(state)")
        }
    }

    @Test func revokeLinkRevokesALiveLinkAndReadsTheListAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .live)])),
            .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .revoked)])),
        ]
        clubs.revokeAnswers = [.success(())]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(1)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        #expect(row(list, "cand_alex")?.menu == [.revokeLink])
        await list.revoke("cand_alex")
        #expect(clubs.calls.contains("revokeInvitation inv_alex"))
        #expect(row(list, "cand_alex")?.status == .revoked)
        #expect(book.link(for: "cand_alex", club: club, account: account) == nil)
        #expect(list.actionFailure == nil)
    }

    @Test func aRevokeThatFailsKeepsTheRowAndSaysWhetherItsUncertain() async {
        let clubs = ScriptedClubs()
        let alex = Sunday.members([Sunday.candidate("cand_alex", "Alex", .live)])
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
        clubs.memberAnswers = Array(repeating: .success(alex), count: 3)
        clubs.revokeAnswers = [.failure(.network), .failure(.refused)]
        let list = model(clubs)
        await list.load()
        await list.revoke("cand_alex")
        #expect(list.actionFailure == .revoke(name: "Alex", uncertain: true))
        #expect(row(list, "cand_alex")?.status == .notOnThisPhone)
        await list.revoke("cand_alex")
        #expect(list.actionFailure == .revoke(name: "Alex", uncertain: false))
        #expect(row(list, "cand_alex")?.menu == [.revokeLink])
        #expect(clubs.calls.filter { $0 == "members club_sunday" }.count == 3)
    }

    @Test func onlyALiveLinkIsRevokedAndOnlyTheCallersCandidatesAreActedOn() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(
                Sunday.members([
                    Sunday.candidate("cand_sam", "Sam", .used),
                    Sunday.candidate("cand_debby", "Debby", .accepted),
                    Sunday.candidate("cand_leila", "Leila", .live, by: Sunday.leila),
                ]))
        ]
        let list = model(clubs)
        await list.load()
        await list.revoke("cand_sam")
        await list.revoke("cand_debby")
        await list.revoke("cand_leila")
        await list.createNewLink(for: "cand_sam")
        await list.createNewLink(for: "cand_debby")
        #expect(await list.linkToShare(for: "cand_debby") == nil)
        #expect(await list.linkToShare(for: "cand_leila") == nil)
        #expect(
            !clubs.calls.contains {
                $0.hasPrefix("revokeInvitation") || $0.hasPrefix("createInvitation")
            })
    }

    @Test func aSecondTapWhileALinkIsMadeMakesNoOther() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let gate = Gate()
        clubs.duringLink = { await gate.wait() }
        let list = model(clubs)
        await list.load()
        let first = Task { await list.linkToShare(for: "cand_sam") }
        await gate.reached()
        #expect(await list.linkToShare(for: "cand_sam") == nil)
        gate.open()
        #expect(await first.value == Sunday.url(1))
        #expect(clubs.calls.filter { $0.hasPrefix("createInvitation") }.count == 1)
        #expect(list.busy.isEmpty)
    }

    @Test func aLinkThatComesAfterTheSessionEndedIsntKept() async {
        // Leave sign-in runs while the first link, the one after a replay without its link, or a
        // link that fails, is on its way.
        let made = Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(1))
        let replay = Sunday.link("inv_sam", for: "cand_sam", url: nil)
        let cases: [([Result<InvitationLink, APIFailure>], Int)] = [
            ([.success(made)], 1),
            ([.success(replay), .success(made)], 2),
            ([.failure(.network)], 1),
            ([.failure(.unavailable)], 1),
            ([.failure(.refused)], 1),
        ]
        for (answers, ending) in cases {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [.success(Sunday.detail())]
            clubs.memberAnswers = [
                .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))
            ]
            clubs.linkAnswers = answers
            let session = SessionFlag()
            clubs.duringLink = {
                await MainActor.run {
                    session.calls += 1
                    if session.calls == ending { session.current = false }
                }
            }
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            let list = model(clubs, book: book, current: { session.current })
            await list.load()
            #expect(await list.linkToShare(for: "cand_sam") == nil)
            #expect(book.link(for: "cand_sam", club: club, account: account) == nil)
            #expect(list.actionFailure == nil)
            #expect(row(list, "cand_sam")?.menu == [])
            #expect(clubs.calls.filter { $0.hasPrefix("createInvitation") }.count == ending)
            #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 1)
            #expect(list.busy.isEmpty)
        }
    }

    @Test func aRevokeAnsweredAfterTheSessionEndedChangesNothing() async {
        for answer: Result<Void, APIFailure> in [
            .success(()), .failure(.network), .failure(.refused), .failure(.signedOut),
        ] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = [.success(Sunday.detail())]
            clubs.memberAnswers = [
                .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .live)]))
            ]
            clubs.revokeAnswers = [answer]
            let session = SessionFlag()
            clubs.duringRevoke = { await MainActor.run { session.current = false } }
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            book.keep(
                Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(1)), club: club,
                account: account)
            var ended = 0
            let list = model(
                clubs, book: book, current: { session.current }, signedOut: { ended += 1 })
            await list.load()
            await list.revoke("cand_alex")
            #expect(clubs.calls.contains("revokeInvitation inv_alex"))
            #expect(row(list, "cand_alex")?.status == .notShared)
            #expect(row(list, "cand_alex")?.menu == [.revokeLink])
            #expect(book.link(for: "cand_alex", club: club, account: account) != nil)
            #expect(list.actionFailure == nil)
            #expect(ended == 0)
            #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 1)
            #expect(list.busy.isEmpty)
        }
    }

    @Test func anAnswerAskedAfterALinkWasMadeTakesThePlaceOfWhatItsRowLearned() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)])),
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .accepted)])),
        ]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        #expect(row(list, "cand_sam")?.menu == [.revokeLink])
        // Sam accepted before this read was asked: its answer is the server's word now.
        await list.refresh()
        #expect(row(list, "cand_sam")?.status == .accepted)
        #expect(row(list, "cand_sam")?.action == nil)
        #expect(row(list, "cand_sam")?.menu == [])
    }

    @Test func createNewLinkOffersItsLinkWhileTheListIsReadAgainAndASecondTapMakesNone() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .revoked)]))
        ]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_alex_2", for: "cand_alex", url: Sunday.url(2)))
        ]
        let list = model(clubs)
        await list.load()
        let making = Gate()
        let reading = Gate()
        clubs.duringLink = { await making.wait() }
        clubs.duringMembers = { read in if read == 2 { await reading.wait() } }
        let first = Task { await list.createNewLink(for: "cand_alex") }
        // While the link is made, the row waits, and a second tap makes nothing.
        await making.reached()
        #expect(list.busy == ["cand_alex"])
        let second = Task { await list.createNewLink(for: "cand_alex") }
        making.open()
        await second.value
        // The link is made and the list is being read again: the row shows it, held, and shares it.
        await reading.reached()
        #expect(list.busy.isEmpty)
        #expect(row(list, "cand_alex")?.action == .shareLink)
        #expect(row(list, "cand_alex")?.menu == [.revokeLink])
        await list.createNewLink(for: "cand_alex")
        #expect(await list.linkToShare(for: "cand_alex") == Sunday.url(2))
        reading.open()
        await first.value
        // The read again failed, and the row still shows the new link, held: nothing to make.
        #expect(row(list, "cand_alex")?.status == .notShared)
        #expect(row(list, "cand_alex")?.action == .shareLink)
        #expect(row(list, "cand_alex")?.menu == [.revokeLink])
        await list.createNewLink(for: "cand_alex")
        #expect(clubs.calls.filter { $0.hasPrefix("createInvitation") }.count == 1)
        #expect(await list.linkToShare(for: "cand_alex") == Sunday.url(2))
        #expect(list.busy.isEmpty)
    }

    @Test func aConfirmedRevokeDropsTheLinkAtOnceThoughTheReadAgainFails() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_alex", "Alex", .live)]))
        ]
        clubs.revokeAnswers = [.success(())]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(1)), club: club,
            account: account)
        let list = model(clubs, book: book)
        await list.load()
        #expect(row(list, "cand_alex")?.action == .shareLink)
        await list.revoke("cand_alex")
        // No answer is left for the read again, so it fails.
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 2)
        #expect(row(list, "cand_alex")?.status == .revoked)
        #expect(row(list, "cand_alex")?.action == .createNewLink)
        #expect(book.link(for: "cand_alex", club: club, account: account) == nil)
        #expect(await list.linkToShare(for: "cand_alex") == nil)
        #expect(list.actionFailure == nil)
    }

    @Test func aLinkMadeHereAndRevokedGoesThoughTheReadAgainFails() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        clubs.revokeAnswers = [.success(())]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let list = model(clubs, book: book)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        // The link is the last one kept, and no read has been asked since.
        await list.revoke("cand_sam")
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 2)
        #expect(book.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(row(list, "cand_sam")?.status == .revoked)
    }

    @Test func aFirstLinkSharedFromTheListReadsSharedAtOnce() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail())]
        clubs.memberAnswers = [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        #expect(row(list, "cand_sam")?.status == .notShared)
        #expect(row(list, "cand_sam")?.menu == [.revokeLink])
        list.shareFinished(for: "cand_sam", completed: true)
        #expect(row(list, "cand_sam")?.status == .shared)
        #expect(row(list, "cand_sam")?.action == .shareAgain)
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 1)
    }

    @Test func aReadAskedBeforeALinkWasMadeLeavesItsRowAsMade() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        let noLink = Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)])
        clubs.memberAnswers = [.success(noLink), .success(noLink)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let list = model(clubs)
        await list.load()
        let gate = Gate()
        clubs.duringMembers = { read in if read == 2 { await gate.wait() } }
        let reading = Task { await list.refresh() }
        await gate.reached()
        #expect(await list.linkToShare(for: "cand_sam") == Sunday.url(1))
        list.shareFinished(for: "cand_sam", completed: true)
        #expect(row(list, "cand_sam")?.status == .shared)
        // The read asked before the link was made can't list it: the row stays as made.
        gate.open()
        await reading.value
        #expect(row(list, "cand_sam")?.status == .shared)
        #expect(row(list, "cand_sam")?.menu == [.revokeLink])
    }

    @Test func createNewLinkAfterAFailedShareLinkIsANewAction() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(Sunday.detail()), .success(Sunday.detail())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)])),
            // The first try made a link after all, and it has since been revoked.
            .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", .revoked)])),
        ]
        clubs.linkAnswers = [
            .failure(.network),
            .success(Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(2))),
        ]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_sam") == nil)
        #expect(list.actionFailure == .createLink(name: "Sam", network: true))
        await list.refresh()
        #expect(row(list, "cand_sam")?.status == .revoked)
        await list.createNewLink(for: "cand_sam")
        #expect(
            clubs.calls.filter { $0.hasPrefix("createInvitation") } == [
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
        #expect(row(list, "cand_sam")?.action == .shareLink)
    }
}

/// The failure line's lifetime (handoff 9's `setupLinks.mutationFailure.lifetime`;
/// `docs/plans/ios-b1-create.md` section 8): it stays through scrolling, the system's menus and a
/// share sheet; it clears when another link action starts, when a read shows the action that
/// failed no longer applies, or when the person leaves the list (a new list each visit).
@MainActor @Suite struct InvitationFailureLineTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func model(_ clubs: ScriptedClubs, book: InvitationLinkBook? = nil) -> InvitationListModel {
        let keys = NumberedKeys()
        return InvitationListModel(
            club: Sunday.ref, accountID: account, service: clubs,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            makeKey: { keys.make() }, current: { true })
    }

    func row(_ list: InvitationListModel, _ candidateID: String) -> InvitationRow? {
        guard case .loaded(let shown) = list.state else { return nil }
        return shown.rows.first { $0.candidateID == candidateID }
    }

    /// Frame 17's five, before Maya's revoke: Maya's link kept and live, Alex's live and not on
    /// this phone, Sam's revoked, Debby accepted and Nina with no link yet; with `changed`, one of
    /// them as a later read lists them.
    func five(_ changed: Candidate? = nil) -> MemberList {
        let five = [
            Sunday.candidate("cand_maya", "Maya", .live),
            Sunday.candidate("cand_alex", "Alex", .live),
            Sunday.candidate("cand_sam", "Sam", .revoked),
            Sunday.candidate("cand_debby", "Debby", .accepted),
            Sunday.candidate("cand_nina", "Nina", nil),
        ]
        return Sunday.members(five.map { $0.id == changed?.id ? changed ?? $0 : $0 })
    }

    func keepingMaya() -> InvitationLinkBook {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_maya", for: "cand_maya", url: Sunday.url(1)), club: club,
            account: account)
        return book
    }

    @Test func itStaysThroughSharingAKeptLinkCancelledOrCompleted() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = Array(repeating: .success(five()), count: 2)
        clubs.revokeAnswers = [.failure(.network)]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        await list.revoke("cand_alex")
        // The read again still offers Revoke link for Alex: the line stays.
        let failure = InvitationListModel.ActionFailure.revoke(name: "Alex", uncertain: true)
        #expect(clubs.calls.filter { $0 == "members club_sunday" }.count == 2)
        #expect(list.actionFailure == failure)
        // A share of a kept link changes no link.
        #expect(await list.linkToShare(for: "cand_maya") == Sunday.url(1))
        #expect(list.actionFailure == failure)
        list.shareFinished(for: "cand_maya", completed: false)
        #expect(list.actionFailure == failure)
        #expect(await list.linkToShare(for: "cand_maya") == Sunday.url(1))
        list.shareFinished(for: "cand_maya", completed: true)
        #expect(row(list, "cand_maya")?.status == .shared)
        #expect(list.actionFailure == failure)
    }

    @Test func anotherLinkActionClearsItAsItStarts() async {
        // Each of these succeeds, and the read again (where there is one) still shows Alex's
        // link live with Revoke link; while each is held on its way, the line is already gone.
        enum Next: CaseIterable { case createNewLink, revoke, firstLink, invite }
        for next in Next.allCases {
            let clubs = ScriptedClubs()
            // The read after Create new link lists Sam's new link, and the read after Revoke
            // link lists Maya's link revoked.
            let after: Candidate? =
                switch next {
                case .createNewLink:
                    Sunday.candidate("cand_sam", "Sam", .live, invitation: "inv_new")
                case .revoke: Sunday.candidate("cand_maya", "Maya", .revoked)
                case .firstLink, .invite: nil
                }
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
            clubs.memberAnswers = [.success(five()), .success(five()), .success(five(after))]
            clubs.revokeAnswers = [.failure(.network), .success(())]
            let madeFor = next == .firstLink ? "cand_nina" : "cand_sam"
            clubs.linkAnswers = [.success(Sunday.link("inv_new", for: madeFor, url: Sunday.url(2)))]
            let list = model(clubs, book: keepingMaya())
            await list.load()
            await list.revoke("cand_alex")
            #expect(list.actionFailure == .revoke(name: "Alex", uncertain: true), "\(next)")
            let held = Gate()
            clubs.duringLink = { await held.wait() }
            clubs.duringRevoke = { await held.wait() }
            let action: Task<Void, Never>? =
                switch next {
                case .createNewLink: Task { await list.createNewLink(for: "cand_sam") }
                case .revoke: Task { await list.revoke("cand_maya") }
                case .firstLink: Task { _ = await list.linkToShare(for: "cand_nina") }
                case .invite: nil
                }
            if let action {
                await held.reached()
                #expect(list.actionFailure == nil, "while held: \(next)")
                held.open()
                await action.value
            } else {
                #expect(list.makeInvite() != nil, "\(next)")
            }
            switch next {
            case .createNewLink: #expect(row(list, "cand_sam")?.action == .shareLink, "\(next)")
            case .revoke: #expect(row(list, "cand_maya")?.status == .revoked, "\(next)")
            case .firstLink: #expect(row(list, "cand_nina")?.status == .notShared, "\(next)")
            case .invite: break
            }
            #expect(list.actionFailure == nil, "\(next)")
        }
    }

    @Test func aNewFailureTakesItsPlace() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = Array(repeating: .success(five()), count: 2)
        clubs.revokeAnswers = [.failure(.network)]
        clubs.linkAnswers = [.failure(.network)]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        await list.revoke("cand_alex")
        await list.createNewLink(for: "cand_sam")
        #expect(list.actionFailure == .createNewLink(name: "Sam", network: true))
    }

    @Test func aRevokeWithNoAnswerThatTheServerMadeIsSettledByTheReadAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = [
            .success(five()),
            .success(
                Sunday.members([
                    Sunday.candidate("cand_maya", "Maya", .revoked),
                    Sunday.candidate("cand_alex", "Alex", .live),
                ])),
        ]
        clubs.revokeAnswers = [.failure(.network)]
        let reading = Gate()
        clubs.duringMembers = { read in if read == 2 { await reading.wait() } }
        let list = model(clubs, book: keepingMaya())
        await list.load()
        let revoking = Task { await list.revoke("cand_maya") }
        // While the list is read again, the line says the revoke wasn't confirmed (frame 17).
        await reading.reached()
        #expect(list.actionFailure == .revoke(name: "Maya", uncertain: true))
        reading.open()
        await revoking.value
        // The server revoked it: Maya's row no longer offers Revoke link, and the line goes.
        #expect(row(list, "cand_maya")?.status == .revoked)
        #expect(row(list, "cand_maya")?.menu.contains(.revokeLink) == false)
        #expect(list.actionFailure == nil)
    }

    @Test func aRefusedNewLinkIsSettledWhenTheReadAgainOffersNone() async {
        // Sam accepted meanwhile, or the link has been used: neither the row nor More offers
        // Create new link, so the line's Try again has nothing to try.
        for after in [CandidateLinkState.accepted, .used] {
            let clubs = ScriptedClubs()
            clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
            clubs.memberAnswers = [
                .success(five()),
                .success(Sunday.members([Sunday.candidate("cand_sam", "Sam", after)])),
            ]
            clubs.linkAnswers = [.failure(.notAllowed)]
            let reading = Gate()
            clubs.duringMembers = { read in if read == 2 { await reading.wait() } }
            let list = model(clubs)
            await list.load()
            let making = Task { await list.createNewLink(for: "cand_sam") }
            await reading.reached()
            #expect(list.actionFailure == .createNewLink(name: "Sam", network: false), "\(after)")
            reading.open()
            await making.value
            #expect(row(list, "cand_sam")?.action != .createNewLink, "\(after)")
            #expect(row(list, "cand_sam")?.menu.contains(.createNewLink) == false, "\(after)")
            #expect(list.actionFailure == nil, "\(after)")
        }
    }

    @Test func aFirstLinkWithNoAnswerIsSettledByAReadThatShowsALink() async {
        // The link was made, but its answer was lost: the next read shows Nina's link, which this
        // phone doesn't hold, and the row offers Create new link instead of Share link.
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 3)
        clubs.memberAnswers = [
            .success(five()), .success(five()),
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .live)])),
        ]
        clubs.linkAnswers = [.failure(.network)]
        let list = model(clubs)
        await list.load()
        #expect(await list.linkToShare(for: "cand_nina") == nil)
        #expect(list.actionFailure == .createLink(name: "Nina", network: true))
        // A read that still shows no link keeps the line.
        await list.refresh()
        #expect(list.actionFailure == .createLink(name: "Nina", network: true))
        await list.refresh()
        #expect(row(list, "cand_nina")?.status == .notOnThisPhone)
        #expect(list.actionFailure == nil)
    }

    @Test func aReadThatNoLongerListsThePersonSettlesIt() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = [.success(five()), .success(Sunday.members(nil))]
        clubs.revokeAnswers = [.failure(.refused)]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        await list.revoke("cand_alex")
        #expect(row(list, "cand_alex") == nil)
        #expect(list.actionFailure == nil)
    }

    @Test func aFailedReadKeepsIt() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = Array(repeating: .success(Sunday.detail()), count: 2)
        clubs.memberAnswers = [.success(five()), .failure(.network)]
        clubs.revokeAnswers = [.failure(.network)]
        let list = model(clubs, book: keepingMaya())
        await list.load()
        await list.revoke("cand_maya")
        #expect(list.actionFailure == .revoke(name: "Maya", uncertain: true))
        #expect(row(list, "cand_maya")?.menu == [.revokeLink])
    }
}

/// The name step (`G01-invite-name`; `docs/plans/ios-b1-create.md` section 1).
@MainActor @Suite struct InviteNameModelTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func model(
        _ clubs: ScriptedClubs, book: InvitationLinkBook? = nil,
        keys: NumberedKeys = NumberedKeys(),
        known: Set<String> = ["cand_maya"], current: @escaping @MainActor () -> Bool = { true },
        changed: @escaping @MainActor () async -> Void = {}
    ) -> InviteNameModel {
        InviteNameModel(
            club: Sunday.ref, accountID: account, rosterVersion: 2, known: known, service: clubs,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            makeKey: { keys.make() }, current: current, changed: changed)
    }

    var withSam: RosterRevision {
        Sunday.revision([
            Sunday.candidate("cand_maya", "Maya", .live),
            Sunday.candidate("cand_sam", "Sam", nil),
        ])
    }

    @Test func createLinkAndShareProposesThenKeepsTheLinkBeforeOfferingIt() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.success(withSam)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let invite = model(clubs, book: book)
        #expect(!invite.canCreate)
        invite.name = " Sam "
        #expect(invite.canCreate)
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(
            clubs.calls == [
                "propose Sam club_sunday v2 \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
        #expect(invite.candidate?.id == "cand_sam")
        #expect(book.link(for: "cand_sam", club: club, account: account)?.invitationID == "inv_sam")
        #expect(!invite.canCreate)
    }

    @Test func aRetryAfterALostProposalSendsTheSameKey() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.failure(.network), .success(withSam)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .network)
        #expect(invite.failureName == "Sam")
        #expect(invite.name == "Sam")
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(
            clubs.calls.filter { $0.hasPrefix("propose") }
                == Array(repeating: "propose Sam club_sunday v2 \(NumberedKeys.key(1))", count: 2))
    }

    @Test func anUnreadableProposalOrLinkKeepsItsKey() async {
        // Each command answered 2xx and the build couldn't read it: each retry is the same action,
        // so Sam is proposed once and their link made once (T19; audit A8).
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.failure(.unreadable), .success(withSam)]
        clubs.linkAnswers = [
            .failure(.unreadable),
            .success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1))),
        ]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(invite.name == "Sam")
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(invite.candidate?.id == "cand_sam")
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(
            clubs.calls == [
                "propose Sam club_sunday v2 \(NumberedKeys.key(1))",
                "propose Sam club_sunday v2 \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func aProposalAnswerWithoutThePersonKeepsItsKey() async {
        // The server answered 2xx with a roster that adds no Sam of the caller's: what it did
        // with the proposal can't be read from it, so the retry sends the same key rather than
        // propose Sam a second time (T19; audit A8).
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [
            .success(Sunday.revision([Sunday.candidate("cand_maya", "Maya", .live)])),
            .success(withSam),
        ]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(invite.candidate == nil)
        #expect(invite.name == "Sam")
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(
            clubs.calls.filter { $0.hasPrefix("propose") }
                == Array(repeating: "propose Sam club_sunday v2 \(NumberedKeys.key(1))", count: 2))
    }

    @Test func aRetryAfterALostLinkProposesNoOneAgainAndKeepsTheName() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.success(withSam)]
        clubs.linkAnswers = [
            .failure(.unavailable),
            .success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1))),
        ]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        // Sam is proposed: the name is theirs from now on.
        invite.name = "Samuel"
        #expect(invite.name == "Sam")
        #expect(invite.canCreate)
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(
            clubs.calls == [
                "propose Sam club_sunday v2 \(NumberedKeys.key(1))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
                "createInvitation cand_sam club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func aLinklessReplayMakesOneMoreLinkUnderANewKey() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.success(withSam)]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_sam", for: "cand_sam", url: nil)),
            .success(Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(2))),
        ]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let invite = model(clubs, book: book)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == Sunday.url(2))
        #expect(clubs.calls.last == "createInvitation cand_sam club_sunday \(NumberedKeys.key(3))")
        #expect(
            book.link(for: "cand_sam", club: club, account: account)?.invitationID == "inv_sam_2")
    }

    @Test func aRefusedProposalIsANewActionNextTime() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.failure(.clubFull), .success(withSam)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(invite.candidate == nil)
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(clubs.calls[1] == "propose Sam club_sunday v2 \(NumberedKeys.key(2))")
    }

    @Test func aVersionConflictReadsTheRosterAgainAndTheNextTapStartsFromIt() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [
            .failure(.versionConflict),
            .success(
                Sunday.revision([
                    Sunday.candidate("cand_maya", "Maya", .live),
                    Sunday.candidate("cand_nina", "Nina", .live),
                    Sunday.candidate("cand_sam", "Sam", nil),
                ])),
        ]
        clubs.clubAnswers = [.success(Sunday.detail(version: 5))]
        clubs.memberAnswers = [
            .success(
                Sunday.members([
                    Sunday.candidate("cand_maya", "Maya", .live),
                    Sunday.candidate("cand_nina", "Nina", .live),
                ]))
        ]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(await invite.createLinkAndShare() == Sunday.url(1))
        #expect(clubs.calls.contains("propose Sam club_sunday v5 \(NumberedKeys.key(2))"))
        #expect(invite.candidate?.id == "cand_sam")
    }

    @Test func anAnswerThatAddsNoOneRecognisableFails() async {
        let clubs = ScriptedClubs()
        // Two Sams the list didn't show: the app can't tell which is this one.
        clubs.proposeAnswers = [
            .success(
                Sunday.revision([
                    Sunday.candidate("cand_sam_a", "Sam", nil),
                    Sunday.candidate("cand_sam_b", "Sam", nil),
                ]))
        ]
        let invite = model(clubs)
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(invite.failure == .other)
        #expect(!clubs.calls.contains { $0.hasPrefix("createInvitation") })
    }

    @Test func aSignedOutAnswerEndsTheSession() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.failure(.signedOut)]
        var ended = 0
        let invite = InviteNameModel(
            club: Sunday.ref, accountID: account, rosterVersion: 2, known: [], service: clubs,
            book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()), current: { true },
            signedOut: { ended += 1 })
        invite.name = "Sam"
        #expect(await invite.createLinkAndShare() == nil)
        #expect(ended == 1)
        #expect(invite.failure == nil)
    }

    @Test func aLinkThatComesAfterTheSessionEndedIsntKept() async {
        // Leave sign-in runs while the first link, or the one after a replay without its link, is
        // on its way.
        for (replays, ending) in [(false, 1), (true, 2)] {
            let clubs = ScriptedClubs()
            clubs.proposeAnswers = [.success(withSam)]
            clubs.linkAnswers =
                (replays ? [.success(Sunday.link("inv_sam", for: "cand_sam", url: nil))] : [])
                + [.success(Sunday.link("inv_sam_2", for: "cand_sam", url: Sunday.url(1)))]
            let session = SessionFlag()
            clubs.duringLink = {
                await MainActor.run {
                    session.calls += 1
                    if session.calls == ending { session.current = false }
                }
            }
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            let invite = model(clubs, book: book, current: { session.current })
            invite.name = "Sam"
            #expect(await invite.createLinkAndShare() == nil)
            #expect(book.link(for: "cand_sam", club: club, account: account) == nil)
            #expect(invite.link == nil)
            #expect(invite.failure == nil)
            #expect(clubs.calls.filter { $0.hasPrefix("createInvitation") }.count == ending)
        }
    }

    @Test func theShareSheetClosingMarksACompletedShareAndReadsTheListAgain() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.success(withSam)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        var reads = 0
        let invite = model(clubs, book: book, changed: { reads += 1 })
        invite.name = "Sam"
        _ = await invite.createLinkAndShare()
        await invite.shareFinished(completed: true)
        #expect(book.link(for: "cand_sam", club: club, account: account)?.shared == true)
        #expect(reads == 1)
    }

    @Test func aCancelledShareMarksNothing() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [.success(withSam)]
        clubs.linkAnswers = [.success(Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)))]
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let invite = model(clubs, book: book)
        invite.name = "Sam"
        _ = await invite.createLinkAndShare()
        await invite.shareFinished(completed: false)
        #expect(book.link(for: "cand_sam", club: club, account: account)?.shared == false)
    }

    @Test func overFortyCharactersWaits() {
        let invite = model(ScriptedClubs())
        invite.name = String(repeating: "a", count: 41)
        #expect(invite.nameIsTooLong)
        #expect(!invite.canCreate)
        // Counted as a person sees characters, never in UTF-16 units (FQ70, T13), as the club's
        // name is.
        invite.name = String(repeating: "👩‍👩‍👧", count: 40)
        #expect(!invite.nameIsTooLong)
        #expect(invite.canCreate)
        invite.name = String(repeating: "👩‍👩‍👧", count: 41)
        #expect(invite.nameIsTooLong)
        #expect(!invite.canCreate)
    }
}
