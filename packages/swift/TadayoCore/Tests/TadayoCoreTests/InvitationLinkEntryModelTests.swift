import Foundation
import Testing

@testable import TadayoCore

/// I have an invite's paste step (`G02-link-entry-signed-in`; handoffs 2 and 4).
@MainActor @Suite struct InvitationLinkEntryModelTests {
    let link = "https://tadayo.app/i#" + Kitchen.token(1).secret

    func entry(_ service: ScriptedClubs, made: @escaping @MainActor () -> Void = {})
        -> InvitationLinkEntryModel
    {
        InvitationLinkEntryModel(
            make: { token in
                made()
                return InvitationModel(
                    token: token, service: service,
                    book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
                    account: Kitchen.account, current: { true }, joined: { _ in },
                    signedOut: {})
            }, released: { _ in })
    }

    @Test func continueWaitsForTextInTheField() {
        let entry = entry(ScriptedClubs())
        #expect(!entry.canContinue)
        entry.text = "   \n"
        #expect(!entry.canContinue)
        entry.text = "anything"
        #expect(entry.canContinue)
    }

    @Test func aPasteWithNoTextSaysSoAndKeepsTheField() {
        let entry = entry(ScriptedClubs())
        entry.text = "typed"
        entry.pasted(nil)
        #expect(entry.problem == .clipboardEmpty)
        #expect(entry.text == "typed")
        entry.pasted("  ")
        #expect(entry.problem == .clipboardEmpty)
        entry.pasted(link)
        #expect(entry.problem == nil)
        #expect(entry.text == link)
    }

    @Test func somethingThatIsntAnInvitationLinkIsNeverChecked() async {
        let service = ScriptedClubs()
        var made = 0
        let entry = entry(service, made: { made += 1 })
        for text in [
            "hello", "https://example.com/i#" + Kitchen.token(1).secret,
            "https://tadayo.app/i?t=" + Kitchen.token(1).secret, "https://tadayo.app/i#short",
            "tadayo.app/i#" + Kitchen.token(1).secret,
        ] {
            entry.text = text
            await entry.proceed()
            #expect(entry.problem == .invalid, "\(text)")
            #expect(entry.text == text)
        }
        #expect(made == 0)
        #expect(service.calls.isEmpty)
        // Editing clears the line.
        entry.text = "hello again"
        #expect(entry.problem == nil)
    }

    /// Handoff 9's frame 4: what isn't a link keeps Continue unavailable until it's edited, or a
    /// paste replaces it.
    @Test func continueWaitsForAnEditAfterTextThatIsntALink() async {
        let entry = entry(ScriptedClubs())
        entry.text = "tadayo.app"
        #expect(entry.canContinue)
        await entry.proceed()
        #expect(entry.problem == .invalid)
        #expect(!entry.canContinue)
        entry.text = "tadayo.app/"
        #expect(entry.canContinue)
        await entry.proceed()
        #expect(!entry.canContinue)
        entry.pasted(link)
        #expect(entry.canContinue)
    }

    @Test func aLinkWithSpacesAroundItIsRead() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.success(.open(Kitchen.roster()))]
        let entry = entry(service)
        entry.pasted("  \(link)\n")
        await entry.proceed()
        #expect(entry.problem == nil)
        #expect(entry.invitation?.state == .open(Kitchen.roster()))
        #expect(service.calls == ["preview 01"])
    }

    @Test func theFieldIsReadOnlyWhileTheLinkIsChecked() async {
        let service = ScriptedClubs()
        service.previewAnswers = [.failure(.network)]
        let gate = Gate()
        service.duringPreview = { await gate.wait() }
        let entry = entry(service)
        entry.text = link
        async let proceeded: Void = entry.proceed()
        await gate.reached()
        // A second check, if one were sent, would answer at once rather than wait at the gate.
        service.duringPreview = {}
        #expect(entry.isChecking)
        #expect(!entry.canContinue)
        entry.text = "changed"
        entry.pasted("pasted")
        await entry.proceed()
        gate.open()
        await proceeded
        #expect(entry.text == link)
        #expect(entry.problem == .cannotCheck(.network))
        #expect(entry.invitation == nil)
        #expect(service.calls == ["preview 01"])
    }

    @Test func nothingTheModelPrintsHoldsTheTypedLink() {
        let entry = entry(ScriptedClubs())
        entry.pasted(link)
        var dumped = ""
        dump(entry, to: &dumped)
        for text in [String(describing: entry), String(reflecting: entry), dumped, "\(entry)"] {
            #expect(!text.contains(Kitchen.token(1).secret), "\(text)")
            #expect(!text.contains("tadayo.app"), "\(text)")
        }
    }

    @Test func theInvitationIsReleasedWhenItsClubOpensOrBackLeavesIt() async throws {
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.joined(Kitchen.ref)), .success(.open(Kitchen.roster())),
        ]
        var made: [InvitationModel] = []
        var released: [InvitationModel] = []
        let entry = InvitationLinkEntryModel(
            make: { token in
                let model = InvitationModel(
                    token: token, service: service,
                    book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
                    account: Kitchen.account, current: { true }, joined: { _ in },
                    signedOut: {})
                made.append(model)
                return model
            },
            released: { released.append($0) })
        entry.text = link
        // A club the account is in: nothing to hand over, and the model is let go.
        await entry.proceed()
        #expect(entry.opened == Kitchen.ref)
        #expect(made.count == 1)
        #expect(released.count == 1)
        #expect(released.first === made.first)
        // An invitation shown, then Back: the model is let go.
        await entry.proceed()
        let shown = try #require(entry.invitation)
        #expect(released.count == 1)
        entry.returned()
        #expect(released.count == 2)
        #expect(released.last === shown)
    }

    @Test func aNewCheckLetsTheShownInvitationGo() async throws {
        let service = ScriptedClubs()
        service.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.open(Kitchen.roster())),
            .failure(.network),
        ]
        var released: [InvitationModel] = []
        let entry = InvitationLinkEntryModel(
            make: { token in
                InvitationModel(
                    token: token, service: service,
                    book: InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
                    account: Kitchen.account, current: { true }, joined: { _ in },
                    signedOut: {})
            },
            released: { released.append($0) })
        entry.text = link
        await entry.proceed()
        let first = try #require(entry.invitation)
        #expect(released.isEmpty)
        entry.text = "https://tadayo.app/i#" + Kitchen.token(2).secret
        await entry.proceed()
        #expect(released.count == 1)
        #expect(released.first === first)
        let second = try #require(entry.invitation)
        #expect(second !== first)
        #expect(second.state == .open(Kitchen.roster()))
        // A check that fails lets the shown one go too, and shows none.
        await entry.proceed()
        #expect(released.count == 2)
        #expect(released.last === second)
        #expect(entry.invitation == nil)
        #expect(entry.problem == .cannotCheck(.network))
        #expect(service.calls == ["preview 01", "preview 02", "preview 02"])
    }

    @Test func nothingIsCheckedOnceTheSessionHasEnded() async {
        var asked = 0
        let entry = InvitationLinkEntryModel(
            make: { _ in
                asked += 1
                return nil
            }, released: { _ in })
        entry.text = link
        await entry.proceed()
        #expect(asked == 1)
        #expect(entry.invitation == nil)
        #expect(entry.opened == nil)
        #expect(entry.problem == nil)
        #expect(!entry.isChecking)
        #expect(entry.text == link)
    }
}
