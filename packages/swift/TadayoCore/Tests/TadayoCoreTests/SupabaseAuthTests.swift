import Foundation
import Testing

@testable import TadayoCore

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// A transport that records each request and answers from a script.
final class ScriptedTransport: HTTPTransport, @unchecked Sendable {
    enum Answer {
        case response(status: Int, body: String, headers: [String: String] = [:])
        case failure
    }

    private let lock = NSLock()
    private var answers: [Answer]
    private(set) var requests: [URLRequest] = []

    init(_ answers: [Answer]) {
        self.answers = answers
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let answer = lock.withLock {
            requests.append(request)
            return answers.isEmpty ? .failure : answers.removeFirst()
        }
        switch answer {
        case .failure:
            throw URLError(.notConnectedToInternet)
        case .response(let status, let body, let headers):
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                headerFields: headers)!
            return (Data(body.utf8), response)
        }
    }

    var lastBody: [String: Any] {
        guard let data = lock.withLock({ requests.last?.httpBody }),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        return object
    }
}

@Suite struct SupabaseAuthTests {
    let configuration = SupabaseConfiguration(
        projectURL: URL(string: "https://example-ref.supabase.co")!,
        publishableKey: "sb_publishable_example")
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let now = Date(timeIntervalSince1970: 1_793_847_600)
    let sessionJSON = """
        {"access_token":"access-1","token_type":"bearer","expires_in":3600,
        "expires_at":1793851200,"refresh_token":"refresh-1",
        "user":{"id":"u-1","email":"ben@example.com"}}
        """

    func auth(_ transport: ScriptedTransport) -> SupabaseAuth {
        SupabaseAuth(configuration: configuration, transport: transport, now: { [now] in now })
    }

    // MARK: Sending a code

    @Test func sendsACodeWithTheAddressAndNothingElse() async throws {
        let transport = ScriptedTransport([.response(status: 200, body: "{}")])
        try await auth(transport).sendCode(to: "  ben@example.com ")
        let request = try #require(transport.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://example-ref.supabase.co/auth/v1/otp")
        #expect(request.value(forHTTPHeaderField: "apikey") == "sb_publishable_example")
        #expect(request.value(forHTTPHeaderField: "X-Supabase-Api-Version") == "2024-01-01")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        let body = transport.lastBody
        #expect(body.keys.sorted() == ["create_user", "email"])
        #expect(body["email"] as? String == "ben@example.com")
        #expect(body["create_user"] as? Bool == true)
    }

    @Test func aCodeTheServerRefusesIsRefused() async {
        for status in [400, 422, 429, 500] {
            let transport = ScriptedTransport([
                .response(
                    status: status,
                    body: #"{"code":"over_email_send_rate_limit","message":"ben@example.com"}"#)
            ])
            await #expect(throws: AuthFailure.refused) {
                try await auth(transport).sendCode(to: "ben@example.com")
            }
        }
    }

    @Test func noAnswerWhileSendingIsANetworkFailure() async {
        let transport = ScriptedTransport([.failure])
        await #expect(throws: AuthFailure.network) {
            try await auth(transport).sendCode(to: "ben@example.com")
        }
    }

    // MARK: Verifying it

    @Test func verifiesTheCodeAsAnEmailCode() async throws {
        let transport = ScriptedTransport([.response(status: 200, body: sessionJSON)])
        let session = try await auth(transport).verify(email: "ben@example.com", code: "529614")
        let request = try #require(transport.requests.first)
        #expect(request.url?.absoluteString == "https://example-ref.supabase.co/auth/v1/verify")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        let body = transport.lastBody
        #expect(body.keys.sorted() == ["email", "token", "type"])
        #expect(body["type"] as? String == "email")
        #expect(body["token"] as? String == "529614")
        #expect(
            session
                == AuthSession(
                    accessToken: "access-1", refreshToken: "refresh-1",
                    expiresAt: now.addingTimeInterval(3600)))
    }

    @Test func aSessionPrintsNoToken() {
        // T52: a session that reaches a log, a dump or a failed test's message says nothing of
        // its tokens.
        let session = AuthSession(
            accessToken: "eyJ-access", refreshToken: "refresh-secret", expiresAt: now)
        var dumped = ""
        dump(session, to: &dumped)
        for text in [
            String(describing: session), String(reflecting: session), "\(session)", dumped,
            String(describing: Optional(session)), String(describing: [session]),
        ] {
            #expect(!text.contains("eyJ-access"))
            #expect(!text.contains("refresh-secret"))
            #expect(text.contains("redacted"))
        }
    }

    @Test func keepsNothingOfTheUser() throws {
        // The response's user holds the address; the session keeps the tokens and expiry only.
        let data = try JSONEncoder().encode(
            AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now))
        let text = String(decoding: data, as: UTF8.self)
        #expect(!text.contains("email"))
        #expect(!text.contains("user"))
    }

    @Test func anyRefusalOfACodeIsOneFailure() async {
        // Supabase answers a wrong code and an expired one alike (otp_expired), so the app can't
        // tell them apart and says neither.
        for (status, code) in [(403, "otp_expired"), (400, "validation_failed"), (401, "x")] {
            let transport = ScriptedTransport([
                .response(status: status, body: #"{"code":"\#(code)","message":"x"}"#)
            ])
            await #expect(throws: AuthFailure.codeNotVerified) {
                try await auth(transport).verify(email: "ben@example.com", code: "529614")
            }
        }
    }

    @Test func aBusyOrFailingServerSaysNothingOfTheCode() async {
        // Handoff 1's error meaning: the wrong-code words only for a code the server refused.
        for (status, code) in [
            (429, "over_request_rate_limit"), (500, "unexpected_failure"), (503, "x"),
        ] {
            let transport = ScriptedTransport([
                .response(status: status, body: #"{"code":"\#(code)","message":"x"}"#)
            ])
            await #expect(throws: AuthFailure.unavailable) {
                try await auth(transport).verify(email: "ben@example.com", code: "529614")
            }
        }
    }

    @Test func noAnswerWhileVerifyingIsANetworkFailure() async {
        await #expect(throws: AuthFailure.network) {
            try await auth(ScriptedTransport([.failure])).verify(
                email: "ben@example.com", code: "529614")
        }
    }

    @Test func aSessionWithoutTokensIsNotASession() async {
        let transport = ScriptedTransport([.response(status: 200, body: #"{"user":{}}"#)])
        await #expect(throws: AuthFailure.codeNotVerified) {
            try await auth(transport).verify(email: "ben@example.com", code: "529614")
        }
    }

    // MARK: Refreshing

    @Test func refreshesWithTheRefreshTokenInTheBody() async throws {
        let transport = ScriptedTransport([.response(status: 200, body: sessionJSON)])
        let old = AuthSession(accessToken: "access-0", refreshToken: "refresh-0", expiresAt: now)
        let session = try await auth(transport).refresh(old)
        let request = try #require(transport.requests.first)
        #expect(
            request.url?.absoluteString
                == "https://example-ref.supabase.co/auth/v1/token?grant_type=refresh_token")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(transport.lastBody.keys.sorted() == ["refresh_token"])
        #expect(transport.lastBody["refresh_token"] as? String == "refresh-0")
        #expect(session.refreshToken == "refresh-1")
    }

    @Test func theCodesThatEndASession() async {
        for code in [
            "refresh_token_not_found", "session_not_found", "session_expired", "user_banned",
            "validation_failed",
        ] {
            let transport = ScriptedTransport([
                .response(status: 400, body: #"{"code":"\#(code)","message":"m"}"#)
            ])
            let old = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
            await #expect(throws: AuthFailure.sessionEnded) {
                try await auth(transport).refresh(old)
            }
        }
    }

    @Test func readsTheErrorCodeFromTheHeaderFirst() async {
        let transport = ScriptedTransport([
            .response(
                status: 400, body: #"{"code":400,"error_code":"session_expired","msg":"m"}"#,
                headers: ["x-sb-error-code": "refresh_token_already_used"])
        ])
        let old = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
        await #expect(throws: AuthFailure.refreshTokenAlreadyUsed) {
            try await auth(transport).refresh(old)
        }
    }

    @Test func readsTheOlderErrorShapeToo() async {
        let transport = ScriptedTransport([
            .response(status: 400, body: #"{"code":400,"error_code":"session_expired","msg":"m"}"#)
        ])
        let old = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
        await #expect(throws: AuthFailure.sessionEnded) { try await auth(transport).refresh(old) }
    }

    @Test func aBusyOrUnreachableServerKeepsTheSession() async {
        let old = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
        for answer in [
            ScriptedTransport.Answer.response(status: 503, body: ""),
            .response(status: 429, body: #"{"code":"over_request_rate_limit"}"#),
        ] {
            await #expect(throws: AuthFailure.unavailable) {
                try await auth(ScriptedTransport([answer])).refresh(old)
            }
        }
        await #expect(throws: AuthFailure.network) {
            try await auth(ScriptedTransport([.failure])).refresh(old)
        }
    }

    // MARK: Signing out

    @Test func signsOutThisSessionOnly() async throws {
        let transport = ScriptedTransport([.response(status: 204, body: "")])
        let session = AuthSession(accessToken: "access-1", refreshToken: "r", expiresAt: now)
        try await auth(transport).signOut(session)
        let request = try #require(transport.requests.first)
        #expect(
            request.url?.absoluteString
                == "https://example-ref.supabase.co/auth/v1/logout?scope=local")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-1")
        #expect(request.value(forHTTPHeaderField: "apikey") == "sb_publishable_example")
        // The sign-out request waits 15 seconds for Supabase, not URLSession's minute.
        #expect(request.timeoutInterval == 15)
    }

    @Test func aSessionAlreadyGoneIsSignedOut() async throws {
        for code in ["session_not_found", "user_not_found"] {
            let transport = ScriptedTransport([
                .response(status: 403, body: #"{"code":"\#(code)"}"#)
            ])
            let session = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
            try await auth(transport).signOut(session)
        }
    }

    @Test func aRefusedTokenIsNotASignOut() async {
        // The session behind an expired or unreadable token may still be live.
        for (status, body) in [
            (403, #"{"code":"bad_jwt"}"#), (401, #"{"code":"no_authorization"}"#), (401, ""),
        ] {
            let transport = ScriptedTransport([.response(status: status, body: body)])
            let session = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
            await #expect(throws: AuthFailure.accessTokenRejected) {
                try await auth(transport).signOut(session)
            }
        }
        await #expect(throws: AuthFailure.unavailable) {
            try await auth(ScriptedTransport([.response(status: 500, body: "")])).signOut(
                AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now))
        }
    }

    @Test func noAnswerWhileSigningOutIsANetworkFailure() async {
        let session = AuthSession(accessToken: "a", refreshToken: "r", expiresAt: now)
        await #expect(throws: AuthFailure.network) {
            try await auth(ScriptedTransport([.failure])).signOut(session)
        }
    }

    // MARK: The connection

    @Test func everyRequestGoesThroughASessionThatKeepsNothing() {
        let configuration = TadayoNetwork.configuration()
        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
        #expect(configuration.httpCookieStorage == nil)
        #expect(configuration.httpShouldSetCookies == false)
        #expect(configuration.urlCredentialStorage == nil)
    }
}
