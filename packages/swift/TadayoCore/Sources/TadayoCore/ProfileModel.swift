import Foundation
import Observation

/// A02-age and A03-profile (handoff 1): "I’m 18 or older", then a name. Each save is one action
/// with one idempotency key, made when it starts and sent again, with the same body, on every
/// retry of it (T19); a changed name is a new action. A failure keeps the name.
@MainActor @Observable public final class ProfileModel {
    /// "Couldn’t save your profile. Check your connection and try again." or "… Try again."
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    /// FQ70: a name is 1 to 40 grapheme clusters, which Swift counts as `Character`s. A longer
    /// one isn't cut: the API refuses a name rather than changing it, and so does this model.
    public static let nameLimit = 40

    public private(set) var account: Account
    public private(set) var isSaving = false
    public private(set) var failure: Failure?

    private var pending: (change: AccountChange, key: IdempotencyKey)?

    let accounts: any AccountService
    let makeKey: @Sendable () -> IdempotencyKey
    let saved: @MainActor (Account) async -> Void
    let signedOut: @MainActor () async -> Void

    /// `saved` takes the account after a change, to route by it; `signedOut` ends the session.
    public init(
        account: Account, accounts: any AccountService,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        saved: @escaping @MainActor (Account) async -> Void,
        signedOut: @escaping @MainActor () async -> Void
    ) {
        self.account = account
        self.accounts = accounts
        self.makeKey = makeKey
        self.saved = saved
        self.signedOut = signedOut
    }

    /// The name as typed.
    public var name = ""

    /// The name, trimmed, is longer than FQ70's 40 characters: Continue waits for a shorter one.
    public var nameIsTooLong: Bool { trimmedName.count > Self.nameLimit }

    /// Continue: a name with something in it besides spaces, no longer than 40 characters, and
    /// nothing on its way.
    public var canContinue: Bool { !trimmedName.isEmpty && !nameIsTooLong && !isSaving }

    /// I’m 18 or older: records the confirmation alone, before any name.
    public func confirmAge() async {
        await save(.confirmAge(expectedVersion: account.version))
    }

    /// Continue: saves the name, trimmed. The API refuses a name rather than changing it.
    public func saveName() async {
        guard canContinue else { return }
        await save(.name(trimmedName, expectedVersion: account.version))
    }

    /// The account as the root last read it.
    func refresh(_ account: Account) {
        self.account = account
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func save(_ change: AccountChange) async {
        guard !isSaving else { return }
        isSaving = true
        failure = nil
        defer { isSaving = false }
        let key = pending.flatMap { $0.change == change ? $0.key : nil } ?? makeKey()
        pending = (change, key)
        do {
            let updated = try await accounts.update(change, key: key)
            pending = nil
            account = updated
            await saved(updated)
        } catch .network {
            failure = .network
        } catch .unavailable {
            failure = .other
        } catch .signedOut {
            pending = nil
            await signedOut()
        } catch .versionConflict, .profileIncomplete {
            pending = nil
            await reread(after: change)
        } catch {
            pending = nil
            failure = .other
        }
    }

    /// After a conflict, the account as it is now: if it already has the age, or a name (another
    /// device gave them), or the name has to wait for the age, the root routes by it. Else the
    /// save failed, and the next tap is a new action from the version read here.
    private func reread(after change: AccountChange) async {
        guard let current = try? await accounts.me() else {
            failure = .other
            return
        }
        account = current
        switch change {
        case .confirmAge where current.ageConfirmed:
            await saved(current)
        case .name where current.displayName != nil || !current.ageConfirmed:
            await saved(current)
        default:
            failure = .other
        }
    }
}
