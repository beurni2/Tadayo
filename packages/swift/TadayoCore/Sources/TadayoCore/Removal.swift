/// What VoiceOver is told once after Remove invitation, on the setup list and on Members (FQ148;
/// handoff 11's sections 3 to 5): the person's invitation was removed, on the server's answer
/// alone; or, after a removal that got no answer or wasn't found, the list read again no longer
/// shows them, which never says why, since joining also takes a row away. `sequence` tells one
/// notice from the next, so each is said once.
public struct RemovalNotice: Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        /// "{name}’s invitation was removed.", with the removed row's place among the rows as
        /// they showed, where VoiceOver's focus goes next.
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

extension APIFailure {
    /// A removal that failed this way may still have been carried out: no answer, or one this
    /// build can't read. Its line says the app couldn't confirm it ("Couldn’t confirm that
    /// {name}’s invitation to {clubName} was removed. Check your connection and try again.");
    /// any other failure's says it couldn't remove it (handoff 11's section 4).
    var leavesRemovalUncertain: Bool { self == .network || self == .unreadable }
}
