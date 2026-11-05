import Foundation

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// Where the app signs in: the Supabase project's URL and its publishable key, the one Supabase
/// credential the app holds (T53, ADR-015). Both are public by design.
public struct SupabaseConfiguration: Sendable, Equatable {
    public let projectURL: URL
    public let publishableKey: String

    public init(projectURL: URL, publishableKey: String) {
        self.projectURL = projectURL
        self.publishableKey = publishableKey
    }
}

/// A signed-in session: the tokens and when the access token runs out, by the device's clock. The
/// expiry only times the next refresh; the server decides whether a token is still good. Nothing
/// of the user Supabase sends (it holds the address) is kept.
public struct AuthSession: Sendable, Equatable, Codable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date

    public init(accessToken: String, refreshToken: String, expiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }
}

/// Why a sign-in call failed, in the terms the screens need. The server's own message is never
/// read: it can hold the address (handoff 4's `authRefusal`: never show the server's prose).
public enum AuthFailure: Error, Sendable, Equatable {
    /// No answer came back.
    case network
    /// The server answered a request for a code and didn't send one.
    case refused
    /// The code wasn't accepted. Supabase answers a wrong code and an expired one alike.
    case codeNotVerified
    /// The refresh token was already used, perhaps by the share extension: read the stored
    /// session again before giving up.
    case refreshTokenAlreadyUsed
    /// The session can't be refreshed: sign in again.
    case sessionEnded
    /// Signing out, the server refused the access token itself (`bad_jwt`): refresh it and try
    /// once more, since the session behind it may still be live.
    case accessTokenRejected
    /// The server is busy or failing: keep the session and try later.
    case unavailable
}

/// Sends a request and returns the response, whatever its status.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// The connection every request uses, to the API and to Supabase: nothing is cached and no cookie
/// is kept, so nothing an account saw stays on the device for the next one (T11, Q26).
public enum TadayoNetwork {
    public static func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        return configuration
    }

    public static func session() -> URLSession {
        URLSession(configuration: configuration())
    }
}

/// `HTTPTransport` over a `URLSession`.
public struct URLSessionHTTPTransport: HTTPTransport {
    let session: URLSession

    public init(session: URLSession = TadayoNetwork.session()) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}

/// The four calls the app makes to Supabase Auth, by hand rather than through Supabase's SDK,
/// which would see the address and the tokens (CLAUDE.md, "Keep it simple"). From GoTrue's source:
/// a six-digit email code (ADR-011), verified as type `email`, which serves a first sign-in and
/// later ones alike; the publishable key goes in `apikey` only, never as a bearer token.
public struct SupabaseAuth: Sendable {
    let configuration: SupabaseConfiguration
    let transport: any HTTPTransport
    let now: @Sendable () -> Date

    public init(
        configuration: SupabaseConfiguration,
        transport: any HTTPTransport = URLSessionHTTPTransport(),
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.configuration = configuration
        self.transport = transport
        self.now = now
    }

    /// Asks Supabase to email a code. `create_user` stays true, so the answer never says whether
    /// an account exists; nothing else is sent (no metadata: it would ride in every token).
    public func sendCode(to email: String) async throws(AuthFailure) {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let (status, _, _) = try await call(
            "otp", body: CodeRequest(email: address, createUser: true))
        guard (200..<300).contains(status) else { throw .refused }
    }

    /// Exchanges the address and its code for a session.
    public func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession {
        let request = VerifyRequest(
            type: "email", email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            token: code)
        let (status, data, _) = try await call("verify", body: request)
        guard (200..<300).contains(status), let session = session(from: data) else {
            throw .codeNotVerified
        }
        return session
    }

    /// Exchanges the refresh token for a new session.
    public func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession {
        let (status, data, response) = try await call(
            "token", query: [URLQueryItem(name: "grant_type", value: "refresh_token")],
            body: RefreshRequest(refreshToken: session.refreshToken))
        if (200..<300).contains(status), let fresh = self.session(from: data) { return fresh }
        if status == 429 || status >= 500 { throw .unavailable }
        if errorCode(data, response) == "refresh_token_already_used" {
            throw .refreshTokenAlreadyUsed
        }
        throw .sessionEnded
    }

    /// Ends this session on the server: `scope=local`, since Supabase's default signs out every
    /// device. A session or user the server no longer knows is already signed out; any other
    /// 401 or 403 refused the token, not the session.
    public func signOut(_ session: AuthSession) async throws(AuthFailure) {
        let (status, data, response) = try await call(
            "logout", query: [URLQueryItem(name: "scope", value: "local")], body: Empty(),
            bearer: session.accessToken)
        if (200..<300).contains(status) { return }
        guard status == 401 || status == 403 else { throw .unavailable }
        let code = errorCode(data, response)
        if code == "session_not_found" || code == "user_not_found" { return }
        throw .accessTokenRejected
    }

    // MARK: The wire

    private struct CodeRequest: Encodable {
        let email: String
        let createUser: Bool
        enum CodingKeys: String, CodingKey {
            case email
            case createUser = "create_user"
        }
    }

    private struct VerifyRequest: Encodable {
        let type: String
        let email: String
        let token: String
    }

    private struct RefreshRequest: Encodable {
        let refreshToken: String
        enum CodingKeys: String, CodingKey { case refreshToken = "refresh_token" }
    }

    private struct Empty: Encodable {}

    private struct SessionResponse: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: Double
        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case expiresIn = "expires_in"
        }
    }

    private func session(from data: Data) -> AuthSession? {
        guard let response = try? JSONDecoder().decode(SessionResponse.self, from: data) else {
            return nil
        }
        return AuthSession(
            accessToken: response.accessToken, refreshToken: response.refreshToken,
            expiresAt: now().addingTimeInterval(response.expiresIn))
    }

    /// The error's code: GoTrue's `x-sb-error-code` header, else the body's `code` (API version
    /// 2024-01-01) or `error_code` (the older shape). The message is never read.
    private func errorCode(_ data: Data, _ response: HTTPURLResponse) -> String? {
        if let header = response.value(forHTTPHeaderField: "x-sb-error-code") { return header }
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        return object?["code"] as? String ?? object?["error_code"] as? String
    }

    private func call(
        _ path: String, query: [URLQueryItem] = [], body: some Encodable, bearer: String? = nil
    ) async throws(AuthFailure) -> (Int, Data, HTTPURLResponse) {
        var url = configuration.projectURL.appending(path: "auth/v1/\(path)")
        if !query.isEmpty { url.append(queryItems: query) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(configuration.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("2024-01-01", forHTTPHeaderField: "X-Supabase-Api-Version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try? JSONEncoder().encode(body)
        do {
            let (data, response) = try await transport.send(request)
            return (response.statusCode, data, response)
        } catch {
            throw .network
        }
    }
}
