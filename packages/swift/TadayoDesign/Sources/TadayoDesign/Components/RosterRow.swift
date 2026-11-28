import SwiftUI

/// One member in a club's members list (G05-members, G05-members-two-days; handoff 1's and 2's
/// frames), from `invitationRosterRow`'s contract: the 36-point avatar with the initial, the name
/// in `row` 17/22 `primaryText` ("Ben · You" for the viewer, handoff 5's `calendar.person.self`),
/// and under it, 4 apart, their weekdays in `metadata` 13/18 `secondaryText` ("Monday", "Monday
/// and Thursday"), the words 49 from the leading edge, with a 1-point `separator` under the row
/// from 49 to the trailing edge. At least 52 high, growing with the text; a member with no day in
/// force shows the name alone, as a Friends row with no day does (`friendsRow.noOccurrence`).
///
/// What the contract doesn't name is the frames': 12 above the words and 16 under them, the
/// scale's steps nearest the 12.5 and 17 the frames draw, and the avatar centred on the words, as
/// drawn, until the accessibility sizes, where it keeps level with the name's first line
/// (`friendsRow.AX5`: "Avatar aligns to first line"). The avatar keeps its size
/// (`dynamicTypePolicy.avatarMarks`). The rows are about 68.5 apart where the frames draw 73: the
/// name and the weekdays take their fonts' own line heights, which the contract's 22 and 18 only
/// stand for (`dynamicTypePolicy.lineHeight`). A row with the name alone is 52 high, 8 above and
/// under the avatar, as handoff 5's `G05-members-proposed`, handoff 10's frame 7 and handoff 2's
/// `G02-changed` draw their rows 52 apart, and as a Friends row with no day is (`PersonRow`); the
/// avatar, the taller, would otherwise make it 64 with the words' 12 and 16 around it.
///
/// It is not a button: nothing in the frames opens from a member's row. VoiceOver reads one
/// element, the name then the weekdays, as sentences: "Ben, you. Monday and Thursday."
/// (`person.self.vo`). A row that opens something is a button its screen makes, which shows the
/// system's disclosure chevron in `secondaryText` at the trailing edge (`Disclosure.shown`):
/// handoff 10's frame 5 draws one on a proposed row whose viewer's decision is pending, level with
/// the name's first line (its 18-point box's middle 11 under the row's words' top, where the
/// avatar's top is). The app draws the roster's own chevron there, 13 points in the Friends row's
/// 20-point box, 4 from the trailing edge and 12 after the words, growing with the name's text
/// (frame 5 draws an 18-point schematic, 48 at accessibility 5). Once decided, the same row
/// reserves that room with no chevron (`Disclosure.reserved`), so its words wrap the same either
/// way (handoff 10's `activeMembersProposedRow.contentColumns`). The chevron says nothing to
/// VoiceOver.
///
/// In an invitation's roster (`invitationRoster`, handoff 8's frame 15) a proposed person's row
/// has no weekdays: under the name, "Proposed by {name}" in the weekdays' place when the proposer
/// is known, and the Proposed tag (`proposedMemberTag`) 8 under the words, leading aligned, at
/// every text size. Its avatar's top is level with the words' top, as handoff 8's frames 14 and
/// 15 and handoff 9's frame 6 draw it (in frame 6 the avatar from 400 and the name's glyphs from
/// 402), not centred on the taller words; at the accessibility sizes it keeps level with the
/// name's first line, as every row's does. VoiceOver reads "Debby. You. Proposed by Ben.
/// Proposed." on the viewer's own row (handoff 9's `handoff9.proposed.ownRow.vo`), "Maya.
/// Proposed by Ben. Proposed." (`proposed.row.vo`) on another's, or "Maya. Proposed." with no
/// proposer.
///
/// The person's invitation page (`G05-members-invite`, handoff 8's frame 14) draws the same
/// proposed row as its candidate's block, alone and with no separator (`separated` false).
///
/// While something about a proposed person is on its way (handoff 11's `busy.members`: their
/// invitation being removed), a line 8 under the tag says so in `metadata` `secondaryText`
/// ("Removing…"), after the system's small indeterminate indicator, and the row grows to hold
/// it (`progress`). VoiceOver doesn't read the line: the screen gives the row its value ("In
/// progress").
public struct RosterRow: View {
    /// How a person who isn't a member yet is shown.
    public enum Proposal: Sendable, Equatable {
        /// "Proposed by {name}" and the tag.
        case by(String)
        /// The tag alone.
        case unnamed
    }

    /// The trailing disclosure chevron's room.
    public enum Disclosure: Sendable, Equatable {
        /// The chevron: the row opens something.
        case shown
        /// The chevron's room, empty: the same row when it opens nothing.
        case reserved
    }

    let name: String
    let photo: Image?
    let isViewer: Bool
    let days: String?
    let proposal: Proposal?
    let disclosure: Disclosure?
    let separated: Bool
    let progress: String?
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var nameSize = TypeRole.row.size
    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.personRowChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.personRowChevron

    /// - Parameters:
    ///   - days: the member's weekdays as the screen words them, or nil while they have none.
    ///   - proposal: how a person who isn't a member yet is shown; nil for a member.
    ///   - disclosure: the trailing chevron, or its room; nil for a row with neither.
    ///   - separated: the separator under the row; false for a row drawn alone, or one whose
    ///     screen draws it under more than the row.
    ///   - progress: what's on its way for a proposed person, under the tag; nil for nothing.
    public init(
        name: String, photo: Image? = nil, isViewer: Bool, days: String?,
        proposal: Proposal? = nil, disclosure: Disclosure? = nil, separated: Bool = true,
        progress: String? = nil
    ) {
        self.name = name
        self.photo = photo
        self.isViewer = isViewer
        self.days = days
        self.proposal = proposal
        self.disclosure = disclosure
        self.separated = separated
        self.progress = progress
    }

    public var body: some View {
        HStack(
            alignment: typeSize.isAccessibilitySize || proposal != nil ? .top : .center,
            spacing: 0
        ) {
            Avatar(name: name, photo: photo, size: .row)
                .alignmentGuide(.top) {
                    typeSize.isAccessibilitySize
                        ? $0[VerticalAlignment.center]
                            - TypeRole.row.firstLineMiddle(atSize: nameSize) : $0[.top]
                }
                .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(verbatim: visibleName)
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                if let line {
                    Text(verbatim: line)
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if proposal != nil {
                    ProposedTag()
                        .padding(.top, Spacing.s - Spacing.xs)
                    if let progress {
                        HStack(spacing: Spacing.xs) {
                            ProgressView()
                                .controlSize(.mini)
                                .tint(Palette.secondaryText)
                            Text(verbatim: progress)
                                .textRole(.metadata)
                                .foregroundStyle(Palette.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.top, Spacing.s - Spacing.xs)
                    }
                }
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let disclosure {
                Image(systemName: "chevron.right")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
                    .opacity(disclosure == .shown ? 1 : 0)
                    .frame(width: chevronBox, height: chevronBox)
                    // Level with the name's first line, as frame 5 draws it; a row aligned on
                    // its centre centres it instead.
                    .alignmentGuide(.top) {
                        $0[VerticalAlignment.center]
                            - TypeRole.row.firstLineMiddle(atSize: nameSize)
                    }
                    .padding(.leading, Spacing.m)
                    .padding(.trailing, Size.personRowChevronInset)
                    .accessibilityHidden(true)
            }
        }
        .padding(.top, isNameAlone ? Spacing.s : Spacing.m)
        .padding(.bottom, isNameAlone ? Spacing.s : Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.personRowNoDateMinHeight)
        .overlay(alignment: .bottom) {
            if separated {
                Rectangle()
                    .fill(Palette.separator)
                    .frame(height: Size.separatorWidth)
                    .padding(.leading, Size.personRowTextInset)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }

    /// A row with the name alone: no weekdays, no proposer and no tag.
    private var isNameAlone: Bool { line == nil && proposal == nil }

    private var visibleName: String {
        isViewer ? String(format: String(localized: "person.self", bundle: .module), name) : name
    }

    private var personSpeech: String {
        isViewer ? String(format: String(localized: "person.self.vo", bundle: .module), name) : name
    }

    /// The line under the name: the weekdays, or who proposed the person.
    private var line: String? {
        if case .by(let proposer) = proposal {
            return String(
                format: String(localized: "roster.proposedBy", bundle: .module), proposer)
        }
        return days
    }

    /// The name, then the weekdays, as sentences; the name alone with none; for a proposed
    /// person, the name, the proposer if known, and "Proposed.", the viewer's own row as handoff
    /// 9 words it ("Debby. You. Proposed by Ben. Proposed.", `handoff9.proposed.ownRow.vo`).
    var spoken: String {
        switch proposal {
        case .by(let proposer) where isViewer:
            return String(
                format: String(localized: "roster.proposedBy.own.vo", bundle: .module), name,
                proposer)
        case .by(let proposer):
            return String(
                format: String(localized: "roster.proposedBy.vo", bundle: .module), personSpeech,
                proposer)
        case .unnamed:
            return String(
                format: String(localized: "roster.proposed.vo", bundle: .module), personSpeech)
        case nil:
            break
        }
        guard let days else {
            return String(
                format: String(localized: "friends.row.noDate.vo", bundle: .module), personSpeech)
        }
        return String(
            format: String(localized: "roster.row.vo", bundle: .module), personSpeech, days)
    }
}

/// The Proposed tag (`proposedMemberTag`): "Proposed" in `proposedTag` 13/18 bold `primaryText`,
/// 5 above and below and 8 at each side, on `surface` with a 1-point `inputBorder` and a 6-point
/// radius, as wide as the word, at least 28 high at the default size, growing with the text.
struct ProposedTag: View {
    var body: some View {
        Text(String(localized: "roster.proposed", bundle: .module))
            .textRole(.proposedTag)
            .foregroundStyle(Palette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, Size.proposedTagBlock)
            .padding(.horizontal, Spacing.s)
            .frame(minHeight: Size.proposedTagMinHeight)
            .background {
                RoundedRectangle(cornerRadius: Size.proposedTagRadius)
                    .fill(Palette.surface)
            }
            .overlay {
                RoundedRectangle(cornerRadius: Size.proposedTagRadius)
                    .strokeBorder(Palette.inputBorder, lineWidth: Size.separatorWidth)
            }
    }
}
