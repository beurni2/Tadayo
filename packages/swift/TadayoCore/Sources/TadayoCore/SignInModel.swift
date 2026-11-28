import Foundation
import Observation

/// A02-email and A02-code (handoff 1, as handoff 2 corrected it; handoff 4's `failureStates`;
/// handoff 7's `authForm`): an address, a six-digit code sent to it, and a new code no sooner than
/// a minute after the last one the server accepted. Each request goes once at a time; a failure
/// keeps what was typed.
///
/// Before them, Welcome (A01; handoffs 8 and 9) and the route the person takes from it (`Way`),
/// when the flow starts there (`showsWelcome`): I have an invite's paste step comes between, signed
/// out (`linkEntry`). The root says where the flow starts and holds what the route leaves for
/// after sign-in (`docs/plans/ios-b1-welcome.md` section 2).
@MainActor @Observable public final class SignInModel {
    public enum Step: Sendable, Equatable {
        case email
        case code
    }

    /// Welcome's three routes (handoff 8's `welcome.routes`; handoff 9's `welcome`).
    public enum Way: Sendable, Equatable {
        /// Create a club: A02-email, the age and the profile if the account needs them, then
        /// `G01-create`, which the root opens once the tabs show.
        case createClub
        /// I have an invite: the paste step, `G02-link-entry`, signed out, whose Continue holds a
        /// link; then A02-email, and the invitation once the tabs show.
        case invitation
        /// Already here? Sign in: A02-email, then wherever the account goes.
        case signIn
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
    /// The flow starts at Welcome, under the screens Welcome's routes push. False for one that
    /// starts at A02-email: a link is held (book p9: "A received invite skips the generic
    /// introduction"), the server ended the sign-in, or Retry after one the phone couldn't keep.
    public private(set) var showsWelcome: Bool
    /// The route taken from Welcome; nil while Welcome shows, or for a flow that starts at
    /// A02-email.
    public private(set) var way: Way?
    /// I have an invite's paste step, signed out, while that route is taken.
    public private(set) var linkEntry: InvitationLinkEntryModel?

    private var typedAddress = ""
    private var digits = ""

    let auth: any AuthService
    let verified: @MainActor (AuthSession) async -> Void
    let now: @Sendable () -> ContinuousClock.Instant
    let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void
    let hold: @MainActor (InvitationToken) -> Void
    let letGo: @MainActor (InvitationToken?) -> Void

    /// `verified` takes the session a code gave; `signInEnded` says the server ended the sign-in
    /// before; `now` and `sleep` time the resend wait on the continuous clock, which keeps counting
    /// while the phone sleeps. `welcome` starts the flow at Welcome; then the paste step's Continue
    /// gives its link to `hold`, for after sign-in, and `letGo` is told when one is let go: the
    /// paste step's own link when Back leaves A02-email for it, and any link held (nil) when
    /// Welcome shows again.
    public init(
        auth: any AuthService,
        verified: @escaping @MainActor (AuthSession) async -> Void,
        signInEnded: Bool = false,
        welcome: Bool = false,
        hold: @escaping @MainActor (InvitationToken) -> Void = { _ in },
        letGo: @escaping @MainActor (InvitationToken?) -> Void = { _ in },
        now: @escaping @Sendable () -> ContinuousClock.Instant = { .now },
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void = {
            try await Task.sleep(until: $0, clock: .continuous)
        }
    ) {
        self.auth = auth
        self.verified = verified
        self.signInEnded = signInEnded
        self.showsWelcome = welcome
        self.hold = hold
        self.letGo = letGo
        self.now = now
        self.sleep = sleep
    }

    /// One of Welcome's routes, while Welcome shows with none taken.
    public func choose(_ way: Way) {
        guard showsWelcome, self.way == nil else { return }
        self.way = way
        if way == .invitation {
            linkEntry = InvitationLinkEntryModel(
                hold: { [weak self] token in self?.hold(token) },
                letGo: { [weak self] token in self?.letGo(token) })
        }
    }

    /// Back to Welcome, from any screen its route pushed, while no request is on its way (the
    /// back button hides then): the route is forgotten, the paste step is left, and any link held
    /// is let go, so Welcome shown again holds nothing for after sign-in (handoff 9's
    /// `linkEntry.cancellation`: "discard the account-scoped intent on explicit exit"). The address
    /// typed stays; A02-code's lines and A02-email's go.
    public func returnToWelcome() {
        guard showsWelcome, way != nil, !isSending, canChangeEmail else { return }
        if step == .code { changeEmail() }
        failure = nil
        linkEntry?.left()
        linkEntry = nil
        way = nil
        letGo(nil)
    }

    /// Back from A02-email to the paste step under it, while no request is on its way: the link it
    /// held is let go, and the field keeps its text, so Continue holds it again.
    public func returnToLinkEntry() {
        guard way == .invitation, !isSending, canChangeEmail else { return }
        if step == .code { changeEmail() }
        failure = nil
        linkEntry?.returned()
    }

    /// A link was opened while signed out, and the root holds it. Where Welcome shows, the flow
    /// starts at A02-email instead (book p9); after Create a club, the link replaces it, A02-email
    /// staying where it is; anywhere else nothing moves.
    func received() {
        switch way {
        case nil: showsWelcome = false
        case .createClub: way = .signIn
        case .invitation, .signIn: break
        }
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
