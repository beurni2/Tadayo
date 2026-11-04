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

    @Test func aSlowResponseThatLeftFirstCantWindTheClockBack() {
        // The fast response left the server 2 seconds after the slow one and arrived first; the
        // slow one arrives 2 seconds later still carrying the earlier server_now.
        let first = ContinuousClock.now
        let fast = ServerClock(serverNow: serverNow.addingTimeInterval(2), receivedAt: first)
        let slow = ServerClock(serverNow: serverNow, receivedAt: first.advanced(by: .seconds(2)))
        #expect(fast.updated(with: slow) == fast)
        #expect(slow.updated(with: fast) == fast)
        let later = first.advanced(by: .seconds(5))
        #expect(fast.updated(with: slow).now(at: later) == serverNow.addingTimeInterval(7))
    }

    @Test func takesAReadingThatPutsTheServerLater() {
        // A minute on, a response puts the server 5 seconds further on than the old reading did.
        let first = ContinuousClock.now
        let old = ServerClock(serverNow: serverNow, receivedAt: first)
        let fresh = ServerClock(
            serverNow: serverNow.addingTimeInterval(65),
            receivedAt: first.advanced(by: .seconds(60))
        )
        #expect(old.updated(with: fresh) == fresh)
        #expect(fresh.updated(with: old) == fresh)
    }
}
