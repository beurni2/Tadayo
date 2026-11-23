import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// Where the header before a club and a tab's states sit, measured in the test host's own window
/// (`AccessibilityElements`) on both iOS versions each run tests: handoff 7's
/// `noClubRootHeader` rectangles across a 393-point screen, the stacked form at an accessibility
/// size, the 32 points from the header to what's under it, Retry 24 above the foot, and the
/// opaque band behind the status bar, which no snapshot shows because none scrolls; and the
/// selected club's header, handoff 3's `navigationAndTargets.selectedClubHeader` rectangles and
/// handoff 8's two rows at every accessibility size, with Home's states under it.
///
/// The header's top is the safe area's, which differs from the frames' 56 by the simulator's
/// status bar, so everything is measured from the header's own top or across the screen.
@MainActor
final class TabsLayoutTests: XCTestCase {
    private typealias Element = AccessibilityElements.Element

    private struct Header {
        let wordmark: Element
        let add: Element
        let account: Element
        let layout: AccessibilityElements.Layout
    }

    private func content(
        _ clubs: RootModel.Clubs, on tab: ClubTab, size: DynamicTypeSize = .large,
        invitations: [AcceptedInvitation] = []
    ) -> some View {
        TabContent(
            tab: tab, clubs: clubs, invitations: invitations, name: "Ben", retry: {}, goHome: {}
        )
        .environment(\.dynamicTypeSize, size)
    }

    private func measured(
        _ clubs: RootModel.Clubs = .noClub, on tab: ClubTab = .home,
        size: DynamicTypeSize = .large, invitations: [AcceptedInvitation] = [],
        file: StaticString = #filePath, line: UInt = #line
    ) throws -> Header {
        let layout = AccessibilityElements.layout(
            of: content(clubs, on: tab, size: size, invitations: invitations))
        let found = { (label: String) in layout.elements.first { $0.label == label } }
        return Header(
            wordmark: try XCTUnwrap(found("Tadayo"), "\(layout.elements)", file: file, line: line),
            add: try XCTUnwrap(found("+ Add"), "\(layout.elements)", file: file, line: line),
            account: try XCTUnwrap(found("Account"), "\(layout.elements)", file: file, line: line),
            layout: layout)
    }

    // MARK: The header

    func testTheHeadersRectanglesAreTheContractsAcrossA393PointScreen() throws {
        // `noClubRootHeader`: the wordmark [20, 64, 96, 30.43], + Add [241, 56, 80, 44],
        // Account [329, 56, 44, 44], in a header whose top is 56.
        let header = try measured()
        XCTAssertEqual(header.layout.size.width, 393)
        let top = header.add.frame.minY
        XCTAssertEqual(top, header.layout.safeArea.top, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.wordmark.frame.minX, 20, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.width, 96, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.minY - top, 8, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.height, 30.43, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.add.frame.minX, 241, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.width, 80, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.height, 44, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.account.frame.minX, 329, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.minY, top, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.width, 44, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.height, 44, accuracy: 0.5, "\(header.account)")
    }

    func testTheHeaderIsTheSameInEveryStateOfATab() throws {
        let first = try measured()
        let states: [RootModel.Clubs] = [.noClub, .loading, .failed(.network)]
        for tab in ClubTab.allCases {
            for (clubs, invitations) in states.map({ ($0, []) }) + [(.noClub, [Self.waiting])] {
                let other = try measured(clubs, on: tab, invitations: invitations)
                let shown = "\(tab), \(clubs), \(invitations.count) invitations"
                XCTAssertEqual(other.wordmark.frame, first.wordmark.frame, shown)
                XCTAssertEqual(other.add.frame, first.add.frame, shown)
                XCTAssertEqual(other.account.frame, first.account.frame, shown)
            }
        }
    }

    func testTheHeaderStaysInOneRowBelowTheAccessibilitySizesWhereItFits() throws {
        // The largest size that isn't an accessibility size: + Add has grown, and still ends 8
        // before Account, which hasn't moved.
        let header = try measured(size: .xxxLarge)
        XCTAssertEqual(header.account.frame.minX, 329, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.add.frame.maxX, 321, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.minY, header.account.frame.minY, accuracy: 0.5)
        XCTAssertGreaterThanOrEqual(header.add.frame.width, 80 - 0.5, "\(header.add)")
    }

    func testTheHeaderStacksAtEveryAccessibilitySizeWithAddLeading() throws {
        // `noClubRootHeader.largest`: "At all accessibility categories, wordmark row then actions
        // row"; the actions' row starts 48 under the header's top, + Add's words at the leading
        // inset, Account [329, y, 44, 44] centred in the row. A 393-point screen has room for
        // one row even at the largest size, so only the rule stacks it.
        let sizes: [DynamicTypeSize] = [
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ]
        for size in sizes {
            let header = try measured(size: size)
            let top = header.wordmark.frame.minY - 8
            XCTAssertEqual(top, header.layout.safeArea.top, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.wordmark.frame.minX, 20, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.wordmark.frame.width, 96, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.add.frame.minY - top, 48, accuracy: 0.5, "\(size): \(header.add)")
            XCTAssertEqual(header.add.frame.minX, 20, accuracy: 0.5, "\(size): \(header.add)")
            XCTAssertGreaterThanOrEqual(header.add.frame.height, 44 - 0.5, "\(size)")
            XCTAssertGreaterThanOrEqual(header.add.frame.width, 44 - 0.5, "\(size)")
            // What the header measures at each size, for the records: no source gives a rule
            // for + Add's target here (the needs list, item 59). A passing hosted test's
            // activities aren't in the log, so the measures are an attachment's name, which the
            // run's attachments manifest on `evidence` lists.
            let target = header.add.frame
            let measures = XCTAttachment(string: "\(header)")
            measures.name =
                "stacked-header \(size): add \(rounded(target.width)) by "
                + "\(rounded(target.height)), header \(rounded(target.maxY - top)) high"
            measures.lifetime = .keepAlways
            add(measures)
            XCTAssertEqual(
                header.account.frame.minX, 329, accuracy: 0.5, "\(size): \(header.account)")
            XCTAssertEqual(header.account.frame.width, 44, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.account.frame.height, 44, accuracy: 0.5, "\(size)")
            XCTAssertEqual(
                header.account.frame.midY, header.add.frame.midY, accuracy: 0.5,
                "\(size): \(header.account), \(header.add)")
            XCTAssertLessThanOrEqual(
                header.add.frame.maxX, header.account.frame.minX - 8 + 0.5, "\(size)")
        }
    }

    // MARK: Under the header

    func testEachTabsTitleStarts32UnderTheHeader() throws {
        // `noClubRootHeader.contentStart`: the header's bottom + 32, for Home's title and, since
        // handoff 7, Friends' and Memories' page titles too.
        let titles: [(ClubTab, String)] = [
            (.home, "Start your club."), (.friends, "Friends"), (.memories, "Memories"),
        ]
        for (tab, words) in titles {
            let header = try measured(on: tab)
            let title = try XCTUnwrap(
                header.layout.elements.first { $0.label == words && $0.isHeader },
                "\(header.layout.elements)")
            XCTAssertEqual(
                title.frame.minY - header.add.frame.maxY, 32, accuracy: 0.5, "\(tab): \(title)")
            XCTAssertEqual(title.frame.minX, 20, accuracy: 0.5, "\(tab): \(title)")
        }
    }

    func testAFailureStarts32UnderTheHeaderAndRetryIs24AboveTheFoot() throws {
        // Kept as built (the check's "Kept as built"; FQ90's default): the title 32 under the
        // header, Retry 24 above the safe area's foot, where the tab bar starts in the app. The
        // title and its line are one element, so the 24 between them isn't measured here: the
        // snapshots show it.
        for tab in ClubTab.allCases {
            let header = try measured(.failed(.network), on: tab)
            let layout = header.layout
            let group = try XCTUnwrap(layout.elements.first { $0.isHeader }, "\(layout.elements)")
            let retry = try XCTUnwrap(
                layout.elements.first { $0.label == "Retry" }, "\(layout.elements)")
            XCTAssertEqual(
                group.frame.minY - header.add.frame.maxY, 32, accuracy: 0.5, "\(tab): \(group)")
            let above = layout.size.height - layout.safeArea.bottom - retry.frame.maxY
            XCTAssertEqual(above, 24, accuracy: 0.5, "\(tab): \(retry), \(layout.safeArea)")
            XCTAssertEqual(retry.frame.minX, 20, accuracy: 0.5, "\(tab): \(retry)")
            XCTAssertEqual(retry.frame.width, 353, accuracy: 0.5, "\(tab): \(retry)")
        }
    }

    // MARK: Accepted invitations on Home with no club

    private static let waiting = ClubFixtures.kitchenInvitation(.waiting)
    private static let changed = ClubFixtures.kitchenInvitation(.rosterChanged)

    func testInvitationsComeFirstAtFrame7sGapsWithG06sOwnUnderThem() throws {
        // Handoff 9's frame 7, each line's top its baseline less 0.82 of its size: "Invitations"
        // 32 under the header, as G06-no-club's title; the row 24 under it, at [20, 353, 84];
        // "Start your club." 32 under the row, its first line 16 under it and its second 8 under
        // that; Create a club 24 under the lines; Private drafts 32 under I have an invite.
        let header = try measured(invitations: [Self.waiting])
        let elements = header.layout.elements
        func element(_ label: String) throws -> Element {
            try XCTUnwrap(elements.first { $0.label == label }, "\(label): \(elements)")
        }
        let heading = try element("Invitations")
        XCTAssertTrue(heading.isHeader, "\(heading)")
        XCTAssertEqual(heading.frame.minX, 20, accuracy: 0.5, "\(heading)")
        XCTAssertEqual(heading.frame.minY - header.add.frame.maxY, 32, accuracy: 0.5, "\(heading)")
        let row = try element("Kitchen table. Waiting for members.")
        XCTAssertEqual(row.frame.minY - heading.frame.maxY, 24, accuracy: 0.5, "\(row)")
        XCTAssertEqual(row.frame.minX, 20, accuracy: 0.5, "\(row)")
        XCTAssertEqual(row.frame.width, 353, accuracy: 0.5, "\(row)")
        XCTAssertEqual(row.frame.height, 84, accuracy: 0.5, "\(row)")
        let title = try element("Start your club.")
        XCTAssertTrue(title.isHeader, "\(title)")
        XCTAssertEqual(title.frame.minY - row.frame.maxY, 32, accuracy: 0.5, "\(title)")
        let first = try element("A private place for two to six people.")
        XCTAssertEqual(first.frame.minY - title.frame.maxY, 16, accuracy: 0.5, "\(first)")
        let second = try element("Create a club or open an invitation.")
        XCTAssertEqual(second.frame.minY - first.frame.maxY, 8, accuracy: 0.5, "\(second)")
        let create = try element("Create a club.")
        XCTAssertEqual(create.frame.minY - second.frame.maxY, 24, accuracy: 0.5, "\(create)")
        let invite = try element("I have an invite")
        let drafts = try element("Private drafts")
        XCTAssertEqual(drafts.frame.minY - invite.frame.maxY, 32, accuracy: 0.5, "\(drafts)")
    }

    func testARowGrowsWithItsHelperLineAndKeepsItsSymbolsOnTheNamesFirstLine() throws {
        // Frame 9: the helper line 8 under the state, the row 16 under it, so taller than 84;
        // the lines take their fonts' own heights (`dynamicTypePolicy.lineHeight`), so less than
        // the frame's 106.
        let header = try measured(invitations: [Self.changed])
        let row = try XCTUnwrap(
            header.layout.elements.first {
                $0.label
                    == "Kitchen table. Review updated members. Open the invitation link to continue."
            }, "\(header.layout.elements)")
        XCTAssertGreaterThan(row.frame.height, 84 + 8, "\(row)")
        XCTAssertLessThan(row.frame.height, 106, "\(row)")
        XCTAssertEqual(row.frame.width, 353, accuracy: 0.5, "\(row)")
    }

    func testFriendsAndMemoriesDontRepeatTheInvitations() throws {
        for tab in [ClubTab.friends, .memories] {
            let header = try measured(on: tab, invitations: [Self.waiting])
            XCTAssertFalse(
                header.layout.elements.contains { $0.label == "Invitations" },
                "\(tab): \(header.layout.elements)")
            XCTAssertFalse(
                header.layout.elements.contains { $0.label.hasPrefix("Kitchen table") },
                "\(tab): \(header.layout.elements)")
        }
    }

    // MARK: The selected club's header

    private struct ClubHeader {
        let selector: Element
        let add: Element
        let account: Element
        let layout: AccessibilityElements.Layout
    }

    private func measuredClub(
        _ club: ClubSummary = ClubFixtures.sunday, home: RootModel.Home = .awaiting(review: false),
        on tab: ClubTab = .home, size: DynamicTypeSize = .large, file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> ClubHeader {
        let view = TabContent(
            tab: tab, clubs: ClubFixtures.listed(club), selected: club, home: home, name: "Ben",
            retry: {}, goHome: {}
        )
        .environment(\.dynamicTypeSize, size)
        let layout = AccessibilityElements.layout(of: view)
        let found = { (label: String) in layout.elements.first { $0.label == label } }
        let selector = "Switch club. \(club.name) selected."
        return ClubHeader(
            selector: try XCTUnwrap(
                found(selector), "\(layout.elements)", file: file, line: line),
            add: try XCTUnwrap(found("+ Add"), "\(layout.elements)", file: file, line: line),
            account: try XCTUnwrap(found("Account"), "\(layout.elements)", file: file, line: line),
            layout: layout)
    }

    func testTheSelectedClubsHeaderRectanglesAreTheContractsAcrossA393PointScreen() throws {
        // `navigationAndTargets.selectedClubHeader`: the selector [20, 56, 230, 44], + Add
        // [274, 56, 59, 44], Account [337, 56, 44, 44], in a header whose top is 56.
        let header = try measuredClub()
        let top = header.layout.safeArea.top
        for element in [header.selector, header.add, header.account] {
            XCTAssertEqual(element.frame.minY, top, accuracy: 0.5, "\(element)")
            XCTAssertEqual(element.frame.height, 44, accuracy: 0.5, "\(element)")
        }
        XCTAssertEqual(header.selector.frame.minX, 20, accuracy: 0.5, "\(header.selector)")
        XCTAssertEqual(header.selector.frame.width, 230, accuracy: 0.5, "\(header.selector)")
        XCTAssertEqual(header.add.frame.minX, 274, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.width, 59, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.account.frame.minX, 337, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.width, 44, accuracy: 0.5, "\(header.account)")
    }

    func testTheSelectedClubsHeaderIsTheSameInEveryStateItShowsIn() throws {
        let first = try measuredClub()
        let homes: [RootModel.Home] = [
            .loading, .awaiting(review: true), .failed(.network), .notInThisBuild,
        ]
        for home in homes {
            let other = try measuredClub(home: home)
            XCTAssertEqual(other.selector.frame, first.selector.frame, "\(home)")
            XCTAssertEqual(other.add.frame, first.add.frame, "\(home)")
            XCTAssertEqual(other.account.frame, first.account.frame, "\(home)")
        }
        for tab in [ClubTab.friends, .memories] {
            let other = try measuredClub(on: tab)
            XCTAssertEqual(other.selector.frame, first.selector.frame, "\(tab)")
            XCTAssertEqual(other.account.frame, first.account.frame, "\(tab)")
        }
    }

    func testTheSelectedClubsHeaderTakesTwoRowsAtEveryAccessibilitySize() throws {
        // handoff 8's `largest`: "At accessibility categories use two rows consistently. A
        // full-width growing selector comes first; Add and Account occupy the second row."
        let sizes: [DynamicTypeSize] = [
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ]
        for size in sizes {
            let header = try measuredClub(size: size)
            stacked(header, "\(size)")
            let measures = XCTAttachment(string: "\(header)")
            measures.name =
                "stacked-club-header \(size): header "
                + "\(rounded(header.account.frame.maxY - header.layout.safeArea.top)) high"
            measures.lifetime = .keepAlways
            add(measures)
        }
    }

    func testANameTooLongForOneRowTakesTwoRowsAtTheDefaultSize() throws {
        // Never cut short: the selector takes the full width, where the name can wrap, and the
        // header grows with it.
        let long = ClubSummary(
            ref: ClubRef(
                id: "club_long", name: "The Thursday evening supper and walking club",
                timezone: "America/New_York", myMembershipID: "mem_ben_long"),
            state: .proposed, memberCount: 1, openDay: nil, nextDay: nil)
        let header = try measuredClub(long)
        stacked(header, "long name")
    }

    func testHomeBeforeTheClubStartsStarts32UnderTheHeaderAndReviewMembersIs24AboveTheFoot()
        throws
    {
        for review in [false, true] {
            let header = try measuredClub(home: .awaiting(review: review))
            let layout = header.layout
            let title = try XCTUnwrap(
                layout.elements.first { $0.isHeader }, "\(layout.elements)")
            XCTAssertEqual(
                title.frame.minY - header.account.frame.maxY, 32, accuracy: 0.5, "\(title)")
            XCTAssertEqual(title.frame.minX, 20, accuracy: 0.5, "\(title)")
            let action = try XCTUnwrap(
                layout.elements.last { $0.traits.contains(.button) }, "\(layout.elements)")
            let above = layout.size.height - layout.safeArea.bottom - action.frame.maxY
            XCTAssertEqual(above, 24, accuracy: 0.5, "\(action)")
            XCTAssertEqual(action.frame.width, 353, accuracy: 0.5, "\(action)")
        }
    }

    func testASuspendedClubsChooseAClubIs8AboveGetHelp() throws {
        // `primaryToSecondaryTargetGap`, target to target, with Get help's target 24 above the
        // foot, as Retry's is.
        let layout = AccessibilityElements.layout(
            of: TabContent(
                tab: .home, clubs: ClubFixtures.listed(ClubFixtures.sundaySuspended),
                selected: ClubFixtures.sundaySuspended, home: .unavailable, name: "Ben",
                retry: {}, goHome: {}))
        let choose = try XCTUnwrap(
            layout.elements.first { $0.label == "Choose a club" }, "\(layout.elements)")
        let help = try XCTUnwrap(
            layout.elements.first { $0.label == "Get help" }, "\(layout.elements)")
        XCTAssertEqual(help.frame.minY - choose.frame.maxY, 8, accuracy: 0.5, "\(choose), \(help)")
        XCTAssertEqual(
            layout.size.height - layout.safeArea.bottom - help.frame.maxY, 24, accuracy: 0.5,
            "\(help)")
        XCTAssertGreaterThanOrEqual(help.frame.height, 44 - 0.5, "\(help)")
    }

    private func stacked(
        _ header: ClubHeader, _ name: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        let top = header.layout.safeArea.top
        XCTAssertEqual(header.selector.frame.minY, top, accuracy: 0.5, name, file: file, line: line)
        XCTAssertEqual(header.selector.frame.minX, 20, accuracy: 0.5, name, file: file, line: line)
        // From the inset to the inset: the words end where the content's do.
        XCTAssertEqual(
            header.selector.frame.width, 353, accuracy: 0.5, name, file: file, line: line)
        XCTAssertGreaterThanOrEqual(
            header.add.frame.minY, header.selector.frame.maxY - 0.5, "\(name): \(header.add)",
            file: file, line: line)
        XCTAssertEqual(header.add.frame.minX, 20, accuracy: 0.5, name, file: file, line: line)
        XCTAssertEqual(
            header.account.frame.minX, 337, accuracy: 0.5, "\(name): \(header.account)",
            file: file, line: line)
        XCTAssertEqual(
            header.account.frame.midY, header.add.frame.midY, accuracy: 0.5, name, file: file,
            line: line)
    }

    // MARK: The band behind the status bar

    func testTheStatusBarsSafeAreaStaysCanvasOverWhatScrolls() throws {
        // `noClubRootHeader.scroll`: "Status-bar safe area remains opaque canvas"; "no custom
        // glass or extra scroll-edge effect". Home with no club, at the largest size so it
        // scrolls, scrolled until + Add's words are half under the status bar: the status bar's
        // area is then one flat colour, the canvas's, and the words show just under it.
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let controller = UIHostingController(
            rootView: content(.noClub, on: .home, size: .accessibility5)
                .environment(\.locale, Locale(identifier: "en_US")))
        controller.overrideUserInterfaceStyle = .light
        window.rootViewController = controller
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        turn(0.5)
        window.layoutIfNeeded()
        let top = window.safeAreaInsets.top
        XCTAssertGreaterThanOrEqual(top, 40, "the window has no status bar to stay clear of")
        let scroll = try XCTUnwrap(scrollView(in: window), "no scroll view in the tab")
        // + Add's row starts 48 under the header's top, and its words are more than 40 high at
        // this size: 68 further up, 20 points of them are under the status bar's area and the
        // rest just below it.
        let rest = scroll.contentOffset
        scroll.setContentOffset(CGPoint(x: rest.x, y: rest.y + 68), animated: false)
        turn(0.3)
        XCTAssertEqual(scroll.contentOffset.y, rest.y + 68, accuracy: 0.5, "the tab didn't scroll")

        // Read pixel for pixel at the window's own scale: scaled down to a pixel a point, the
        // words' edge just under the band rings into its last row (`ios` 44464008020: row 61 of
        // 62 came out lighter than the canvas beside the words, on both runtimes).
        let band = 20.0
        let pixels = try XCTUnwrap(drawn(window, points: top + band), "the window wasn't drawn")
        let edge = Int((top * pixels.scale).rounded(.down))
        keep(pixels.image, as: "tabs-scrolled-under-the-status-bar")
        // `Palette.canvas` in light, 0xFAFBF8: a drawing tinted all over can't pass for it.
        let canvas: [UInt8] = [250, 251, 248]
        var odd: [String] = []
        for y in 0..<edge {
            for x in 0..<pixels.width where pixels.differs(pixels.at(x, y), canvas) {
                if odd.count < 5 { odd.append("(\(x), \(y)) \(pixels.at(x, y))") }
            }
        }
        XCTAssertEqual(
            odd, [],
            "the status bar's area, \(edge) rows of pixels, isn't the canvas \(canvas) throughout")
        // Under the band nothing is laid over the content either ("no … extra scroll-edge
        // effect"): the screen's inset, where no content is, is the canvas there too.
        var tinted: [String] = []
        let inset = Int(20 * pixels.scale) - 1
        for y in edge..<pixels.height {
            for x in 0..<inset where pixels.differs(pixels.at(x, y), canvas) {
                if tinted.count < 5 { tinted.append("(\(x), \(y)) \(pixels.at(x, y))") }
            }
        }
        XCTAssertEqual(tinted, [], "the inset just under the status bar's area isn't the canvas")
        // The same rows without the band would hold + Add's words: they are there just below,
        // so the scroll moved them and the drawing shows what's on the screen. Counted past
        // the wordmark's width, where only + Add's words can be.
        var ink = 0
        let left = Int(120 * pixels.scale)
        let right = Int(200 * pixels.scale)
        for y in edge..<pixels.height {
            for x in left..<right where pixels.differs(pixels.at(x, y), canvas) { ink += 1 }
        }
        XCTAssertGreaterThan(
            ink, Int(50 * pixels.scale * pixels.scale),
            "+ Add's words aren't just under the status bar's area")
    }

    // MARK: Helpers

    /// Keeps the drawing for a failure's evidence: named as `tools/ci/ios_steps.py` collects a
    /// snapshot, and kept only if the test fails, as the UI tests keep theirs.
    private func keep(_ image: UIImage, as name: String, test: String = #function) {
        let attachment = XCTAttachment(image: image)
        attachment.name = "\(test.prefix { $0 != "(" }).\(name).png"
        attachment.lifetime = .deleteOnSuccess
        add(attachment)
    }

    /// To a tenth of a point.
    private func rounded(_ value: CGFloat) -> String {
        String(format: "%.1f", value)
    }

    private func turn(_ seconds: TimeInterval) {
        let until = Date().addingTimeInterval(seconds)
        while Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    }

    private func scrollView(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView { return scroll }
        for subview in view.subviews {
            if let found = scrollView(in: subview) { return found }
        }
        return nil
    }

    private struct Pixels {
        let bytes: [UInt8]
        let width: Int
        let height: Int
        /// Pixels to a point.
        let scale: CGFloat
        let image: UIImage

        func at(_ x: Int, _ y: Int) -> [UInt8] {
            let start = (y * width + x) * 4
            return Array(bytes[start..<start + 3])
        }

        /// More than rounding apart, in any of red, green and blue.
        func differs(_ one: [UInt8], _ other: [UInt8]) -> Bool {
            zip(one, other).contains { abs(Int($0) - Int($1)) > 2 }
        }
    }

    /// The window's top `points` as drawn, pixel for pixel at the window's scale, in sRGB.
    private func drawn(_ window: UIWindow, points: CGFloat) -> Pixels? {
        let scale = window.traitCollection.displayScale
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        format.preferredRange = .standard
        let size = CGSize(width: window.bounds.width, height: points)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let cgImage = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB)
        else { return nil }
        let width = cgImage.width
        let height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let made = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.interpolationQuality = .none
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard made else { return nil }
        return Pixels(bytes: bytes, width: width, height: height, scale: scale, image: image)
    }
}
