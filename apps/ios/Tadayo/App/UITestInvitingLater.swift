#if DEBUG
    import Foundation
    import TadayoCore

    extension UITestLaunch {
        /// The club calls for Ben in Sunday people, active with five members and a place free
        /// (`inviteLater`; handoff 8's frames 14 and 16): Invite someone proposes each name into an
        /// open revision Ben approves by proposing (FQ60), its roster version moving on by one, a
        /// link is made for each person on asking and a revoke revokes it, and the details stop
        /// offering a proposal at six. Its links are made up for the tests: no server ever made
        /// them. Every other call is `NoClubs`'.
        final class InvitingLater: ClubService, @unchecked Sendable {
            private static let sunday = ClubRef(
                id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
                myMembershipID: "mem_ben")
            private static let five: [(name: String, day: Weekday)] = [
                ("Ben", .monday), ("Maya", .tuesday), ("Alex", .wednesday), ("Sam", .thursday),
                ("Debby", .friday),
            ]
            static let listed = [
                ClubSummary(
                    ref: sunday, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
            ]

            private let none = NoClubs()
            private let lock = NSLock()
            private var candidates: [Candidate] = []
            /// The links made, which tells each one's id apart.
            private var made = 0
            /// The people proposed and removed, each a change of the roster.
            private var changes = 0

            private var clock: ServerClock { ServerClock(serverNow: Date(), receivedAt: .now) }

            private static func person(_ name: String) -> Person {
                Person(
                    membershipID: "mem_\(name.lowercased())", displayName: name, avatarVersion: nil)
            }

            /// The roster's version: the five's, then one more for each person proposed or
            /// removed. Read under the lock.
            private var version: Int { 5 + changes }

            /// The open revision, once someone is proposed. Read under the lock.
            private var revision: RosterRevision? {
                guard !candidates.isEmpty else { return nil }
                return RosterRevision(
                    id: "rev_\(version)", version: 1, club: Self.sunday, state: .open,
                    proposedBy: Self.person("Ben"), members: Self.five.map { Self.person($0.name) },
                    candidates: candidates, myDecision: .approved, supersededBy: nil)
            }

            func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
                guard clubID == Self.sunday.id else { throw .notFound }
                return lock.withLock {
                    ClubDetail(
                        serverClock: clock, club: Self.listed[0], rosterVersion: version,
                        canPropose: Self.five.count + candidates.count < 6,
                        openRevisionID: revision?.id)
                }
            }

            func members(of clubID: String) async throws(APIFailure) -> MemberList {
                guard clubID == Self.sunday.id else { throw .notFound }
                return lock.withLock {
                    MemberList(
                        serverClock: clock, club: Self.sunday,
                        members: Self.five.enumerated().map { index, member in
                            Member(
                                person: Self.person(member.name), position: index + 1, cover: nil,
                                nextDay: nil, nextUp: false)
                        },
                        openRevision: revision)
                }
            }

            func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
                guard clubID == Self.sunday.id else { throw .notFound }
                return ClubWeek(
                    serverClock: clock, club: Self.sunday,
                    assignments: Self.five.map {
                        WeekdayAssignment(weekday: $0.day, person: Self.person($0.name))
                    })
            }

            func propose(
                _ names: [String], in clubID: String, expectedRosterVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> RosterRevision {
                let answer: Result<RosterRevision, APIFailure> = lock.withLock {
                    guard clubID == Self.sunday.id else { return .failure(.notFound) }
                    guard expectedRosterVersion == version else {
                        return .failure(.versionConflict)
                    }
                    for name in names {
                        changes += 1
                        candidates.append(
                            Candidate(
                                id: "cand_\(changes)", name: name,
                                proposedBy: Self.person("Ben"), invitation: nil))
                    }
                    return revision.map { .success($0) } ?? .failure(.refused)
                }
                return try answer.get()
            }

            func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
                async throws(APIFailure) -> InvitationLink
            {
                let answer: InvitationLink? = lock.withLock {
                    guard clubID == Self.sunday.id,
                        let index = candidates.firstIndex(where: { $0.id == candidateID })
                    else { return nil }
                    made += 1
                    let invitation = CandidateInvitation(
                        id: "inv_\(candidateID)_\(made)", state: .live,
                        expiresAt: Date().addingTimeInterval(7 * 86_400))
                    let candidate = candidates[index]
                    candidates[index] = Candidate(
                        id: candidate.id, name: candidate.name, proposedBy: candidate.proposedBy,
                        invitation: invitation)
                    return InvitationLink(
                        invitationID: invitation.id, candidateID: candidateID,
                        url: URL(
                            string: "https://tadayo.app/i#" + String(format: "later%038d", index)),
                        expiresAt: invitation.expiresAt)
                }
                guard let answer else { throw .notFound }
                return answer
            }

            func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
                let revoked: Bool = lock.withLock {
                    guard
                        let index = candidates.firstIndex(where: {
                            $0.invitation?.id == invitationID && $0.invitation?.state == .live
                        }), let live = candidates[index].invitation
                    else { return false }
                    let candidate = candidates[index]
                    candidates[index] = Candidate(
                        id: candidate.id, name: candidate.name, proposedBy: candidate.proposedBy,
                        invitation: CandidateInvitation(
                            id: live.id, state: .revoked, expiresAt: live.expiresAt))
                    return true
                }
                guard revoked else { throw .notFound }
            }

            /// Ben's own candidate, before anyone joins: gone, and their place free (FQ148).
            func removeCandidate(_ candidateID: String) async throws(APIFailure) {
                let removed: Bool = lock.withLock {
                    guard let index = candidates.firstIndex(where: { $0.id == candidateID })
                    else { return false }
                    candidates.remove(at: index)
                    changes += 1
                    return true
                }
                guard removed else { throw .notFound }
            }

            func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
                async throws(APIFailure) -> ClubDetail
            { try await none.createClub(name: name, timezone: timezone, key: key) }

            func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
                try await none.rosterRevision(revisionID)
            }

            func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.approve(revisionID, expectedVersion: expectedVersion, key: key) }

            func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.decline(revisionID, expectedVersion: expectedVersion, key: key) }

            func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
                try await none.preview(token)
            }

            func accept(
                _ token: InvitationToken, revisionID: String, expectedVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> InvitationAcceptance {
                try await none.accept(
                    token, revisionID: revisionID, expectedVersion: expectedVersion, key: key)
            }
        }
    }
#endif
