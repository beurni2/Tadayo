import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Home, Friends and Memories for an account with no club, in every state of the club list, and
/// with a club selected, in every state this build has for it (design/reference/INVENTORY.md):
/// those with a render from handoffs 2 to 7, and the rest built from spec. Each is the tab view
/// the app shows, with the system's tab bar, without the Lab's tab. The fixture is Ben,
/// unphotographed, as handoff 4's `G06-no-club` draws him: the frames with a club draw his
/// photograph, which the app shows once avatars are read (a known difference). The clubs are
/// `ClubFixtures`'.
@MainActor
final class TabsSnapshotTests: XCTestCase {
    // MARK: No club

    func testG06NoClub() {
        snap(.noClub, on: .home, named: "G06-no-club")
    }

    func testF01NoClub() {
        snap(.noClub, on: .friends, named: "F01-no-club")
    }

    func testM01NoClub() {
        snap(.noClub, on: .memories, named: "M01-no-club")
    }

    // MARK: While the club list loads

    func testH01LoadingNoClub() {
        snap(.loading, on: .home, named: "H01-loading-no-club")
    }

    func testF01LoadingNoClub() {
        snap(.loading, on: .friends, named: "F01-loading-no-club")
    }

    func testM01LoadingNoClub() {
        snap(.loading, on: .memories, named: "M01-loading-no-club")
    }

    // MARK: When the club list fails

    func testH01ErrorNoClub() {
        snap(.failed(.network), on: .home, named: "H01-error-no-club")
    }

    func testF01ErrorNoClub() {
        snap(.failed(.network), on: .friends, named: "F01-error-no-club")
    }

    func testM01ErrorNoClub() {
        snap(.failed(.network), on: .memories, named: "M01-error-no-club")
    }

    func testH01ErrorNoClubRefused() {
        snap(.failed(.other), on: .home, named: "H01-error-no-club-refused")
    }

    func testF01ErrorNoClubRefused() {
        snap(.failed(.other), on: .friends, named: "F01-error-no-club-refused")
    }

    func testM01ErrorNoClubRefused() {
        snap(.failed(.other), on: .memories, named: "M01-error-no-club-refused")
    }

    // MARK: No club, with accepted invitations

    func testG06NoClubInvitation() {
        snap(
            .noClub, invitations: [ClubFixtures.kitchenInvitation(.waiting)], on: .home,
            named: "G06-no-club-invitation")
    }

    func testG06NoClubInvitationChanged() {
        snap(
            .noClub, invitations: [ClubFixtures.kitchenInvitation(.rosterChanged)], on: .home,
            named: "G06-no-club-invitation-changed")
    }

    func testG06NoClubInvitationChangedHeld() {
        snap(
            .noClub,
            invitations: [ClubFixtures.kitchenInvitation(.rosterChanged, linkHeld: true)],
            on: .home, named: "G06-no-club-invitation-changed-held")
    }

    func testG06NoClubInvitationDeclined() {
        snap(
            .noClub, invitations: [ClubFixtures.kitchenInvitation(.didNotGoAhead)], on: .home,
            named: "G06-no-club-invitation-declined")
    }

    // MARK: A club selected

    func testH01AwaitingActivation() {
        snap(
            ClubFixtures.listed(ClubFixtures.sunday, ClubFixtures.kitchenPaused),
            selected: ClubFixtures.sunday, home: .awaiting(review: false), on: .home,
            named: "H01-awaiting-activation")
    }

    func testH01AwaitingActivationReview() {
        snap(
            ClubFixtures.listed(ClubFixtures.sunday), selected: ClubFixtures.sunday,
            home: .awaiting(review: true), on: .home, named: "H01-awaiting-activation-review")
    }

    func testH01Loading() {
        snap(
            ClubFixtures.listed(ClubFixtures.sunday), selected: ClubFixtures.sunday,
            home: .loading, on: .home, named: "H01-loading")
    }

    func testH01Error() {
        snap(
            ClubFixtures.listed(ClubFixtures.sunday), selected: ClubFixtures.sunday,
            home: .failed(.network), on: .home, named: "H01-error")
    }

    func testH01Unavailable() {
        snapSuspended(on: .home, named: "H01-unavailable")
    }

    func testF01Unavailable() {
        snapSuspended(on: .friends, named: "F01-unavailable")
    }

    func testM01Unavailable() {
        snapSuspended(on: .memories, named: "M01-unavailable")
    }

    func testGlobalClubNotInBuildSelected() {
        // An active club, whose Home is B2's. Every tab draws it the same.
        snap(
            ClubFixtures.listed(ClubFixtures.kitchen, ClubFixtures.sunday),
            selected: ClubFixtures.kitchen, home: .notInThisBuild, on: .home,
            named: "global-club-not-in-build-selected")
    }

    // MARK: What VoiceOver finds

    func testTheHeadersWordmarkAddAndAccount() {
        let elements = AccessibilityElements.of(content(.noClub, on: .home))
        let wordmark = elements.first { $0.label == "Tadayo" }
        XCTAssertNotNil(wordmark, "\(elements)")
        XCTAssertFalse(wordmark?.isHeader ?? true, "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "+ Add" }?.hint,
            "Save a private draft or open private drafts.", "\(elements)")
        let account = elements.first { $0.label == "Account" }
        XCTAssertTrue(account?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertEqual(account?.hint, "Open your account.", "\(elements)")
        // The avatar's initial isn't read: Account is.
        XCTAssertFalse(elements.contains { $0.label == "B" }, "\(elements)")
    }

    func testEachTitleIsAHeading() {
        heading("Start your club.", in: content(.noClub, on: .home))
        heading("Friends", in: content(.noClub, on: .friends))
        heading("Your friends will appear here.", in: content(.noClub, on: .friends))
        heading("Memories", in: content(.noClub, on: .memories))
        heading("Your shared days, kept together.", in: content(.noClub, on: .memories))
        heading(
            "Couldn’t load Home. Check your connection and try again.",
            in: content(.failed(.network), on: .home))
        heading("Couldn’t load Friends. Try again.", in: content(.failed(.other), on: .friends))
        heading(
            "This version of Tadayo can’t show clubs yet.",
            in: club(ClubFixtures.kitchen, home: .notInThisBuild, on: .home))
    }

    func testTheNoClubActionsSayWhatTheyDo() {
        let elements = AccessibilityElements.of(content(.noClub, on: .home))
        XCTAssertTrue(
            elements.contains { $0.label == "Create a club." && $0.traits.contains(.button) },
            "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "I have an invite" }?.hint, "Open an invitation link.",
            "\(elements)")
        let drafts = elements.first { $0.label == "Private drafts" }
        XCTAssertEqual(drafts?.hint, "Only you can see these.", "\(elements)")
        XCTAssertTrue(drafts?.traits.contains(.button) ?? false, "\(elements)")
    }

    func testGoToHomeIsAButton() {
        let elements = AccessibilityElements.of(content(.noClub, on: .memories))
        XCTAssertTrue(
            elements.contains { $0.label == "Go to Home" && $0.traits.contains(.button) },
            "\(elements)")
    }

    func testWhileLoadingOnlyTheLabelIsReadNotTheIndicator() {
        // The header's three, then the label: the indicator is no element of its own.
        for tab in ClubTab.allCases {
            let labels = AccessibilityElements.of(content(.loading, on: tab)).map(\.label)
            XCTAssertEqual(
                labels, ["Tadayo", "+ Add", "Account", String(localized: tab.loading)], "\(tab)")
        }
    }

    func testAFailuresTitleAndLineAreOneSpokenGroup() {
        // handoff 6's `denied.group.vo`: the title, then the line, read together.
        let failed = AccessibilityElements.of(content(.failed(.network), on: .memories))
        XCTAssertTrue(
            failed.contains {
                $0.label == "Couldn’t load Memories. Check your connection and try again."
            }, "\(failed)")
        XCTAssertFalse(failed.contains { $0.label == "Couldn’t load Memories." }, "\(failed)")
        XCTAssertFalse(
            failed.contains { $0.label == "Check your connection and try again." }, "\(failed)")
    }

    func testAFailureOffersRetryAndAClubThisBuildCantShowDoesnt() {
        // Its label is Retry on every tab; its hint names the tab it loads again (handoff 7's
        // `vo.retryHome.hint` and the other two).
        let hints: [(ClubTab, String)] = [
            (.home, "Load Home again."), (.friends, "Load Friends again."),
            (.memories, "Load Memories again."),
        ]
        for (tab, hint) in hints {
            for failure in [RootModel.Failure.network, .other] {
                let failed = AccessibilityElements.of(content(.failed(failure), on: tab))
                let retry = failed.first { $0.label == "Retry" && $0.traits.contains(.button) }
                XCTAssertEqual(retry?.hint, hint, "\(tab), \(failure): \(failed)")
            }
        }
        let other = AccessibilityElements.of(
            club(ClubFixtures.kitchen, home: .notInThisBuild, on: .home))
        XCTAssertTrue(other.contains { $0.label == "Account" }, "\(other)")
        XCTAssertFalse(other.contains { $0.label == "Retry" }, "\(other)")
    }

    // MARK: What VoiceOver finds with accepted invitations

    func testEachInvitationIsOneButtonBetweenItsHeadingAndStartYourClub() {
        // `acceptedInvitations.row.a11y`: one button, the club, its state and any helper line as
        // its label, the state's hint, the symbols hidden, no selected trait; read after
        // "Invitations" and before "Start your club.", in the list's order.
        let rows: [(AcceptedInvitation, String, String)] = [
            (
                ClubFixtures.kitchenInvitation(.waiting), "Kitchen table. Waiting for members.",
                "Open this invitation to see its current state."
            ),
            (
                ClubFixtures.kitchenInvitation(.rosterChanged, linkHeld: true),
                "Kitchen table. Review updated members.", "Review and accept the updated roster."
            ),
            (
                ClubFixtures.kitchenInvitation(.rosterChanged),
                "Kitchen table. Review updated members. Open the invitation link to continue.",
                "Open or paste the invitation link to continue."
            ),
            (
                ClubFixtures.kitchenInvitation(.didNotGoAhead),
                "Kitchen table. Invitation didn’t go ahead.", "Open this invitation for details."
            ),
        ]
        for (invitation, label, hint) in rows {
            let elements = AccessibilityElements.of(
                content(.noClub, on: .home, invitations: [invitation]))
            let labels = elements.map(\.label)
            let heading = labels.firstIndex(of: "Invitations")
            let row = labels.firstIndex(of: label)
            let start = labels.firstIndex(of: "Start your club.")
            XCTAssertNotNil(heading, "\(elements)")
            XCTAssertTrue(elements.first { $0.label == "Invitations" }?.isHeader ?? false)
            XCTAssertEqual(row, heading.map { $0 + 1 }, "\(label): \(elements)")
            XCTAssertEqual(start, row.map { $0 + 1 }, "\(label): \(elements)")
            let element = elements.first { $0.label == label }
            XCTAssertEqual(element?.hint, hint, "\(elements)")
            XCTAssertTrue(element?.traits.contains(.button) ?? false, "\(elements)")
            XCTAssertFalse(element?.traits.contains(.selected) ?? true, "\(elements)")
            // Nothing else between them: the name, the state and the symbols aren't read on
            // their own.
            XCTAssertFalse(labels.contains("Kitchen table"), "\(elements)")
        }
    }

    func testSeveralInvitationsAreReadInTheListsOrder() {
        let sunday = AcceptedInvitation(
            MyInvitation(
                invitationID: "inv_sunday", clubName: "Sunday people", inviterName: "Debby",
                state: .didNotGoAhead), linkHeld: false)
        let elements = AccessibilityElements.of(
            content(
                .noClub, on: .home,
                invitations: [ClubFixtures.kitchenInvitation(.waiting), sunday]))
        let labels = elements.map(\.label)
        let kitchen = labels.firstIndex(of: "Kitchen table. Waiting for members.")
        let ended = labels.firstIndex(of: "Sunday people. Invitation didn’t go ahead.")
        XCTAssertEqual(ended, kitchen.map { $0 + 1 }, "\(elements)")
        XCTAssertEqual(labels.filter { $0 == "Invitations" }.count, 1, "\(elements)")
    }

    // MARK: What VoiceOver finds with a club selected

    func testTheSelectorSaysItSwitchesTheSelectedClub() {
        let elements = AccessibilityElements.of(awaiting(review: false))
        let selector = elements.first { $0.label == "Switch club. Sunday people selected." }
        XCTAssertTrue(selector?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertFalse(selector?.isHeader ?? true, "\(elements)")
        // The name isn't read again on its own, nor the wordmark, which the header doesn't show.
        XCTAssertFalse(elements.contains { $0.label == "Sunday people" }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Tadayo" }, "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "+ Add" }?.hint,
            "Save a private draft or open private drafts.", "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Account" }, "\(elements)")
    }

    func testHomeBeforeTheClubStartsReadsItsHeadingAndReviewMembers() {
        let waiting = AccessibilityElements.of(awaiting(review: false))
        heading("Waiting for club confirmation", in: awaiting(review: false))
        let review = waiting.first { $0.label == "Review members" }
        XCTAssertTrue(review?.traits.contains(.button) ?? false, "\(waiting)")
        XCTAssertEqual(review?.hint, "Review the proposed roster for Sunday people.", "\(waiting)")
        XCTAssertTrue(
            waiting.contains { $0.label == "Drafts stay private when the club starts." },
            "\(waiting)")
        XCTAssertTrue(waiting.contains { $0.label == "Private drafts" }, "\(waiting)")

        let pending = AccessibilityElements.of(awaiting(review: true))
        heading("Review the updated members", in: awaiting(review: true))
        XCTAssertTrue(
            pending.contains {
                $0.label == "Review and approve the updated roster before Sunday people can start."
            }, "\(pending)")
        let updated = pending.first { $0.label == "Review Sunday people’s updated members." }
        XCTAssertTrue(updated?.traits.contains(.button) ?? false, "\(pending)")
        XCTAssertEqual(updated?.hint, "", "\(pending)")
    }

    func testHomesLoadingLabelNamesTheClubInItsHint() {
        let view = club(ClubFixtures.sunday, home: .loading, on: .home)
        let elements = AccessibilityElements.of(view)
        XCTAssertEqual(
            elements.map(\.label),
            ["Switch club. Sunday people selected.", "+ Add", "Account", "Loading Home…"])
        XCTAssertEqual(elements.last?.hint, "For Sunday people.", "\(elements)")
    }

    func testHomesFailureOffersItsOwnRetry() {
        let view = club(ClubFixtures.sunday, home: .failed(.network), on: .home)
        let elements = AccessibilityElements.of(view)
        heading("Couldn’t load Home. Check your connection and try again.", in: view)
        let retry = elements.first { $0.label == "Retry" && $0.traits.contains(.button) }
        XCTAssertEqual(retry?.hint, "Retry loading Home for Sunday people.", "\(elements)")
    }

    func testASuspendedClubShowsNothingOfItOnAnyTab() {
        for tab in ClubTab.allCases {
            let view = club(ClubFixtures.sundaySuspended, home: .unavailable, on: tab)
            let elements = AccessibilityElements.of(view)
            heading("Club unavailable. This club isn’t available right now.", in: view)
            // T9: neither its name nor anything else of it, and the wordmark in its place.
            XCTAssertFalse(
                elements.contains { $0.label.contains("Sunday") || $0.hint.contains("Sunday") },
                "\(tab): \(elements)")
            XCTAssertTrue(elements.contains { $0.label == "Tadayo" }, "\(tab): \(elements)")
            XCTAssertTrue(
                elements.contains { $0.label == "Choose a club" && $0.traits.contains(.button) },
                "\(tab): \(elements)")
            XCTAssertEqual(
                elements.first { $0.label == "Get help" }?.hint, "Contact Tadayo support.",
                "\(tab): \(elements)")
        }
    }

    func testFriendsAndMemoriesOfAClubThatHasntStartedAreThisBuildsTitle() {
        for tab in [ClubTab.friends, .memories] {
            let view = club(ClubFixtures.sunday, home: .awaiting(review: false), on: tab)
            heading("This version of Tadayo can’t show clubs yet.", in: view)
            let elements = AccessibilityElements.of(view)
            XCTAssertFalse(elements.contains { $0.label == "Review members" }, "\(elements)")
        }
    }

    // MARK: Helpers

    private func content(
        _ clubs: RootModel.Clubs, on tab: ClubTab, invitations: [AcceptedInvitation] = []
    ) -> some View {
        TabContent(
            tab: tab, clubs: clubs, invitations: invitations, name: "Ben", retry: {}, goHome: {})
    }

    /// A tab with `selected` the selected club, in a list holding it alone.
    private func club(
        _ selected: ClubSummary, home: RootModel.Home, on tab: ClubTab
    ) -> some View {
        TabContent(
            tab: tab, clubs: ClubFixtures.listed(selected), selected: selected, home: home,
            name: "Ben", retry: {}, goHome: {})
    }

    private func awaiting(review: Bool) -> some View {
        club(ClubFixtures.sunday, home: .awaiting(review: review), on: .home)
    }

    private func snapSuspended(
        on tab: TabsView.Selection, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        snap(
            ClubFixtures.listed(ClubFixtures.sundaySuspended, ClubFixtures.kitchen),
            selected: ClubFixtures.sundaySuspended, home: .unavailable, on: tab, named: state,
            testName: testName, line: line)
    }

    private func heading(
        _ title: String, in view: some View, file: StaticString = #filePath, line: UInt = #line
    ) {
        let elements = AccessibilityElements.of(view)
        XCTAssertTrue(
            elements.contains { $0.label == title && $0.isHeader }, "\(elements)", file: file,
            line: line)
    }

    private func snap(
        _ clubs: RootModel.Clubs, selected: ClubSummary? = nil, home: RootModel.Home = .loading,
        invitations: [AcceptedInvitation] = [], on tab: TabsView.Selection,
        named state: String, testName: String = #function, line: UInt = #line
    ) {
        let shown = tab.tab.map { TabShown(clubs, selected: selected, home: home, on: $0) }
        ScreenSnapshot.assert(
            TabsView(
                clubs: clubs, selected: selected, home: home, accepted: invitations, name: "Ben",
                selection: tab, showsLab: false, retry: {}, logOut: {}),
            named: state, busy: shown == .loading, testName: testName,
            line: line)
    }
}
