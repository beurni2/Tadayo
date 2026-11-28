/// What VoiceOver is told once after Remove invitation, on the setup list and on Members (FQ148;
/// handoff 11's sections 3 to 5): the person's invitation was removed, on the server's answer
/// alone, said once the read after it has answered; or, after a removal that got no answer or
/// wasn't found, the list read again no longer shows them, which never says why, since joining
/// also takes a row away. `sequence` tells one notice from the next, so each is said once.
public struct RemovalNotice: Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        /// "{name}’s invitation was removed.", with the removed row's place among the rows as
        /// they showed: on the setup list, VoiceOver's focus goes on to Create an invitation if
        /// the read after the answer brought it back.
        case removed(name: String, position: Int)
        /// "Invitation list updated." on the setup list, "Members updated." on Members.
        case updated
    }

    public let kind: Kind
    public let sequence: Int

    public init(kind: Kind, sequence: Int) {
        self.kind = kind
        self.sequence = sequence
    }
}

/// A removed person's row gone from the screen on the server's answer, before the read after it:
/// VoiceOver's focus leaves it at once for the row now in its place, else the one before (handoff
/// 11's section 4: "Do not leave focus on a disappeared More control"). `position` is the row's
/// place among the rows as they showed; `sequence` tells one from the next, so focus moves once
/// for each.
public struct RemovedRow: Sendable, Equatable {
    public let position: Int
    public let sequence: Int

    public init(position: Int, sequence: Int) {
        self.position = position
        self.sequence = sequence
    }
}

extension APIFailure {
    /// A removal that failed this way may still have been carried out: no answer, or one this
    /// build can't read. Its line says the app couldn't confirm it ("Couldn’t confirm that
    /// {name}’s invitation to {clubName} was removed. Check your connection and try again.");
    /// any other failure's says it couldn't remove it (handoff 11's section 4).
    var leavesRemovalUncertain: Bool { self == .network || self == .unreadable }
}
