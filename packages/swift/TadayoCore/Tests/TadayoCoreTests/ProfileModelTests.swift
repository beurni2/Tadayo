import Foundation
import Testing

@testable import TadayoCore

/// An `AccountService` whose answers come from a script, recording every call in order.
final class FakeAccounts: AccountService, @unchecked Sendable {
    private let lock = NSLock()
    private var meAnswers: [Result<Account, APIFailure>]
    private var updateAnswers: [Result<Account, APIFailure>]
    private var clubsAnswers: [Result<ClubList, APIFailure>]
    private(set) var calls: [String] = []
    private(set) var updates: [(change: AccountChange, key: IdempotencyKey)] = []

    init(
        me: [Result<Account, APIFailure>] = [], update: [Result<Account, APIFailure>] = [],
        clubs: [Result<ClubList, APIFailure>] = []
    ) {
        meAnswers = me
        updateAnswers = update
        clubsAnswers = clubs
    }

    private func next<T>(_ answers: inout [Result<T, APIFailure>]) -> Result<T, APIFailure> {
        answers.isEmpty ? .failure(.network) : answers.removeFirst()
    }

    func me() async throws(APIFailure) -> Account {
        try lock.withLock {
            calls.append("me")
            return next(&meAnswers)
        }.get()
    }

    func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure) -> Account {
        try lock.withLock {
            calls.append("update")
            updates.append((change, key))
            return next(&updateAnswers)
        }.get()
    }

    func clubs() async throws(APIFailure) -> ClubList {
        try lock.withLock {
            calls.append("clubs")
            return next(&clubsAnswers)
        }.get()
    }
}

/// Keys numbered from 1, so a test can tell them apart.
final class NumberedKeys: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func make() -> IdempotencyKey {
        lock.withLock {
            count += 1
            return IdempotencyKey(
                uuid: UUID(uuidString: String(format: "00000000-0000-7000-8000-%012d", count))!)
        }
    }

    static func key(_ n: Int) -> IdempotencyKey {
        IdempotencyKey(uuid: UUID(uuidString: String(format: "00000000-0000-7000-8000-%012d", n))!)
    }
}

func account(name: String? = nil, age: Bool = false, version: Int = 0) -> Account {
    Account(
        id: "acct_ben", displayName: name, avatarVersion: nil, ageConfirmed: age,
        version: version)
}

@MainActor @Suite struct ProfileModelTests {
    final class Routes {
        var saved: [Account] = []
        var signedOut = 0
    }

    func model(
        _ accounts: FakeAccounts, _ start: Account, _ routes: Routes = Routes(),
        keys: NumberedKeys = NumberedKeys()
    ) -> ProfileModel {
        ProfileModel(
            account: start, accounts: accounts, makeKey: { keys.make() },
            saved: { routes.saved.append($0) }, signedOut: { routes.signedOut += 1 })
    }

    @Test func theAgeIsRecordedAloneAndFirst() async {
        let accounts = FakeAccounts(update: [.success(account(age: true, version: 1))])
        let routes = Routes()
        let model = model(accounts, account(), routes)
        model.name = "Ben"
        await model.confirmAge()
        #expect(accounts.updates.map(\.change) == [.confirmAge(expectedVersion: 0)])
        #expect(routes.saved == [account(age: true, version: 1)])
        #expect(model.account == account(age: true, version: 1))
    }

    @Test func theNameIsTrimmedAndSentWithTheVersionRead() async {
        let accounts = FakeAccounts(update: [.success(account(name: "Ben", age: true, version: 2))])
        let routes = Routes()
        let model = model(accounts, account(age: true, version: 1), routes)
        model.name = "  Ben \n"
        await model.saveName()
        #expect(accounts.updates.map(\.change) == [.name("Ben", expectedVersion: 1)])
        #expect(routes.saved.count == 1)
    }

    @Test func anEmptyNameIsRefusedHere() async {
        let accounts = FakeAccounts()
        let model = model(accounts, account(age: true, version: 1))
        for name in ["", "   ", "\n\t"] {
            model.name = name
            #expect(!model.canContinue)
            await model.saveName()
        }
        #expect(accounts.calls.isEmpty)
        model.name = "B"
        #expect(model.canContinue)
    }

    @Test func aNameOverFortyCharactersWaitsAndIsNotCut() async {
        // FQ70 counts grapheme clusters: a family emoji is one, as is an e with its accent.
        let accounts = FakeAccounts()
        let model = model(accounts, account(age: true))
        let family = "👨‍👩‍👧‍👦"
        model.name = String(repeating: family, count: 39) + "e\u{301}"
        #expect(!model.nameIsTooLong)
        #expect(model.canContinue)
        model.name += "x"
        #expect(model.nameIsTooLong)
        #expect(!model.canContinue)
        await model.saveName()
        #expect(accounts.calls.isEmpty)
        #expect(model.name.count == 41)
        model.name = "  " + String(repeating: "a", count: 40) + " "
        #expect(model.canContinue)
    }

    @Test func aRetryAfterNoAnswerSendsTheSameKeyAndBody() async {
        let keys = NumberedKeys()
        let accounts = FakeAccounts(update: [
            .failure(.network), .failure(.unavailable),
            .success(account(name: "Ben", age: true, version: 2)),
        ])
        let model = model(accounts, account(age: true, version: 1), keys: keys)
        model.name = "Ben"
        await model.saveName()
        #expect(model.failure == .network)
        #expect(model.name == "Ben")
        await model.saveName()
        #expect(model.failure == .other)
        await model.saveName()
        #expect(model.failure == nil)
        #expect(accounts.updates.map(\.key) == Array(repeating: NumberedKeys.key(1), count: 3))
        #expect(accounts.updates.allSatisfy { $0.change == .name("Ben", expectedVersion: 1) })
    }

    @Test func aChangedNameIsANewActionWithANewKey() async {
        let accounts = FakeAccounts(update: [
            .failure(.network), .success(account(name: "Benji", age: true, version: 2)),
        ])
        let model = model(accounts, account(age: true, version: 1))
        model.name = "Ben"
        await model.saveName()
        model.name = "Benji"
        await model.saveName()
        #expect(accounts.updates.map(\.key) == [NumberedKeys.key(1), NumberedKeys.key(2)])
    }

    @Test func aRefusedSaveEndsItsActionAndKeepsTheName() async {
        let accounts = FakeAccounts(update: [
            .failure(.refused), .success(account(name: "Ben", age: true, version: 2)),
        ])
        let model = model(accounts, account(age: true, version: 1))
        model.name = "Ben"
        await model.saveName()
        #expect(model.failure == .other)
        #expect(model.name == "Ben")
        #expect(!model.isSaving)
        await model.saveName()
        #expect(accounts.updates.map(\.key) == [NumberedKeys.key(1), NumberedKeys.key(2)])
    }

    @Test func aConflictReadsTheAccountAgainAndTriesWithItsVersion() async {
        let accounts = FakeAccounts(
            me: [.success(account(age: true, version: 4))],
            update: [
                .failure(.versionConflict), .success(account(name: "Ben", age: true, version: 5)),
            ])
        let routes = Routes()
        let model = model(accounts, account(age: true, version: 1), routes)
        model.name = "Ben"
        await model.saveName()
        #expect(model.failure == .other)
        #expect(routes.saved.isEmpty)
        await model.saveName()
        #expect(accounts.calls == ["update", "me", "update"])
        #expect(accounts.updates.last?.change == .name("Ben", expectedVersion: 4))
        #expect(accounts.updates.map(\.key) == [NumberedKeys.key(1), NumberedKeys.key(2)])
    }

    @Test func aNameAnotherDeviceGaveMovesOn() async {
        let accounts = FakeAccounts(
            me: [.success(account(name: "Benjamin", age: true, version: 4))],
            update: [.failure(.versionConflict)])
        let routes = Routes()
        let model = model(accounts, account(age: true, version: 1), routes)
        model.name = "Ben"
        await model.saveName()
        #expect(model.failure == nil)
        #expect(routes.saved == [account(name: "Benjamin", age: true, version: 4)])
    }

    @Test func anAgeAnotherDeviceRecordedMovesOn() async {
        let accounts = FakeAccounts(
            me: [.success(account(age: true, version: 3))], update: [.failure(.versionConflict)])
        let routes = Routes()
        let model = model(accounts, account(), routes)
        await model.confirmAge()
        #expect(model.failure == nil)
        #expect(routes.saved == [account(age: true, version: 3)])
    }

    @Test func aNameBeforeTheAgeGoesBackForIt() async {
        let accounts = FakeAccounts(
            me: [.success(account(version: 2))], update: [.failure(.profileIncomplete)])
        let routes = Routes()
        let model = model(accounts, account(age: true, version: 1), routes)
        model.name = "Ben"
        await model.saveName()
        #expect(routes.saved == [account(version: 2)])
        #expect(model.name == "Ben")
    }

    @Test func anEndedSessionSignsOut() async {
        let routes = Routes()
        let model = model(FakeAccounts(update: [.failure(.signedOut)]), account(), routes)
        await model.confirmAge()
        #expect(routes.signedOut == 1)
    }
}
