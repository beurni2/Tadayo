import Foundation
import Observation

/// A02-email and A02-code (handoff 1, as handoff 2 corrected it; handoff 4's `failureStates`;
/// handoff 7's `authForm`): an address, a six-digit code sent to it, and a new code no sooner than
/// a minute after the last one the server accepted. Each request goes once at a time; a failure
/// keeps what was typed.
@MainActor @Observable public final class SignInModel {
    public enum Step: Sendable, Equatable {
        case email
        case code
    }

    /// What went wrong with the address or the code, one line at a time; the app gives each its
    /// delivered words. A new code's failure is a `ResendFailure`, a line of its own.
    public enum Failure: Sendable, Equatable {
        /// "Couldn’t send a code. Check your connection and try again."
        case sendNetwork
        /// "Couldn’t send a code. Try again." (`auth.firstSend.refused`)
        case sendRefused
        /// "Couldn’t verify the code. Check your connection and try again."
        case verifyNetwork
        /// `codeVerificationFailure`: Supabase answers a wrong code and an expired one alike.
        case codeNotVerified
        /// Supabase was busy or failing (429 or 5xx), so it said nothing about the code: the
        /// same digits can be tried again. "Couldn’t verify the code. Try again." (FQ86; handoff
        /// 7's `auth.code.unavailable` has the same words.)
        case verifyUnavailable
    }

    /// Why the last new code didn't go: a line in its own block under the resend row, beside a
    /// code's line, never in its place (handoff 7's `authForm.resendFailure`: "Dedicated block
    /// below resend action, not the code validation block. Keep an existing wrong-code message
    /// in its original block too").
    public enum ResendFailure: Sendable, Equatable {
        /// "Couldn’t send a new code. Check your connection and try again."
        case network
        /// "Couldn’t send a new code. Try again." (`auth.resend.refused`)
        case refused
    }

    public static let codeLength = 6
    /// Handoff 1: "no earlier than 60 seconds after a successful send". A wait for the screen
    /// only: Supabase keeps its own (T1).
    public static let resendWait: Duration = .seconds(60)

    public private(set) var step = Step.email
    /// The address as typed. While a code is on its way the field is read-only, not disabled, so
    /// it keeps its focus and its keyboard (handoff 7's `busyPrimary.field`: "read-only, keep
    /// first responder and keyboard if already shown; restore editing after failure"): a write
    /// made then is ignored, and the address stays what was sent.
    public var email: String {
        get { typedAddress }
        set {
            guard !isSending else { return }
            typedAddress = newValue
        }
    }
    /// The address the last code went to, as A02-code shows it.
    public private(set) var address = ""
    public private(set) var failure: Failure?
    /// The last new code's failure, until the next one is asked for, a new code goes, or the
    /// address is changed; typing a code or a verify leaves it, as it isn't about the digits. No
    /// source gives its lifetime (`docs/plans/ios-b0-adopt-handoff-7/signin.md`, F4).
    public private(set) var resendFailure: ResendFailure?
    public private(set) var isSending = false
    public private(set) var isVerifying = false
    public private(set) var isResending = false
    /// The minute since the last successful send has passed: the resend row offers a new code.
    public private(set) var canResend = false
    /// The sign-in before this one was ended by the server, not by the person: A02-email says so
    /// (handoff 7's `auth.email.signedOut`) until a code is sent. It lives in this model, in
    /// memory, and is never kept or logged.
    public private(set) var signInEnded: Bool
    /// When the resend row next changes, while A02-code waits; the view waits on it.
    public private(set) var resendDue: ContinuousClock.Instant?

    private var typedAddress = ""
    private var digits = ""

    let auth: any AuthService
    let verified: @MainActor (AuthSession) async -> Void
    let now: @Sendable () -> ContinuousClock.Instant
    let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void

    /// `verified` takes the session a code gave; `signInEnded` says the server ended the sign-in
    /// before; `now` and `sleep` time the resend wait on the continuous clock, which keeps counting
    /// while the phone sleeps.
    public init(
        auth: any AuthService,
        verified: @escaping @MainActor (AuthSession) async -> Void,
        signInEnded: Bool = false,
        now: @escaping @Sendable () -> ContinuousClock.Instant = { .now },
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void = {
            try await Task.sleep(until: $0, clock: .continuous)
        }
    ) {
        self.auth = auth
        self.verified = verified
        self.signInEnded = signInEnded
        self.now = now
        self.sleep = sleep
    }

    /// The code as typed or pasted: ASCII digits only, at most six. Editing it clears a failed
    /// verification's line; Verify code needs no edit to try the same six digits again. While
    /// the code is checked, through the account read that follows a verified one, and while a new
    /// code is on its way, the field is read-only, as the address is while a code is sent
    /// (handoff 7's `authForm.resendConcurrency`), and editing returns once the request ends.
    public var code: String {
        get { digits }
        set {
            guard !isVerifying, !isResending else { return }
            let typed = String(
                newValue.filter { $0.isASCII && $0.isWholeNumber }.prefix(Self.codeLength))
            guard typed != digits else { return }
            digits = typed
            if [.codeNotVerified, .verifyNetwork, .verifyUnavailable].contains(failure) {
                failure = nil
            }
        }
    }

    /// Send a code: a plausible address, and no request already on its way: neither a code, nor
    /// a check of one, nor a new code (A02-email sits under A02-code, so none of the screens can
    /// ask while another request runs, and the model doesn't let them either).
    public var canSend: Bool {
        Self.isPlausible(email) && !isSending && !isVerifying && !isResending
    }

    /// Verify code: six digits and nothing on its way. After a refused code it stays available,
    /// with the digits kept, as handoff 2's A02-code-error has it: "Verify code remains enabled
    /// for six digits because expiry is unknown."
    public var canVerify: Bool {
        digits.count == Self.codeLength && !isVerifying && !isResending
    }

    /// Asks for a code; A02-code comes only once the server accepts.
    public func sendCode() async {
        guard canSend else { return }
        isSending = true
        failure = nil
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await auth.sendCode(to: address)
            codeWasSent(to: address)
            signInEnded = false
            step = .code
        } catch .network {
            failure = .sendNetwork
        } catch {
            failure = .sendRefused
        }
        isSending = false
    }

    /// Verifies the six digits, on an explicit tap only.
    public func verify() async {
        guard canVerify else { return }
        isVerifying = true
        failure = nil
        let code = digits
        do {
            let session = try await auth.verify(email: address, code: code)
            await verified(session)
        } catch .network {
            failure = .verifyNetwork
        } catch .unavailable {
            failure = .verifyUnavailable
        } catch {
            failure = .codeNotVerified
        }
        isVerifying = false
    }

    /// Sends a new code to the same address. A refusal keeps the digits, the row and a code's
    /// line as they are, and says why in its own (handoff 7's `authForm.resendSuccess`: "Failed
    /// resend keeps old challenge/digits and does not restart interval.").
    public func resend() async {
        guard canResend, !isResending, !isVerifying else { return }
        isResending = true
        resendFailure = nil
        do {
            try await auth.sendCode(to: address)
            codeWasSent(to: address)
        } catch .network {
            resendFailure = .network
        } catch {
            resendFailure = .refused
        }
        isResending = false
    }

    /// Change email address is offered while no code is being verified or sent: an answer that
    /// came back on A02-email would belong to a screen no longer showing.
    public var canChangeEmail: Bool { !isVerifying && !isResending }

    /// Change email address: back to A02-email with the address as it was, and neither of
    /// A02-code's lines.
    public func changeEmail() {
        guard canChangeEmail else { return }
        step = .email
        failure = nil
        resendFailure = nil
    }

    /// Waits out the minute after the last successful send, then offers a new code. The view
    /// runs it for each `resendDue`; cancelling it changes nothing.
    public func waitForResend() async {
        guard let due = resendDue else { return }
        if now() < due { try? await sleep(due) }
        guard resendDue == due, now() >= due else { return }
        resendDue = nil
        canResend = true
    }

    /// A code went, as the server answered: the digits and any line about them or about the last
    /// new code go too (handoff 7's `authForm.resendSuccess`: "Only server success clears old
    /// code, updates challenge, begins new 60-second interval").
    private func codeWasSent(to address: String) {
        self.address = address
        digits = ""
        failure = nil
        resendFailure = nil
        canResend = false
        resendDue = now().advanced(by: Self.resendWait)
    }

    /// One `@`, something before it, and a dotted domain after it, with no space anywhere: enough
    /// to catch a slip, leaving the rest to the server.
    static func isPlausible(_ email: String) -> Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard address.count <= 254, !address.contains(where: \.isWhitespace) else { return false }
        let parts = address.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty else { return false }
        let labels = parts[1].split(separator: ".", omittingEmptySubsequences: false)
        return labels.count >= 2 && labels.allSatisfy { !$0.isEmpty }
    }
}
