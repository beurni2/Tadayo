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

    let make: @MainActor (InvitationToken) -> InvitationModel?
    let released: @MainActor (InvitationModel) -> Void

    /// `make` gives the invitation's model for a token, or nil once the session it was made in has
    /// ended; `released` is told when a model is done with: left (Back), replaced by the next
    /// Continue's, or its club opened while the link was checked.
    public init(
        make: @escaping @MainActor (InvitationToken) -> InvitationModel?,
        released: @escaping @MainActor (InvitationModel) -> Void
    ) {
        self.make = make
        self.released = released
    }

    /// What's in the field. A write while the link is checked is ignored; any other clears the
    /// line.
    public var text: String {
        get { typed }
        set {
            guard !isChecking else { return }
            typed = newValue
            problem = nil
        }
    }
    private var typed = ""

    /// Continue: the field has something in it besides spaces, no check is on its way, and it
    /// isn't the text just found not to be a link, which waits for an edit (handoff 9's frame 4:
    /// "Continue unavailable until locally plausible").
    public var canContinue: Bool {
        !typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isChecking
            && problem != .invalid
    }

    /// The system's paste control's text, or nil when it had none to give.
    public func pasted(_ text: String?) {
        guard !isChecking else { return }
        guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            problem = .clipboardEmpty
            return
        }
        typed = text
        problem = nil
    }

    /// Continue: reads the field as an invitation link and checks it.
    public func proceed() async {
        guard canContinue else { return }
        guard let token = InvitationToken(link: typed) else {
            problem = .invalid
            return
        }
        guard let model = make(token) else { return }
        // A new check: an invitation still handed over is done with.
        if let shown = invitation {
            invitation = nil
            released(shown)
        }
        problem = nil
        isChecking = true
        await model.check()
        isChecking = false
        // Set aside by the root while it was checked (the account found incomplete): nothing to
        // show.
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

    /// The invitation shown has been left (Back): the field is as it was.
    public func returned() {
        if let invitation { released(invitation) }
        invitation = nil
    }

    public nonisolated var description: String { "InvitationLinkEntryModel" }
    public nonisolated var customMirror: Mirror { Mirror(self, children: [:]) }
}
