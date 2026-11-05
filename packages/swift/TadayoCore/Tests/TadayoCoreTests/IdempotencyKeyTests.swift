import Foundation
import Testing

@testable import TadayoCore

@Suite struct IdempotencyKeyTests {
    // Thursday 5 November 2026, 3:00 AM UTC.
    let date = Date(timeIntervalSince1970: 1_793_847_600)

    @Test func isAVersion7UUIDWithTheRFCVariant() {
        let bytes = IdempotencyKey.make(at: date).uuid.uuid
        #expect(bytes.6 >> 4 == 0x7)
        #expect(bytes.8 >> 6 == 0b10)
    }

    @Test func startsWithTheMillisecondsSinceTheEpoch() {
        let key = IdempotencyKey.make(at: date.addingTimeInterval(0.123))
        let b = key.uuid.uuid
        let millis = [b.0, b.1, b.2, b.3, b.4, b.5].reduce(UInt64(0)) { $0 << 8 | UInt64($1) }
        #expect(millis == 1_793_847_600_123)
    }

    @Test func keysMadeLaterSortLater() {
        let first = IdempotencyKey.make(at: date)
        let second = IdempotencyKey.make(at: date.addingTimeInterval(0.001))
        #expect(first.description < second.description)
    }

    @Test func everyKeyIsNew() {
        let keys = (0..<2_000).map { _ in IdempotencyKey.make(at: date) }
        #expect(Set(keys).count == keys.count)
    }

    @Test func readsAsTheContractsLowercaseUUID() throws {
        let key = IdempotencyKey.make(at: date)
        #expect(key.description.count == 36)
        #expect(key.description == key.description.lowercased())
        #expect(key.description.hasPrefix("01a1a9a6-2380-7"))
        let data = try JSONEncoder().encode(key)
        #expect(String(decoding: data, as: UTF8.self) == "\"\(key.description)\"")
        #expect(try JSONDecoder().decode(IdempotencyKey.self, from: data) == key)
    }
}
