import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver reads for each of the drop card's states, and what the hidden card's input can
/// hold. The exact labels pin T10 (before the reveal, someone else's drop is read as its sender,
/// caption and opening time, and nothing of its media: TECH-DESIGN section 8's "hidden-drop
/// states announce author and opening time only"), T20 (nothing before the commit reads as
/// Added) and T25 (the removed placeholder says nothing of the drop). Each test expects every
/// element the state has, each with its label, value, hint and whether it is a button, so a word
/// read twice, an avatar's initial, a stray value or a tap nobody built fails it. These are the
/// component's half of
/// T16 and Q07: B4's check as a non-author on F02 is the other. They are hosted unit tests, not
/// snapshot tests, so the iOS 17 and 18 compatibility runs read the labels too.
@MainActor
final class DropCardTests: XCTestCase {
    /// ICU puts a narrow no-break space before AM and PM.
    private let seven = "7\u{202F}AM"
    private var opens: String {
        "Opens Friday, November 13, 2026 at \(seven), New York. Hidden content."
    }
    private var opening: String {
        "Opens Friday, November 13, 2026 at \(seven), New York."
    }

    // MARK: Before the reveal (T10)

    func testSomeoneElsesHiddenDropIsItsSenderCaptionAndOpeningOnly() {
        assertReads(
            collecting(FixtureCast.maya, "Your future living room."),
            [Read("Maya. Your future living room. \(opens)")])
    }

    func testAHiddenDropWithNoCaptionNamesTheStar() {
        assertReads(collecting(FixtureCast.sam, nil), [Read("Sam. Photo for Debby. \(opens)")])
    }

    func testOnlyTheAuthorsOwnHiddenDropCarriesItsHighlight() {
        assertReads(
            collecting(FixtureCast.ben, "Coffee, obviously.", .author(isHighlight: true)),
            [Read("Ben, you. Coffee, obviously. Highlight. \(opens)")])
        assertReads(
            collecting(FixtureCast.ben, "Coffee, obviously.", .author(isHighlight: false)),
            [Read("Ben, you. Coffee, obviously. \(opens)")])
    }

    /// A tripwire on who can carry a Highlight before the reveal: the switch has no default, so a
    /// new viewer case doesn't compile until it is argued against T10 and FQ21 here.
    func testOnlyTheAuthorCaseCanCarryAHighlight() {
        let viewers: [HiddenDrop.Viewer] = [
            .member, .author(isHighlight: false), .author(isHighlight: true),
        ]
        for viewer in viewers {
            let mayCarryIt: Bool
            switch viewer {
            case .member: mayCarryIt = false
            case .author(let isHighlight): mayCarryIt = isHighlight
            }
            let read = labels(collecting(FixtureCast.maya, "Your future living room.", viewer))
            XCTAssertEqual(read.joined().contains("Highlight"), mayCarryIt, "\(viewer): \(read)")
        }
    }

    /// A tripwire on the hidden drop's input: these fields and their types, and nothing else. A
    /// new one, such as a thumbnail, a size or a description, must be argued against T10 before
    /// this changes. It pins the input's shape; what fills it is B4's mapping from the contract.
    func testTheHiddenDropHoldsNothingFromTheMedia() {
        let drop = HiddenDrop(
            caption: "Your future living room.", mediaClass: .photo,
            sender: FixtureCast.maya.sender, cover: Palette.cover(slot: 1),
            occasion: FixtureCast.collectingDay, viewer: .member)
        XCTAssertEqual(
            fields(drop),
            [
                "caption: Optional<String>", "mediaClass: MediaClass", "sender: Sender",
                "cover: Cover", "occasion: Occasion", "viewer: Viewer",
            ])
        XCTAssertEqual(fields(drop.sender), ["name: String", "photo: Optional<Image>"])
        XCTAssertEqual(fields(drop.cover), ["fill: Color", "ink: Color"])
        // No default and no payload bound: a new media class (B7's video link), or a payload on
        // this one (a provider, a size), doesn't compile until it is argued against T10 here.
        switch drop.mediaClass {
        case .photo: break
        }
        XCTAssertEqual(
            fields(drop.occasion),
            [
                "star: String", "date: LocalDate", "opensAt: Date", "zone: TimeZone",
                "includingYear: Bool",
            ])
    }

    // MARK: Not added yet (T20)

    func testAnUploadSaysItIsNotAddedYetWithItsRealProgress() {
        assertReads(
            card(.uploading(upload, progress: 0.57)),
            [
                Read(
                    "For Debby’s Friday. \(opening) This has your name on it. Uploading. Not added yet.",
                    value: "57%")
            ])
    }

    /// Processing has no progress to show, so no value (FQ91 (a) and (c)).
    func testProcessingSaysItIsNotAddedYet() {
        assertReads(
            card(.processing(upload)),
            [
                Read(
                    "For Debby’s Friday. \(opening) This has your name on it. Processing. Not added yet."
                )
            ])
    }

    func testAPrivateDraftIsSharedWithNobody() {
        let draft = PrivateDraft(
            photo: Image("fixture-dog"), note: "He sat still for exactly one photo.")
        assertReads(
            card(.privateDraft(draft)),
            [
                Read(
                    "Choose a friend later. He sat still for exactly one photo. Not shared with anyone."
                )
            ])
    }

    /// A screen in the current year writes the date without the year (FQ44), but every spoken
    /// opening keeps it (FQ44; FQ91 (c)), whatever the visible line does.
    func testASpokenOpeningKeepsTheYearWhenTheLineDropsIt() {
        let day = FixtureCast.collectingDayThisYear
        assertReads(
            collecting(FixtureCast.maya, "Your future living room.", occasion: day),
            [Read("Maya. Your future living room. \(opens)")])
        let thisYear = OwnUpload(
            photo: Image("fixture-coffee"), caption: "This has your name on it.", occasion: day)
        assertReads(
            card(.processing(thisYear)),
            [
                Read(
                    "For Debby’s Friday. \(opening) This has your name on it. Processing. Not added yet."
                )
            ])
        assertReads(
            receipt(isHighlight: true, occasion: day),
            [Read("Added for Debby’s Friday. \(opening)")])
    }

    // MARK: Removed (T25) and revealed

    func testTheRemovedPlaceholderSaysNothingOfTheDrop() {
        assertReads(card(.removed), [Read("This drop is no longer available")])
    }

    func testARevealedHighlightIsReadAsAPhotoAndAHighlight() {
        let drop = RevealedDrop(
            caption: "Your future living room.", sender: FixtureCast.maya.sender,
            photo: Image("fixture-chair"), isHighlight: true)
        assertReads(
            card(.revealed(drop)), [Read("Maya. Your future living room. Photo. Highlight.")])
        let loading = RevealedDrop(
            caption: nil, sender: FixtureCast.sam.sender, photo: nil, isHighlight: false)
        assertReads(card(.revealed(loading)), [Read("Sam. Photo.")])
    }

    func testThePhotoLabelIsOneWord() {
        assertReads(PhotoHighlightLabel(), [Read("Highlight")])
    }

    // MARK: The receipt

    func testTheReceiptOffersMakeMyHighlightOnlyWhenItIsntOneAlready() {
        let added = "Added for Debby’s Friday. \(opening)"
        assertReads(
            receipt(isHighlight: false),
            [Read(added), Read("Make my highlight", isButton: true)])
        assertReads(receipt(isHighlight: true), [Read(added)])
    }

    // MARK: Helpers

    private var upload: OwnUpload {
        OwnUpload(
            photo: Image("fixture-coffee"), caption: "This has your name on it.",
            occasion: FixtureCast.collectingDay)
    }

    private func collecting(
        _ person: FixtureCast.Person, _ caption: String?, _ viewer: HiddenDrop.Viewer = .member,
        occasion: Occasion = FixtureCast.collectingDay
    ) -> some View {
        card(
            .collecting(
                HiddenDrop(
                    caption: caption, mediaClass: .photo, sender: person.sender,
                    cover: Palette.cover(slot: person.slot), occasion: occasion, viewer: viewer)))
    }

    private func card(_ state: DropCard.State) -> some View {
        DropCard(state, labels: FixtureCast.labels).padding(.horizontal, 20)
    }

    private func receipt(
        isHighlight: Bool, occasion: Occasion = FixtureCast.collectingDay
    ) -> some View {
        CompactReceipt(
            AddedDrop(occasion: occasion, isHighlight: isHighlight),
            labels: FixtureCast.labels, makeHighlight: {}
        ).padding(.horizontal, 20)
    }

    private func labels(_ view: some View) -> [String] {
        AccessibilityElements.of(view).map(\.label)
    }

    /// What VoiceOver finds in one element: its label, its value and hint (none unless given),
    /// and whether it is a button. No state but the receipt's action is a button: the taps that
    /// open a draft or explain the opening time are B4's (Q07).
    private struct Read: Equatable, CustomStringConvertible {
        let label: String
        var value = ""
        var hint = ""
        var isButton = false

        init(_ label: String, value: String = "", hint: String = "", isButton: Bool = false) {
            self.label = label
            self.value = value
            self.hint = hint
            self.isButton = isButton
        }

        var description: String {
            "\"\(label)\" value \"\(value)\" hint \"\(hint)\"\(isButton ? " button" : "")"
        }
    }

    /// Every element of the view, in order, is exactly one of these, so nothing else is spoken.
    private func assertReads(
        _ view: some View, _ expected: [Read], file: StaticString = #filePath, line: UInt = #line
    ) {
        let read = AccessibilityElements.of(view).map {
            Read($0.label, value: $0.value, hint: $0.hint, isButton: $0.traits.contains(.button))
        }
        XCTAssertEqual(read, expected, file: file, line: line)
    }

    private func fields(_ value: Any) -> [String] {
        Mirror(reflecting: value).children.map {
            "\($0.label ?? "?"): \(String(describing: type(of: $0.value)))"
        }
    }
}
