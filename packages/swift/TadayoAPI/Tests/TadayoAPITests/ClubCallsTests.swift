import Foundation
import HTTPTypes
import OpenAPIRuntime
import TadayoCore
import Testing

@testable import TadayoAPI

/// Stage B1's club calls (docs/plans/ios-b1-clubs.md section 3), each against the contract's own
/// examples: every documented answer mapped, and the invitation's token only ever in a request
/// body (T7), a not-found kept neutral (T14), one key for every retry (T19).
@Suite struct ClubCallsTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    // The contract's link (createInvitation's `link` example).
    let token = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM"
    var invitation: InvitationToken { InvitationToken(secret: token)! }

    func api(_ transport: CannedTransport, auth: RefreshingAuth = RefreshingAuth())
        -> TadayoAPIClient
    {
        TadayoAPIClient.testing(transport, auth: auth, at: start)
    }

    func example(_ name: String) -> CannedTransport.Answer {
        .json(name.hasPrefix("create") || name.hasPrefix("propose") ? 201 : 200, example: name)
    }

    func instant(_ text: String) -> Date {
        try! Date(text, strategy: .iso8601)
    }

    let ben = Person(membershipID: "mem_kt_ben", displayName: "Ben", avatarVersion: "av_ben_1")
    let kitchenTable = ClubRef(
        id: "club_kitchen_table", name: "Kitchen table", timezone: "America/New_York",
        myMembershipID: "mem_kt_ben")

    // MARK: The clubs

    @Test func theListCarriesEachClubWithItsDays() async throws {
        let list = try await api(CannedTransport([example("listClubs.two_clubs")])).clubs()
        #expect(list.serverClock.serverNow == instant("2026-11-06T14:41:00Z"))
        #expect(list.invitations.isEmpty)
        #expect(list.clubs.map(\.name) == ["Sunday people", "Kitchen table"])
        let sunday = try #require(list.clubs.first)
        #expect(
            sunday.ref
                == ClubRef(
                    id: "club_sunday_people", name: "Sunday people", timezone: "America/New_York",
                    myMembershipID: "mem_sp_ben"))
        #expect(sunday.state == .active)
        #expect(sunday.memberCount == 6)
        #expect(
            sunday.openDay
                == Occurrence(
                    id: "occ_sp_debby_2026_11_06", clubID: "club_sunday_people",
                    star: Person(
                        membershipID: "mem_sp_debby", displayName: "Debby",
                        avatarVersion: "av_debby_1"),
                    localDate: LocalDate(year: 2026, month: 11, day: 6)!,
                    revealAt: instant("2026-11-06T12:00:00Z"),
                    closeAt: instant("2026-11-07T06:00:00Z"), phase: .open))
        #expect(sunday.nextDay?.star.displayName == "Nina")
        #expect(sunday.nextDay?.star.avatarVersion == nil)
        #expect(sunday.nextDay?.phase == .collecting)
        let kitchen = try #require(list.clubs.last)
        #expect(kitchen.openDay == nil)
        #expect(kitchen.memberCount == 5)
    }

    @Test func anInvitationWaitingOnItsMembersIsListedWithNothingElse() async throws {
        let list = try await api(CannedTransport([example("listClubs.waiting_to_join")])).clubs()
        #expect(list.clubs.isEmpty)
        #expect(
            list.invitations == [
                MyInvitation(
                    invitationID: "inv_kt_leila", clubName: "Kitchen table", inviterName: "Ben",
                    state: .waiting)
            ])
        #expect(!list.isEmpty)
    }

    @Test func eachInvitationStateIsRead() async throws {
        for (state, read) in [
            ("waiting", MyInvitationState.waiting), ("roster_changed", .rosterChanged),
            ("did_not_go_ahead", .didNotGoAhead),
        ] {
            let body =
                #"{"server_now":"2026-11-06T14:41:00Z","clubs":[],"invitations":[{"invitation_id":"inv_1","club_name":"Kitchen table","inviter_name":"Ben","state":"\#(state)"}]}"#
            let list = try await api(CannedTransport([.json(200, body)])).clubs()
            #expect(list.invitations.first?.state == read)
        }
    }

    @Test func aDayWhoseDateIsNotADateIsUnreadable() async {
        let body = ContractExample.json("listClubs.two_clubs")
            .replacingOccurrences(
                of: #""local_date":"2026-11-06""#, with: #""local_date":"Friday""#)
        await #expect(throws: APIFailure.unreadable) {
            try await api(CannedTransport([.json(200, body)])).clubs()
        }
    }

    // MARK: Creating a club

    @Test func creatingAClubSendsItsNameAndTheDevicesZoneAlone() async throws {
        let transport = CannedTransport([example("createClub.created")])
        let key = IdempotencyKey.make(at: start)
        let detail = try await api(transport).createClub(
            name: "Sunday people", timezone: TimeZone(identifier: "America/New_York")!, key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/v1/clubs")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["name", "timezone"])
        #expect(sent.json["name"] as? String == "Sunday people")
        #expect(sent.json["timezone"] as? String == "America/New_York")
        #expect(detail.rosterVersion == 0)
        #expect(detail.canPropose)
        #expect(detail.openRevisionID == nil)
        #expect(detail.club.state == .proposed)
        #expect(detail.club.memberCount == 1)
        #expect(detail.club.ref.myMembershipID == "mem_sp_ben")
        #expect(detail.serverClock.serverNow == instant("2026-11-06T14:41:00Z"))
    }

    // MARK: Club information and members

    @Test func clubInformationCarriesTheRosterVersionAndTheOpenRevision() async throws {
        let transport = CannedTransport([example("getClub.kitchen_table")])
        let detail = try await api(transport).club("club_kitchen_table")
        #expect(transport.sent.first?.request.method == .get)
        #expect(transport.sent.first?.request.path == "/v1/clubs/club_kitchen_table")
        #expect(detail.club.ref == kitchenTable)
        #expect(detail.rosterVersion == 5)
        #expect(!detail.canPropose)
        #expect(detail.openRevisionID == "rev_kt_leila")
    }

    @Test func theMembersComeInTheServersOrderWithTheirNextDays() async throws {
        let transport = CannedTransport([example("listMembers.sunday_people")])
        let list = try await api(transport).members(of: "club_sunday_people")
        #expect(transport.sent.first?.request.path == "/v1/clubs/club_sunday_people/members")
        #expect(list.club.myMembershipID == "mem_sp_ben")
        #expect(
            list.members.map(\.person.displayName) == [
                "Ben", "Maya", "Alex", "Sam", "Debby", "Nina",
            ])
        #expect(list.members.map(\.position) == [1, 2, 3, 4, 5, 6])
        #expect(list.members.map(\.cover) == [1, 2, 3, 4, 5, 6])
        #expect(list.members.filter(\.nextUp).map(\.person.displayName) == ["Nina"])
        #expect(list.members.first?.nextDay?.localDate == LocalDate(year: 2026, month: 11, day: 9))
        #expect(list.openRevision == nil)
    }

    @Test func aMemberWithNoDayYetHasNone() async throws {
        let list = try await api(CannedTransport([example("listMembers.first_days")]))
            .members(of: "club_sunday_people")
        #expect(
            list.members.filter { $0.nextDay == nil }.map(\.person.displayName) == ["Ben", "Debby"])
    }

    @Test func theMembersCarryTheOpenRevision() async throws {
        let list = try await api(CannedTransport([example("listMembers.kitchen_table")]))
            .members(of: "club_kitchen_table")
        let revision = try #require(list.openRevision)
        #expect(revision.id == "rev_kt_leila")
        #expect(revision.candidates.map(\.name) == ["Leila"])
    }

    @Test func theMembersAreInPositionOrderWhateverOrderTheyCameIn() async throws {
        var answer = try #require(
            try JSONSerialization.jsonObject(
                with: Data(ContractExample.json("listMembers.sunday_people").utf8))
                as? [String: Any])
        let members = try #require(answer["members"] as? [Any])
        answer["members"] = Array(members.reversed())
        let body = try JSONSerialization.data(withJSONObject: answer)
        let list = try await api(
            CannedTransport([.json(200, String(decoding: body, as: UTF8.self))])
        ).members(of: "club_sunday_people")
        #expect(
            list.members.map(\.person.displayName) == [
                "Ben", "Maya", "Alex", "Sam", "Debby", "Nina",
            ])
    }

    // MARK: The club's week

    @Test func theWeekCarriesEachMembersDayInForceToday() async throws {
        let transport = CannedTransport([example("getSchedule.sunday_people")])
        let week = try await api(transport).schedule(of: "club_sunday_people")
        #expect(transport.sent.first?.request.method == .get)
        #expect(transport.sent.first?.request.path == "/v1/clubs/club_sunday_people/schedule")
        #expect(week.serverClock.serverNow == instant("2026-11-06T14:41:00Z"))
        #expect(week.club.myMembershipID == "mem_sp_ben")
        #expect(week.assignments.map(\.weekday) == Weekday.allCases)
        #expect(
            week.assignments.map(\.person.displayName) == [
                "Ben", "Maya", "Alex", "Sam", "Debby", "Nina",
            ])
        #expect(
            week.assignments.first?.person
                == Person(membershipID: "mem_sp_ben", displayName: "Ben", avatarVersion: "av_ben_1")
        )
    }

    @Test func aWeekWithAProposalIsReadForItsCurrentDaysAlone() async throws {
        let week = try await api(CannedTransport([example("getSchedule.new_member")]))
            .schedule(of: "club_kitchen_table")
        // Friday, free and proposed for Leila, isn't a day in force.
        #expect(
            week.assignments.map(\.weekday) == [
                .monday, .tuesday, .wednesday, .thursday, .saturday,
            ])
        #expect(!week.assignments.contains { $0.person.displayName == "Leila" })
    }

    @Test func aWeekWithNoDayInForceHasNone() async throws {
        let answer = #"""
            {"server_now":"2026-11-06T14:41:00Z","club":{"id":"club_sunday_people","name":"Sunday people","timezone":"America/New_York","my_membership_id":"mem_sp_ben"}}
            """#
        let week = try await api(CannedTransport([.json(200, answer)]))
            .schedule(of: "club_sunday_people")
        #expect(week.assignments.isEmpty)
    }

    @Test func aListWithNoClubIsEmpty() async throws {
        let list = try await api(CannedTransport([example("listClubs.no_club")])).clubs()
        #expect(list.isEmpty)
        #expect(list.clubs.isEmpty)
        #expect(list.invitations.isEmpty)
    }

    @Test func anActiveClubCarriesTheDayOpenNowAndTheNext() async throws {
        let detail = try await api(CannedTransport([example("getClub.sunday_people")]))
            .club("club_sunday_people")
        #expect(detail.club.state == .active)
        #expect(detail.club.memberCount == 6)
        #expect(detail.club.openDay?.star.displayName == "Debby")
        #expect(detail.club.openDay?.phase == .open)
        #expect(detail.club.openDay?.localDate == LocalDate(year: 2026, month: 11, day: 6))
        #expect(detail.club.nextDay?.star.displayName == "Nina")
        #expect(detail.openRevisionID == nil)
    }

    @Test func everyValueTheContractNamesHasItsOwnCase() {
        // A value the contract adds before `TadayoCore` knows it fails here, not as a refused
        // answer on a phone (the lanes' agreement: the app learns a value first).
        for state in Components.Schemas.ClubState.allCases {
            #expect(ClubState(state) != nil, "\(state)")
        }
        for phase in Components.Schemas.OccurrencePhase.allCases {
            #expect(OccurrencePhase(phase) != nil, "\(phase)")
        }
        for state in Components.Schemas.MyInvitationState.allCases {
            #expect(MyInvitationState(state) != nil, "\(state)")
        }
        for state in Components.Schemas.RosterRevisionState.allCases {
            #expect(RosterRevisionState(state) != nil, "\(state)")
        }
        for decision in Components.Schemas.RosterDecision.allCases {
            #expect(RosterDecision(decision) != nil, "\(decision)")
        }
        for state in Components.Schemas.CandidateLinkState.allCases {
            #expect(CandidateLinkState(state) != nil, "\(state)")
        }
    }

    // MARK: Proposing people and their links

    @Test func proposingSendsTheLabelsAndTheRosterVersionItRead() async throws {
        let transport = CannedTransport([example("proposeRoster.leila")])
        let key = IdempotencyKey.make(at: start)
        let revision = try await api(transport).propose(
            ["Leila"], in: "club_kitchen_table", expectedRosterVersion: 5, key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/v1/clubs/club_kitchen_table/roster")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["add", "expected_roster_version"])
        #expect(sent.json["expected_roster_version"] as? Int == 5)
        #expect((sent.json["add"] as? [[String: String]]) == [["label": "Leila"]])
        #expect(revision.id == "rev_kt_leila")
        #expect(revision.version == 1)
        #expect(revision.club == kitchenTable)
        #expect(revision.state == .open)
        #expect(revision.proposedBy == ben)
        #expect(revision.members.map(\.displayName) == ["Ben", "Alex", "Sam", "Nina", "Maya"])
        #expect(revision.myDecision == .approved)
        #expect(revision.supersededBy == nil)
        #expect(
            revision.candidates == [
                Candidate(
                    id: "cnd_kt_leila", name: "Leila", proposedBy: ben,
                    invitation: CandidateInvitation(
                        id: "inv_kt_leila", state: .live,
                        expiresAt: instant("2026-11-13T14:41:00Z")))
            ])
    }

    @Test func aLinkIsMadeForOneCandidateAndCarriesItsToken() async throws {
        let transport = CannedTransport([example("createInvitation.link")])
        let key = IdempotencyKey.make(at: start)
        let link = try await api(transport).createInvitation(
            for: "cnd_kt_leila", in: "club_kitchen_table", key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/v1/clubs/club_kitchen_table/invitations")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["candidate_id"])
        #expect(sent.json["candidate_id"] as? String == "cnd_kt_leila")
        #expect(link.invitationID == "inv_kt_leila")
        #expect(link.candidateID == "cnd_kt_leila")
        #expect(link.expiresAt == instant("2026-11-13T14:41:00Z"))
        let url = try #require(link.url)
        #expect(InvitationToken(url: url)?.secret == token)
    }

    @Test func aRetriedLinkAnswersWithoutItsURL() async throws {
        let link = try await api(CannedTransport([example("createInvitation.replayed")]))
            .createInvitation(for: "cnd_kt_leila", in: "club_kitchen_table", key: .make(at: start))
        #expect(link.url == nil)
        #expect(link.invitationID == "inv_kt_leila")
    }

    func linkAnswer(url: String, candidate: String = "cnd_kt_leila") -> CannedTransport.Answer {
        let body: [String: String] = [
            "invitation_id": "inv_kt_leila", "candidate_id": candidate, "url": url,
            "expires_at": "2026-11-13T14:41:00Z",
        ]
        let data = try! JSONSerialization.data(withJSONObject: body)
        return .json(201, String(decoding: data, as: UTF8.self))
    }

    @Test func aLinkThatIsNotExactlyAnInvitationLinkIsUnreadable() async {
        // The server's link is held to the contract's pattern character for character: none of
        // the leniencies a pasted link gets (spaces around it, the host's case), so the app never
        // stores or shares a link another phone would read differently.
        for url in [
            "https://example.com/i#\(token)", "https://tadayo.app/i?t=\(token)",
            "http://tadayo.app/i#\(token)", "https://tadayo.app/i#short",
            "https://tadayo.app/i#\(token)\n", " https://tadayo.app/i#\(token)",
            "HTTPS://TADAYO.APP/i#\(token)", "https://tadayo%2Eapp/i#\(token)",
            "https://tadayo.app:/i#\(token)",
        ] {
            await #expect(throws: APIFailure.unreadable, "\(url)") {
                try await api(CannedTransport([linkAnswer(url: url)])).createInvitation(
                    for: "cnd_kt_leila", in: "club_kitchen_table", key: .make(at: start))
            }
        }
    }

    @Test func aLinkForAnotherCandidateIsUnreadable() async {
        let answer = linkAnswer(url: "https://tadayo.app/i#\(token)", candidate: "cnd_kt_sam")
        await #expect(throws: APIFailure.unreadable) {
            try await api(CannedTransport([answer])).createInvitation(
                for: "cnd_kt_leila", in: "club_kitchen_table", key: .make(at: start))
        }
    }

    @Test func revokingDeletesTheLinkByItsID() async throws {
        let transport = CannedTransport([example("revokeInvitation.revoked")])
        try await api(transport).revokeInvitation("inv_kt_leila")
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .delete)
        #expect(sent.request.path == "/v1/invitations/inv_kt_leila")
        #expect(sent.body == nil)
    }

    @Test func removingACandidateDeletesThemByTheirIDWithNoKeyAndNoBody() async throws {
        let transport = CannedTransport([example("removeCandidate.removed")])
        try await api(transport).removeCandidate("cnd_kt_leila")
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .delete)
        #expect(sent.request.path == "/v1/candidates/cnd_kt_leila")
        #expect(sent.body == nil)
        // Repeating it answers the same and changes nothing, so it takes no key.
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == nil)
    }

    // MARK: A roster revision

    @Test func aRevisionShowsTheProposersLinkToTheProposerAlone() async throws {
        for (name, state) in [
            ("getRosterRevision.link_revoked", CandidateLinkState.revoked),
            ("getRosterRevision.link_expired", .expired),
            ("getRosterRevision.accepted", .accepted),
            ("getRosterRevision.another_name_proposer", .used),
        ] {
            let transport = CannedTransport([example(name)])
            let revision = try await api(transport).rosterRevision("rev_kt_leila")
            #expect(transport.sent.first?.request.path == "/v1/rosters/rev_kt_leila")
            #expect(revision.club.myMembershipID == "mem_kt_ben")
            #expect(revision.candidates.first?.invitation?.state == state, "\(name)")
        }
        let approver = try await api(CannedTransport([example("getRosterRevision.approve")]))
            .rosterRevision("rev_kt_leila")
        #expect(approver.club.myMembershipID == "mem_kt_maya")
        #expect(approver.myDecision == .pending)
        #expect(approver.candidates.first?.invitation == nil)
    }

    @Test func aRevisionForAnotherNameKeepsTheLinksProposer() async throws {
        let revision = try await api(
            CannedTransport([example("getRosterRevision.another_name_proposer")])
        ).rosterRevision("rev_kt_debby")
        #expect(revision.candidates.map(\.name) == ["Debby"])
        #expect(revision.proposedBy == ben)
        #expect(revision.myDecision == .pending)
    }

    @Test func aMemberSeesARevisionForAnotherNameWithoutItsLink() async throws {
        let revision = try await api(CannedTransport([example("getRosterRevision.another_name")]))
            .rosterRevision("rev_kt_debby")
        #expect(revision.club.myMembershipID == "mem_kt_maya")
        #expect(revision.candidates.map(\.name) == ["Debby"])
        #expect(revision.candidates.first?.proposedBy == ben)
        #expect(revision.candidates.first?.invitation == nil)
        #expect(revision.myDecision == .pending)
    }

    @Test func aSupersededRevisionNamesItsReplacement() async throws {
        let revision = try await api(CannedTransport([example("getRosterRevision.superseded")]))
            .rosterRevision("rev_kt_leila")
        #expect(revision.state == .superseded)
        #expect(revision.version == 2)
        #expect(revision.supersededBy == "rev_kt_debby")
    }

    @Test func approvingAndDecliningSendTheVersionSeen() async throws {
        let approving = CannedTransport([example("approveRoster.approved")])
        let key = IdempotencyKey.make(at: start)
        let approved = try await api(approving).approve(
            "rev_kt_leila", expectedVersion: 1, key: key)
        let sent = try #require(approving.sent.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/v1/rosters/rev_kt_leila/approvals")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["expected_version"])
        #expect(sent.json["expected_version"] as? Int == 1)
        #expect(approved.myDecision == .approved)
        #expect(approved.state == .open)

        let declining = CannedTransport([example("declineRoster.declined")])
        let declined = try await api(declining).decline(
            "rev_kt_leila", expectedVersion: 1, key: .make(at: start))
        #expect(declining.sent.first?.request.path == "/v1/rosters/rev_kt_leila/declines")
        #expect(declining.sent.first?.json.keys.sorted() == ["expected_version"])
        #expect(declined.state == .didNotGoAhead)
        #expect(declined.myDecision == .declined)
    }

    // MARK: An invitation

    @Test func theTokenTravelsOnlyInTheBody() async throws {
        let transport = CannedTransport([
            example("previewInvitation.open"), example("acceptInvitation.waiting"),
        ])
        let client = api(transport)
        _ = try await client.preview(invitation)
        _ = try await client.accept(
            invitation, revisionID: "rev_kt_leila", expectedVersion: 1, key: .make(at: start))
        #expect(
            transport.sent.map(\.request.path) == [
                "/v1/invitations/preview", "/v1/invitations/accept",
            ])
        for sent in transport.sent {
            #expect(sent.request.method == .post)
            #expect(!(sent.request.path ?? "").contains(token))
            #expect(!(sent.request.path ?? "").contains("?"))
            for field in sent.request.headerFields {
                #expect(!field.value.contains(token), "\(field.name)")
            }
            #expect(sent.json["token"] as? String == token)
        }
        #expect(transport.sent[0].json.keys.sorted() == ["token"])
        #expect(
            transport.sent[1].json.keys.sorted() == ["expected_version", "revision_id", "token"])
        #expect(transport.sent[1].json["revision_id"] as? String == "rev_kt_leila")
        #expect(transport.sent[1].json["expected_version"] as? Int == 1)
    }

    @Test func anOpenInvitationShowsTheExactRosterAndNothingElse() async throws {
        let preview = try await api(CannedTransport([example("previewInvitation.open")]))
            .preview(invitation)
        let others = ["Ben", "Alex", "Sam", "Nina", "Maya"].map {
            InvitationRosterEntry(name: $0, kind: .member, isYou: false)
        }
        #expect(
            preview
                == .open(
                    InvitationRoster(
                        invitationID: "inv_kt_leila", inviterName: "Ben",
                        clubName: "Kitchen table", revisionID: "rev_kt_leila", revisionVersion: 1,
                        roster: others + [
                            InvitationRosterEntry(name: "Leila", kind: .candidate, isYou: true)
                        ],
                        expiresAt: instant("2026-11-13T14:41:00Z"))))
    }

    @Test func eachPreviewBecomesItsState() async throws {
        func read(_ name: String) async throws -> InvitationPreview {
            try await api(CannedTransport([example(name)])).preview(invitation)
        }
        guard case .changed(let changed) = try await read("previewInvitation.changed") else {
            Issue.record("changed")
            return
        }
        #expect(changed.revisionID == "rev_kt_leila_2")
        guard case .changed(let renamed) = try await read("previewInvitation.another_name") else {
            Issue.record("another_name")
            return
        }
        #expect(
            renamed.roster.last
                == InvitationRosterEntry(name: "Debby", kind: .candidate, isYou: true))
        guard case .waiting(let waiting) = try await read("previewInvitation.waiting") else {
            Issue.record("waiting")
            return
        }
        #expect(waiting.expiresAt == nil)
        #expect(waiting.revisionVersion == 1)
        #expect(try await read("previewInvitation.expired") == .expired(inviterName: "Ben"))
        #expect(try await read("previewInvitation.full") == .full(inviterName: "Ben"))
        #expect(
            try await read("previewInvitation.did_not_go_ahead")
                == .didNotGoAhead(inviterName: "Ben"))
        #expect(
            try await read("previewInvitation.joined")
                == .joined(
                    ClubRef(
                        id: "club_kitchen_table", name: "Kitchen table",
                        timezone: "America/New_York", myMembershipID: "mem_kt_maya")))
    }

    @Test func eachAcceptanceBecomesItsState() async throws {
        func accept(_ name: String) async throws -> InvitationAcceptance {
            try await api(CannedTransport([example(name)])).accept(
                invitation, revisionID: "rev_kt_leila", expectedVersion: 1, key: .make(at: start))
        }
        #expect(try await accept("acceptInvitation.waiting") == .waiting)
        #expect(try await accept("acceptInvitation.another_name") == .changed)
        #expect(
            try await accept("acceptInvitation.joined")
                == .joined(
                    ClubRef(
                        id: "club_kitchen_table", name: "Kitchen table",
                        timezone: "America/New_York", myMembershipID: "mem_kt_leila")))
    }

    // MARK: Failures

    @Test func aNotFoundIsTheSameWhateverItWasFor() async {
        // T14: one answer for an unknown, revoked, replaced or used link, and for a club or
        // revision the caller can't see.
        let notFound = CannedTransport.Answer.json(404, #"{"code":"NOT_FOUND"}"#)
        for operation in ClubOperation.allCases where operation.documents404 {
            await #expect(throws: APIFailure.notFound, "\(operation)") {
                try await operation.call(on: api(CannedTransport([notFound])), self)
            }
        }
    }

    @Test func eachClubAnswerBecomesItsFailure() async {
        let error = { (code: String) in CannedTransport.Answer.json(409, #"{"code":"\#(code)"}"#) }
        let cases: [(ClubOperation, CannedTransport.Answer, APIFailure)] = [
            (.createClub, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            (.createClub, error("IDEMPOTENCY_CONFLICT"), .refused),
            (.createClub, .json(400, #"{"code":"INVALID_REQUEST","field":"timezone"}"#), .refused),
            (
                .createClub, .json(429, #"{"code":"RATE_LIMITED"}"#, ["Retry-After": "30"]),
                .unavailable
            ),
            (.club, .response(status: 503, body: "", headers: [:]), .unavailable),
            (.members, .failure, .network),
            (.members, .response(status: 418, body: "", headers: [:]), .refused),
            (
                .propose, .json(409, #"{"code":"VERSION_CONFLICT","current_version":6}"#),
                .versionConflict
            ),
            (.propose, error("CLUB_FULL"), .clubFull),
            (.propose, error("IDEMPOTENCY_CONFLICT"), .refused),
            (.createInvitation, .json(403, #"{"code":"NOT_ALLOWED"}"#), .notAllowed),
            (.createInvitation, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            (.revokeInvitation, .json(403, #"{"code":"NOT_ALLOWED"}"#), .notAllowed),
            (.removeCandidate, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            // NOT_ALLOWED isn't one of its codes: anyone but the proposer gets NOT_FOUND (T14).
            (.removeCandidate, .json(403, #"{"code":"NOT_ALLOWED"}"#), .refused),
            (.removeCandidate, .json(400, #"{"code":"INVALID_REQUEST"}"#), .refused),
            (
                .removeCandidate, .json(429, #"{"code":"RATE_LIMITED"}"#, ["Retry-After": "30"]),
                .unavailable
            ),
            (.removeCandidate, .failure, .network),
            (.removeCandidate, .json(409, #"{"code":"VERSION_CONFLICT","current_version":2}"#), .refused),
            (.approve, error("ROSTER_CHANGED"), .rosterChanged),
            (.approve, error("CLUB_FULL"), .clubFull),
            (
                .approve, .json(409, #"{"code":"VERSION_CONFLICT","current_version":2}"#),
                .versionConflict
            ),
            (.decline, error("ROSTER_CHANGED"), .rosterChanged),
            (
                .decline, .json(409, #"{"code":"VERSION_CONFLICT","current_version":2}"#),
                .versionConflict
            ),
            (.preview, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            (
                .preview, .json(429, #"{"code":"RATE_LIMITED"}"#, ["Retry-After": "30"]),
                .unavailable
            ),
            (.accept, .json(410, #"{"code":"INVITATION_EXPIRED"}"#), .invitationExpired),
            // A refusal whose body this build can't read is still a refusal (audit A8).
            (.propose, error("SOMETHING_NEW"), .refused),
            (.accept, .json(410, "not json"), .refused),
            (.accept, error("ROSTER_CHANGED"), .rosterChanged),
            (.accept, error("CLUB_FULL"), .clubFull),
            (
                .accept, .json(409, #"{"code":"VERSION_CONFLICT","current_version":2}"#),
                .versionConflict
            ),
            (.accept, error("IDEMPOTENCY_CONFLICT"), .refused),
            (.revokeInvitation, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            (.rosterRevision, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            // A code the operation doesn't document for that status is refused, whatever it
            // names, as `clubs()` refuses one (`TadayoAPIClientTests`).
            (.club, .json(403, #"{"code":"NOT_ALLOWED"}"#), .refused),
            (.members, .json(403, #"{"code":"UNAUTHENTICATED"}"#), .refused),
            (.schedule, .json(403, #"{"code":"PROFILE_INCOMPLETE"}"#), .profileIncomplete),
            (.schedule, .json(403, #"{"code":"NOT_ALLOWED"}"#), .refused),
            (.schedule, .response(status: 503, body: "", headers: [:]), .unavailable),
            (.schedule, .failure, .network),
            (.schedule, .response(status: 418, body: "", headers: [:]), .refused),
            (.schedule, .json(409, #"{"code":"VERSION_CONFLICT","current_version":2}"#), .refused),
            (.accept, .json(403, #"{"code":"NOT_ALLOWED"}"#), .refused),
            (.createClub, error("VERSION_CONFLICT"), .refused),
            (.createInvitation, error("CLUB_FULL"), .refused),
            (.propose, error("ROSTER_CHANGED"), .refused),
            (.decline, error("CLUB_FULL"), .refused),
            (.approve, error("UNAUTHENTICATED"), .refused),
            (.approve, error("NOT_FOUND"), .refused),
        ]
        for (operation, answer, failure) in cases {
            await #expect(throws: failure, "\(operation) \(answer)") {
                try await operation.call(on: api(CannedTransport([answer])), self)
            }
        }
    }

    @Test func anAnswerThatBreaksTheContractIsUnreadable() async {
        // Unreadable, not refused: a 2xx the build can't read may still be a command the server
        // carried out, so the action's retry keeps its key (T19; audit A8).
        let answers: [(ClubOperation, CannedTransport.Answer)] = [
            // A value the contract may add after this build: a new club state in a 201.
            (
                .createClub,
                .json(
                    201,
                    ContractExample.json("createClub.created").replacingOccurrences(
                        of: #""state":"proposed""#, with: #""state":"archived""#))
            ),
            (.createClub, .response(status: 200, body: "", headers: [:])),
            (.propose, .json(201, #"{"id":"rev_kt_leila"}"#)),
            (.accept, .json(200, "not json")),
            (.revokeInvitation, .json(200, #"{"invitation_id":"inv_kt_other","state":"revoked"}"#)),
            // An answer naming another candidate says nothing of this one.
            (.removeCandidate, .json(200, #"{"candidate_id":"cnd_kt_other","state":"removed"}"#)),
            (.removeCandidate, .json(200, #"{"candidate_id":"cnd_kt_leila","state":"ended"}"#)),
            (.removeCandidate, .json(200, "not json")),
            (.club, .json(200, #"{"server_now":"2026-11-06T14:41:00Z"}"#)),
            (.preview, .json(200, #"{"state":"open"}"#)),
            (
                .schedule,
                .json(
                    200,
                    ContractExample.json("getSchedule.sunday_people").replacingOccurrences(
                        of: #""weekday": "monday""#, with: #""weekday": "sunday""#
                    )
                    .replacingOccurrences(
                        of: #""weekday":"monday""#, with: #""weekday":"sunday""#))
            ),
            (.preview, .json(200, #"{"state":"pending"}"#)),
            (.accept, .json(200, #"{"invitation_id":"inv_kt_leila","state":"approved"}"#)),
            (
                .rosterRevision,
                .response(
                    status: 200, body: ContractExample.json("getRosterRevision.approve"),
                    headers: ["Content-Type": "application/json"])
            ),
        ]
        for (operation, answer) in answers {
            await #expect(throws: APIFailure.unreadable, "\(operation)") {
                try await operation.call(on: api(CannedTransport([answer])), self)
            }
        }
    }

    @Test func aRetriedCommandSendsTheSameKeyAndBody() async throws {
        let unauthenticated = CannedTransport.Answer.json(401, #"{"code":"UNAUTHENTICATED"}"#)
        for operation in ClubOperation.allCases where operation.isCommand {
            let auth = RefreshingAuth([
                .success(
                    AuthSession(
                        accessToken: "access-2", refreshToken: "refresh-2",
                        expiresAt: start.addingTimeInterval(7200)))
            ])
            let transport = CannedTransport([unauthenticated, example(operation.example)])
            // A key the action made a minute before the call, so no key the call could make
            // for itself matches it.
            let key = IdempotencyKey.make(at: start.addingTimeInterval(-60))
            try await operation.call(on: api(transport, auth: auth), self, key: key)
            let header = HTTPField.Name("Idempotency-Key")!
            #expect(transport.sent.count == 2, "\(operation)")
            #expect(transport.sent.map(\.bearer) == ["Bearer access-1", "Bearer access-2"])
            #expect(
                transport.sent.map { $0.request.headerFields[header] }
                    == [key.description, key.description], "\(operation)")
            #expect(transport.sent.first?.body == transport.sent.last?.body, "\(operation)")
        }
    }

    @Test func aReadRejectedAgainAfterTheRefreshSignsOut() async {
        // The token is refreshed once and the read sent again; a second 401 ends the session,
        // as for the account's own calls (`TadayoAPIClientTests.aSecondRejectionSignsOut`).
        let unauthenticated = CannedTransport.Answer.json(401, #"{"code":"UNAUTHENTICATED"}"#)
        for operation in ClubOperation.allCases where !operation.isCommand {
            let auth = RefreshingAuth([
                .success(
                    AuthSession(
                        accessToken: "access-2", refreshToken: "refresh-2",
                        expiresAt: start.addingTimeInterval(7200)))
            ])
            let transport = CannedTransport([unauthenticated, unauthenticated])
            await #expect(throws: APIFailure.signedOut, "\(operation)") {
                try await operation.call(on: api(transport, auth: auth), self)
            }
            #expect(
                transport.sent.map(\.bearer) == ["Bearer access-1", "Bearer access-2"],
                "\(operation)")
            #expect(auth.refreshes == 1, "\(operation)")
        }
    }

    @Test func aReadCarriesNoKey() async throws {
        for operation in ClubOperation.allCases where !operation.isCommand {
            let transport = CannedTransport([example(operation.example)])
            try await operation.call(on: api(transport), self)
            #expect(
                transport.sent.first?.request.headerFields[HTTPField.Name("Idempotency-Key")!]
                    == nil, "\(operation)")
        }
    }

    /// Each club call once, with the arguments the tests use, so a failure table can name them.
    enum ClubOperation: CaseIterable, CustomStringConvertible {
        case createClub, club, members, schedule, propose, createInvitation, revokeInvitation
        case removeCandidate, rosterRevision, approve, decline, preview, accept

        var description: String { example }

        /// The contract example that answers it.
        var example: String {
            switch self {
            case .createClub: "createClub.created"
            case .club: "getClub.kitchen_table"
            case .members: "listMembers.kitchen_table"
            case .schedule: "getSchedule.sunday_people"
            case .propose: "proposeRoster.leila"
            case .createInvitation: "createInvitation.link"
            case .revokeInvitation: "revokeInvitation.revoked"
            case .removeCandidate: "removeCandidate.removed"
            case .rosterRevision: "getRosterRevision.approve"
            case .approve: "approveRoster.approved"
            case .decline: "declineRoster.declined"
            case .preview: "previewInvitation.open"
            case .accept: "acceptInvitation.waiting"
            }
        }

        /// The operations that carry an idempotency key.
        var isCommand: Bool {
            switch self {
            case .createClub, .propose, .createInvitation, .approve, .decline, .accept: true
            default: false
            }
        }

        /// Every one but creating a club, whose answers the contract lists without a 404.
        var documents404: Bool { self != .createClub }

        func call(on api: TadayoAPIClient, _ test: ClubCallsTests, key: IdempotencyKey? = nil)
            async throws
        {
            let key = key ?? IdempotencyKey.make(at: test.start)
            switch self {
            case .createClub:
                _ = try await api.createClub(
                    name: "Sunday people", timezone: TimeZone(identifier: "America/New_York")!,
                    key: key)
            case .club: _ = try await api.club("club_kitchen_table")
            case .members: _ = try await api.members(of: "club_kitchen_table")
            case .schedule: _ = try await api.schedule(of: "club_sunday_people")
            case .propose:
                _ = try await api.propose(
                    ["Leila"], in: "club_kitchen_table", expectedRosterVersion: 5, key: key)
            case .createInvitation:
                _ = try await api.createInvitation(
                    for: "cnd_kt_leila", in: "club_kitchen_table", key: key)
            case .revokeInvitation: try await api.revokeInvitation("inv_kt_leila")
            case .removeCandidate: try await api.removeCandidate("cnd_kt_leila")
            case .rosterRevision: _ = try await api.rosterRevision("rev_kt_leila")
            case .approve: _ = try await api.approve("rev_kt_leila", expectedVersion: 1, key: key)
            case .decline: _ = try await api.decline("rev_kt_leila", expectedVersion: 1, key: key)
            case .preview: _ = try await api.preview(test.invitation)
            case .accept:
                _ = try await api.accept(
                    test.invitation, revisionID: "rev_kt_leila", expectedVersion: 1, key: key)
            }
        }
    }
}

extension CannedTransport.Answer {
    /// The contract's example `name`, as the API sends it.
    static func json(_ status: Int, example name: String) -> Self {
        .json(status, ContractExample.json(name))
    }
}

extension TadayoAPIClient {
    /// A client for the tests, on `transport`, with a session stored at `start` whose token is
    /// `access-1` for an hour.
    static func testing(
        _ transport: CannedTransport, auth: RefreshingAuth = RefreshingAuth(),
        stored: AuthSession? = nil, at start: Date
    ) -> TadayoAPIClient {
        let session =
            stored
            ?? AuthSession(
                accessToken: "access-1", refreshToken: "refresh-1",
                expiresAt: start.addingTimeInterval(3600))
        return TadayoAPIClient(
            serverURL: URL(string: "https://api-dev.tadayo.app")!,
            session: SessionManager(
                auth: auth, store: InMemorySessionStore(session), now: { start }),
            transport: transport)
    }
}
