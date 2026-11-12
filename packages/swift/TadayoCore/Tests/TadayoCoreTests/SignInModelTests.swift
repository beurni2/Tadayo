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

    @Test func aSignInStartsWithNothingEnded() {
        #expect(model(FakeAuth()).signInEnded == false)
    }

    @Test func aSignInTheServerEndedSaysSoUntilACodeIsSent() async {
        // Handoff 7's `auth.email.signedOut`: shown on A02-email for a sign-in the server ended,
        // through a failed send, and cleared once a code is sent, so going back to A02-email
        // afterwards doesn't show it again.
        let auth = FakeAuth(send: [.network])
        let model = SignInModel(auth: auth, verified: { _ in }, signInEnded: true)
        #expect(model.signInEnded)
        model.email = "ben@example.com"
        await model.sendCode()
        #expect(model.failure == .sendNetwork)
        #expect(model.signInEnded)
        await model.sendCode()
        #expect(model.step == .code)
        #expect(!model.signInEnded)
        model.changeEmail()
        #expect(model.step == .email)
        #expect(!model.signInEnded)
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

    /// Handoff 7's `busyPrimary.field`: while a code is on its way the address is read-only, not
    /// disabled, so the field keeps its focus and its keyboard; "restore editing after failure".
    /// A write made then is ignored, so the field shows what was sent, and each failure gives
    /// editing back with the address as it was.
    @Test func theAddressCantBeEditedWhileACodeIsOnItsWay() async {
        for (answer, failure) in [
            (AuthFailure.network, SignInModel.Failure.sendNetwork), (.refused, .sendRefused),
        ] {
            let gate = Gate()
            let auth = FakeAuth(send: [answer])
            auth.duringSignIn = { await gate.wait() }
            let model = model(auth)
            model.email = "ben@example.com"
            let sending = Task { await model.sendCode() }
            await gate.reached()
            #expect(model.isSending)
            model.email = "ben@example.co"
            #expect(model.email == "ben@example.com")
            model.email = ""
            #expect(model.email == "ben@example.com")
            gate.open()
            await sending.value
            #expect(!model.isSending)
            #expect(model.failure == failure)
            #expect(model.email == "ben@example.com")
            model.email = "ben@example.co"
            #expect(model.email == "ben@example.co")
            #expect(auth.calls == ["sendCode ben@example.com"])
        }
    }

    /// The address is editable again once a code has gone, so Change email address returns to a
    /// field that takes what is typed, with the address as it was.
    @Test func theAddressCanBeEditedAgainOnceACodeHasGone() async {
        let model = await onCode(FakeAuth())
        model.changeEmail()
        #expect(model.email == "ben@example.com")
        model.email = "ben@example.org"
        #expect(model.email == "ben@example.org")
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

    /// Handoff 2's A02-code-error: "Verify code remains enabled for six digits because expiry
    /// is unknown."
    @Test func aRefusedCodeKeepsItsDigitsAndVerifyCode() async {
        let auth = FakeAuth(verify: [
            .failure(.codeNotVerified), .failure(.codeNotVerified), .success(session),
        ])
        let verified = Verified()
        let model = await onCode(auth, ManualContinuousClock(), verified)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == .codeNotVerified)
        #expect(model.code == "529614")
        #expect(model.canVerify)
        await model.verify()
        #expect(
            auth.calls.suffix(2) == [
                "verify ben@example.com 529614", "verify ben@example.com 529614",
            ])
        #expect(model.failure == .codeNotVerified)
        model.code = "52961"
        #expect(model.failure == nil)
        #expect(!model.canVerify)
        model.code = "529613"
        #expect(model.canVerify)
        await model.verify()
        #expect(auth.calls.last == "verify ben@example.com 529613")
        #expect(verified.sessions == [session])
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

    @Test func aBusyServerIsNeverAWrongCode() async {
        // A 429 or 5xx said nothing about the code: the same digits can be tried again.
        let auth = FakeAuth(verify: [.failure(.unavailable), .success(session)])
        let verified = Verified()
        let model = await onCode(auth, ManualContinuousClock(), verified)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == .verifyUnavailable)
        #expect(model.code == "529614")
        #expect(model.canVerify)
        model.code = "52961"
        #expect(model.failure == nil)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == nil)
        #expect(verified.sessions == [session])
    }

    /// The same for the code while it is checked (handoff 7: "Input edits ... are inactive until
    /// the request completes, even if the old challenge has six digits"). The digits stay as they
    /// were, a failure gives editing back, and a refused code's line goes on the first edit, as
    /// it did before. Verifying holds through the account read that follows a verified code.
    @Test func theCodeCantBeEditedWhileItIsChecked() async {
        for (answer, failure) in [
            (AuthFailure.network, SignInModel.Failure.verifyNetwork),
            (.unavailable, .verifyUnavailable), (.codeNotVerified, .codeNotVerified),
        ] {
            let gate = Gate()
            let auth = FakeAuth(verify: [.failure(answer)])
            let model = await onCode(auth)
            auth.duringSignIn = { await gate.wait() }
            model.code = "529614"
            let verifying = Task { await model.verify() }
            await gate.reached()
            #expect(model.isVerifying)
            model.code = "529613"
            #expect(model.code == "529614")
            model.code = ""
            #expect(model.code == "529614")
            gate.open()
            await verifying.value
            #expect(!model.isVerifying)
            #expect(model.failure == failure)
            #expect(model.code == "529614")
            model.code = "529613"
            #expect(model.code == "529613")
            #expect(model.failure == nil)
        }
    }

    @Test func theCodeCantBeEditedWhileTheAccountAfterItIsRead() async {
        let gate = Gate()
        let auth = FakeAuth(verify: [.success(session)])
        let clock = ManualContinuousClock()
        let model = SignInModel(
            auth: auth, verified: { _ in await gate.wait() }, now: { clock.now },
            sleep: { clock.sleep(until: $0) })
        model.email = "ben@example.com"
        await model.sendCode()
        model.code = "529614"
        let verifying = Task { await model.verify() }
        await gate.reached()
        #expect(model.isVerifying)
        model.code = "529613"
        #expect(model.code == "529614")
        gate.open()
        await verifying.value
    }

    @Test func theAddressCantChangeWhileACodeIsOnItsWay() async {
        // T49: an answer that came back on A02-email would be a state it can't draw.
        let gate = Gate()
        let auth = FakeAuth(verify: [.failure(.codeNotVerified)])
        let model = await onCode(auth)
        auth.duringSignIn = { await gate.wait() }
        model.code = "529614"
        let verifying = Task { await model.verify() }
        await gate.reached()
        #expect(!model.canChangeEmail)
        model.changeEmail()
        #expect(model.step == .code)
        gate.open()
        await verifying.value
        #expect(model.canChangeEmail)
        #expect(model.step == .code)
        #expect(model.failure == .codeNotVerified)
    }

    @Test func theAddressCantChangeWhileANewCodeIsOnItsWay() async {
        let gate = Gate()
        let clock = ManualContinuousClock()
        let auth = FakeAuth(send: [nil, .network])
        let model = await onCode(auth, clock)
        clock.advance(.seconds(60))
        await model.waitForResend()
        #expect(model.canResend)
        auth.duringSignIn = { await gate.wait() }
        let resending = Task { await model.resend() }
        await gate.reached()
        #expect(!model.canChangeEmail)
        model.changeEmail()
        #expect(model.step == .code)
        gate.open()
        await resending.value
        #expect(model.resendFailure == .network)
        #expect(model.failure == nil)
        #expect(model.step == .code)
        #expect(model.canChangeEmail)
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
        // The line was about digits that are gone (handoff 7's `authForm.resendSuccess`: "Only
        // server success clears old code").
        #expect(model.failure == nil)
        #expect(model.resendFailure == nil)
        #expect(!model.canResend)
        model.code = "529614"
        #expect(model.canVerify)
        await model.waitForResend()
        #expect(clock.waits == [.seconds(120)])
    }

    /// Handoff 7's `authForm.resendSuccess`: "Failed resend keeps old challenge/digits and does
    /// not restart interval." The line is the resend's own, not the code's.
    @Test func aRefusedNewCodeKeepsTheDigitsAndTheRow() async {
        for (answer, failure) in [
            (AuthFailure.network, SignInModel.ResendFailure.network), (.refused, .refused),
        ] {
            let auth = FakeAuth(send: [nil, answer])
            let clock = ManualContinuousClock()
            let model = await onCode(auth, clock)
            model.code = "52961"
            clock.advance(.seconds(60))
            await model.waitForResend()
            await model.resend()
            #expect(model.resendFailure == failure)
            #expect(model.failure == nil)
            #expect(model.code == "52961")
            #expect(model.canResend)
            #expect(model.resendDue == nil)
        }
    }

    /// While a new code is on its way the code is read-only, as it is while it is checked
    /// (handoff 7's `authForm.resendConcurrency`: "Verify, Change email address and input edits
    /// are inactive while resending. Verify remains unavailable even if the previous challenge
    /// has six digits."). A refusal gives editing back with the digits kept; a new code gives it
    /// back with the digits cleared. Send a new code stays offered throughout and after a
    /// refusal, so the screen has no availability to say again (handoff 7's
    /// `announcementPolicy.resend`: "restores resend action without a second availability
    /// announcement").
    @Test func theCodeCantBeEditedWhileANewCodeIsOnItsWay() async {
        for answer in [AuthFailure.network, .refused, nil] {
            let gate = Gate()
            let clock = ManualContinuousClock()
            let auth = FakeAuth(send: [nil, answer])
            let model = await onCode(auth, clock)
            model.code = "529614"
            clock.advance(.seconds(60))
            await model.waitForResend()
            auth.duringSignIn = { await gate.wait() }
            let resending = Task { await model.resend() }
            await gate.reached()
            #expect(model.isResending)
            #expect(model.canResend)
            #expect(!model.canVerify)
            model.code = "529613"
            #expect(model.code == "529614")
            model.code = ""
            #expect(model.code == "529614")
            gate.open()
            await resending.value
            #expect(!model.isResending)
            #expect(model.canResend == (answer != nil))
            #expect(model.code == (answer == nil ? "" : "529614"))
            model.code = "529613"
            #expect(model.code == "529613")
            #expect(model.canVerify)
        }
    }

    /// Handoff 7's `authForm.resendFailure`: "Dedicated block below resend action, not the code
    /// validation block. Keep an existing wrong-code message in its original block too." A code
    /// not verified stays while a new code is on its way and after it fails, beside the resend's
    /// own line, and the field stays marked; the order the two come in makes no difference.
    @Test func aFailedNewCodeLeavesAWrongCodeLineAlone() async {
        let gate = Gate()
        let clock = ManualContinuousClock()
        let auth = FakeAuth(send: [nil, .network], verify: [.failure(.codeNotVerified)])
        let model = await onCode(auth, clock)
        model.code = "529614"
        await model.verify()
        #expect(model.failure == .codeNotVerified)
        clock.advance(.seconds(60))
        await model.waitForResend()
        auth.duringSignIn = { await gate.wait() }
        let resending = Task { await model.resend() }
        await gate.reached()
        #expect(model.failure == .codeNotVerified)
        gate.open()
        await resending.value
        #expect(model.failure == .codeNotVerified)
        #expect(model.resendFailure == .network)
        #expect(model.code == "529614")

        // The other way round: the resend fails first, then the code isn't verified.
        let first = FakeAuth(send: [nil, .refused], verify: [.failure(.codeNotVerified)])
        let laterClock = ManualContinuousClock()
        let other = await onCode(first, laterClock)
        laterClock.advance(.seconds(60))
        await other.waitForResend()
        await other.resend()
        other.code = "529614"
        await other.verify()
        #expect(other.failure == .codeNotVerified)
        #expect(other.resendFailure == .refused)
    }

    /// How long a resend's line lasts, which no source says (`signin.md` F4): until the next
    /// resend starts, or a new code goes, or Change email address. Typing a code, or a verify
    /// that fails, leaves it: it is about the new code, not the digits.
    @Test func aResendsLineLastsUntilTheNextResend() async {
        let gate = Gate()
        let clock = ManualContinuousClock()
        let auth = FakeAuth(
            send: [nil, .network, .refused, nil], verify: [.failure(.network)])
        let model = await onCode(auth, clock)
        clock.advance(.seconds(60))
        await model.waitForResend()
        await model.resend()
        #expect(model.resendFailure == .network)
        model.code = "52961"
        model.code = "529614"
        #expect(model.resendFailure == .network)
        await model.verify()
        #expect(model.failure == .verifyNetwork)
        #expect(model.resendFailure == .network)

        // The next resend clears it as it starts, and leaves the code's line.
        auth.duringSignIn = { await gate.wait() }
        let again = Task { await model.resend() }
        await gate.reached()
        #expect(model.resendFailure == nil)
        #expect(model.failure == .verifyNetwork)
        gate.open()
        await again.value
        #expect(model.resendFailure == .refused)

        // A new code that goes clears both: the digits the code's line named are gone.
        auth.duringSignIn = {}
        await model.resend()
        #expect(model.resendFailure == nil)
        #expect(model.failure == nil)
        #expect(model.code == "")
    }

    /// A code that goes clears both lines, whichever request sent it: the model's own rule, not
    /// only the screens' order (A02-email is behind A02-code, so the first code is sent with
    /// neither line showing). The two requests here run one after the other; neither can start
    /// while the other runs (`sendNothingWhileACheckOrANewCodeIsOnItsWay`).
    @Test func aCodeThatGoesClearsBothLinesWhicheverRequestSentIt() async {
        let clock = ManualContinuousClock()
        let auth = FakeAuth(send: [nil, .network], verify: [.failure(.codeNotVerified)])
        let model = await onCode(auth, clock)
        model.code = "529614"
        await model.verify()
        clock.advance(.seconds(60))
        await model.waitForResend()
        await model.resend()
        #expect(model.resendFailure == .network)
        await model.sendCode()
        #expect(auth.calls.last == "sendCode ben@example.com")
        #expect(model.failure == nil)
        #expect(model.resendFailure == nil)
        #expect(model.code == "")
    }

    /// Send a new code waits while the code is checked, even once its minute has passed
    /// (handoff 7's `busyPrimary.leaveChangeResend`: "Inactive while primary request or routing
    /// account read runs; do not queue another action"; IMPLEMENTATION.md: "Send a new code is
    /// also inactive if its minute has elapsed"). Nothing goes, the digits stay, and the check's
    /// answer is about those digits.
    @Test func noNewCodeGoesWhileTheCodeIsChecked() async {
        let gate = Gate()
        let clock = ManualContinuousClock()
        let auth = FakeAuth(verify: [.failure(.codeNotVerified)])
        let model = await onCode(auth, clock)
        clock.advance(.seconds(60))
        await model.waitForResend()
        #expect(model.canResend)
        model.code = "529614"
        auth.duringSignIn = { await gate.wait() }
        let verifying = Task { await model.verify() }
        await gate.reached()
        auth.duringSignIn = {}
        await model.resend()
        #expect(!model.isResending)
        gate.open()
        await verifying.value
        #expect(auth.calls == ["sendCode ben@example.com", "verify ben@example.com 529614"])
        #expect(model.code == "529614")
        #expect(model.failure == .codeNotVerified)
        #expect(model.resendFailure == nil)
        #expect(model.canResend)
    }

    /// Each request goes once at a time: while a code is checked or a new code is on its way, a
    /// code isn't sent either, whatever asks (no screen can: A02-email is under A02-code). So a
    /// late answer never lands on a screen that has moved on.
    @Test func sendNothingWhileACheckOrANewCodeIsOnItsWay() async {
        for checking in [true, false] {
            let gate = Gate()
            let clock = ManualContinuousClock()
            let auth = FakeAuth(verify: [.failure(.codeNotVerified)])
            let model = await onCode(auth, clock)
            clock.advance(.seconds(60))
            await model.waitForResend()
            model.code = "529614"
            auth.duringSignIn = { await gate.wait() }
            let running = Task {
                if checking { await model.verify() } else { await model.resend() }
            }
            await gate.reached()
            auth.duringSignIn = {}
            let calls = auth.calls
            let due = model.resendDue
            #expect(!model.canSend)
            await model.sendCode()
            #expect(auth.calls == calls)
            #expect(model.resendDue == due)
            #expect(!model.isSending)
            gate.open()
            await running.value
        }
    }

    /// Change email address leaves both lines behind: back on A02-email neither shows, and a
    /// code sent from there comes to A02-code with none.
    @Test func changingTheAddressClearsBothLines() async {
        let clock = ManualContinuousClock()
        let auth = FakeAuth(send: [nil, .network], verify: [.failure(.codeNotVerified)])
        let model = await onCode(auth, clock)
        model.code = "529614"
        await model.verify()
        clock.advance(.seconds(60))
        await model.waitForResend()
        await model.resend()
        #expect(model.failure == .codeNotVerified)
        #expect(model.resendFailure == .network)
        model.changeEmail()
        #expect(model.step == .email)
        #expect(model.failure == nil)
        #expect(model.resendFailure == nil)
        model.email = "debby@example.com"
        await model.sendCode()
        #expect(model.step == .code)
        #expect(model.failure == nil)
        #expect(model.resendFailure == nil)
    }
}
