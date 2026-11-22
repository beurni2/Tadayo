import Foundation
import Testing

@testable import TadayoCore

/// One invitation, checked and accepted (`docs/plans/ios-b1-invitation.md` section 1).
@MainActor @Suite struct InvitationModelTests {
    let account = Kitchen.account
    let token = Kitchen.token(1)

    /// Keys made in order, so a test can tell a reused one from a new one.
    final class Keys: @unchecked Sendable {
        private let lock = NSLock()
        private var made = 0
        var count: Int { lock.withLock { made } }
        func next() -> IdempotencyKey {
            lock.withLock {
                made += 1
                return IdempotencyKey(
                    uuid: UUID(uuidString: String(format: "00000000-0000-7000-8000-%012d", made))!)
            }
        }
        static func key(_ n: Int) -> String { String(format: "00000000-0000-7000-8000-%012d", n) }
    }

    @MainActor final class Opened {
        var clubs: [ClubRef] = []
        var signedOut = 0
    }

    func model(
        _ service: ScriptedClubs, book: InvitationLinkBook? = nil, keys: Keys = Keys(),
        token: InvitationToken? = Kitchen.token(1), state: InvitationModel.State = .checking,
        session: SessionFlag = SessionFlag(), opened: Opened = Opened()
    ) -> InvitationModel {
        InvitationModel(
            token: token, state: state, service: service,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            account: account, makeKey: { keys.next() }, current: { session.current },
            joined: { opened.clubs.append($0) }, signedOut: { opened.signedOut += 1 })
    }

    // MARK: Checking

    @Test func eachPreviewAnswerHasItsState() async {
        let roster = Kitchen.roster()
        let cases: [(Result<InvitationPreview, APIFailure>, InvitationModel.State)] = [
            (.success(.open(roster)), .open(roster)),
            (.success(.changed(roster)), .changed(roster, nil)),
            (.success(.waiting(roster)), .waiting(clubName: "Kitchen table")),
            (.success(.expired(inviterName: "Ben")), .expired(inviterName: "Ben")),
            (.success(.full(inviterName: "Debby")), .full(inviterName: "Debby")),
            (.success(.didNotGoAhead(inviterName: "Debby")), .didNotGoAhead(inviterName: "Debby")),
            (.success(.joined(Kitchen.ref)), .opening(Kitchen.ref)),
            (.failure(.network), .checkFailed(.network)),
            (.failure(.unavailable), .checkFailed(.other)),
            (.failure(.refused), .checkFailed(.other)),
            (.failure(.profileIncomplete), .checkFailed(.other)),
        ]
        for (answer, state) in cases {
            let service = ScriptedClubs()
            service.previewAnswers = [answer]
            let invitation = model(service)
            #expect(invitation.state == .checking)
            await invitation.check()
            #expect(invitation.state == state, "\(answer)")
            #expect(service.calls == ["preview 01"])
        }
    }

    @Test func notFoundIsOneStateWhateverTheCause() async {
        // Unknown, revoked, replaced and used by another account all answer the same NOT_FOUND
        // (T14), and the model has nothing else to tell them apart by.
        let service = ScriptedClubs()
        service.previewAnswers = [.failure(.notFound)]
        let invitation = model(service)
        await invitation.check()
        #expect(invitation.state == .unavailable)
    }

    @Test func aJoinedLinkOpensTheClub() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.joined(Kitchen.ref))]
        let opened = Opened()
        let invitation = model(service, opened: opened)
        await invitation.check()
        #expect(invitation.state == .opening(Kitchen.ref))
        #expect(opened.clubs == [Kitchen.ref])
    }

    @Test func retryChecksAgain() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.failure(.network), .success(.open(Kitchen.roster()))]
        let invitation = model(service)
        await invitation.check()
        #expect(invitation.state == .checkFailed(.network))
        await invitation.check()
        #expect(invitation.state == .open(Kitchen.roster()))
        #expect(service.calls == ["preview 01", "preview 01"])
    }

    @Test func oneCheckAtATime() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        let invitation = model(service)
        let gate = Gate()
        service.duringPreview = { await gate.wait() }
        async let first: Void = invitation.check()
        await gate.reached()
        // A second preview, if one were sent, would answer at once rather than wait at the gate.
        service.duringPreview = {}
        await invitation.check()
        gate.open()
        await first
        #expect(service.calls == ["preview 01"])
    }

    @Test func aSignedOutAnswerEndsTheSession() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.failure(.signedOut)]
        let opened = Opened()
        let invitation = model(service, opened: opened)
        await invitation.check()
        #expect(opened.signedOut == 1)
    }

    @Test func anAnswerAfterTheSessionEndedDoesNothing() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.joined(Kitchen.ref))]
        let session = SessionFlag()
        service.duringPreview = { @MainActor in session.current = false }
        let opened = Opened()
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keepReceived(token, invitation: "inv_leila", account: account)
        let invitation = model(service, book: book, session: session, opened: opened)
        await invitation.check()
        #expect(invitation.state == .checking)
        #expect(opened.clubs.isEmpty)
        // Nothing dropped either.
        #expect(book.received(token, account: account) != nil)
    }

    @Test func nothingIsCheckedWithoutAToken() async {
        let service = ScriptedClubs()
        let invitation = model(
            service, token: nil, state: .didNotGoAhead(inviterName: "Ben"))
        await invitation.check()
        #expect(invitation.state == .didNotGoAhead(inviterName: "Ben"))
        #expect(service.calls.isEmpty)
    }

    // MARK: The roster

    @Test func theRosterListsTheViewerFirstThenTheServersOrder() {
        let roster = Kitchen.roster()
        #expect(roster.viewerFirst.map(\.name) == ["Leila", "Ben", "Maya", "Nina"])
        #expect(roster.viewerFirst.count == roster.roster.count)
        // Without the viewer (a roster that doesn't list them), the server's order alone.
        let other = InvitationRoster(
            invitationID: "inv", inviterName: "Ben", clubName: "Kitchen table",
            revisionID: "rev", revisionVersion: 1,
            roster: [
                InvitationRosterEntry(name: "Ben", kind: .member, isYou: false),
                InvitationRosterEntry(name: "Maya", kind: .member, isYou: false),
            ], expiresAt: nil)
        #expect(other.viewerFirst.map(\.name) == ["Ben", "Maya"])
    }

    // MARK: Accepting

    @Test func acceptSendsTheRevisionShownWithAKeyMadeWhenItStarts() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster(version: 3)))]
        service.acceptAnswers = [.success(.waiting)]
        let keys = Keys()
        let invitation = model(service, keys: keys)
        await invitation.check()
        #expect(keys.count == 0)
        await invitation.accept()
        #expect(service.calls == ["preview 01", "accept 01 rev_1 v3 \(Keys.key(1))"])
        #expect(invitation.state == .waiting(clubName: "Kitchen table"))
        #expect(!invitation.isAccepting)
    }

    @Test func aRetryOfTheSameRevisionSendsTheSameKey() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        service.acceptAnswers = [
            .failure(.network), .failure(.unavailable), .success(.waiting),
        ]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.acceptFailure == .network)
        #expect(invitation.state == .open(Kitchen.roster()))
        await invitation.accept()
        #expect(invitation.acceptFailure == .other)
        await invitation.accept()
        #expect(invitation.acceptFailure == nil)
        let key = Keys.key(1)
        #expect(
            service.calls == [
                "preview 01", "accept 01 rev_1 v1 \(key)", "accept 01 rev_1 v1 \(key)",
                "accept 01 rev_1 v1 \(key)",
            ])
    }

    @Test func aRefusalMakesTheNextTapANewAction() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        service.acceptAnswers = [
            .failure(.refused), .failure(.profileIncomplete), .success(.waiting),
        ]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.acceptFailure == .other)
        await invitation.accept()
        #expect(invitation.acceptFailure == .other)
        await invitation.accept()
        #expect(
            service.calls == [
                "preview 01", "accept 01 rev_1 v1 \(Keys.key(1))",
                "accept 01 rev_1 v1 \(Keys.key(2))", "accept 01 rev_1 v1 \(Keys.key(3))",
            ])
    }

    @Test func aNewRevisionIsANewActionWithANewKey() async {
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.open(Kitchen.roster())),
            .success(.changed(Kitchen.roster(revision: "rev_2", version: 1))),
        ]
        service.acceptAnswers = [
            .failure(.network), .failure(.rosterChanged), .success(.waiting),
        ]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        await invitation.accept()
        #expect(invitation.state == .changed(Kitchen.roster(revision: "rev_2", version: 1), nil))
        await invitation.accept()
        #expect(
            service.calls == [
                "preview 01", "accept 01 rev_1 v1 \(Keys.key(1))",
                "accept 01 rev_1 v1 \(Keys.key(1))", "preview 01",
                "accept 01 rev_2 v1 \(Keys.key(2))",
            ])
    }

    @Test func aVersionConflictChecksAgain() async {
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.waiting(Kitchen.roster())),
        ]
        service.acceptAnswers = [.failure(.versionConflict)]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.state == .waiting(clubName: "Kitchen table"))
        #expect(service.calls.filter { $0.hasPrefix("preview") }.count == 2)
    }

    @Test func eachEndingAnswerHasItsState() async {
        let cases: [(Result<InvitationAcceptance, APIFailure>, InvitationModel.State)] = [
            (.success(.joined(Kitchen.ref)), .opening(Kitchen.ref)),
            (.failure(.clubFull), .full(inviterName: "Ben")),
            (.failure(.invitationExpired), .expired(inviterName: "Ben")),
            (.failure(.notFound), .unavailable),
        ]
        for (answer, state) in cases {
            let service = ScriptedClubs()
            service.previewAnswers = [.success(.open(Kitchen.roster()))]
            service.acceptAnswers = [answer]
            let invitation = model(service)
            await invitation.check()
            await invitation.accept()
            #expect(invitation.state == state, "\(answer)")
            #expect(invitation.acceptFailure == nil)
        }
    }

    @Test func aJoinedAnswerWithoutItsClubChecksAgainForIt() async {
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.joined(Kitchen.ref)),
        ]
        service.acceptAnswers = [.success(.joined(nil))]
        let opened = Opened()
        let invitation = model(service, opened: opened)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.state == .opening(Kitchen.ref))
        #expect(opened.clubs == [Kitchen.ref])
    }

    /// The answer names the inviter (the contract's `InvitationFull`, since the api lane's #107),
    /// so a full club names them even when this model never showed the roster.
    @Test func aFullClubNamesTheInviterBeforeAnyRosterWasShown() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.full(inviterName: "Ben"))]
        let invitation = model(service)
        await invitation.check()
        #expect(invitation.state == .full(inviterName: "Ben"))
    }

    @Test func oneAcceptAtATime() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        service.acceptAnswers = [.success(.waiting)]
        let invitation = model(service)
        await invitation.check()
        let gate = Gate()
        service.duringAccept = { await gate.wait() }
        async let first: Void = invitation.accept()
        await gate.reached()
        // A second accept, if one were sent, would answer at once rather than wait at the gate.
        service.duringAccept = {}
        #expect(invitation.isAccepting)
        await invitation.accept()
        await invitation.check()
        gate.open()
        await first
        #expect(service.calls == ["preview 01", "accept 01 rev_1 v1 \(Keys.key(1))"])
    }

    @Test func acceptNeedsARosterOnScreen() async {
        let service = ScriptedClubs()
        for state: InvitationModel.State in [
            .checking, .waiting(clubName: "Kitchen table"), .unavailable,
            .expired(inviterName: "Ben"),
        ] {
            let invitation = model(service, state: state)
            await invitation.accept()
        }
        #expect(service.calls.isEmpty)
    }

    @Test func aSignedOutAcceptEndsTheSession() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        service.acceptAnswers = [.failure(.signedOut)]
        let opened = Opened()
        let invitation = model(service, opened: opened)
        await invitation.check()
        await invitation.accept()
        #expect(opened.signedOut == 1)
        #expect(!invitation.isAccepting)
    }

    @Test func anAcceptAnsweredAfterTheSessionEndedDoesNothing() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        service.acceptAnswers = [.success(.waiting)]
        let session = SessionFlag()
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let invitation = model(service, book: book, session: session)
        await invitation.check()
        service.duringAccept = { @MainActor in session.current = false }
        await invitation.accept()
        #expect(invitation.state == .open(Kitchen.roster()))
        #expect(book.received(token, account: account) == nil)
        #expect(!invitation.isAccepting)
    }

    // MARK: The changed name (FQ66; handoff 8's `G02-changed-name`)

    @Test func aChangedAcceptanceShowsTheNewRosterWithTheEarlierName() async {
        let service = ScriptedClubs()
        let renamed = Kitchen.roster(you: "Debby", revision: "rev_2")
        service.previewAnswers = [.success(.open(Kitchen.roster())), .success(.changed(renamed))]
        service.acceptAnswers = [.success(.changed), .success(.waiting)]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.state == .changed(renamed, .from("Leila")))
        // Accepting the new revision is a new action.
        await invitation.accept()
        #expect(invitation.state == .waiting(clubName: "Kitchen table"))
        #expect(
            service.calls == [
                "preview 01", "accept 01 rev_1 v1 \(Keys.key(1))", "preview 01",
                "accept 01 rev_2 v1 \(Keys.key(2))",
            ])
    }

    @Test func anOpenRosterAfterAChangedAcceptanceKeepsTheEarlierName() async {
        let service = ScriptedClubs()
        let renamed = Kitchen.roster(you: "Debby", revision: "rev_2")
        service.previewAnswers = [.success(.open(Kitchen.roster())), .success(.open(renamed))]
        service.acceptAnswers = [.success(.changed)]
        let invitation = model(service)
        await invitation.check()
        await invitation.accept()
        #expect(invitation.state == .changed(renamed, .from("Leila")))
    }

    @Test func aFreshChangedRosterNamesNoEarlierName() async {
        // After a relaunch, or from the club list: the contract's `changed` names no cause.
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.changed(Kitchen.roster(you: "Debby")))]
        let invitation = model(service)
        await invitation.check()
        #expect(invitation.state == .changed(Kitchen.roster(you: "Debby"), nil))
    }

    @Test func theKeptMarkSaysTheNameChangedWhenTheEarlierNameIsntHeld() async {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keepReceived(token, invitation: "inv_leila", account: account, nameChanged: true)
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.changed(Kitchen.roster(you: "Debby")))]
        let invitation = model(service, book: book)
        await invitation.check()
        #expect(invitation.state == .changed(Kitchen.roster(you: "Debby"), .notHeld))
    }

    // MARK: The kept token (the contract's `MyInvitationState`)

    @Test func theTokenIsKeptOnceItIsTheAccounts() async throws {
        for (preview, acceptance, nameChanged) in [
            (InvitationPreview.waiting(Kitchen.roster()), nil, false),
            (.changed(Kitchen.roster()), nil, false),
            (.open(Kitchen.roster()), InvitationAcceptance.waiting, false),
            (.open(Kitchen.roster()), .changed, true),
        ] {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            let service = ScriptedClubs()
            service.previewAnswers = [.success(preview), .success(.changed(Kitchen.roster()))]
            service.acceptAnswers = acceptance.map { [.success($0)] } ?? []
            let invitation = model(service, book: book)
            await invitation.check()
            if acceptance != nil { await invitation.accept() }
            let kept = try #require(book.received(token, account: account), "\(preview)")
            #expect(kept.invitationID == "inv_leila")
            #expect(kept.token == token)
            #expect(kept.nameChanged == nameChanged)
        }
    }

    @Test func aClosedModelsLateAnswerDropsButNeverKeeps() async throws {
        // Every answer that would keep the token, landing once the model is closed: from a check
        // (waiting, changed) and from an accept (waiting, changed).
        for (preview, acceptance) in [
            (InvitationPreview.waiting(Kitchen.roster()), nil),
            (.changed(Kitchen.roster()), nil),
            (.open(Kitchen.roster()), InvitationAcceptance.waiting),
            (.open(Kitchen.roster()), .changed),
        ] {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            let service = ScriptedClubs()
            service.previewAnswers = [.success(preview)]
            service.acceptAnswers = acceptance.map { [.success($0)] } ?? []
            let invitation = model(service, book: book)
            let gate = Gate()
            if acceptance == nil {
                service.duringPreview = { await gate.wait() }
                async let checked: Void = invitation.check()
                await gate.reached()
                invitation.close()
                gate.open()
                await checked
            } else {
                await invitation.check()
                service.duringAccept = { await gate.wait() }
                async let accepted: Void = invitation.accept()
                await gate.reached()
                invitation.close()
                gate.open()
                await accepted
            }
            #expect(book.received(token, account: account) == nil, "\(preview)")
        }
        // An answer that drops the token still drops it.
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keepReceived(token, invitation: "inv_leila", account: account)
        let service = ScriptedClubs()
        service.previewAnswers = [.failure(.notFound), .success(.open(Kitchen.roster()))]
        let invitation = model(service, book: book)
        let gate = Gate()
        service.duringPreview = { await gate.wait() }
        async let checked: Void = invitation.check()
        await gate.reached()
        invitation.close()
        gate.open()
        await checked
        #expect(book.received(token, account: account) == nil)
        // And a closed model checks and accepts nothing more, its roster still on it.
        let shownService = ScriptedClubs()
        shownService.previewAnswers = [.success(.open(Kitchen.roster()))]
        let shown = model(shownService)
        await shown.check()
        shown.close()
        await shown.accept()
        await shown.check()
        #expect(shown.state == .open(Kitchen.roster()))
        #expect(shownService.calls == ["preview 01"])
    }

    @Test func aClosedModelOpensNoClub() async {
        for viaAccept in [false, true] {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            book.keepReceived(token, invitation: "inv_leila", account: account)
            let service = ScriptedClubs()
            service.previewAnswers =
                viaAccept
                ? [.success(.open(Kitchen.roster()))] : [.success(.joined(Kitchen.ref))]
            service.acceptAnswers = [.success(.joined(Kitchen.ref))]
            let opened = Opened()
            let invitation = model(service, book: book, opened: opened)
            if viaAccept { await invitation.check() }
            let gate = Gate()
            service.duringPreview = { await gate.wait() }
            service.duringAccept = { await gate.wait() }
            async let answered: Void = viaAccept ? invitation.accept() : invitation.check()
            await gate.reached()
            invitation.close()
            gate.open()
            await answered
            // The token still goes; the club isn't opened from a model the root no longer shows.
            #expect(book.received(token, account: account) == nil, "\(viaAccept)")
            #expect(opened.clubs.isEmpty, "\(viaAccept)")
        }
    }

    @Test func anOpenRosterKeepsNothing() async {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.full(inviterName: "Ben")),
        ]
        let invitation = model(service, book: book)
        await invitation.check()
        #expect(book.received(token, account: account) == nil)
        await invitation.check()
        #expect(book.received(token, account: account) == nil)
    }

    @Test func aPreviewLeavesTheMarkAndWaitingClearsIt() async {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keepReceived(token, invitation: "inv_leila", account: account, nameChanged: true)
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.changed(Kitchen.roster(revision: "rev_2")))]
        service.acceptAnswers = [.success(.waiting)]
        let invitation = model(service, book: book)
        await invitation.check()
        #expect(book.received(token, account: account)?.nameChanged == true)
        await invitation.accept()
        #expect(book.received(token, account: account)?.nameChanged == false)
    }

    @Test func theTokenGoesWhenTheInvitationJoinsOrEndsOrNoLongerWorks() async {
        let previews: [Result<InvitationPreview, APIFailure>] = [
            .success(.joined(Kitchen.ref)), .success(.didNotGoAhead(inviterName: "Ben")),
            .success(.expired(inviterName: "Ben")), .failure(.notFound),
        ]
        for answer in previews {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            book.keepReceived(token, invitation: "inv_leila", account: account)
            let service = ScriptedClubs()
            service.previewAnswers = [answer]
            await model(service, book: book).check()
            #expect(book.received(token, account: account) == nil, "\(answer)")
        }
        let acceptances: [Result<InvitationAcceptance, APIFailure>] = [
            .success(.joined(Kitchen.ref)), .failure(.invitationExpired), .failure(.notFound),
        ]
        for answer in acceptances {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            book.keepReceived(token, invitation: "inv_leila", account: account)
            let service = ScriptedClubs()
            service.previewAnswers = [.success(.changed(Kitchen.roster()))]
            service.acceptAnswers = [answer]
            let invitation = model(service, book: book)
            await invitation.check()
            await invitation.accept()
            #expect(book.received(token, account: account) == nil, "\(answer)")
        }
    }

    @Test func aFullClubOrAFailureKeepsTheToken() async {
        for answer: Result<InvitationAcceptance, APIFailure> in [
            .failure(.clubFull), .failure(.network), .failure(.refused),
        ] {
            let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
            book.keepReceived(token, invitation: "inv_leila", account: account)
            let service = ScriptedClubs()
            service.previewAnswers = [.success(.changed(Kitchen.roster()))]
            service.acceptAnswers = [answer]
            let invitation = model(service, book: book)
            await invitation.check()
            await invitation.accept()
            #expect(book.received(token, account: account) != nil, "\(answer)")
        }
    }
}
