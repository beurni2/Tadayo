import Foundation
import Testing

@testable import TadayoCore

/// The kept invitation links' rules (ADR-037; the contract's `InvitationLink`;
/// `docs/plans/ios-b1-create.md` section 1).
@MainActor @Suite struct InvitationLinkBookTests {
    let account = Sunday.account
    let club = Sunday.ref.id

    func book(_ vault: any InvitationLinkVault = InMemoryInvitationLinkVault())
        -> InvitationLinkBook
    {
        InvitationLinkBook(vault: vault)
    }

    @Test func aLinkIsKeptAndReadForItsCandidate() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        let kept = try #require(
            links.keep(
                Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
                account: account))
        #expect(kept.url == Sunday.url(1))
        #expect(!kept.shared)
        #expect(links.link(for: "cand_sam", club: club, account: account) == kept)
        #expect(links.link(for: "cand_sam", club: "club_other", account: account) == nil)
        #expect(links.link(for: "cand_maya", club: club, account: account) == nil)
        // In the vault too, for the next launch.
        #expect(try vault.load()?.links == [kept])
        #expect(
            book(vault).link(for: "cand_sam", club: club, account: account)?.url == Sunday.url(1))
    }

    @Test func aReplayWithoutItsLinkOrAnythingButAnInvitationLinkKeepsNothing() {
        let links = book()
        #expect(
            links.keep(
                Sunday.link("inv_sam", for: "cand_sam", url: nil), club: club, account: account)
                == nil)
        for other in [
            "https://example.com/i#" + String(repeating: "a", count: 43),
            "https://tadayo.app/i?t=" + String(repeating: "a", count: 43),
            "https://tadayo.app/i#short",
        ] {
            #expect(
                links.keep(
                    Sunday.link("inv_sam", for: "cand_sam", url: URL(string: other)!), club: club,
                    account: account) == nil)
        }
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aNewLinkForTheSameCandidateReplacesTheOld() {
        let links = book()
        links.keep(
            Sunday.link("inv_1", for: "cand_sam", url: Sunday.url(1)), club: club, account: account)
        links.markShared("inv_1", account: account)
        links.keep(
            Sunday.link("inv_2", for: "cand_sam", url: Sunday.url(2)), club: club, account: account)
        let kept = links.link(for: "cand_sam", club: club, account: account)
        #expect(kept?.invitationID == "inv_2")
        #expect(kept?.url == Sunday.url(2))
        #expect(kept?.shared == false)
    }

    @Test func anotherAccountsLinksAreNeverRead() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        #expect(links.link(for: "cand_sam", club: club, account: "acct_maya") == nil)
        links.markShared("inv_sam", account: "acct_maya")
        #expect(links.link(for: "cand_sam", club: club, account: account)?.shared == false)
        // Keeping for another account starts its file in place of Ben's.
        links.keep(
            Sunday.link("inv_x", for: "cand_x", url: Sunday.url(2)), club: club,
            account: "acct_maya")
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(try vault.load()?.accountID == "acct_maya")
        #expect(try vault.load()?.links.map(\.invitationID) == ["inv_x"])
        // An empty account id is never anyone's: it keeps nothing, and a file left for it is never
        // read.
        #expect(links.link(for: "cand_x", club: club, account: "") == nil)
        #expect(
            links.keep(
                Sunday.link("inv_y", for: "cand_y", url: Sunday.url(3)), club: club, account: "")
                == nil)
        #expect(try vault.load()?.accountID == "acct_maya")
        let nobodys = InMemoryInvitationLinkVault(
            InvitationLinkFile(
                accountID: "",
                links: [
                    KeptInvitationLink(
                        clubID: club, candidateID: "cand_sam", invitationID: "inv_sam",
                        url: Sunday.url(1), shared: false)
                ]))
        #expect(book(nobodys).link(for: "cand_sam", club: club, account: "") == nil)
    }

    @Test func aCompletedShareIsMarked() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        links.markShared("inv_sam", account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account)?.shared == true)
        #expect(try vault.load()?.links.first?.shared == true)
    }

    @Test func liveAcceptedAndUsedLinksStayRevokedAndExpiredOnesGo() {
        let links = book()
        let states: [(String, CandidateLinkState)] = [
            ("maya", .live), ("debby", .accepted), ("sam", .used), ("alex", .revoked),
            ("nina", .expired),
        ]
        for (index, (name, _)) in states.enumerated() {
            links.keep(
                Sunday.link("inv_\(name)", for: "cand_\(name)", url: Sunday.url(index)), club: club,
                account: account)
        }
        let stamp = links.beginRead()
        links.settle(
            Sunday.members(
                states.map {
                    Sunday.candidate(
                        "cand_\($0.0)", $0.0.capitalized, $0.1, invitation: "inv_\($0.0)")
                }
            ), stamp: stamp, account: account)
        for (name, state) in states {
            let kept = links.link(for: "cand_\(name)", club: club, account: account) != nil
            #expect(kept == [.live, .accepted, .used].contains(state), "\(name) \(state)")
        }
    }

    @Test func aCandidateGoneAnOpenRevisionGoneOrANewerLinkPurges() {
        let links = book()
        links.keep(
            Sunday.link("inv_maya", for: "cand_maya", url: Sunday.url(1)), club: club,
            account: account)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(2)), club: club,
            account: account)
        links.keep(
            Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(3)), club: club,
            account: account)
        let first = links.beginRead()
        // Maya joined (gone from the candidates); Sam's link was replaced from another phone.
        links.settle(
            Sunday.members([
                Sunday.candidate("cand_sam", "Sam", .live, invitation: "inv_sam_2"),
                Sunday.candidate("cand_alex", "Alex", .live),
            ]), stamp: first, account: account)
        #expect(links.link(for: "cand_maya", club: club, account: account) == nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(links.link(for: "cand_alex", club: club, account: account) != nil)
        // The proposal ended: no open revision.
        links.settle(Sunday.members(nil), stamp: links.beginRead(), account: account)
        #expect(links.link(for: "cand_alex", club: club, account: account) == nil)
    }

    @Test func aReadRequestedBeforeALinkWasKeptNeverPurgesIt() {
        let links = book()
        let stamp = links.beginRead()
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        // The read's answer can't list the link made after it was asked.
        links.settle(Sunday.members([]), stamp: stamp, account: account)
        links.settleGone(club: club, stamp: stamp, account: account)
        links.settle(
            ClubList(serverClock: Sunday.clock, clubs: [], invitations: []), stamp: stamp,
            account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account) != nil)
        // A read asked after it decides.
        links.settle(Sunday.members([]), stamp: links.beginRead(), account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func linksFoundAtLaunchCountAsKeptBeforeAnyRead() {
        let vault = InMemoryInvitationLinkVault()
        book(vault).keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        let relaunched = book(vault)
        relaunched.settle(Sunday.members([]), stamp: relaunched.beginRead(), account: account)
        #expect(relaunched.link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aClubNotFoundOrGoneFromTheListPurgesOnlyItsLinks() {
        let links = book()
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        links.keep(
            Sunday.link("inv_leila", for: "cand_leila", url: Sunday.url(2)), club: "club_kitchen",
            account: account)
        links.settleGone(club: "club_kitchen", stamp: links.beginRead(), account: account)
        #expect(links.link(for: "cand_leila", club: "club_kitchen", account: account) == nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) != nil)

        links.keep(
            Sunday.link("inv_leila", for: "cand_leila", url: Sunday.url(2)), club: "club_kitchen",
            account: account)
        links.settle(
            ClubList(serverClock: Sunday.clock, clubs: [Sunday.summary], invitations: []),
            stamp: links.beginRead(), account: account)
        #expect(links.link(for: "cand_leila", club: "club_kitchen", account: account) == nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) != nil)
    }

    @Test func forgettingEmptiesTheVault() throws {
        let vault = FailingVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        links.forget()
        #expect(vault.kept == nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(book(vault).link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aVaultThatCantDeleteIsLeftAFileNoAccountReads() throws {
        let vault = FailingVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        vault.failDeletes = true
        links.forget()
        #expect(vault.kept == InvitationLinkFile(accountID: "", links: []))
        #expect(book(vault).link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func theLastLinkPurgedDeletesTheFile() {
        let vault = FailingVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        links.settle(Sunday.members([]), stamp: links.beginRead(), account: account)
        #expect(vault.kept == nil)
        #expect(vault.deletes == 1)
    }

    @Test func aVaultThatCantSaveKeepsTheLinkForThisLaunchOnly() {
        let vault = FailingVault()
        vault.failSaves = true
        let links = book(vault)
        let kept = links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        #expect(kept != nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) == kept)
        #expect(vault.kept == nil)
        #expect(book(vault).link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aVaultThatCantLoadReadsAsNothingKept() {
        let vault = FailingVault(
            InvitationLinkFile(
                accountID: account,
                links: [
                    KeptInvitationLink(
                        clubID: club, candidateID: "cand_sam", invitationID: "inv_sam",
                        url: Sunday.url(1), shared: false)
                ]))
        vault.failLoads = true
        #expect(book(vault).link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aFailedLoadWritesNothingOverTheVaultAndTheNextAccessReadsIt() throws {
        let sam = KeptInvitationLink(
            clubID: club, candidateID: "cand_sam", invitationID: "inv_sam", url: Sunday.url(1),
            shared: true)
        let maya = KeptInvitationLink(
            clubID: club, candidateID: "cand_maya", invitationID: "inv_maya", url: Sunday.url(2),
            shared: false)
        let vault = FailingVault(InvitationLinkFile(accountID: account, links: [sam, maya]))
        vault.failLoads = true
        let links = book(vault)
        // The iPhone is locked: nothing reads as kept, and a link kept now is this launch's alone.
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        let alex = try #require(
            links.keep(
                Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(3)), club: club,
                account: account))
        #expect(links.link(for: "cand_alex", club: club, account: account) == alex)
        #expect(vault.saves == 0)
        #expect(vault.deletes == 0)
        #expect(vault.kept?.links == [sam, maya])
        // Unlocked: the vault's links come back, with this launch's, and are written together.
        vault.failLoads = false
        #expect(links.link(for: "cand_sam", club: club, account: account) == sam)
        #expect(links.link(for: "cand_maya", club: club, account: account) == maya)
        #expect(links.link(for: "cand_alex", club: club, account: account) == alex)
        #expect(vault.kept?.links == [sam, maya, alex])
    }

    @Test func aLinkTheServerRevokedGoesAtOnce() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        links.keep(
            Sunday.link("inv_maya", for: "cand_maya", url: Sunday.url(2)), club: club,
            account: account)
        links.drop("inv_sam", account: "acct_maya")
        #expect(links.link(for: "cand_sam", club: club, account: account) != nil)
        links.drop("inv_sam", account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(try vault.load()?.links.map(\.invitationID) == ["inv_maya"])
    }

    @Test func aForgetThatCouldntFinishIsTriedAgainAtTheNextAccess() {
        let vault = FailingVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        vault.failDeletes = true
        vault.failSaves = true
        links.forget()
        #expect(vault.kept?.links.count == 1)
        vault.failDeletes = false
        vault.failSaves = false
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(vault.kept == nil)
    }

    @Test func whatThisLaunchKeptBeforeTheVaultWasReadWinsAndOneAccountsLinksAreKept() throws {
        let maya = KeptInvitationLink(
            clubID: club, candidateID: "cand_ben", invitationID: "inv_ben", url: Sunday.url(1),
            shared: false)
        let older = KeptInvitationLink(
            clubID: club, candidateID: "cand_alex", invitationID: "inv_alex", url: Sunday.url(2),
            shared: true)
        let sam = KeptInvitationLink(
            clubID: club, candidateID: "cand_sam", invitationID: "inv_sam", url: Sunday.url(3),
            shared: false)
        // The vault holds another account's file, or this account's with an older link for the
        // candidate this launch makes one for while the iPhone is locked.
        for (stored, expected) in [
            (InvitationLinkFile(accountID: "acct_maya", links: [maya]), [String]()),
            (InvitationLinkFile(accountID: account, links: [older, sam]), ["inv_sam"]),
        ] {
            let vault = FailingVault(stored)
            vault.failLoads = true
            let links = book(vault)
            let alex = try #require(
                links.keep(
                    Sunday.link("inv_alex_2", for: "cand_alex", url: Sunday.url(4)), club: club,
                    account: account))
            vault.failLoads = false
            #expect(links.link(for: "cand_alex", club: club, account: account) == alex)
            #expect(links.link(for: "cand_ben", club: club, account: account) == nil)
            #expect(links.link(for: "cand_ben", club: club, account: "acct_maya") == nil)
            #expect(vault.kept?.accountID == account)
            #expect(vault.kept?.links.map(\.invitationID) == expected + ["inv_alex_2"])
        }
    }

    @Test func whatAReadOrARevokeSaidWhileTheVaultWasLockedHoldsOnceItsRead() throws {
        let stored = ["sam", "maya", "alex"].enumerated().map { index, name in
            KeptInvitationLink(
                clubID: club, candidateID: "cand_" + name, invitationID: "inv_" + name,
                url: Sunday.url(index + 1), shared: false)
        }
        let vault = FailingVault(InvitationLinkFile(accountID: account, links: stored))
        vault.failLoads = true
        let links = book(vault)
        let stamp = links.beginRead()
        // Nina's link is kept after the read was requested, so its answer can't list it.
        links.keep(
            Sunday.link("inv_nina", for: "cand_nina", url: Sunday.url(4)), club: club,
            account: account)
        links.settle(
            Sunday.members([
                Sunday.candidate("cand_maya", "Maya", .live),
                Sunday.candidate("cand_alex", "Alex", .live),
            ]), stamp: stamp, account: account)
        links.drop("inv_alex", account: account)
        // Another account's answer says nothing about these links.
        links.settleGone(club: club, stamp: links.beginRead(), account: "acct_maya")
        #expect(vault.kept?.links == stored)
        vault.failLoads = false
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(links.link(for: "cand_alex", club: club, account: account) == nil)
        #expect(links.link(for: "cand_maya", club: club, account: account) == stored[1])
        #expect(vault.kept?.links.map(\.invitationID) == ["inv_maya", "inv_nina"])
    }

    @Test func aLinkReplacedWhileTheVaultWasLockedStaysGoneThoughItsReplacementIsRevoked() {
        let older = KeptInvitationLink(
            clubID: club, candidateID: "cand_alex", invitationID: "inv_alex", url: Sunday.url(1),
            shared: true)
        let vault = FailingVault(InvitationLinkFile(accountID: account, links: [older]))
        vault.failLoads = true
        let links = book(vault)
        // Create new link while the iPhone is locked replaces the vault's link on the server, and
        // the new one is revoked before the vault is read.
        links.keep(
            Sunday.link("inv_alex_2", for: "cand_alex", url: Sunday.url(2)), club: club,
            account: account)
        links.drop("inv_alex_2", account: account)
        vault.failLoads = false
        #expect(links.link(for: "cand_alex", club: club, account: account) == nil)
        #expect(vault.kept == nil)
    }

    @Test func aForgetThatCouldntFinishNeverReadsTheForgottenLinksBack() {
        let sam = KeptInvitationLink(
            clubID: club, candidateID: "cand_sam", invitationID: "inv_sam", url: Sunday.url(1),
            shared: false)
        let vault = FailingVault(InvitationLinkFile(accountID: account, links: [sam]))
        let links = book(vault)
        vault.failDeletes = true
        vault.failSaves = true
        // Leave sign-in before anything read the vault: the forget can't finish.
        links.forget()
        #expect(vault.kept?.links == [sam])
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
    }

    @Test func aLinkWrittenAfterAForgetThatCouldntFinishIsntForgottenLater() throws {
        let vault = FailingVault()
        let links = book(vault)
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
            account: account)
        vault.failDeletes = true
        vault.failBlankSaves = true
        links.forget()
        // The next account's link is written over the file the forget couldn't remove.
        let alex = try #require(
            links.keep(
                Sunday.link("inv_alex", for: "cand_alex", url: Sunday.url(2)), club: club,
                account: "acct_maya"))
        #expect(vault.kept?.links == [alex])
        vault.failDeletes = false
        vault.failBlankSaves = false
        #expect(links.link(for: "cand_alex", club: club, account: "acct_maya") == alex)
        #expect(vault.kept?.links == [alex])
    }

    @Test func nothingTheTypesPrintHoldsTheLink() throws {
        let links = book()
        let kept = try #require(
            links.keep(
                Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: club,
                account: account))
        let file = InvitationLinkFile(accountID: account, links: [kept])
        let token = try #require(Sunday.url(1).fragment)
        for text in [
            String(describing: kept), String(reflecting: kept), String(describing: file),
            String(reflecting: file), dumped(kept), dumped(file), "\(kept)", "\(file)",
        ] {
            #expect(!text.contains(token), "\(text)")
            #expect(!text.contains("tadayo.app"), "\(text)")
        }
    }

    // MARK: An accepted invitation's token (the contract's `MyInvitationState`)

    func accepted(_ id: String, _ state: MyInvitationState) -> MyInvitation {
        MyInvitation(invitationID: id, clubName: "Kitchen table", inviterName: "Ben", state: state)
    }

    func clubList(_ invitations: [MyInvitation], clubs: [ClubSummary] = []) -> ClubList {
        ClubList(serverClock: Sunday.clock, clubs: clubs, invitations: invitations)
    }

    @Test func anAcceptedTokenIsKeptAndReadByTokenAndByInvitation() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        let token = Kitchen.token(1)
        let kept = try #require(
            links.keepReceived(token, invitation: "inv_leila", account: account))
        #expect(kept.token == token)
        #expect(!kept.nameChanged)
        #expect(links.received(token, account: account) == kept)
        #expect(links.received(invitation: "inv_leila", account: account) == kept)
        #expect(links.received(Kitchen.token(2), account: account) == nil)
        #expect(links.received(invitation: "inv_other", account: account) == nil)
        // Another account's file is never read for it (T11).
        #expect(links.received(token, account: "acct_maya") == nil)
        // In the vault, for the next launch, beside no link.
        #expect(try vault.load()?.received == [kept])
        #expect(book(vault).received(token, account: account) == kept)
    }

    @Test func anEmptyAccountOrInvitationKeepsNothing() {
        let links = book()
        #expect(links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: "") == nil)
        #expect(links.keepReceived(Kitchen.token(1), invitation: "", account: account) == nil)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
    }

    @Test func theSameInvitationOrTheSameTokenIsReplacedAndTheMarkCarried() {
        let links = book()
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        #expect(links.received(Kitchen.token(1), account: account)?.nameChanged == false)
        links.keepReceived(
            Kitchen.token(1), invitation: "inv_leila", account: account, nameChanged: true)
        // A preview leaves the mark as it was.
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        #expect(links.received(Kitchen.token(1), account: account)?.nameChanged == true)
        // A new token for the same invitation replaces the old one.
        links.keepReceived(Kitchen.token(2), invitation: "inv_leila", account: account)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
        #expect(
            links.received(invitation: "inv_leila", account: account)?.token == Kitchen.token(2))
        // The same token under another invitation id replaces it too.
        links.keepReceived(Kitchen.token(2), invitation: "inv_other", account: account)
        #expect(links.received(invitation: "inv_leila", account: account) == nil)
        #expect(links.received(Kitchen.token(2), account: account)?.invitationID == "inv_other")
    }

    @Test func aDroppedTokenGoesAtOnceAndTheLastOneDeletesTheFile() {
        let vault = FailingVault()
        let links = book(vault)
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        let stamp = links.beginRead()
        links.dropReceived(Kitchen.token(1), account: account)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
        #expect(vault.kept == nil)
        // A read requested before then, answering with the invitation still waiting, brings
        // nothing back.
        links.settle(
            clubList([accepted("inv_leila", .waiting)]), stamp: stamp, account: account)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
    }

    @Test func aClubListKeepsWaitingAndChangedTokensAndDropsTheRest() {
        let links = book()
        for (n, id) in ["inv_waiting", "inv_changed", "inv_ended", "inv_gone"].enumerated() {
            links.keepReceived(Kitchen.token(n + 1), invitation: id, account: account)
        }
        links.settle(
            clubList([
                accepted("inv_waiting", .waiting), accepted("inv_changed", .rosterChanged),
                accepted("inv_ended", .didNotGoAhead),
            ]), stamp: links.beginRead(), account: account)
        #expect(links.received(invitation: "inv_waiting", account: account) != nil)
        #expect(links.received(invitation: "inv_changed", account: account) != nil)
        // It didn't go ahead, or it joined (no longer listed): its token goes.
        #expect(links.received(invitation: "inv_ended", account: account) == nil)
        #expect(links.received(invitation: "inv_gone", account: account) == nil)
    }

    @Test func aTokenKeptWhileTheListWasReadIsLeftByItsAnswer() {
        let links = book()
        let stamp = links.beginRead()
        // Accepted while the list was on its way: its answer can't list it yet.
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        links.settle(clubList([]), stamp: stamp, account: account)
        #expect(links.received(Kitchen.token(1), account: account) != nil)
        links.settle(clubList([]), stamp: links.beginRead(), account: account)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
    }

    @Test func aClubListSettlesLinksAndTokensApart() {
        let links = book()
        links.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(9)), club: club,
            account: account)
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        // Sunday people listed, the invitation not: the link stays and the token goes.
        links.settle(
            clubList([], clubs: [Sunday.summary]), stamp: links.beginRead(), account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account) != nil)
        #expect(links.received(Kitchen.token(1), account: account) == nil)
        // The invitation listed, the club not: the token stays and the link goes.
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        links.settle(
            clubList([accepted("inv_leila", .waiting)]), stamp: links.beginRead(),
            account: account)
        #expect(links.link(for: "cand_sam", club: club, account: account) == nil)
        #expect(links.received(Kitchen.token(1), account: account) != nil)
    }

    @Test func forgettingDropsTheTokensWithTheLinks() throws {
        let vault = InMemoryInvitationLinkVault()
        let links = book(vault)
        links.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: account)
        links.forget()
        #expect(links.received(Kitchen.token(1), account: account) == nil)
        #expect(try vault.load() == nil)
    }

    @Test func aDecisionWhileTheVaultWasLockedHoldsForItsTokensOnceItsRead() throws {
        let stored = [
            KeptReceivedInvitation(
                invitationID: "inv_waiting", secret: Kitchen.token(1).secret, nameChanged: true),
            KeptReceivedInvitation(
                invitationID: "inv_ended", secret: Kitchen.token(2).secret, nameChanged: false),
            KeptReceivedInvitation(
                invitationID: "inv_joined", secret: Kitchen.token(3).secret, nameChanged: false),
        ]
        let vault = FailingVault(
            InvitationLinkFile(accountID: account, links: [], received: stored))
        vault.failLoads = true
        let links = book(vault)
        links.settle(
            clubList([accepted("inv_waiting", .waiting), accepted("inv_joined", .waiting)]),
            stamp: links.beginRead(), account: account)
        links.dropReceived(Kitchen.token(3), account: account)
        #expect(vault.kept?.received == stored)
        vault.failLoads = false
        #expect(links.received(Kitchen.token(1), account: account) == stored[0])
        #expect(links.received(Kitchen.token(2), account: account) == nil)
        #expect(links.received(Kitchen.token(3), account: account) == nil)
        #expect(vault.kept?.received == [stored[0]])
    }

    @Test func aTokenKeptWhileTheVaultWasLockedReplacesTheVaultsForTheSameInvitation() throws {
        let older = KeptReceivedInvitation(
            invitationID: "inv_leila", secret: Kitchen.token(1).secret, nameChanged: true)
        let vault = FailingVault(
            InvitationLinkFile(accountID: account, links: [], received: [older]))
        vault.failLoads = true
        let links = book(vault)
        links.keepReceived(
            Kitchen.token(2), invitation: "inv_leila", account: account, nameChanged: false)
        vault.failLoads = false
        #expect(links.received(Kitchen.token(1), account: account) == nil)
        #expect(
            links.received(invitation: "inv_leila", account: account)?.token == Kitchen.token(2))
        #expect(vault.kept?.received.count == 1)
    }

    @Test func aFileWithoutTokensDecodesWithNone() throws {
        // As an earlier build wrote it: the account and its links, nothing else.
        let json = Data(
            #"{"accountID":"acct_ben","links":[{"clubID":"club_sunday","candidateID":"cand_sam","invitationID":"inv_sam","url":"https://tadayo.app/i#tok0000000000000000000000000000000000000001","shared":true}]}"#
                .utf8)
        let file = try JSONDecoder().decode(InvitationLinkFile.self, from: json)
        #expect(file.accountID == "acct_ben")
        #expect(file.links.map(\.invitationID) == ["inv_sam"])
        #expect(file.received.isEmpty)
        // And a file with tokens comes back whole.
        let kept = InvitationLinkFile(
            accountID: account, links: [],
            received: [
                KeptReceivedInvitation(
                    invitationID: "inv_leila", secret: Kitchen.token(1).secret, nameChanged: true)
            ])
        #expect(
            try JSONDecoder().decode(InvitationLinkFile.self, from: JSONEncoder().encode(kept))
                == kept)
    }

    @Test func nothingTheTypesPrintHoldsTheToken() throws {
        let links = book()
        let token = Kitchen.token(7)
        let kept = try #require(
            links.keepReceived(token, invitation: "inv_leila", account: account, nameChanged: true))
        let file = InvitationLinkFile(accountID: account, links: [], received: [kept])
        for text in [
            String(describing: kept), String(reflecting: kept), String(describing: file),
            String(reflecting: file), dumped(kept), dumped(file), "\(kept)", "\(file)",
        ] {
            #expect(!text.contains(token.secret), "\(text)")
            #expect(!text.contains("tok0000"), "\(text)")
        }
    }

    private func dumped(_ value: Any) -> String {
        var text = ""
        dump(value, to: &text)
        return text
    }
}
