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

        /// The photographs book p50 lists, by asset name.
        static let photos = [
            "fixture-friends", "fixture-coffee", "fixture-chair", "fixture-bread", "fixture-sea",
            "fixture-gardening", "fixture-dog",
        ]
    }
#endif
