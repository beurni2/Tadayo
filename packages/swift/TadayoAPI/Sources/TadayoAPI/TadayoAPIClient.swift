import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import TadayoCore

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// The Tadayo API, as the app calls it. The generated `Client` stays internal and this is all the
/// app sees: the account here, the clubs in `TadayoAPIClient+Clubs.swift`, in `TadayoCore`'s
/// types, with every failure as an `APIFailure`, which carries nothing of the answer (T52). A
/// refusal the contract documents is `refused`; an answer this build can't read is `unreadable`,
/// since the server may have acted on it (audit A8). It grows with each slice.
public struct TadayoAPIClient: AccountService {
    let client: Client
    let now: @Sendable () -> ContinuousClock.Instant

    /// A client for `serverURL`, whose requests carry `session`'s access token and go through
    /// `urlSession`: by default `TadayoNetwork`'s, which keeps nothing (T11, Q26).
    public init(
        serverURL: URL, session: SessionManager, urlSession: URLSession = TadayoNetwork.session()
    ) {
        self.init(
            serverURL: serverURL, session: session,
            transport: URLSessionTransport(configuration: .init(session: urlSession)))
    }

    init(
        serverURL: URL, session: SessionManager, transport: any ClientTransport,
        now: @escaping @Sendable () -> ContinuousClock.Instant = { .now }
    ) {
        client = Client(
            serverURL: serverURL, transport: transport,
            middlewares: [BearerMiddleware(session: session)])
        self.now = now
    }

    /// `GET /v1/me`.
    public func me() async throws(APIFailure) -> Account {
        try await call { client in
            switch try await client.getMe() {
            case .ok(let answer): return Account(try answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    /// `PATCH /v1/me`, sending only the change's fields, with its key and the version it read.
    public func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure)
        -> Account
    {
        let request: Components.Schemas.UpdateMeRequest
        switch change {
        case .confirmAge(let version):
            request = .init(expectedVersion: version, ageConfirmed: true)
        case .name(let name, let version):
            request = .init(expectedVersion: version, displayName: name)
        }
        return try await call { client in
            switch try await client.updateMe(
                headers: .init(idempotencyKey: key.description), body: .json(request))
            {
            case .ok(let answer): return Account(try answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .conflict(let answer):
                let code = try answer.body.json.code
                throw code == .versionConflict ? APIFailure.versionConflict : .refused
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest, .notFound: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    /// `GET /v1/clubs`, with the server's clock as it answered (T1).
    public func clubs() async throws(APIFailure) -> ClubList {
        try await call { client in
            switch try await client.listClubs() {
            case .ok(let answer): return try ClubList(answer.body.json, receivedAt: now())
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                let code = try answer.body.json.code
                throw code == .profileIncomplete ? APIFailure.profileIncomplete : .refused
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    func call<T>(_ body: (Client) async throws -> T) async throws(APIFailure) -> T {
        do {
            return try await body(client)
        } catch let failure as APIFailure {
            throw failure
        } catch {
            throw Self.failure(error)
        }
    }

    /// A status the contract doesn't list for the operation: a success the build can't read,
    /// whose command the server may have carried out, or a refusal.
    static func failure(status: Int) -> APIFailure {
        switch status {
        case 500...: .unavailable
        case 200..<300: .unreadable
        default: .refused
        }
    }

    /// A call that threw: no session, no answer, or an answer that doesn't match the contract (a
    /// value it added after this build, or a missing or changed `Cache-Control`, among them).
    /// Such an answer isn't trusted, but its status still says what the server did: a 401 ends
    /// the session and a 429 is a busy server, as every operation documents them; any other
    /// status is read as `failure(status:)` reads one the contract doesn't list. So a refusal
    /// whose body this build can't read is still `refused`, and only a success, whose command the
    /// server may have carried out, is `unreadable` (audit A8).
    static func failure(_ error: any Error) -> APIFailure {
        let answered = error as? ClientError
        switch answered?.underlyingError ?? error {
        case let session as SessionError:
            switch session {
            case .signedOut: return .signedOut
            case .network: return .network
            case .unavailable: return .unavailable
            }
        case is URLError, is CancellationError: return .network
        default:
            switch answered?.response?.status.code {
            case 401: return .signedOut
            case 429: return .unavailable
            case let status?: return failure(status: status)
            case nil: return .unreadable
            }
        }
    }
}

extension Account {
    init(_ me: Components.Schemas.Me) {
        self.init(
            id: me.id, displayName: me.displayName, avatarVersion: me.avatarVersion,
            ageConfirmed: me.ageConfirmed, version: me.version)
    }
}

/// Adds the session's access token to every operation but the two public ones, and answers a
/// 401 once: with the token another process stored since, or a refreshed one.
struct BearerMiddleware: ClientMiddleware {
    /// The operations the contract marks `security: []`.
    static let publicOperations: Set<String> = ["previewInvitationWeb", "removeDevice"]

    let session: SessionManager

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard !Self.publicOperations.contains(operationID) else {
            return try await next(request, body, baseURL)
        }
        let token = try await session.accessToken()
        let answer = try await next(Self.request(request, bearing: token), body, baseURL)
        guard answer.0.status == .unauthorized, body?.iterationBehavior ?? .multiple == .multiple
        else { return answer }
        let fresh = try await session.accessToken(afterRejecting: token)
        return try await next(Self.request(request, bearing: fresh), body, baseURL)
    }

    static func request(_ request: HTTPRequest, bearing token: String) -> HTTPRequest {
        var request = request
        request.headerFields[.authorization] = "Bearer \(token)"
        return request
    }
}
