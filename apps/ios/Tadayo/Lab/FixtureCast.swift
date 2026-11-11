#if LAB
    import SwiftUI
    import TadayoCore
    import TadayoDesign

    /// The book's fixture cast (book p6, p27, p50; the handoff briefs' "Content"): Sunday people,
    /// with Ben on Monday and Debby on Friday, the long-name fixtures, and the dates the book uses.
    /// Only in builds that point at `dev` (LAB) and in the tests (T46).
    enum FixtureCast {
        struct Person: Identifiable {
            let name: String
            let photo: String?
            /// The sender's cover slot, in the roster's order (handoff 0; FQ41).
            let slot: Int
            var id: String { name }
            var image: Image? { photo.map { Image($0) } }
            var sender: Sender { Sender(name: name, photo: image) }
        }

        static let club = "Sunday people"
        static let ben = Person(name: "Ben", photo: "fixture-ben", slot: 0)
        static let maya = Person(name: "Maya", photo: "fixture-maya", slot: 1)
        static let alex = Person(name: "Alex", photo: nil, slot: 2)
        static let sam = Person(name: "Sam", photo: nil, slot: 3)
        static let debby = Person(name: "Debby", photo: "fixture-debby", slot: 4)
        static let nina = Person(name: "Nina", photo: nil, slot: 5)
        static let sundayPeople = [ben, maya, alex, sam, debby, nina]

        /// Book p27's long names, which wrap and never shrink.
        static let alexandriaRose = Person(name: "Alexandria-Rose Mensah", photo: nil, slot: 2)
        static let deborahAnne = Person(name: "Deborah-Anne Ouédraogo", photo: nil, slot: 1)

        /// Debby's Fridays: 6 November 2026 (open) and 13 November 2026 (collecting).
        static let open = LocalDate(iso: "2026-11-06")!
        static let collecting = LocalDate(iso: "2026-11-13")!
        static let zone = TimeZone(identifier: "America/New_York")!
        /// The snapshot region, handoff 3's: en-US, 12-hour (FQ44's default writes the phone's).
        static let labels = DateLabels(locale: Locale(identifier: "en_US"))
        /// Debby's Friday, November 13, 2026, opening at 7 AM in New York (12:00 UTC), as the
        /// collecting cards, the upload and the receipt are for it. Each Lab specimen stands alone,
        /// so its visible date carries the year, as the sheet's specimens do (handoff 6's
        /// `travellingRows.targetYear`: "standalone specimen"); a screen decides for itself (FQ44).
        static let collectingDay = Occasion(
            star: debby.name, date: collecting, opensAt: Date(timeIntervalSince1970: 1_794_571_200),
            zone: zone, includingYear: true)
        /// The same Friday as a screen in 2026 writes it, without the year (FQ44: a visible date
        /// in the current year doesn't carry it), for the specimen that shows that form and the
        /// tests that check every spoken opening still does.
        static let collectingDayThisYear = Occasion(
            star: debby.name, date: collecting, opensAt: collectingDay.opensAt, zone: zone,
            includingYear: false)

        /// Alex's Wednesday, November 11, 2026, opening at 7 AM in New York: the longest weekday,
        /// and the date 2.1's `C01-picker` gives Alex.
        static let alexsWednesday = Occasion(
            star: alex.name, date: LocalDate(iso: "2026-11-11")!,
            opensAt: Date(timeIntervalSince1970: 1_794_398_400), zone: zone, includingYear: true)

        /// The same Wednesday for Alexandria-Rose Mensah, the long name in Alex's place (2.1's
        /// `F01-long-names`).
        static let alexandriaRosesWednesday = Occasion(
            star: alexandriaRose.name, date: alexsWednesday.date, opensAt: alexsWednesday.opensAt,
            zone: zone, includingYear: true)

        /// Debby's open Friday, November 6, 2026, from 7 AM until 1 AM on the 7th in New York
        /// (06:00 UTC), as handoff 0's `H01-open` draws it, standing alone with the year.
        static let openDay = DayHeader.OpenDay(
            star: debby.name, isViewer: false, date: open,
            closesAt: Date(timeIntervalSince1970: 1_794_031_200), zone: zone, includingYear: true)
        static let openDayThisYear = DayHeader.OpenDay(
            star: debby.name, isViewer: false, date: open, closesAt: openDay.closesAt, zone: zone,
            includingYear: false)
        /// Ben's own Monday, November 9, 2026, open until 1 AM on the 10th (2.1's `H01-your-day`).
        static let bensOpenDay = DayHeader.OpenDay(
            star: ben.name, isViewer: true, date: LocalDate(iso: "2026-11-09")!,
            closesAt: Date(timeIntervalSince1970: 1_794_290_400), zone: zone, includingYear: true)

        /// Each member's next day in the book's week, opening at 7 AM in New York (12:00 UTC, in
        /// standard time after 1 November), as handoff 3's `F01.row.vo.*` and handoff 6's
        /// `F01-friends` give them, with Nina's first, so she is Next up.
        static let week: [String: (date: LocalDate, opensAt: Date)] = [
            "Nina": (LocalDate(iso: "2026-11-07")!, Date(timeIntervalSince1970: 1_794_052_800)),
            "Ben": (LocalDate(iso: "2026-11-09")!, Date(timeIntervalSince1970: 1_794_225_600)),
            "Maya": (LocalDate(iso: "2026-11-10")!, Date(timeIntervalSince1970: 1_794_312_000)),
            "Alex": (LocalDate(iso: "2026-11-11")!, Date(timeIntervalSince1970: 1_794_398_400)),
            "Sam": (LocalDate(iso: "2026-11-12")!, Date(timeIntervalSince1970: 1_794_484_800)),
            "Debby": (collecting, collectingDay.opensAt),
        ]
        static let nextUp = nina
        /// The viewer, as in handoff 6's frames.
        static let viewer = ben
        /// Handoff 6's travelling frames, and the London variant built from spec (INVENTORY's
        /// X-11).
        static let auckland = TimeZone(identifier: "Pacific/Auckland")!
        static let london = TimeZone(identifier: "Europe/London")!

        /// A member as the roster lists them, with the next day of `day` (themselves unless a
        /// long-name fixture takes another's place), or none.
        static func member(
            _ person: Person, dated: Bool = true, day: Person? = nil, photo: Image?? = nil,
            isNextUp: Bool? = nil, includingYear: Bool = false
        ) -> PersonRow.Member {
            let next = week[(day ?? person).name]!
            return PersonRow.Member(
                name: person.name, photo: photo ?? person.image, isViewer: person.id == viewer.id,
                isNextUp: isNextUp ?? ((day ?? person).id == nextUp.id),
                day: dated
                    ? PersonRow.Day(
                        date: next.date, opensAt: next.opensAt, zone: zone,
                        includingYear: includingYear) : nil)
        }

        /// The photographs book p50 lists, by asset name.
        static let photos = [
            "fixture-friends", "fixture-coffee", "fixture-chair", "fixture-bread", "fixture-sea",
            "fixture-gardening", "fixture-dog",
        ]
    }
#endif
