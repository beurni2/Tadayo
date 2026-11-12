import Foundation

/// What VoiceOver says as a sign-in request begins, and A02-email's notice after a sign-in the
/// server ended, without moving its focus (handoff 7's
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
