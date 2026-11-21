import Foundation
import Testing

@testable import TadayoCore

/// Naming a new club (`G01-create`, `G01-create-failed`; `docs/plans/ios-b1-create.md`
/// section 1).
@MainActor @Suite struct CreateClubModelTests {
    let zone = TimeZone(identifier: "America/New_York")!

    func model(
        _ clubs: ScriptedClubs, keys: NumberedKeys = NumberedKeys(),
        zone: TimeZone? = nil, created: @escaping @MainActor (ClubDetail) async -> Void = { _ in },
        signedOut: @escaping @MainActor () async -> Void = {}
    ) -> CreateClubModel {
        let zone = zone ?? self.zone
        return CreateClubModel(
            service: clubs, makeKey: { keys.make() }, timezone: { zone }, created: created,
            signedOut: signedOut)
    }

    @Test func aNameNeedsSomethingVisibleAndAtMostFortyCharacters() {
        let create = model(ScriptedClubs())
        #expect(!create.canContinue)
        create.name = "   "
        #expect(!create.canContinue)
        create.name = String(repeating: "a", count: 40)
        #expect(create.canContinue)
        #expect(!create.nameIsTooLong)
        create.name = " " + String(repeating: "a", count: 40) + " "
        #expect(create.canContinue)
        create.name = String(repeating: "a", count: 41)
        #expect(!create.canContinue)
        #expect(create.nameIsTooLong)
        // Counted as a person sees characters, never in UTF-16 units (FQ70, T13).
        create.name = String(repeating: "👩‍👩‍👧", count: 40)
        #expect(create.canContinue)
    }

    @Test func continueMakesTheClubWithTheTrimmedNameAndTheDevicesZone() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [.success(Sunday.detail())]
        var made: [ClubDetail] = []
        let create = model(clubs, created: { made.append($0) })
        create.name = "  Sunday people "
        await create.create()
        #expect(clubs.calls == ["createClub Sunday people America/New_York \(NumberedKeys.key(1))"])
        #expect(made == [Sunday.detail()])
        #expect(create.club == Sunday.detail())
        #expect(create.failure == nil)
        // One club: Continue makes no other.
        #expect(!create.canContinue)
        await create.create()
        #expect(clubs.calls.count == 1)
    }

    @Test func aRetryAfterNoAnswerSendsTheSameKeyAndZone() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [
            .failure(.network), .failure(.unavailable), .success(Sunday.detail()),
        ]
        // The zone is read when the action starts, and the retries send that one.
        let zones = Zones([zone, TimeZone(identifier: "Europe/Paris")!])
        let keys = NumberedKeys()
        let create = CreateClubModel(
            service: clubs, makeKey: { keys.make() }, timezone: { zones.next() },
            created: { _ in }, signedOut: {})
        create.name = "Sunday people"
        await create.create()
        #expect(create.failure == .network)
        #expect(create.name == "Sunday people")
        await create.create()
        #expect(create.failure == .other)
        await create.create()
        #expect(create.failure == nil)
        #expect(
            clubs.calls
                == Array(
                    repeating: "createClub Sunday people America/New_York \(NumberedKeys.key(1))",
                    count: 3))
    }

    @Test func aChangedNameIsANewAction() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [.failure(.network), .success(Sunday.detail())]
        let create = model(clubs)
        create.name = "Sunday peple"
        await create.create()
        create.name = "Sunday people"
        await create.create()
        #expect(
            clubs.calls == [
                "createClub Sunday peple America/New_York \(NumberedKeys.key(1))",
                "createClub Sunday people America/New_York \(NumberedKeys.key(2))",
            ])
    }

    @Test func aRefusalKeepsTheNameAndTheNextTapIsANewAction() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [.failure(.refused), .success(Sunday.detail())]
        let create = model(clubs)
        create.name = "Sunday people"
        await create.create()
        #expect(create.failure == .other)
        #expect(create.name == "Sunday people")
        #expect(create.canContinue)
        await create.create()
        #expect(
            clubs.calls.last == "createClub Sunday people America/New_York \(NumberedKeys.key(2))")
    }

    @Test func aSignedOutAnswerEndsTheSession() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [.failure(.signedOut)]
        var ended = 0
        let create = model(clubs, signedOut: { ended += 1 })
        create.name = "Sunday people"
        await create.create()
        #expect(ended == 1)
        #expect(create.failure == nil)
        #expect(create.club == nil)
    }

    @Test func theNameIsReadOnlyWhileTheClubIsMadeAndOneMakeRunsAtATime() async {
        let clubs = ScriptedClubs()
        clubs.createAnswers = [.success(Sunday.detail())]
        let gate = Gate()
        let create = model(clubs, created: { _ in await gate.wait() })
        create.name = "Sunday people"
        let first = Task { await create.create() }
        while clubs.calls.isEmpty { await Task.yield() }
        #expect(create.isCreating)
        create.name = "Something else"
        #expect(create.name == "Sunday people")
        await create.create()
        #expect(clubs.calls.count == 1)
        gate.open()
        await first.value
        #expect(!create.isCreating)
    }
}

/// Zones handed out in turn, one per read.
final class Zones: @unchecked Sendable {
    private let lock = NSLock()
    private var zones: [TimeZone]

    init(_ zones: [TimeZone]) {
        self.zones = zones
    }

    func next() -> TimeZone {
        lock.withLock { zones.count > 1 ? zones.removeFirst() : zones[0] }
    }
}
