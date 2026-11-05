import Foundation

/// The key a mutation carries in its `Idempotency-Key` header (T19; docs/TECH-DESIGN.md section 4,
/// "Networking and local data"): made once, when the person starts the action, and sent again,
/// with the same body, on every retry, so the server commits the action once.
///
/// It is a UUIDv7 (RFC 9562): 48 bits of milliseconds since 1970, the version, then 74 random bits.
/// Foundation's `UUID()` is version 4, so the key is built here. The time only orders the keys; the
/// device's clock decides nothing through it (T1).
public struct IdempotencyKey: Sendable, Hashable, Codable, CustomStringConvertible {
    public let uuid: UUID

    public init(uuid: UUID) {
        self.uuid = uuid
    }

    /// A new key for an action started at `date`.
    public static func make(at date: Date = Date()) -> IdempotencyKey {
        var generator = SystemRandomNumberGenerator()
        return make(at: date, using: &generator)
    }

    static func make(
        at date: Date, using generator: inout some RandomNumberGenerator
    ) -> IdempotencyKey {
        let millis = UInt64(max(0, (date.timeIntervalSince1970 * 1000).rounded(.down)))
        var bytes = [UInt8](repeating: 0, count: 16)
        for index in 0..<6 {
            bytes[index] = UInt8(truncatingIfNeeded: millis >> (8 * (5 - index)))
        }
        for index in 6..<16 {
            bytes[index] = UInt8.random(in: .min ... .max, using: &generator)
        }
        bytes[6] = 0x70 | (bytes[6] & 0x0F)
        bytes[8] = 0x80 | (bytes[8] & 0x3F)
        let uuid = UUID(
            uuid: (
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14],
                bytes[15]
            ))
        return IdempotencyKey(uuid: uuid)
    }

    /// The lowercase form the contract's `uuid` format takes.
    public var description: String { uuid.uuidString.lowercased() }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let uuid = UUID(uuidString: text) else {
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Not a UUID: \(text)")
        }
        self.uuid = uuid
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }
}
