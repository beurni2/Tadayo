#if LAB
    import SwiftUI
    import TadayoCore

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

        /// The photographs book p50 lists, by asset name.
        static let photos = [
            "fixture-friends", "fixture-coffee", "fixture-chair", "fixture-bread", "fixture-sea",
            "fixture-gardening", "fixture-dog",
        ]
    }
#endif
