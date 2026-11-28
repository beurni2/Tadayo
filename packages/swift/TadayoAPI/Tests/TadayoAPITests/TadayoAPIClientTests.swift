import Foundation
import HTTPTypes
import OpenAPIRuntime
import TadayoCore
import Testing

@testable import TadayoAPI

/// A transport that records each request and answers from a script, as the contract's examples
/// would come back from the API.
final class CannedTransport: ClientTransport, @unchecked Sendable {
    enum Answer {
        case response(status: Int, body: String, headers: [String: String])
        /// An answer whose body says whether anything read it (`BodyWatch`).
        case watched(status: Int, body: String, headers: [String: String], BodyWatch)
        case failure

        /// An answer as the contract has every one: JSON, for the caller alone.
        static func json(_ status: Int, _ body: String, _ extra: [String: String] = [:]) -> Answer {
            .response(
                status: status, body: body,
                headers: ["Content-Type": "application/json", "Cache-Control": "private, no-store"]
                    .merging(extra) { $1 })
        }
    }

    struct Sent {
        let request: HTTPRequest
        let body: Data?
        let operationID: String

        var bearer: String? { request.headerFields[.authorization] }
        var json: [String: Any] {
            guard let body, let object = try? JSONSerialization.jsonObject(with: body) else {
                return [:]
            }
            return object as? [String: Any] ?? [:]
        }
    }

    private let lock = NSLock()
    private var answers: [Answer]
    private(set) var sent: [Sent] = []

    init(_ answers: [Answer]) {
        self.answers = answers
    }

    func send(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let data: Data? =
            if let body { try await Data(collecting: body, upTo: 1 << 20) } else { nil }
        let answer = lock.withLock {
            sent.append(Sent(request: request, body: data, operationID: operationID))
            return answers.isEmpty ? .failure : answers.removeFirst()
        }
        switch answer {
        case .failure:
            throw URLError(.notConnectedToInternet)
        case .response(let status, let body, let headers):
            return (Self.response(status, headers), HTTPBody(body))
        case .watched(let status, let body, let headers, let watch):
            return (Self.response(status, headers), watch.body(body))
        }
    }

    private static func response(_ status: Int, _ headers: [String: String]) -> HTTPResponse {
        var fields = HTTPFields()
        for (name, value) in headers { fields[HTTPField.Name(name)!] = value }
        return HTTPResponse(status: .init(code: status), headerFields: fields)
    }
}

/// Whether an answer's body was read: the contract says an app reads no 5xx's body (its rule
/// since PR #151, the outside audit's B8). Starting to iterate the body counts as reading it.
final class BodyWatch: @unchecked Sendable {
    private let lock = NSLock()
    private var read = false

    var wasRead: Bool { lock.withLock { read } }

    func body(_ text: String) -> HTTPBody {
        let bytes = Array(text.utf8)
        return HTTPBody(
            Bytes(bytes: bytes, watch: self), length: .known(Int64(bytes.count)),
            iterationBehavior: .single)
    }

    private func reading() {
        lock.withLock { read = true }
    }

    private struct Bytes: AsyncSequence, Sendable {
        let bytes: [UInt8]
        let watch: BodyWatch

        func makeAsyncIterator() -> AsyncStream<ArraySlice<UInt8>>.Iterator {
            watch.reading()
            return AsyncStream { continuation in
                continuation.yield(ArraySlice(bytes))
                continuation.finish()
            }.makeAsyncIterator()
        }
    }
}

/// An `AuthService` that refreshes from a script; the API's tests make no other call.
final class RefreshingAuth: AuthService, @unchecked Sendable {
    private let lock = NSLock()
    private var answers: [Result<AuthSession, AuthFailure>]
    private(set) var refreshes = 0

    init(_ answers: [Result<AuthSession, AuthFailure>] = []) {
        self.answers = answers
    }

    func sendCode(to email: String) async throws(AuthFailure) {}
    func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession {
        throw .codeNotVerified
    }
    func signOut(_ session: AuthSession) async throws(AuthFailure) {}

    func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession {
        try lock.withLock {
            refreshes += 1
            return answers.isEmpty ? .failure(.network) : answers.removeFirst()
        }.get()
    }
}

@Suite struct TadayoAPIClientTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)

    func session(_ n: Int, expiresIn seconds: TimeInterval = 3600) -> AuthSession {
        AuthSession(
            accessToken: "access-\(n)", refreshToken: "refresh-\(n)",
            expiresAt: start.addingTimeInterval(seconds))
    }

    func api(
        _ transport: CannedTransport, auth: RefreshingAuth = RefreshingAuth(),
        stored: AuthSession? = nil
    ) -> TadayoAPIClient {
        .testing(transport, auth: auth, stored: stored ?? session(1), at: start)
    }

    // The contract's examples (packages/contracts/openapi.yaml).
    let ben =
        #"{"id":"acct_ben","display_name":"Ben","avatar_version":"av_ben_1","age_confirmed":true,"version":3}"#
    let newAccount = #"{"id":"acct_new","age_confirmed":false,"version":0}"#
    let noClub = #"{"server_now":"2026-11-05T03:00:00Z","clubs":[],"invitations":[]}"#

    // MARK: The account

    @Test func readsTheAccountWithTheSessionsToken() async throws {
        let transport = CannedTransport([.json(200, ben)])
        let account = try await api(transport).me()
        #expect(
            account
                == Account(
                    id: "acct_ben", displayName: "Ben", avatarVersion: "av_ben_1",
                    ageConfirmed: true, version: 3))
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/v1/me")
        #expect(sent.bearer == "Bearer access-1")
    }

    @Test func aNewAccountHasNeitherAgeNorName() async throws {
        let account = try await api(CannedTransport([.json(200, newAccount)])).me()
        #expect(account.displayName == nil)
        #expect(!account.ageConfirmed)
        #expect(account.version == 0)
    }

    @Test func confirmingTheAgeSendsItAloneWithTheKeyAndTheVersion() async throws {
        let transport = CannedTransport([.json(200, ben)])
        let key = IdempotencyKey.make(at: start)
        _ = try await api(transport).update(.confirmAge(expectedVersion: 0), key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .patch)
        #expect(sent.request.path == "/v1/me")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["age_confirmed", "expected_version"])
        #expect(sent.json["age_confirmed"] as? Bool == true)
        #expect(sent.json["expected_version"] as? Int == 0)
    }

    @Test func aNameIsSentAsGivenWithNothingElse() async throws {
        let transport = CannedTransport([.json(200, ben)])
        _ = try await api(transport).update(
            .name("Ben", expectedVersion: 1), key: .make(at: start))
        let sent = try #require(transport.sent.first)
        #expect(sent.json.keys.sorted() == ["display_name", "expected_version"])
        #expect(sent.json["display_name"] as? String == "Ben")
    }

    // MARK: The clubs

    @Test func noClubAndNoInvitationIsEmptyOnTheServersClock() async throws {
        let list = try await api(CannedTransport([.json(200, noClub)])).clubs()
        #expect(list.isEmpty)
        #expect(list.serverClock.serverNow == start)
    }

    @Test func aClubOrAnInvitationIsNotEmpty() async throws {
        let club =
            #"{"id":"club_sun","name":"Sunday people","timezone":"America/New_York","my_membership_id":"mem_ben","state":"active","member_count":6}"#
        let invitation =
            #"{"invitation_id":"inv_1","club_name":"Sunday people","inviter_name":"Maya","state":"waiting"}"#
        for body in [
            #"{"server_now":"2026-11-05T03:00:00Z","clubs":[\#(club)],"invitations":[]}"#,
            #"{"server_now":"2026-11-05T03:00:00Z","clubs":[],"invitations":[\#(invitation)]}"#,
        ] {
            let list = try await api(CannedTransport([.json(200, body)])).clubs()
            #expect(!list.isEmpty)
        }
    }

    // MARK: Failures

    @Test func eachAnswerBecomesItsFailure() async {
        let error = { (code: String) in #"{"code":"\#(code)"}"# }
        let cases: [(String, CannedTransport.Answer, APIFailure)] = [
            ("me", .json(400, error("INVALID_REQUEST")), .refused),
            ("me", .json(429, error("RATE_LIMITED"), ["Retry-After": "30"]), .unavailable),
            ("me", .response(status: 503, body: "", headers: [:]), .unavailable),
            ("me", .response(status: 418, body: "", headers: [:]), .refused),
            // A success the contract doesn't list: the server may have acted (audit A8).
            ("me", .response(status: 202, body: "", headers: [:]), .unreadable),
            ("update", .response(status: 204, body: "", headers: [:]), .unreadable),
            ("me", .failure, .network),
            ("clubs", .json(403, error("PROFILE_INCOMPLETE")), .profileIncomplete),
            ("clubs", .json(403, error("NOT_ALLOWED")), .refused),
            (
                "update", .json(409, #"{"code":"VERSION_CONFLICT","current_version":3}"#),
                .versionConflict
            ),
            ("update", .json(409, error("IDEMPOTENCY_CONFLICT")), .refused),
            ("update", .json(404, error("NOT_FOUND")), .refused),
        ]
        for (operation, answer, failure) in cases {
            await #expect(throws: failure, "\(operation) \(answer)") {
                try await call(operation, on: api(CannedTransport([answer])))
            }
        }
    }

    /// The contract's rule since PR #151 (the outside audit's B8): any operation may answer a
    /// 500, or a 503, which no operation lists, each with no body and `Cache-Control: private,
    /// no-store`, except a stopping server's 503, Fastify's own, with a short JSON body and no
    /// `Cache-Control`; the app reads any 5xx as the service out of reach for now and reads no
    /// 5xx's body. A 5xx from anything in front of the server is read the same way.
    @Test func anyFiveHundredIsTheServiceOutOfReachAndItsBodyIsNeverRead() async {
        for (status, body, headers) in Self.fiveHundreds {
            for operation in ["me", "clubs", "update"] {
                let watch = BodyWatch()
                let transport = CannedTransport([
                    .watched(status: status, body: body, headers: headers, watch)
                ])
                await #expect(throws: APIFailure.unavailable, "\(operation) \(status) \(body)") {
                    try await call(operation, on: api(transport))
                }
                #expect(!watch.wasRead, "\(operation) \(status) \(body)")
                #expect(transport.sent.count == 1, "\(operation) \(status): not sent again")
            }
        }
    }

    /// Fastify 5's answer while the server closes (its `lib/route.js`), byte for byte.
    static let stopping =
        #"{"error":"Service Unavailable","message":"Service Unavailable","statusCode":503}"#

    /// The 5xx answers the server and what's in front of it can give, which no operation but the
    /// health check lists: the server's own 500 and 503 (`services/api/src/app.ts` `failed`,
    /// `services/api/src/answers.ts` `unavailable`), a stopping server's 503 as Fastify 5 writes
    /// it (`return503OnClosing`), and a proxy's.
    static let fiveHundreds: [(Int, String, [String: String])] = [
        (500, "", ["Cache-Control": "private, no-store"]),
        (503, "", ["Cache-Control": "private, no-store"]),
        (
            503, stopping,
            ["Content-Type": "application/json", "Content-Length": "80", "Connection": "close"]
        ),
        (502, "<html><body>Bad Gateway</body></html>", ["Content-Type": "text/html"]),
        (504, "", [:]),
    ]

    @Test func anAnswerThatBreaksTheContractIsUnreadableNotTrusted() async {
        // Unreadable, not refused: the server answered 2xx, so it may have acted, and a command's
        // retry keeps its key (T19; audit A8).
        let answers: [CannedTransport.Answer] = [
            .response(status: 200, body: ben, headers: ["Content-Type": "application/json"]),
            .json(200, ben, ["Cache-Control": "max-age=60"]),
            .json(200, #"{"id":"acct_ben"}"#),
            .json(200, "not json"),
            .json(200, ben, ["Content-Type": "text/html"]),
        ]
        for answer in answers {
            await #expect(throws: APIFailure.unreadable) {
                try await api(CannedTransport([answer])).me()
            }
        }
    }

    @Test func anAnswerWhoseBodyCannotBeReadIsReadByItsStatus() async {
        // A refusal whose body this build can't read is still a refusal: only a success, whose
        // command the server may have carried out, is unreadable (audit A8).
        let json = ["Content-Type": "application/json"]
        let cases: [(String, CannedTransport.Answer, APIFailure)] = [
            // A code the contract added after this build.
            ("update", .json(409, #"{"code":"SOMETHING_NEW"}"#), .refused),
            ("clubs", .json(403, #"{"code":"SOMETHING_NEW"}"#), .refused),
            // A body that isn't the contract's, or no `Cache-Control`.
            (
                "me",
                .response(status: 400, body: "<html/>", headers: ["Content-Type": "text/html"]),
                .refused
            ),
            (
                "update", .response(status: 404, body: #"{"code":"NOT_FOUND"}"#, headers: json),
                .refused
            ),
            ("me", .json(429, "not json", ["Retry-After": "30"]), .unavailable),
        ]
        for (operation, answer, failure) in cases {
            await #expect(throws: failure, "\(operation) \(answer)") {
                try await call(operation, on: api(CannedTransport([answer])))
            }
        }
        // A second 401 still ends the session, as `aSecondRejectionSignsOut` does.
        let unreadable = CannedTransport.Answer.json(401, "not json")
        let auth = RefreshingAuth([.success(session(2, expiresIn: 7200))])
        await #expect(throws: APIFailure.signedOut) {
            try await api(CannedTransport([unreadable, unreadable]), auth: auth).me()
        }
    }

    // MARK: The token

    @Test func aRejectedTokenIsRefreshedOnceAndTheCallSentAgain() async throws {
        let auth = RefreshingAuth([.success(session(2, expiresIn: 7200))])
        let transport = CannedTransport([
            .json(401, #"{"code":"UNAUTHENTICATED"}"#), .json(200, ben),
        ])
        _ = try await api(transport, auth: auth).me()
        #expect(transport.sent.map(\.bearer) == ["Bearer access-1", "Bearer access-2"])
        #expect(auth.refreshes == 1)
    }

    @Test func aRejectedRetryOfAnUpdateSendsTheSameKeyAndBody() async throws {
        let auth = RefreshingAuth([.success(session(2, expiresIn: 7200))])
        let transport = CannedTransport([
            .json(401, #"{"code":"UNAUTHENTICATED"}"#), .json(200, ben),
        ])
        _ = try await api(transport, auth: auth).update(
            .name("Ben", expectedVersion: 1), key: .make(at: start))
        let key = HTTPField.Name("Idempotency-Key")!
        #expect(transport.sent.count == 2)
        #expect(
            transport.sent[0].request.headerFields[key]
                == transport.sent[1].request.headerFields[key])
        #expect(transport.sent[0].body == transport.sent[1].body)
    }

    @Test func aSecondRejectionSignsOut() async {
        let auth = RefreshingAuth([.success(session(2, expiresIn: 7200))])
        let unauthenticated = CannedTransport.Answer.json(401, #"{"code":"UNAUTHENTICATED"}"#)
        let transport = CannedTransport([unauthenticated, unauthenticated])
        await #expect(throws: APIFailure.signedOut) { try await api(transport, auth: auth).me() }
        #expect(transport.sent.count == 2)
        #expect(auth.refreshes == 1)
    }

    @Test func withoutAFreshTokenNothingIsSent() async {
        let expired = session(1, expiresIn: 0)
        for (refresh, failure) in [
            (AuthFailure.network, APIFailure.network), (.unavailable, .unavailable),
            (.sessionEnded, .signedOut),
        ] {
            let transport = CannedTransport([.json(200, ben)])
            await #expect(throws: failure) {
                try await api(transport, auth: RefreshingAuth([.failure(refresh)]), stored: expired)
                    .me()
            }
            #expect(transport.sent.isEmpty)
        }
    }

    @Test func thePublicOperationsCarryNoToken() async throws {
        let middleware = BearerMiddleware(
            session: SessionManager(
                auth: RefreshingAuth(), store: InMemorySessionStore(session(1)),
                now: { [start] in start }))
        let request = HTTPRequest(method: .post, scheme: "https", authority: nil, path: "/v1/x")
        for (operation, bearer) in [
            ("previewInvitationWeb", nil), ("removeDevice", nil), ("getMe", "Bearer access-1"),
        ] {
            let (response, _) = try await middleware.intercept(
                request, body: nil, baseURL: URL(string: "https://api-dev.tadayo.app")!,
                operationID: operation
            ) { request, _, _ in
                #expect(request.headerFields[.authorization] == bearer)
                return (HTTPResponse(status: .ok), nil)
            }
            #expect(response.status == .ok)
        }
    }

    @Test func thePublicOperationsAreTheContracts() throws {
        // The generator ignores `security`, so the list the middleware keeps is checked against
        // the file the client is generated from: a public operation the contract adds fails here
        // until the list has it, and no session's token goes with it (TECH-DESIGN section 6).
        let contract = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Sources/TadayoAPI/openapi.yaml")
        var operations: [String: [String]] = [:]
        var inPaths = false
        var block: [String] = []
        func close() {
            if let id = block.first(where: { $0.hasPrefix("operationId: ") }) {
                operations[String(id.dropFirst("operationId: ".count))] = block.filter {
                    $0.hasPrefix("security:")
                }
            }
            block = []
        }
        for line in try String(contentsOf: contract, encoding: .utf8).split(separator: "\n") {
            if !line.hasPrefix(" ") {
                close()
                inPaths = line == "paths:"
            } else if inPaths, line.hasPrefix("    "), !line.hasPrefix("     ") {
                close()
            } else if inPaths, line.hasPrefix("      "), !line.hasPrefix("       ") {
                block.append(String(line.dropFirst(6)))
            }
        }
        close()
        #expect(operations.count > 60)
        #expect(["getMe", "updateMe", "listClubs"].allSatisfy { operations[$0] == [] })
        #expect(operations.values.allSatisfy { $0 == [] || $0 == ["security: []"] })
        let open = Set(operations.filter { $0.value == ["security: []"] }.keys)
        #expect(open == BearerMiddleware.publicOperations)
    }

    @Test func aFailureSaysNothingOfTheAnswer() {
        // T52: nothing a failure prints can carry an address, a name or a token.
        for failure in [
            APIFailure.network, .signedOut, .profileIncomplete, .versionConflict, .notFound,
            .notAllowed, .rosterChanged, .clubFull, .invitationExpired, .unavailable, .refused,
            .unreadable,
        ] {
            #expect(String(describing: failure).allSatisfy { $0.isLetter })
        }
    }

    func call(_ operation: String, on api: TadayoAPIClient) async throws {
        switch operation {
        case "me": _ = try await api.me()
        case "clubs": _ = try await api.clubs()
        default: _ = try await api.update(.confirmAge(expectedVersion: 0), key: .make(at: start))
        }
    }
}
