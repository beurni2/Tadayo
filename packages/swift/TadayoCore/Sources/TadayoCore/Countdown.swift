import Foundation

/// The time left until an instant the server named, such as the next `reveal_at` (spec 08:
/// "Synchronize countdowns with server_now and the next reveal_at"). It is shown, never used to
/// decide: when it reaches zero the app asks the server again (T1).
public struct Countdown: Sendable, Equatable {
    public let target: Date

    public init(target: Date) {
        self.target = target
    }

    public struct Remaining: Sendable, Equatable {
        public let days: Int
        public let hours: Int
        public let minutes: Int

        public init(days: Int, hours: Int, minutes: Int) {
            self.days = days
            self.hours = hours
            self.minutes = minutes
        }
    }

    /// Whole days, hours and minutes left at `now`, the server's time from `ServerClock`. A part
    /// minute counts as a minute, so the countdown never says nothing is left before the instant:
    /// 5 hours 41 minutes and 1 second reads as 5 hours 42 minutes. Nil once the target is reached.
    public func remaining(at now: Date) -> Remaining? {
        let interval = target.timeIntervalSince(now)
        guard interval > 0 else { return nil }
        let totalMinutes = Int((interval / 60).rounded(.up))
        return Remaining(
            days: totalMinutes / 1440, hours: (totalMinutes % 1440) / 60, minutes: totalMinutes % 60
        )
    }

    /// When the shown minutes next change, so a view refreshes once a minute and not every
    /// second. Nil once the target is reached.
    public func nextChange(after now: Date) -> Date? {
        let interval = target.timeIntervalSince(now)
        guard interval > 0 else { return nil }
        let partial = interval.truncatingRemainder(dividingBy: 60)
        return now.addingTimeInterval(partial == 0 ? 60 : partial)
    }
}
