import Foundation
import Testing

@testable import TadayoCore

/// A continuous clock the test moves by hand. Its sleep moves the clock to the instant asked for,
/// as if the time had passed, and records each wait.
final class ManualContinuousClock: @unchecked Sendable {
    private let lock = NSLock()
    private let origin = ContinuousClock.now
    private var offset = Duration.zero
    private(set) var waits: [Duration] = []

    var now: ContinuousClock.Instant { lock.withLock { origin + offset } }
    func advance(_ duration: Duration) { lock.withLock { offset += duration } }

    func sleep(until instant: ContinuousClock.Instant) {
        lock.withLock {
            waits.append(instant - origin)
            offset = max(offset, instant - origin)
        }
    }
}

@MainActor @Suite struct SignInModelTests {
    let session = AuthSession(
        accessToken: "access-1", refreshToken: "refresh-1",
        expiresAt: Date(timeIntervalSince1970: 1_793_851_200))

    final class Verified {
        var sessions: [AuthSession] = []
    }

    func model(
        _ auth: FakeAuth, _ clock: ManualContinuousClock = ManualContinuousClock(),
        _ verified: Verified = Verified()
    ) -> SignInModel {
        SignInModel(
            auth: auth, verified: { verified.sessions.append($0) }, now: { clock.now },
            sleep: { clock.sleep(until: $0) })
    }

    /// A model on A02-code, its code sent to ben@example.com.
    func onCode(
        _ auth: FakeAuth, _ clock: ManualContinuousClock = ManualContinuousClock(),
        _ verified: Verified = Verified()
    ) async -> SignInModel {
        let model = model(auth, clock, verified)
        model.email = "ben@example.com"
        await model.sendCode()
        return model
    }

    // MARK: A02-email

    @Test func sendIsOfferedForAPlausibleAddressOnly() {
        let model = model(FakeAuth())
        for address in [
            "ben@example.com", " ben@example.com ", "b@x.co", "ben+club@mail.example.com",
        ] {
            model.email = address
            #expect(model.canSend, "\(address)")
        }
        for address in [
            "", "ben", "ben@", "@example.com", "ben@example", "ben@example.", "ben@.com",
            "ben@@example.com", "ben @example.com", "ben@exam ple.com",
        ] {
            model.email = address
            #expect(!model.canSend, "\(address)")
        }
    }

    @Test func theCodeScreenComesOnlyOnceTheServerAccepts() async {
        let auth = FakeAuth()
        let model = model(auth)
        model.email = "  ben@example.com "
        await model.sendCode()
        #expect(auth.calls == ["sendCode ben@example.com"])
        #expect(model.step == .code)
        #expect(model.address == "ben@example.com")
        #expect(model.failure == nil)
    }

    @Test func aFailedSendKeepsTheAddressOnTheEmailScreen() async {
        for (answer, failure) in [
            (AuthFailure.network, SignInModel.Failure.sendNetwork), (.refused, .sendRefused),
        ] {
            let model = model(FakeAuth(send: [answer]))
            model.email = "ben@example.com"
            await model.sendCode()
            #expect(model.step == .email)
            #expect(model.failure == failure)
            #expect(model.email == "ben@example.com")
            #expect(!model.isSending)
            await model.sendCode()
            #expect(model.step == .code)
            #expect(model.failure == nil)
        }
    }

    @Test func oneSendAtATime() async {
        let auth = FakeAuth()
        auth.duringSignIn = { try? await Task.sleep(for: .milliseconds(50)) }
        let model = model(auth)
        model.email = "ben@example.com"
        async let first: Void = model.sendCode()
        async let second: Void = model.sendCode()
        _ = await (first, second)
        #expect(auth.calls == ["sendCode ben@example.com"])
    }

    // MARK: A02-code

    @Test func theCodeTakesSixDigitsAndNothingElse() async {
        let model = await onCode(FakeAuth())
        model.code = "529 614"
        #expect(model.code == "529614")
        model.code = "5296147"
        #expect(model.code == "529614")
        model.code = "52a9-6"
        #expect(model.code == "5296")
        #expect(!model.canVerify)
        model.code = "١٢٣٤٥٦"
        #expect(model.code == "")
        model.code = "1\u{FE0F}\u{20E3}23456"
        #expect(model.code == "23456")
    }

    @Test func verifyingWaitsForSixDigitsAndATap() async {
        let auth = FakeAuth(verify: [.success(session)])
        let verified = Verified()
        let model = await onCode(auth, ManualContinuousClock(), verified)
        model.code = "52961"
        await model.verify()
        #expect(auth.calls == ["sendCode ben@example.com"])
        model.code = "529614"
        #expect(model.canVerify)
        #expect(verified.sessions.isEmpty)
        await model.verify()
        #expect(auth.calls.last == "verify ben@example.com 529614")
        #expect(verified.sessions == [session])
    }

    @Test func aRefusedCodeKeepsItsDigitsAndWaitsForAnEdit() async {
        let auth = FakeAuth(verify: [.failure(.codeNotVerified), .success(session)])
        let model = await onCode(auth)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == .codeNotVerified)
        #expect(model.code == "529614")
        #expect(!model.canVerify)
        await model.verify()
        #expect(auth.calls.count == 2)
        model.code = "52961"
        #expect(model.failure == nil)
        model.code = "529613"
        #expect(model.canVerify)
    }

    @Test func noAnswerIsNeverAWrongCode() async {
        let auth = FakeAuth(verify: [.failure(.network), .success(session)])
        let verified = Verified()
        let model = await onCode(auth, ManualContinuousClock(), verified)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == .verifyNetwork)
        #expect(model.code == "529614")
        #expect(model.canVerify)
        await model.verify()
        #expect(verified.sessions == [session])
    }

    @Test func changingTheAddressKeepsIt() async {
        let model = await onCode(FakeAuth())
        model.changeEmail()
        #expect(model.step == .email)
        #expect(model.email == "ben@example.com")
    }

    // MARK: A new code

    @Test func aNewCodeIsOfferedAMinuteAfterTheSend() async {
        let clock = ManualContinuousClock()
        let model = await onCode(FakeAuth(), clock)
        #expect(!model.canResend)
        clock.advance(.seconds(59))
        await model.resend()
        #expect(!model.canResend)
        await model.waitForResend()
        #expect(clock.waits == [.seconds(60)])
        #expect(model.canResend)
        #expect(model.resendDue == nil)
    }

    @Test func theWaitCountsFromTheSendNotFromTheScreen() async {
        // Back from the background after two minutes: no second wait.
        let clock = ManualContinuousClock()
        let model = await onCode(FakeAuth(), clock)
        clock.advance(.seconds(120))
        await model.waitForResend()
        #expect(clock.waits.isEmpty)
        #expect(model.canResend)
    }

    @Test func aNewCodeClearsTheDigitsAndWaitsAgain() async {
        let auth = FakeAuth(verify: [.failure(.codeNotVerified)])
        let clock = ManualContinuousClock()
        let model = await onCode(auth, clock)
        model.code = "529614"
        await model.verify()
        clock.advance(.seconds(60))
        await model.waitForResend()
        await model.resend()
        #expect(auth.calls.last == "sendCode ben@example.com")
        #expect(model.code == "")
        #expect(model.failure == nil)
        #expect(!model.canResend)
        model.code = "529614"
        #expect(model.canVerify)
        await model.waitForResend()
        #expect(clock.waits == [.seconds(120)])
    }

    @Test func aRefusedNewCodeKeepsTheDigitsAndTheRow() async {
        for (answer, failure) in [
            (AuthFailure.network, SignInModel.Failure.resendNetwork), (.refused, .resendRefused),
        ] {
            let auth = FakeAuth(send: [nil, answer])
            let clock = ManualContinuousClock()
            let model = await onCode(auth, clock)
            model.code = "52961"
            clock.advance(.seconds(60))
            await model.waitForResend()
            await model.resend()
            #expect(model.failure == failure)
            #expect(model.code == "52961")
            #expect(model.canResend)
            #expect(model.resendDue == nil)
        }
    }
}
