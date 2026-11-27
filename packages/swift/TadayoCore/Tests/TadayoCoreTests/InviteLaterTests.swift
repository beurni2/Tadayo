import Foundation
import Testing

@testable import TadayoCore

/// Inviting someone into an active club (`docs/plans/ios-b1-approve.md` section 2, 7c): the
/// person's invitation page is the setup list made for one candidate, the caller's own; the name
/// step from Club details reads the candidates before its first proposal; Club details offers
/// Invite someone only for an active club the server lets take a proposal.
@MainActor @Suite struct InviteLaterTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func page(
        _ clubs: ScriptedClubs, for candidateID: String, book: InvitationLinkBook? = nil,
        keys: NumberedKeys = NumberedKeys()
    ) -> InvitationListModel {
        InvitationListModel(
            club: Sunday.ref, accountID: account, service: clubs,
            book: book ?? InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            candidate: candidateID, makeKey: { keys.make() }, current: { true })
    }

    func loaded(_ list: InvitationListModel) -> InvitationList? {
        if case .loaded(let shown) = list.state { return shown }
        return nil
    }

    /// Sunday people, active with five members, as `getClub` answers it.
    func active(version: Int = 3, canPropose: Bool = true) -> ClubDetail {
        ClubDetail(
            serverClock: Sunday.clock,
            club: ClubSummary(
                ref: Sunday.ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil),
            rosterVersion: version, canPropose: canPropose, openRevisionID: "rev_1")
    }

    // MARK: The person's invitation page

    @Test func thePageShowsOnlyTheOneCandidateWithTheirProposerAndTheMemberCount() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active())]
        clubs.memberAnswers = [
            .success(
                Sunday.members([
                    Sunday.candidate("cand_maya", "Maya", .live),
                    Sunday.candidate("cand_nina", "Nina", nil),
                    Sunday.candidate("cand_leila", "Leila", nil, by: Sunday.leila),
                ]))
        ]
        let nina = page(clubs, for: "cand_nina")
        await nina.load()
        let shown = loaded(nina)
        #expect(shown?.rows.map(\.name) == ["Nina"])
        #expect(shown?.rows.first?.proposedBy == "Ben")
        #expect(shown?.memberCount == 5)
        #expect(shown?.club == Sunday.ref)
        #expect(nina.ended == false)
    }

    @Test func someoneElsesCandidateGetsNoPageAndNoLink() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active())]
        clubs.memberAnswers = [
            .success(
                Sunday.members([Sunday.candidate("cand_leila", "Leila", nil, by: Sunday.leila)]))
        ]
        let leila = page(clubs, for: "cand_leila")
        await leila.load()
        #expect(loaded(leila)?.rows.isEmpty == true)
        #expect(leila.ended == true)
        #expect(await leila.linkToShare(for: "cand_leila") == nil)
        #expect(!clubs.calls.contains { $0.hasPrefix("createInvitation") })
    }

    @Test func thePageEndsOnceTheAnswerNoLongerListsThem() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active()), .success(active(version: 4))]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .live)])),
            // Nina joined: the revision applied, and none is open.
            .success(Sunday.members(nil)),
        ]
        let nina = page(clubs, for: "cand_nina")
        await nina.load()
        #expect(nina.ended == false)
        await nina.refresh()
        #expect(nina.ended == true)
        #expect(loaded(nina)?.rows.isEmpty == true)
    }

    @Test func aFailedReadAgainLeavesThePageAsItWas() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active()), .failure(.network)]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .live)])),
            .failure(.network),
        ]
        let nina = page(clubs, for: "cand_nina")
        await nina.load()
        await nina.refresh()
        #expect(nina.ended == false)
        #expect(loaded(nina)?.rows.map(\.name) == ["Nina"])
    }

    @Test func shareLinkMakesTheFirstLinkKeptBeforeItsSharedUnderOneKey() async {
        let clubs = ScriptedClubs()
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        clubs.clubAnswers = [.success(active())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", nil)]))
        ]
        clubs.linkAnswers = [
            .failure(.network),
            .success(Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(7))),
        ]
        let nina = page(clubs, for: "cand_nina", book: book)
        await nina.load()
        #expect(loaded(nina)?.rows.first?.action == .shareLink)
        #expect(await nina.linkToShare(for: "cand_nina") == nil)
        #expect(nina.actionFailure == .createLink(name: "Nina", network: true))
        // The retry is the same action: the same key.
        #expect(await nina.linkToShare(for: "cand_nina") == Sunday.url(7))
        #expect(
            clubs.calls.filter { $0.hasPrefix("createInvitation") } == [
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(1))",
            ])
        #expect(book.link(for: "cand_nina", club: club, account: account)?.url == Sunday.url(7))
        nina.shareFinished(for: "cand_nina", completed: true)
        #expect(loaded(nina)?.rows.first?.status == .shared)
        #expect(loaded(nina)?.rows.first?.action == .shareAgain)
    }

    @Test func revokeLinkRevokesTheirLiveLinkAndTheRowSaysSo() async {
        let clubs = ScriptedClubs()
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(7)), club: club,
            account: account)
        clubs.clubAnswers = [.success(active()), .failure(.network)]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .live)])),
            .failure(.network),
        ]
        clubs.revokeAnswers = [.success(())]
        let nina = page(clubs, for: "cand_nina", book: book)
        await nina.load()
        #expect(loaded(nina)?.rows.first?.menu == [.revokeLink])
        await nina.revoke("cand_nina")
        #expect(clubs.calls.contains("revokeInvitation inv_nina"))
        #expect(loaded(nina)?.rows.first?.status == .revoked)
        #expect(loaded(nina)?.rows.first?.action == .createNewLink)
        #expect(book.link(for: "cand_nina", club: club, account: account) == nil)
    }

    // MARK: The name step from Club details

    func nameStep(
        _ clubs: ScriptedClubs, version: Int = 3, known: Set<String>?,
        keys: NumberedKeys = NumberedKeys()
    ) -> InviteNameModel {
        InviteNameModel(
            club: Sunday.ref, accountID: account, rosterVersion: version, known: known,
            service: clubs, book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
            makeKey: { keys.make() }, current: { true })
    }

    @Test func aNameStepWithNoCandidatesKnownReadsThemBeforeItsFirstProposal() async {
        let clubs = ScriptedClubs()
        let earlier = Sunday.candidate("cand_nina_1", "Nina", .live)
        let added = Sunday.candidate("cand_nina_2", "Nina", nil)
        clubs.clubAnswers = [.success(active(version: 4))]
        clubs.memberAnswers = [.success(Sunday.members([earlier]))]
        clubs.proposeAnswers = [.success(Sunday.revision([earlier, added]))]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_nina_2", for: "cand_nina_2", url: Sunday.url(8)))
        ]
        let step = nameStep(clubs, known: nil)
        step.name = "Nina"
        #expect(await step.createLinkAndShare() == Sunday.url(8))
        #expect(step.candidate?.id == "cand_nina_2")
        // The reads, then the proposal at the version they gave, then the link.
        #expect(Set(clubs.calls.prefix(2)) == ["club club_sunday", "members club_sunday"])
        #expect(
            Array(clubs.calls.dropFirst(2)) == [
                "propose Nina club_sunday v4 \(NumberedKeys.key(1))",
                "createInvitation cand_nina_2 club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func aFailedFirstReadFailsTheActionWithNothingProposed() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active()), .success(active(version: 3))]
        clubs.memberAnswers = [.failure(.network), .success(Sunday.members(nil))]
        clubs.proposeAnswers = [
            .success(Sunday.revision([Sunday.candidate("cand_nina", "Nina", nil)]))
        ]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(9)))
        ]
        let step = nameStep(clubs, known: nil)
        step.name = "Nina"
        #expect(await step.createLinkAndShare() == nil)
        #expect(step.failure == .network)
        #expect(step.name == "Nina")
        #expect(!clubs.calls.contains { $0.hasPrefix("propose") })
        // Create link and share again reads again, then proposes.
        #expect(await step.createLinkAndShare() == Sunday.url(9))
        #expect(clubs.calls.filter { $0.hasPrefix("propose") }.count == 1)
    }

    @Test func aNameStepWhoseCandidatesAreKnownProposesAtOnce() async {
        let clubs = ScriptedClubs()
        clubs.proposeAnswers = [
            .success(Sunday.revision([Sunday.candidate("cand_nina", "Nina", nil)]))
        ]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(9)))
        ]
        let step = nameStep(clubs, known: [])
        step.name = "Nina"
        #expect(await step.createLinkAndShare() == Sunday.url(9))
        #expect(clubs.calls.first == "propose Nina club_sunday v3 \(NumberedKeys.key(1))")
    }

    @Test func aFailedProposalAfterTheFirstReadSendsTheSameProposalAgainWithNoReadAgain() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active(version: 4))]
        clubs.memberAnswers = [.success(Sunday.members(nil))]
        clubs.proposeAnswers = [
            .failure(.network),
            .success(Sunday.revision([Sunday.candidate("cand_nina", "Nina", nil)])),
        ]
        clubs.linkAnswers = [
            .success(Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(9)))
        ]
        let step = nameStep(clubs, known: nil)
        step.name = "Nina"
        #expect(await step.createLinkAndShare() == nil)
        #expect(step.failure == .network)
        // The retry is the same proposal, at the same version, with the same key (T19): the
        // candidates read once are still known, so nothing is read again.
        #expect(await step.createLinkAndShare() == Sunday.url(9))
        #expect(
            Array(clubs.calls.dropFirst(2)) == [
                "propose Nina club_sunday v4 \(NumberedKeys.key(1))",
                "propose Nina club_sunday v4 \(NumberedKeys.key(1))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(2))",
            ])
    }

    // MARK: Club details' Invite someone

    func details(_ clubs: ScriptedClubs, state: ClubState) -> ClubDetailsModel {
        ClubDetailsModel(
            club: ClubSummary(
                ref: Sunday.ref, state: state, memberCount: 5, openDay: nil, nextDay: nil),
            service: clubs,
            links: (InvitationLinkBook(vault: InMemoryInvitationLinkVault()), account))
    }

    @Test func inviteSomeoneIsOfferedOnlyForAnActiveClubThatCanTakeAProposal() async {
        let open = ScriptedClubs()
        open.clubAnswers = [.success(active(canPropose: true))]
        let model = details(open, state: .active)
        #expect(model.canInvite == false)
        await model.loadDetails()
        #expect(model.canInvite == true)
        #expect(model.makeInvite() != nil)

        let full = ScriptedClubs()
        full.clubAnswers = [.success(active(canPropose: false))]
        let six = details(full, state: .active)
        await six.loadDetails()
        #expect(six.canInvite == false)
        #expect(six.makeInvite() == nil)

        let setup = ScriptedClubs()
        setup.clubAnswers = [.success(Sunday.detail(canPropose: true))]
        let proposed = details(setup, state: .proposed)
        await proposed.loadDetails()
        #expect(proposed.canInvite == false)
        #expect(proposed.makeInvite() == nil)
    }

    @Test func clubDetailsReadAgainKeepsWhatItShowsAndDropsInviteSomeoneAtSix() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [
            .success(active(canPropose: true)), .failure(.network),
            .success(active(version: 4, canPropose: false)),
        ]
        let model = details(clubs, state: .active)
        await model.loadDetails()
        // A failed read again keeps the details on screen, Invite someone with them.
        await model.refreshDetails()
        #expect(model.details == .loaded(active(canPropose: true)))
        #expect(model.canInvite == true)
        // The proposal took the last place: the next read takes Invite someone away.
        await model.refreshDetails()
        #expect(model.details == .loaded(active(version: 4, canPropose: false)))
        #expect(model.canInvite == false)
        #expect(model.makeInvite() == nil)
    }

    @Test func clubDetailsReadAgainBeforeTheyLoadedLoadsThem() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.failure(.network), .success(active())]
        let model = details(clubs, state: .active)
        await model.loadDetails()
        #expect(model.details == .failed(.network))
        await model.refreshDetails()
        #expect(model.details == .loaded(active()))
    }

    @Test func theInvitationPageIsMadeForTheCandidateMembersListed() async {
        let clubs = ScriptedClubs()
        let model = details(clubs, state: .active)
        let made = model.invitation(for: "cand_nina")
        #expect(made?.candidateID == "cand_nina")
        #expect(made?.club == Sunday.ref)
        let active = ClubSummary(
            ref: Sunday.ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
        #expect(ClubDetailsModel(club: active, service: clubs).invitation(for: "x") == nil)
        let ended = ClubDetailsModel(
            club: active, service: clubs,
            links: (InvitationLinkBook(vault: InMemoryInvitationLinkVault()), account),
            current: { false })
        #expect(ended.invitation(for: "cand_nina") == nil)
    }

    @Test func thePageOpensOnlyInAnActiveClub() async {
        let clubs = ScriptedClubs()
        #expect(details(clubs, state: .active).opensInvitations == true)
        for state in [ClubState.proposed, .paused] {
            let model = details(clubs, state: state)
            #expect(model.opensInvitations == false, "\(state)")
            #expect(model.invitation(for: "cand_nina") == nil, "\(state)")
        }
        // The details, once read, say the club's state.
        let paused = ScriptedClubs()
        paused.clubAnswers = [
            .success(
                ClubDetail(
                    serverClock: Sunday.clock,
                    club: ClubSummary(
                        ref: Sunday.ref, state: .paused, memberCount: 1, openDay: nil,
                        nextDay: nil),
                    rosterVersion: 3, canPropose: true, openRevisionID: nil))
        ]
        let model = details(paused, state: .active)
        await model.loadDetails()
        #expect(model.opensInvitations == false)
        #expect(model.invitation(for: "cand_nina") == nil)
    }

    @Test func thePageOpenedAgainForThePersonKeepsItsKeyAndDropsItsLine() async {
        let clubs = ScriptedClubs()
        let keys = NumberedKeys()
        clubs.clubAnswers = [.success(active()), .success(active())]
        clubs.memberAnswers = [
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .revoked)])),
            .success(Sunday.members([Sunday.candidate("cand_nina", "Nina", .revoked)])),
        ]
        clubs.linkAnswers = [
            .failure(.network),
            .success(Sunday.link("inv_nina_2", for: "cand_nina", url: Sunday.url(7))),
        ]
        let model = details(clubs, state: .active)
        let page = model.invitation(for: "cand_nina", makeKey: { keys.make() })
        await page?.load()
        await page?.createNewLink(for: "cand_nina")
        #expect(page?.actionFailure == .createNewLink(name: "Nina", network: true))
        // Back, then Nina's row again: the same page, its line gone (handoff 9's `lifetime`).
        let again = model.invitation(for: "cand_nina")
        #expect(again === page)
        #expect(again?.actionFailure == nil)
        // Its retry is the same action: the same key (T19).
        await again?.createNewLink(for: "cand_nina")
        #expect(
            clubs.calls.filter { $0.hasPrefix("createInvitation") } == [
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(1))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(1))",
            ])
    }

    @Test func anotherPersonsPageOrOneThatEndedIsANewPage() async {
        let clubs = ScriptedClubs()
        clubs.clubAnswers = [.success(active())]
        clubs.memberAnswers = [.success(Sunday.members(nil))]
        let model = details(clubs, state: .active)
        let nina = model.invitation(for: "cand_nina")
        let leila = model.invitation(for: "cand_leila")
        #expect(leila !== nina)
        #expect(model.invitation(for: "cand_leila") === leila)
        // Leila is no longer an open candidate: Leila's page has ended, and the next is new.
        await leila?.load()
        #expect(leila?.ended == true)
        let next = model.invitation(for: "cand_leila")
        #expect(next != nil)
        #expect(next !== leila)
    }

    // MARK: The name step left unfinished (T19)

    /// Club details loaded, with Nina's proposal and link scripted after them.
    func detailsForNina(
        _ clubs: ScriptedClubs, propose: [Result<RosterRevision, APIFailure>],
        link: [Result<InvitationLink, APIFailure>]
    ) async -> ClubDetailsModel {
        clubs.clubAnswers = [.success(active()), .success(active())]
        clubs.memberAnswers = [.success(Sunday.members(nil))]
        clubs.proposeAnswers = propose
        clubs.linkAnswers = link
        let model = details(clubs, state: .active)
        await model.loadDetails()
        return model
    }

    var nina: RosterRevision { Sunday.revision([Sunday.candidate("cand_nina", "Nina", nil)]) }
    var ninasLink: InvitationLink { Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(9)) }

    /// The commands sent, without the reads.
    func commands(_ clubs: ScriptedClubs) -> [String] {
        clubs.calls.filter { !$0.hasPrefix("club ") && !$0.hasPrefix("members ") }
    }

    @Test func theNameStepLeftWithNinaProposedIsTheOneInviteSomeoneOpensAgain() async {
        let clubs = ScriptedClubs()
        let keys = NumberedKeys()
        let model = await detailsForNina(
            clubs, propose: [.success(nina)], link: [.failure(.network), .success(ninasLink)])
        let step = model.makeInvite(makeKey: { keys.make() })
        step?.name = "Nina"
        #expect(await step?.createLinkAndShare() == nil)
        #expect(step?.failure == .network)
        #expect(step?.isUnfinished == true)
        // Back, then Invite someone again: the same name step, Nina still named, its line gone.
        let again = model.makeInvite()
        #expect(again === step)
        #expect(again?.name == "Nina")
        #expect(again?.failure == nil)
        // Its retry makes Nina's link with the same key and proposes nobody again (T19).
        #expect(await again?.createLinkAndShare() == Sunday.url(9))
        #expect(
            commands(clubs) == [
                "propose Nina club_sunday v3 \(NumberedKeys.key(1))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(2))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(2))",
            ])
        // Done: the next Invite someone is a new name step.
        #expect(step?.isUnfinished == false)
        let next = model.makeInvite()
        #expect(next != nil)
        #expect(next !== step)
    }

    @Test func aProposalWithNoAnswerGoesAgainWithItsKeyFromTheNameStepOpenedAgain() async {
        let clubs = ScriptedClubs()
        let keys = NumberedKeys()
        let model = await detailsForNina(
            clubs, propose: [.failure(.network), .success(nina)], link: [.success(ninasLink)])
        let step = model.makeInvite(makeKey: { keys.make() })
        step?.name = "Nina"
        #expect(await step?.createLinkAndShare() == nil)
        let again = model.makeInvite()
        #expect(again === step)
        #expect(await again?.createLinkAndShare() == Sunday.url(9))
        #expect(
            commands(clubs) == [
                "propose Nina club_sunday v3 \(NumberedKeys.key(1))",
                "propose Nina club_sunday v3 \(NumberedKeys.key(1))",
                "createInvitation cand_nina club_sunday \(NumberedKeys.key(2))",
            ])
    }

    @Test func backWhileCreateLinkAndShareIsOutOpensTheSameNameStepAgain() async {
        let clubs = ScriptedClubs()
        let model = await detailsForNina(
            clubs, propose: [.success(nina)], link: [.success(ninasLink)])
        let gate = Gate()
        clubs.duringLink = { await gate.wait() }
        let step = model.makeInvite()
        step?.name = "Nina"
        let action = Task { await step?.createLinkAndShare() }
        await gate.reached()
        #expect(model.makeInvite() === step)
        gate.open()
        #expect(await action.value == Sunday.url(9))
        #expect(commands(clubs).filter { $0.hasPrefix("propose") }.count == 1)
    }

    @Test func aNameStepWithNothingOutstandingIsNotOpenedAgain() async {
        let clubs = ScriptedClubs()
        let model = await detailsForNina(clubs, propose: [.failure(.notAllowed)], link: [])
        // Left with nothing sent: the next is new.
        let untouched = model.makeInvite()
        #expect(untouched?.isUnfinished == false)
        let step = model.makeInvite()
        #expect(step !== untouched)
        // A refusal says the server proposed nobody: the next is new, and proposes afresh.
        step?.name = "Nina"
        #expect(await step?.createLinkAndShare() == nil)
        #expect(step?.failure == .other)
        #expect(step?.isUnfinished == false)
        #expect(model.makeInvite() !== step)
    }
}
