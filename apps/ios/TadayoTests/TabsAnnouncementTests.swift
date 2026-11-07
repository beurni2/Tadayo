import TadayoCore
import XCTest

@testable import Tadayo

/// What VoiceOver says as the club list changes, for the selected tab (`TabsView.announcement`):
/// one polite loading label, "Home updated." once on Home, and a failure's words at once
/// (handoff 3's `loadingAndCutoffFocus`). A hosted test can't hear VoiceOver, so the TestFlight
/// notes ask for it on the iPhone too.
@MainActor
final class TabsAnnouncementTests: XCTestCase {
    private func said(
        _ old: RootModel.Clubs?, _ new: RootModel.Clubs, on tab: ClubTab?
    ) -> [String] {
        guard let said = TabsView.announcement(from: old, to: new, on: tab) else { return [] }
        return [said.words, said.politely ? "politely" : "at once"]
    }

    func testTheLoadingLabelIsSaidPolitelyWhenTheTabsShow() {
        XCTAssertEqual(said(nil, .loading, on: .home), ["Loading Home…", "politely"])
        XCTAssertEqual(said(nil, .loading, on: .friends), ["Loading Friends…", "politely"])
        XCTAssertEqual(said(nil, .loading, on: .memories), ["Loading Memories…", "politely"])
    }

    func testHomeUpdatedIsSaidOnlyOnHomeWhenTheListComesBack() {
        XCTAssertEqual(said(.loading, .noClub, on: .home), ["Home updated.", "politely"])
        XCTAssertEqual(said(.loading, .noClub, on: .friends), [])
        XCTAssertEqual(said(.loading, .noClub, on: .memories), [])
        // Shown already settled, nothing came back to announce.
        XCTAssertEqual(said(nil, .noClub, on: .home), [])
    }

    func testAFailureIsSaidAtOnceWithItsLine() {
        XCTAssertEqual(
            said(.loading, .failed(.network), on: .friends),
            ["Couldn’t load Friends. Check your connection and try again.", "at once"])
        XCTAssertEqual(
            said(.loading, .failed(.other), on: .home),
            ["Couldn’t load Home. Try again.", "at once"])
        XCTAssertEqual(
            said(.loading, .notInThisBuild, on: .memories),
            ["This version of Tadayo can’t show clubs yet.", "at once"])
    }

    func testRetrySaysTheLoadingLabelAgain() {
        XCTAssertEqual(
            said(.failed(.network), .loading, on: .memories), ["Loading Memories…", "politely"])
    }

    func testTheLabSaysNothing() {
        XCTAssertEqual(said(nil, .loading, on: nil), [])
        XCTAssertEqual(said(.loading, .failed(.network), on: nil), [])
    }
}
