import Foundation
import Observation

/// I have an invite's paste step (`G02-link-entry-signed-in`; handoffs 2 and 4;
/// `docs/plans/ios-b1-invitation.md` section 1). The field holds what was pasted or typed; the
/// clipboard is read only when the person uses the system's paste control, which hands its text
/// here (handoff 2). Continue reads the field as an invitation link, `https://tadayo.app/i#<token>`
/// and nothing else, never fetching a pasted URL, then checks it on this screen: no answer keeps
/// the text with the check's failure, and any answer is the invitation, handed over to be shown
/// (handoff 4), except a club the account is already in, which opens. Back to this screen finds
/// the text as it was. What's typed may hold a token, so
/// nothing the model prints, reflects or dumps holds it (T7, T52).
///
/// Signed out, from Welcome (`G02-link-entry`, handoff 2's frame 11; `init(hold:letGo:)`), it
/// checks nothing: Continue holds the link for the sign-in that follows ("A valid format stores an
/// opaque invitation intent. If signed out, continue through authentication before fetching or
/// displaying the club and roster"), and Back to the field, or away from the step, lets it go
/// (handoff 9's `linkEntry.cancellation`; `docs/plans/ios-b1-welcome.md` section 2).
@MainActor @Observable
public final class InvitationLinkEntryModel: CustomStringConvertible,
    CustomReflectable
{
    /// The line under the field.
    public enum Problem: Sendable, Equatable {
        /// "That doesn’t look like a Tadayo invitation link. Check the link and try again."
        case invalid
        /// "There isn’t an invitation link to paste. Copy the link and try again."
        case clipboardEmpty
        /// "Couldn’t check the invitation link. Check your connection and try again." when no
        /// answer came (`linkEntry.cannotCheck`), or "Couldn’t check the invitation link. Try
        /// again." when the server answered otherwise (handoff 9's `entry.answeredFailure`).
        case cannotCheck(InvitationModel.Failure)
    }

    public private(set) var problem: Problem?
    /// The link is being checked: the field is read-only and Continue waits.
    public private(set) var isChecking = false
    /// The invitation the last Continue found, to show; nil until one is found.
    public private(set) var invitation: InvitationModel?
    /// The club the link opened, the account already being a member: the root has kept it as the
    /// selected club and read the list again, and the paste step is done (`handoff8.joinedLink`).
    public private(set) var opened: ClubRef?
    /// Signed out, Continue held the link: A02-email follows, over this step.
    public private(set) var isHeld = false

    /// What Continue does with a link.
    private enum Mode {
        /// Signed in: checks it, with the invitation's model `make` gives, and tells `released`
        /// when that model is done with.
        case check(
            make: @MainActor (InvitationToken) -> InvitationModel?,
            released: @MainActor (InvitationModel) -> Void)
        /// Signed out: holds it with `hold`, and lets it go with `letGo`.
        case hold(
            hold: @MainActor (InvitationToken) -> Void,
            letGo: @MainActor (InvitationToken) -> Void)
    }

    private let mode: Mode
    /// Signed out, the link Continue held, until Back lets it go.
    private var held: InvitationToken?

    /// Signed in: `make` gives the invitation's model for a token, or nil once the session it was
    /// made in has ended; `released` is told when a model is done with: left (Back), replaced by
    /// the next Continue's, or its club opened while the link was checked.
    public init(
        make: @escaping @MainActor (InvitationToken) -> InvitationModel?,
        released: @escaping @MainActor (InvitationModel) -> Void
    ) {
        mode = .check(make: make, released: released)
    }

    /// Signed out: `hold` takes the link Continue read, for the sign-in that follows, and `letGo`
    /// is told when it's let go: Back to the field, or away from the step.
    public init(
        hold: @escaping @MainActor (InvitationToken) -> Void,
        letGo: @escaping @MainActor (InvitationToken) -> Void
    ) {
        mode = .hold(hold: hold, letGo: letGo)
    }

    /// Continue checks the link here (signed in), or holds it for after sign-in (signed out).
    public var checks: Bool {
        if case .check = mode { return true }
        return false
    }

    /// What's in the field. A write while the link is checked is ignored; any other clears the
    /// line, except that text found not to be a link keeps its line, and Continue waits, until the
    /// field holds a plausible link or is emptied (handoff 9's `localInvalid`: the message and the
    /// unavailable Continue are one state).
    public var text: String {
        get { typed }
        set {
            guard !isChecking else { return }
            typed = newValue
            settle()
        }
    }
    private var typed = ""
    /// The paste step has been left (`left()`): nothing more is checked or shown.
    private var isLeft = false
    /// Text was found not to be a link: Continue waits, and the line stays, until the field holds
    /// a plausible link or is emptied.
    private var awaitsPlausibleLink = false
    /// The invitation being checked, until its check is done: closed at once if the paste step is
    /// left meanwhile.
    private var checked: InvitationModel?

    /// Continue: the field has something in it besides spaces, no check is on its way, the step
    /// hasn't been left, and it isn't text found not to be a link (handoff 9's frame 4: "makes
    /// Continue unavailable until the input is locally plausible").
    public var canContinue: Bool {
        !typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isChecking && !isLeft
            && !awaitsPlausibleLink && !isHeld
    }

    /// The system's paste control's text, or nil when it had none to give.
    public func pasted(_ text: String?) {
        guard !isChecking else { return }
        guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            problem = .clipboardEmpty
            return
        }
        typed = text
        settle()
    }

    /// The line after the field has changed: none, unless the text found not to be a link is
    /// still neither a plausible link nor empty.
    private func settle() {
        if awaitsPlausibleLink {
            let empty = typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            guard empty || InvitationToken(link: typed) != nil else {
                problem = .invalid
                return
            }
            awaitsPlausibleLink = false
        }
        problem = nil
    }

    /// Continue: reads the field as an invitation link and checks it, or, signed out, holds it.
    public func proceed() async {
        guard canContinue, !isLeft else { return }
        guard let token = InvitationToken(link: typed) else {
            problem = .invalid
            awaitsPlausibleLink = true
            return
        }
        let make: @MainActor (InvitationToken) -> InvitationModel?
        let released: @MainActor (InvitationModel) -> Void
        switch mode {
        case .hold(let hold, _):
            problem = nil
            held = token
            isHeld = true
            hold(token)
            return
        case .check(let making, let releasing):
            (make, released) = (making, releasing)
        }
        guard let model = make(token) else { return }
        // A new check: an invitation still handed over is done with.
        if let shown = invitation {
            invitation = nil
            released(shown)
        }
        problem = nil
        isChecking = true
        checked = model
        await model.check()
        if checked === model { checked = nil }
        isChecking = false
        // Set aside by the root while it was checked (the account found incomplete), or let go
        // because the paste step was left: nothing to show.
        guard !model.isClosed else { return }
        switch model.state {
        case .checkFailed(let failure):
            problem = .cannotCheck(failure)
        case .checking:
            // Not checked: the session it was made in has ended.
            break
        case .opening(let club):
            // The club opened while the link was checked: nothing is left to show.
            opened = club
            released(model)
        default:
            invitation = model
        }
    }

    /// The invitation shown has been left (Back), or, signed out, A02-email over the step: the
    /// field is as it was, and the link held is let go (Continue holds it again).
    public func returned() {
        switch mode {
        case .check(_, let released):
            if let invitation { released(invitation) }
            invitation = nil
        case .hold(_, let letGo):
            isHeld = false
            if let held {
                self.held = nil
                letGo(held)
            }
        }
    }

    /// The paste step itself has been left (Back, or its screens closed), with or without a check
    /// on its way (handoff 9's `linkEntry.cancellation`: "Back may cancel an in-flight read"): the
    /// invitation shown is let go, a check still on its way is closed at once, so its answer opens
    /// no club and keeps no link, and nothing more is checked. No invitation from a link the
    /// person walked away from is kept, shown, joined or held for the next sign-in.
    public func left() {
        isLeft = true
        if let checked, case .check(_, let released) = mode {
            self.checked = nil
            released(checked)
        }
        returned()
    }

    public nonisolated var description: String { "InvitationLinkEntryModel" }
    public nonisolated var customMirror: Mirror { Mirror(self, children: [:]) }
}
