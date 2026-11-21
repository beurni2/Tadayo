import TadayoCore
import XCTest

@testable import Tadayo

/// What VoiceOver says as what the selected tab shows changes (`TabsView.announcement`): one
/// polite loading label, "Home updated." once on Home, and a failure's words, or a suspended
/// club's denial, at once (handoff 3's `loadingAndCutoffFocus`). A hosted test can't hear
/// VoiceOver, so the TestFlight notes ask for it on the iPhone too.
@MainActor
final class TabsAnnouncementTests: XCTestCase {
    /// The club list's states, with no club selected.
    private func said(
        _ old: RootModel.Clubs?, _ new: RootModel.Clubs, on tab: ClubTab?
    ) -> [String] {
        let shown = { (clubs: RootModel.Clubs) in
            TabShown(clubs, selected: nil, home: .loading, on: tab ?? .home)
        }
        return heard(old.map(shown), shown(new), on: tab)
    }

    /// What a tab shows, with or without a club.
    private func heard(_ old: TabShown?, _ new: TabShown, on tab: ClubTab?) -> [String] {
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

    // MARK: With a club selected

    func testTheListsAnswerSaysNothingWhileTheClubsHomeIsStillRead() {
        // The list's loading label was said; the list answers with Sunday people selected, and
        // Home's reads follow under the same label.
        let club = ClubFixtures.sunday
        let listLoading = TabShown(.loading, selected: nil, home: .loading, on: .home)
        let homeLoading = TabShown(
            ClubFixtures.listed(club), selected: club, home: .loading, on: .home)
        XCTAssertEqual(homeLoading, .loading)
        XCTAssertEqual(heard(listLoading, homeLoading, on: .home), [])
    }

    func testHomeUpdatedIsSaidWhenHomeBeforeTheClubStartsComesBack() {
        XCTAssertEqual(
            heard(.loading, .awaiting(review: false), on: .home), ["Home updated.", "politely"])
        XCTAssertEqual(
            heard(.loading, .awaiting(review: true), on: .home), ["Home updated.", "politely"])
        XCTAssertEqual(heard(nil, .awaiting(review: false), on: .home), [])
    }

    func testHomesFailureIsSaidAtOnce() {
        XCTAssertEqual(
            heard(.loading, .homeFailed(.network), on: .home),
            ["Couldn’t load Home. Check your connection and try again.", "at once"])
    }

    func testASuspendedClubsDenialIsSaidAtOnceOnEveryTab() {
        for tab in ClubTab.allCases {
            XCTAssertEqual(
                heard(.awaiting(review: false), .unavailable, on: tab),
                ["Club unavailable. This club isn’t available right now.", "at once"], "\(tab)")
        }
    }

    func testChoosingAnotherClubSaysTheLoadingLabel() {
        XCTAssertEqual(
            heard(.awaiting(review: false), .loading, on: .home), ["Loading Home…", "politely"])
    }
}
