import Foundation
import TadayoCore

/// The clubs the tabs' snapshots and readings draw, each frame its own fixture, never one
/// timeline (book p12): Sunday people, which Ben created and which hasn't started
/// (`H01-awaiting-activation`, `G06-switcher-status`), or suspended (`H01-unavailable`,
/// `G06-switcher-unavailable`), or active with Debby's Friday open (2.1's `G06-switcher`); and
/// Kitchen table active with its five members and Maya's day next (`G06-switcher`,
/// `G06-switcher-unavailable`), or with Ben alone and paused (`G06-switcher-status`).
enum ClubFixtures {
    static let sunday = club("club_sunday", "Sunday people", .proposed)
    static let sundaySuspended = club("club_sunday", "Sunday people", .suspended)
    static let sundayOpen = club(
        "club_sunday", "Sunday people", .active, members: 6,
        open: day(of: "club_sunday", star: "Debby", on: november(6), phase: .open))
    static let kitchen = club(
        "club_kitchen", "Kitchen table", .active, members: 5,
        next: day(of: "club_kitchen", star: "Maya", on: november(9), phase: .collecting))
    static let kitchenPaused = club("club_kitchen", "Kitchen table", .paused, members: 1)

    /// Club details for Sunday people with its six members (2.1's `G05-club-details`).
    static let sundayDetail = ClubDetail(
        serverClock: ServerClock(serverNow: now, receivedAt: .now),
        club: club("club_sunday", "Sunday people", .active, members: 6), rosterVersion: 6,
        canPropose: false, openRevisionID: nil)

    /// Sunday people's six, one day each, Ben the viewer (handoff 1's `G05-members`).
    static let sundayRoster = roster(
        "club_sunday", "Sunday people",
        [
            ("Ben", [.monday]), ("Maya", [.tuesday]), ("Alex", [.wednesday]),
            ("Sam", [.thursday]), ("Debby", [.friday]), ("Nina", [.saturday]),
        ])

    /// A pair, Ben and Debby, two days each (handoff 2's `G05-members-two-days`). The frame's
    /// title, "Ben and Debby", stands in for the club's name, which a real pair has (handoffs 3
    /// and 4's R-05), so the fixture names the club as the book's others are named.
    static let pairRoster = roster(
        "club_sunday", "Sunday people",
        [("Ben", [.monday, .thursday]), ("Debby", [.tuesday, .friday])])

    /// The roster of `id` with each name's weekdays, in that order, Ben the viewer.
    static func roster(_ id: String, _ name: String, _ days: [(String, [Weekday])]) -> Roster {
        let ref = ClubRef(
            id: id, name: name, timezone: "America/New_York", myMembershipID: "mem_Ben")
        let clock = ServerClock(serverNow: now, receivedAt: .now)
        let people = days.map { name, _ in
            Person(membershipID: "mem_\(name)", displayName: name, avatarVersion: nil)
        }
        let members = MemberList(
            serverClock: clock, club: ref,
            members: people.enumerated().map { index, person in
                Member(person: person, position: index + 1, cover: nil, nextDay: nil, nextUp: false)
            },
            openRevision: nil)
        let week = ClubWeek(
            serverClock: clock, club: ref,
            assignments: zip(people, days).flatMap { person, day in
                day.1.map { WeekdayAssignment(weekday: $0, person: person) }
            })
        return Roster(members, week: week)
    }

    /// The club list holding `clubs`, in that order.
    static func listed(_ clubs: ClubSummary...) -> RootModel.Clubs {
        .listed(
            ClubList(
                serverClock: ServerClock(serverNow: now, receivedAt: .now), clubs: clubs,
                invitations: []))
    }

    private static let now = Date(timeIntervalSince1970: 1_793_000_000)

    private static func club(
        _ id: String, _ name: String, _ state: ClubState, members: Int = 1,
        open: Occurrence? = nil, next: Occurrence? = nil
    ) -> ClubSummary {
        ClubSummary(
            ref: ClubRef(
                id: id, name: name, timezone: "America/New_York", myMembershipID: "mem_ben_\(id)"),
            state: state, memberCount: members, openDay: open, nextDay: next)
    }

    private static func day(
        of club: String, star: String, on date: LocalDate, phase: OccurrencePhase
    ) -> Occurrence {
        Occurrence(
            id: "occ_\(club)_\(star)", clubID: club,
            star: Person(membershipID: "mem_\(star)", displayName: star, avatarVersion: nil),
            localDate: date, revealAt: now, closeAt: now, phase: phase)
    }

    private static func november(_ day: Int) -> LocalDate {
        LocalDate(year: 2026, month: 11, day: day)!
    }
}
