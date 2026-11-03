import Foundation
import Testing

@testable import TadayoCore

@Suite struct ServerClockTests {
    // Friday 6 November 2026, 1:41 AM in New York (book p12's second fixture).
    let serverNow = Date(timeIntervalSince1970: 1_793_947_260)

    @Test func runsFromServerNowOnTheContinuousClock() {
        let received = ContinuousClock.now
        let clock = ServerClock(serverNow: serverNow, receivedAt: received)
        #expect(clock.now(at: received) == serverNow)
        let later = received.advanced(by: .seconds(90))
        #expect(clock.now(at: later) == serverNow.addingTimeInterval(90))
    }

    @Test func neverReadsTheDevicesWallClock() {
        // The device's clock could say anything; the reading depends only on server_now and the
        // continuous time since it arrived.
        let received = ContinuousClock.now
        let clock = ServerClock(serverNow: serverNow, receivedAt: received)
        let reading = clock.now(at: received.advanced(by: .seconds(3600)))
        #expect(reading == serverNow.addingTimeInterval(3600))
    }

    @Test func keepsTheReadingThatArrivedLast() {
        let first = ContinuousClock.now
        let older = ServerClock(serverNow: serverNow, receivedAt: first)
        let newer = ServerClock(
            serverNow: serverNow.addingTimeInterval(-5), receivedAt: first.advanced(by: .seconds(1))
        )
        #expect(older.updated(with: newer) == newer)
        #expect(newer.updated(with: older) == newer)
    }
}
