import Foundation
import Observation

/// Club details and its members list, for one club (G05-club-details, G05-members and
/// G05-members-two-days; `docs/plans/ios-b1-club-details.md` section 1). `RootModel.clubDetails()`
/// makes one for the selected club.
///
/// The two screens load and fail apart, each with its own words (handoff 8's
/// `loadStates.details` and `loadStates.members`), so each has its own state:
/// - `details`, from `GET /v1/clubs/{club_id}`; a suspended club is `.unavailable` with no call
///   (FQ80's default: the same "Club unavailable" as Home, with nothing of the club; T9);
/// - `members`, from `GET /v1/clubs/{club_id}/members` and `GET /v1/clubs/{club_id}/schedule`
///   together: the roster, and each member's weekday or two, which `listMembers` doesn't hold
///   (its `next_day` is one day).
///
/// An answer counts only while `current` says so (the session it was asked in hasn't ended and
/// the club is still the selected one) and while the read wasn't cancelled: a screen that went
/// away before its answer came gets none, and a read cancelled on the way, which the client
/// gives as a network failure, shows no failure. A later read of the same screen drops an earlier
/// one's answer. A not found means the club is no longer the caller's to read (left, suspended
/// or gone: T9, T14): the model is `closed`, which closes the screens showing it, and `gone` has
/// the list read again, which decides. A `signedOut` answer ends the session (`signedOut`), as
/// everywhere else. Nothing is written anywhere: the answers live in this model, in memory, until
/// the tabs let it go (the next Club details opened, or the session's end). The one exception is
/// the account's kept invitation links (`links`): each members answer settles them, as the setup
/// list's does, so a candidate who joined has their link purged even when the setup list isn't
/// opened again (ADR-037).
@MainActor @Observable public final class ClubDetailsModel {
    /// Why a read failed, which picks the line under the failure's title: the network's ("Check
    /// your connection and try again.") or a refusal's ("Try again."; handoff 8's
    /// `networkBodyKey` and `refusalBodyKey`).
    public enum Failure: Sendable, Equatable {
        case network
        case refused
    }

    public enum Details: Sendable, Equatable {
        case loading
        case loaded(ClubDetail)
        case failed(Failure)
        /// A suspended club: nothing of it, and no call (T9, FQ80).
        case unavailable
    }

    public enum Members: Sendable, Equatable {
        case loading
        case loaded(Roster)
        case failed(Failure)
    }

    /// The club as the list had it when the model was made.
    public let club: ClubSummary
    public private(set) var details: Details
    public private(set) var members = Members.loading
    /// A read answered not found: the club is no longer the caller's to read, so nothing of it
    /// stays on screen (T9). The screens close on it, whenever the list's own read answers.
    public private(set) var closed = false

    let service: any ClubService
    /// The account's kept invitation links, which each members answer settles (ADR-037).
    let links: (book: InvitationLinkBook, accountID: String)?
    let current: @MainActor () -> Bool
    let gone: @MainActor () async -> Void
    let signedOut: @MainActor () async -> Void
    private var detailReads = 0
    private var memberReads = 0

    public init(
        club: ClubSummary, service: any ClubService,
        links: (book: InvitationLinkBook, accountID: String)? = nil,
        current: @escaping @MainActor () -> Bool = { true },
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) {
        self.club = club
        self.service = service
        self.links = links
        self.current = current
        self.gone = gone
        self.signedOut = signedOut
        details = club.state == .suspended ? .unavailable : .loading
    }

    /// Club details, when it shows and on its Retry.
    public func loadDetails() async {
        guard club.state != .suspended else {
            details = .unavailable
            return
        }
        detailReads += 1
        let asked = detailReads
        details = .loading
        let answer = await Self.result { [service, club] () async throws(APIFailure) in
            try await service.club(club.id)
        }
        guard !Task.isCancelled, current(), asked == detailReads else { return }
        switch answer {
        case .success(let detail):
            details = .loaded(detail)
        case .failure(let failure):
            if let failed = await settle(failure) { details = .failed(failed) }
        }
    }

    /// The members list, when it shows and on its Retry: the roster and the club's week, read
    /// together, since the list needs both.
    public func loadMembers() async {
        guard club.state != .suspended else { return }
        memberReads += 1
        let asked = memberReads
        members = .loading
        let stamp = links?.book.beginRead()
        let id = club.id
        async let list = Self.result { [service] () async throws(APIFailure) in
            try await service.members(of: id)
        }
        async let week = Self.result { [service] () async throws(APIFailure) in
            try await service.schedule(of: id)
        }
        let answers = await (list, week)
        guard !Task.isCancelled, current() else { return }
        // The members answer settles the kept links whichever read is latest: it's the server's
        // word on them as of its request (ADR-037), whatever the week's read answered.
        if let links, let stamp {
            switch answers.0 {
            case .success(let roster):
                links.book.settle(roster, stamp: stamp, account: links.accountID)
            case .failure(.notFound):
                links.book.settleGone(club: id, stamp: stamp, account: links.accountID)
            case .failure:
                break
            }
        }
        guard asked == memberReads else { return }
        switch answers {
        case (.success(let list), .success(let week)):
            members = .loaded(Roster(list, week: week))
        case (.failure(let failure), _), (_, .failure(let failure)):
            // Either failing fails the list. A session ended, then a not found, from either,
            // decides over any other failure, in whichever order the two answered: each says the
            // same of the club or the session.
            let worst = Self.decisive(answers.0.failure, answers.1.failure) ?? failure
            if let failed = await settle(worst) { members = .failed(failed) }
        }
    }

    /// What a failed read leads to: the model closed and the list read again for a club no
    /// longer the caller's, the session ended for a `signedOut` answer (neither shows a
    /// failure), or the failure the screen shows.
    private func settle(_ failure: APIFailure) async -> Failure? {
        switch failure {
        case .notFound:
            closed = true
            await gone()
            return nil
        case .signedOut:
            await signedOut()
            return nil
        case .network:
            return .network
        default:
            return .refused
        }
    }

    /// Of two reads' failures, the one that decides more than the screen: a session ended, then
    /// a club no longer the caller's.
    private static func decisive(_ first: APIFailure?, _ second: APIFailure?) -> APIFailure? {
        let both = [first, second].compactMap { $0 }
        return both.first { $0 == .signedOut } ?? both.first { $0 == .notFound }
    }

    private nonisolated static func result<T: Sendable>(
        _ body: @Sendable () async throws(APIFailure) -> T
    ) async -> Result<T, APIFailure> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }
}

/// The members list as Members shows it (G05-members): the roster in the server's stable order
/// (spec 09: never re-sorted by anything else), each member with whether they're the viewer and
/// their weekdays, Monday first, from the club's week in force today.
///
/// The roster and the week are two reads, so a member's days are matched by membership id: a
/// member the week gives none shows the name alone (T49), and a day of someone the roster
/// doesn't list is dropped. The roster, its count and its club are the one `listMembers` answer
/// (handoff 4's `membersFooter`: "updates from one authorized server snapshot"). Nothing in it
/// comes from drops (T55). The days are the week's `current` as the server gives it to this
/// caller (the contract's `Schedule`): in first days opened again with a week of their own, a
/// member's own confirmed days are in the proposal only, which this list doesn't read, until the
/// new week starts (FQ124).
public struct Roster: Sendable, Equatable {
    public struct Row: Sendable, Equatable, Identifiable {
        public let person: Person
        public let isViewer: Bool
        /// Monday first; empty while they have no day in force.
        public let weekdays: [Weekday]

        public var id: String { person.membershipID }

        public init(person: Person, isViewer: Bool, weekdays: [Weekday]) {
            self.person = person
            self.isViewer = isViewer
            self.weekdays = weekdays
        }
    }

    /// How many days each member has, when every member listed has the same: the subtitle
    /// Members shows ("Each person has a day.", "Two reveal days each.").
    public enum Days: Sendable, Equatable {
        case one
        case two
    }

    public let club: ClubRef
    public let rows: [Row]

    public init(_ list: MemberList, week: ClubWeek) {
        club = list.club
        rows = list.members.sorted { $0.position < $1.position }.map { member in
            let id = member.person.membershipID
            return Row(
                person: member.person, isViewer: id == list.club.myMembershipID,
                weekdays: week.assignments.filter { $0.person.membershipID == id }.map(\.weekday)
                    .sorted())
        }
    }

    /// `.one` when every member has one weekday, `.two` when every member has two, and nil
    /// otherwise: someone with none (a club's first days before everyone has confirmed, say) or
    /// a mix. The subtitle is shown only when the roster bears it out (T43, T49): handoff 1's
    /// check found "Each person has a day." untrue in a pair.
    public var days: Days? {
        let counts = Set(rows.map(\.weekdays.count))
        guard counts.count == 1, let count = counts.first else { return nil }
        switch count {
        case 1: return .one
        case 2: return .two
        default: return nil
        }
    }
}

extension Result {
    fileprivate var failure: Failure? {
        if case .failure(let failure) = self { return failure }
        return nil
    }
}
