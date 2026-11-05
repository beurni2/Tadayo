import Foundation

/// The server's time, as the device last heard it (T1; docs/TECH-DESIGN.md section 4, "Time on
/// the device"). Every Home and day response carries `server_now`; the app keeps it with the
/// moment it arrived on the device's continuous clock, and reads "now" from those two. Of two
/// readings it keeps the one that puts the server's time latest (`updated(with:)`).
///
/// The device's wall clock is never read: changing it moves nothing here. The continuous clock
/// keeps counting while the phone sleeps, so a reading after a night asleep is still the server's
/// time plus the time that really passed. A countdown runs from this, and nothing on the device
/// decides access: the server compares `reveal_at` and `close_at` with its own clock.
public struct ServerClock: Sendable, Equatable {
    public let serverNow: Date
    public let receivedAt: ContinuousClock.Instant

    public init(serverNow: Date, receivedAt: ContinuousClock.Instant) {
        self.serverNow = serverNow
        self.receivedAt = receivedAt
    }

    /// The server's time at `instant` on the device's continuous clock.
    public func now(at instant: ContinuousClock.Instant) -> Date {
        let elapsed = receivedAt.duration(to: instant)
        let (seconds, attoseconds) = elapsed.components
        return serverNow.addingTimeInterval(
            TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18)
    }

    /// Keeps the reading that puts the server's time later, compared at one instant. Each reading
    /// is behind the server by the time its response took to arrive, so the later one is the
    /// closer, and never ahead: a slow response that left the server first can't wind the clock
    /// back, whenever it arrives.
    public func updated(with other: ServerClock) -> ServerClock {
        let instant = max(receivedAt, other.receivedAt)
        return other.now(at: instant) >= now(at: instant) ? other : self
    }
}
