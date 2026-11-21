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

    private func dumped(_ value: Any) -> String {
        var text = ""
        dump(value, to: &text)
        return text
    }
}
