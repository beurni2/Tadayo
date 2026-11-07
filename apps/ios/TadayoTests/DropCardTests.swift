import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver reads for each of the drop card's states, and what the hidden card's input can
/// hold. The exact labels pin T10 (before the reveal, someone else's drop is read as its sender,
/// caption and opening time, and nothing of its media: TECH-DESIGN section 8's "hidden-drop
/// states announce author and opening time only"), T20 (nothing before the commit reads as
/// Added) and T25 (the removed placeholder says nothing of the drop). Each test expects the whole
/// list of labels, so a word read twice, or an avatar's initial, fails it; the hidden cards'
/// tests also expect no value, no hint and no button trait. These are the component's half of
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
        assertHidden(
            collecting(FixtureCast.maya, "Your future living room."),
            reads: "Maya. Your future living room. \(opens)")
    }

    func testAHiddenDropWithNoCaptionNamesTheStar() {
        assertHidden(collecting(FixtureCast.sam, nil), reads: "Sam. Photo for Debby. \(opens)")
    }

    func testOnlyTheAuthorsOwnHiddenDropCarriesItsHighlight() {
        assertHidden(
            collecting(FixtureCast.ben, "Coffee, obviously.", .author(isHighlight: true)),
            reads: "Ben, you. Coffee, obviously. Highlight. \(opens)")
        assertHidden(
            collecting(FixtureCast.ben, "Coffee, obviously.", .author(isHighlight: false)),
            reads: "Ben, you. Coffee, obviously. \(opens)")
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
        XCTAssertEqual(
            fields(drop.occasion),
            [
                "star: String", "date: LocalDate", "opensAt: Date", "zone: TimeZone",
                "includingYear: Bool",
            ])
    }

    // MARK: Not added yet (T20)

    func testAnUploadSaysItIsNotAddedYetWithItsRealProgress() {
        let elements = AccessibilityElements.of(
            card(.uploading(upload, progress: 0.57)))
        XCTAssertEqual(
            elements.map(\.label),
            ["For Debby’s Friday. \(opening) This has your name on it. Uploading. Not added yet."])
        XCTAssertEqual(elements.first?.value, "57%")
    }

    func testProcessingSaysItIsNotAddedYet() {
        XCTAssertEqual(
            labels(card(.processing(upload))),
            ["For Debby’s Friday. \(opening) This has your name on it. Processing. Not added yet."])
    }

    func testAPrivateDraftIsSharedWithNobody() {
        let draft = PrivateDraft(
            photo: Image("fixture-dog"), note: "He sat still for exactly one photo.")
        XCTAssertEqual(
            labels(card(.privateDraft(draft))),
            ["Choose a friend later. He sat still for exactly one photo. Not shared with anyone."])
    }

    // MARK: Removed (T25) and revealed

    func testTheRemovedPlaceholderSaysNothingOfTheDrop() {
        XCTAssertEqual(labels(card(.removed)), ["This drop is no longer available"])
    }

    func testARevealedHighlightIsReadAsAPhotoAndAHighlight() {
        let drop = RevealedDrop(
            caption: "Your future living room.", sender: FixtureCast.maya.sender,
            photo: Image("fixture-chair"), isHighlight: true)
        XCTAssertEqual(
            labels(card(.revealed(drop))), ["Maya. Your future living room. Photo. Highlight."])
        let loading = RevealedDrop(
            caption: nil, sender: FixtureCast.sam.sender, photo: nil, isHighlight: false)
        XCTAssertEqual(labels(card(.revealed(loading))), ["Sam. Photo."])
    }

    func testThePhotoLabelIsOneWord() {
        XCTAssertEqual(labels(PhotoHighlightLabel()), ["Highlight"])
    }

    // MARK: The receipt

    func testTheReceiptOffersMakeMyHighlightOnlyWhenItIsntOneAlready() {
        let added = "Added for Debby’s Friday. \(opening)"
        let offering = AccessibilityElements.of(receipt(isHighlight: false))
        XCTAssertEqual(offering.map(\.label), [added, "Make my highlight"])
        XCTAssertTrue(offering.last?.traits.contains(.button) ?? false, "\(offering)")
        XCTAssertEqual(labels(receipt(isHighlight: true)), [added])
    }

    // MARK: Helpers

    private var upload: OwnUpload {
        OwnUpload(
            photo: Image("fixture-coffee"), caption: "This has your name on it.",
            occasion: FixtureCast.collectingDay)
    }

    private func collecting(
        _ person: FixtureCast.Person, _ caption: String?, _ viewer: HiddenDrop.Viewer = .member
    ) -> some View {
        card(
            .collecting(
                HiddenDrop(
                    caption: caption, mediaClass: .photo, sender: person.sender,
                    cover: Palette.cover(slot: person.slot), occasion: FixtureCast.collectingDay,
                    viewer: viewer)))
    }

    private func card(_ state: DropCard.State) -> some View {
        DropCard(state, labels: FixtureCast.labels).padding(.horizontal, 20)
    }

    private func receipt(isHighlight: Bool) -> some View {
        CompactReceipt(
            AddedDrop(occasion: FixtureCast.collectingDay, isHighlight: isHighlight),
            labels: FixtureCast.labels, makeHighlight: {}
        ).padding(.horizontal, 20)
    }

    private func labels(_ view: some View) -> [String] {
        AccessibilityElements.of(view).map(\.label)
    }

    /// A hidden card is one element: exactly this label, no value, no hint, and no button trait
    /// (the tap that explains the opening time is B4's), so nothing else is spoken (Q07).
    private func assertHidden(
        _ view: some View, reads label: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        let elements = AccessibilityElements.of(view)
        XCTAssertEqual(elements.map(\.label), [label], file: file, line: line)
        XCTAssertEqual(elements.first?.value, "", "\(elements)", file: file, line: line)
        XCTAssertEqual(elements.first?.hint, "", "\(elements)", file: file, line: line)
        XCTAssertFalse(
            elements.first?.traits.contains(.button) ?? true, "\(elements)", file: file, line: line)
    }

    private func fields(_ value: Any) -> [String] {
        Mirror(reflecting: value).children.map {
            "\($0.label ?? "?"): \(String(describing: type(of: $0.value)))"
        }
    }
}
