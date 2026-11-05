import Foundation
import Testing

@testable import TadayoCore

@Suite struct LocalDateTests {
    @Test func readsTheContractsFormat() {
        let date = LocalDate(iso: "2026-11-13")
        #expect(date?.year == 2026)
        #expect(date?.month == 11)
        #expect(date?.day == 13)
        #expect(date?.iso == "2026-11-13")
    }

    @Test(arguments: [
        "2026-02-29", "2026-13-01", "2026-11-31", "2026-11-1", "26-11-13", "2026/11/13",
        "2026-11-13T07:00", "", "2026-1a-13", "２０２６-11-13",
    ])
    func refusesAnythingElse(text: String) {
        #expect(LocalDate(iso: text) == nil)
    }

    @Test func knowsLeapYears() {
        #expect(LocalDate(iso: "2028-02-29") != nil)
        #expect(LocalDate(iso: "2000-02-29") != nil)
        #expect(LocalDate(iso: "2100-02-29") == nil)
    }

    @Test func ordersByDate() {
        let a = LocalDate(iso: "2026-11-06")!
        let b = LocalDate(iso: "2026-11-13")!
        let c = LocalDate(iso: "2027-01-01")!
        #expect(a < b && b < c)
    }

    @Test func roundTripsThroughJSON() throws {
        let date = LocalDate(iso: "2026-11-06")!
        let data = try JSONEncoder().encode([date])
        #expect(String(decoding: data, as: UTF8.self) == "[\"2026-11-06\"]")
        #expect(try JSONDecoder().decode([LocalDate].self, from: data) == [date])
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode([LocalDate].self, from: Data("[\"Friday\"]".utf8))
        }
    }
}
