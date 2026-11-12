import Foundation

/// What VoiceOver says as a sign-in request begins, along A02-code's resend row, and A02-email's
/// notice after a sign-in the server ended, without moving its focus (handoff 7's
/// `announcementPolicy.busy`: "Announce the action once, keep focus; button label stable, value
/// vo.busy.value. Do not repeat on renders."). A hosted test can't hear VoiceOver, so the choice
/// is made here, as `TabsView.announcement` makes the tabs', and the screen says what it returns.
enum SignInAnnouncement {
    /// "Sending a code.", once, as Send a code's request begins (`isSending` turns true), and
    /// nothing when it ends, goes on, or the screen redraws. It is said at the default priority:
    /// it acknowledges the person's own tap, as a failure's words are said; handoff 7 gives no
    /// priority (`docs/design/handoff-7/ios-lane-needs.md`, item 57).
    static func sending(from was: Bool, to now: Bool) -> String? {
        begins(from: was, to: now) ? String(localized: "auth.email.busy.vo") : nil
    }

    /// "Saving your age confirmation.", once, as I’m 18 or older's request begins (`isSaving`
    /// turns true), as `sending` says its words (handoff 7's `vo.age.busy`).
    static func savingAge(from was: Bool, to now: Bool) -> String? {
        begins(from: was, to: now) ? String(localized: "auth.age.busy.vo") : nil
    }

    /// "Verifying code.", once, as Verify code's request begins (`isVerifying` turns true), as
    /// `sending` says its words (handoff 7's `vo.code.busy`).
    static func verifying(from was: Bool, to now: Bool) -> String? {
        begins(from: was, to: now) ? String(localized: "auth.code.busy.vo") : nil
    }

    /// "Sending a new code…", once, as Send a new code's request begins (`isResending` turns
    /// true): handoff 7's `vo.resend.busy`, the words the row then shows (`auth.code.resending`).
    static func resending(from was: Bool, to now: Bool) -> String? {
        begins(from: was, to: now) ? String(localized: "auth.code.resending") : nil
    }

    /// "Send a new code is available." once the minute has passed (handoff 7's
    /// `vo.resend.available`), nil while it runs; the screen says it, politely, as it changes to
    /// something. A failed new code leaves Send a new code offered, so it isn't said again then:
    /// handoff 7's "Failed resend uses its exact failure announcement and restores resend action
    /// without a second availability announcement" (`copy-contracts.json`).
    static func resendAvailable(_ canResend: Bool) -> String? {
        canResend ? String(localized: "auth.code.resendAvailable.vo") : nil
    }

    /// "Check ben@example.com for a new code. You can send a new code after one minute.", once a
    /// new code has gone and its minute begun (`resendDue` set): handoff 7's `vo.resend.success`,
    /// which "includes waiting state". Nil as the minute ends (`resendDue` cleared). The address
    /// is said on the device only, never logged (T52).
    static func newCode(to address: String, due: ContinuousClock.Instant?) -> String? {
        guard due != nil else { return nil }
        return String(format: String(localized: "auth.code.resent.vo"), address)
    }

    /// A02-email's notice after a sign-in the server ended, "Your sign-in ended. Enter your email
    /// to sign in again." (handoff 7's `auth.email.signedOut`), which the screen shows and says
    /// as it first shows it; nil after a Leave the person asked for, or with no sign-in before.
    /// Handoff 7 gives it no frame, ink, gaps, announcement or lifetime (W-10), so its reading is
    /// built from spec: said once, politely, after what VoiceOver says of the new screen, and gone
    /// once a code is sent (`SignInModel.signInEnded`).
    static func signedOutNotice(signInEnded: Bool) -> String? {
        signInEnded ? String(localized: "auth.email.signedOut") : nil
    }

    private static func begins(from was: Bool, to now: Bool) -> Bool { !was && now }
}
