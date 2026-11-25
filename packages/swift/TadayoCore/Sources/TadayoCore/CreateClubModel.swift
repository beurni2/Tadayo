import Foundation
import Observation

/// Naming a new club (`G01-create`, `G01-create-failed`; book p33; spec 04). Continue to
/// invitations makes the club with its name and the device's zone, which is the club's from then
/// on (FQ19). The make is one action with one key, made when it starts and sent again, with the
/// same body, on every retry of it (T19); a changed name is a new action. A failure keeps the
/// name, editable (handoff 8's `B1LoadShell.transientFailure`). An answer counts only while
/// `current` says the session it was asked in goes on. No cover in the trial (FQ17).
@MainActor @Observable public final class CreateClubModel {
    /// "Couldn’t create the club. Check your connection and try again." or "… Try again."
    /// (handoff 8's frame 7 and `failureStates`).
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    /// FQ70: a club's name is 1 to 40 grapheme clusters, which Swift counts as `Character`s. A
    /// longer one isn't cut: the API refuses a name rather than changing it, and so does this
    /// model.
    public static let nameLimit = 40

    public private(set) var isCreating = false
    public private(set) var failure: Failure?
    /// The club made, once the server has answered for it: Continue makes no other.
    public private(set) var club: ClubDetail?

    private var pending: (name: String, timezone: TimeZone, key: IdempotencyKey)?

    let service: any ClubService
    let makeKey: @Sendable () -> IdempotencyKey
    let timezone: @Sendable () -> TimeZone
    let current: @MainActor () -> Bool
    let created: @MainActor (ClubDetail) async -> Void
    let signedOut: @MainActor () async -> Void

    /// `current` says the session the model was made in goes on; `created` takes the club once
    /// it's made, to show its invitations; `signedOut` ends the session.
    public init(
        service: any ClubService,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        timezone: @escaping @Sendable () -> TimeZone = { TimeZone.current },
        current: @escaping @MainActor () -> Bool,
        created: @escaping @MainActor (ClubDetail) async -> Void,
        signedOut: @escaping @MainActor () async -> Void
    ) {
        self.service = service
        self.makeKey = makeKey
        self.timezone = timezone
        self.current = current
        self.created = created
        self.signedOut = signedOut
    }

    /// The name as typed. While the club is being made the field is read-only, so it keeps its
    /// focus and its keyboard, as the profile's does (handoff 7's `busyPrimary.field`): a write
    /// made then is ignored, and the name stays what's being sent.
    public var name: String {
        get { typedName }
        set {
            guard !isCreating else { return }
            typedName = newValue
        }
    }
    private var typedName = ""

    /// The name, trimmed, is longer than FQ70's 40 characters: Continue waits for a shorter one.
    public var nameIsTooLong: Bool { trimmedName.count > Self.nameLimit }

    /// Continue to invitations: a name with something in it besides spaces, no longer than 40
    /// characters, nothing on its way, and no club made yet.
    public var canContinue: Bool {
        !trimmedName.isEmpty && !nameIsTooLong && !isCreating && club == nil
    }

    /// Continue to invitations: makes the club with the name, trimmed.
    public func create() async {
        guard canContinue else { return }
        let name = trimmedName
        isCreating = true
        failure = nil
        defer { isCreating = false }
        let attempt =
            pending.flatMap { $0.name == name ? $0 : nil } ?? (
                name: name, timezone: timezone(), key: makeKey()
            )
        pending = attempt
        do {
            let made = try await service.createClub(
                name: attempt.name, timezone: attempt.timezone, key: attempt.key)
            pending = nil
            guard current() else { return }
            club = made
            await created(made)
        } catch .network {
            guard current() else { return }
            failure = .network
        } catch .unavailable, .unreadable {
            // The server may have made it (a busy server, or an answer this build couldn't
            // read): the retry sends the same key, so it's made once.
            guard current() else { return }
            failure = .other
        } catch .signedOut {
            pending = nil
            guard current() else { return }
            await signedOut()
        } catch {
            pending = nil
            guard current() else { return }
            failure = .other
        }
    }

    private var trimmedName: String { typedName.trimmingCharacters(in: .whitespacesAndNewlines) }
}
