import Foundation
import TadayoCore

/// The clubs the tabs' snapshots and readings draw, each frame its own fixture, never one
/// timeline (book p12): Sunday people, which Ben created and which hasn't started
/// (`H01-awaiting-activation`, `G06-switcher-status`), or suspended (`H01-unavailable`,
/// `G06-switcher-unavailable`), or active with Debby's Friday open (2.1's `G06-switcher`); and
/// Kitchen table active with its five members and Maya's day next (`G06-switcher`,
/// `G06-switcher-unavailable`), or with Ben alone and paused (`G06-switcher-status`). Sunday
/// people's proposed roster, Ben's own and the one the server made for Debby's name, is the
/// creator's (`G05-members-proposed`, `-approve`).
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

    /// Kitchen table's invitation from Maya, which the account accepted and which hasn't become a
    /// membership: waiting on the members, its roster changed, or not gone ahead (handoff 9's
    /// frames 7 to 11, which draw Kitchen table and name the account Leila, whom the app's
    /// fixtures don't have: Ben stands in). `linkHeld` says whether this phone holds its link.
    static func kitchenInvitation(
        _ state: MyInvitationState, linkHeld: Bool = false
    ) -> AcceptedInvitation {
        AcceptedInvitation(
            MyInvitation(
                invitationID: "inv_kitchen", clubName: "Kitchen table", inviterName: "Maya",
                state: state),
            linkHeld: linkHeld)
    }

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

    /// Kitchen table active with its five, Maya the viewer, and Ben's proposal of Leila open, with
    /// Alex's of Nina in it for FQ144's two candidates (G03-approve: handoffs 4 and 8; FQ54, FQ60).
    static func kitchenRevision(nina: Bool = false, decision: RosterDecision = .pending)
        -> RosterRevision
    {
        let people = ["Ben", "Maya", "Alex", "Sam", "Debby"].map {
            Person(membershipID: "mem_\($0)", displayName: $0, avatarVersion: nil)
        }
        var candidates = [
            Candidate(id: "cand_leila", name: "Leila", proposedBy: people[0], invitation: nil)
        ]
        if nina {
            candidates.append(
                Candidate(id: "cand_nina", name: "Nina", proposedBy: people[2], invitation: nil))
        }
        return RosterRevision(
            id: "rev_leila", version: 3, club: kitchenAsMaya, state: .open, proposedBy: people[0],
            members: people, candidates: candidates, myDecision: decision, supersededBy: nil)
    }

    /// Kitchen table's five, one day each, Maya the viewer, with `open` as its open revision.
    static func kitchenRoster(open: RosterRevision?) -> Roster {
        roster(
            "club_kitchen", "Kitchen table",
            [
                ("Ben", [.monday]), ("Maya", [.tuesday]), ("Alex", [.wednesday]),
                ("Sam", [.thursday]), ("Debby", [.friday]),
            ], viewer: "Maya", open: open)
    }

    private static let kitchenAsMaya = ClubRef(
        id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
        myMembershipID: "mem_Maya")

    /// Sunday people before it starts, Ben its creator and only member, with Ben's first roster
    /// open: Ben, then Maya, Alex, Sam, Debby and Nina as Ben proposed them, Ben's approval counted
    /// by proposing (FQ60; handoff 5's `G05-members-proposed`).
    static let sundayProposal = proposal(
        ["Maya", "Alex", "Sam", "Debby", "Nina"], id: "rev_sunday", version: 1, decision: .approved)

    /// The revision the server made when Debby accepted under a name Ben didn't give (FQ84), which
    /// Ben must approve (`G05-members-proposed-approve`, FQ145's default).
    static let sundayRenamed = proposal(
        ["Debby"], id: "rev_debby", version: 2, decision: .pending)

    /// Sunday people's proposed roster as Ben reads it: Ben, then `names` as candidates of the
    /// open revision `id` at `version`, with Ben's `decision` on it.
    private static func proposal(
        _ names: [String], id: String, version: Int, decision: RosterDecision
    ) -> ProposedRoster {
        let club = ClubRef(
            id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
            myMembershipID: "mem_Ben")
        let ben = Person(membershipID: "mem_Ben", displayName: "Ben", avatarVersion: nil)
        let revision = RosterRevision(
            id: id, version: version, club: club, state: .open, proposedBy: ben, members: [ben],
            candidates: names.map {
                Candidate(
                    id: "cand_\($0.lowercased())", name: $0, proposedBy: ben, invitation: nil)
            },
            myDecision: decision, supersededBy: nil)
        let list = MemberList(
            serverClock: ServerClock(serverNow: now, receivedAt: .now), club: club,
            members: [Member(person: ben, position: 1, cover: nil, nextDay: nil, nextUp: false)],
            openRevision: revision)
        return ProposedRoster(list, open: revision)
    }

    /// The roster of `id` with each name's weekdays, in that order, Ben the viewer unless
    /// `viewer` says, and `open` as its open revision.
    static func roster(
        _ id: String, _ name: String, _ days: [(String, [Weekday])], viewer: String = "Ben",
        open: RosterRevision? = nil
    ) -> Roster {
        let ref = ClubRef(
            id: id, name: name, timezone: "America/New_York", myMembershipID: "mem_\(viewer)")
        let clock = ServerClock(serverNow: now, receivedAt: .now)
        let people = days.map { name, _ in
            Person(membershipID: "mem_\(name)", displayName: name, avatarVersion: nil)
        }
        let members = MemberList(
            serverClock: clock, club: ref,
            members: people.enumerated().map { index, person in
                Member(person: person, position: index + 1, cover: nil, nextDay: nil, nextUp: false)
            },
            openRevision: open)
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
