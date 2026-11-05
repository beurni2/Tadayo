import Foundation
import Testing

@testable import TadayoCore

@Suite struct CountdownTests {
    // Saturday 7 November 2026, 7 AM in New York: Nina's reveal_at (spec 08's example).
    let revealAt = Date(timeIntervalSince1970: 1_794_052_800)

    @Test func countsWholeMinutesRoundingUp() {
        let countdown = Countdown(target: revealAt)
        // Spec 08: "Opens in 5 hours 42 minutes", at 1:18 AM and a few seconds.
        let now = revealAt.addingTimeInterval(-(5 * 3600 + 41 * 60 + 1))
        #expect(countdown.remaining(at: now) == .init(days: 0, hours: 5, minutes: 42))
        #expect(
            countdown.remaining(at: revealAt.addingTimeInterval(-(5 * 3600 + 42 * 60)))
                == .init(days: 0, hours: 5, minutes: 42))
    }

    @Test func countsDays() {
        let countdown = Countdown(target: revealAt)
        let now = revealAt.addingTimeInterval(-(2 * 86400 + 3 * 3600 + 4 * 60))
        #expect(countdown.remaining(at: now) == .init(days: 2, hours: 3, minutes: 4))
    }

    @Test func neverSaysNothingIsLeftBeforeTheInstant() {
        let countdown = Countdown(target: revealAt)
        #expect(
            countdown.remaining(at: revealAt.addingTimeInterval(-0.5))
                == .init(days: 0, hours: 0, minutes: 1))
        #expect(countdown.remaining(at: revealAt) == nil)
        #expect(countdown.remaining(at: revealAt.addingTimeInterval(1)) == nil)
    }

    @Test func changesOncePerMinute() {
        let countdown = Countdown(target: revealAt)
        let now = revealAt.addingTimeInterval(-(10 * 60 + 15))
        #expect(countdown.nextChange(after: now) == now.addingTimeInterval(15))
        let onTheMinute = revealAt.addingTimeInterval(-600)
        #expect(countdown.nextChange(after: onTheMinute) == onTheMinute.addingTimeInterval(60))
        #expect(countdown.nextChange(after: revealAt) == nil)
    }

    @Test func runsFromTheServersClockNotTheDevices() {
        let received = ContinuousClock.now
        let clock = ServerClock(
            serverNow: revealAt.addingTimeInterval(-3600), receivedAt: received)
        let countdown = Countdown(target: revealAt)
        let now = clock.now(at: received.advanced(by: .seconds(1800)))
        #expect(countdown.remaining(at: now) == .init(days: 0, hours: 0, minutes: 30))
    }
}
