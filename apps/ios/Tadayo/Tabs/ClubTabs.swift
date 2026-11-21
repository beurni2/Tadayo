import SwiftUI
import TadayoDesign

/// H01-awaiting-activation (handoff 3's frame, with handoff 5's words): Home for a club that
/// hasn't started. "Waiting for club confirmation" in `utilityTitle` 32/35 and "The club starts
/// when another person accepts the same roster." in `body` `secondaryText`; Private drafts; and
/// "Drafts stay private when the club starts." in `metadata` `secondaryText` under it. When the
/// creator's own decision on the club's current revision is pending, the title and the line are
/// frame 13's, "Review the updated members" and "Review and approve the updated roster before
/// {clubName} can start." (handoff 8's `creatorReviewRequired`, FQ84). Nothing lists or counts
/// who has accepted (book p30, T33).
///
/// The gaps are `handoff6.spacing`'s, not the frame's (handoff 5's X-28): the title 32 under the
/// header (`homeContentTopAfterHeader`), the line 24 under it (`homeTitleToBody`), Private drafts
/// 16 under that (`homeBodyToSecondary`), and the note 16 under Private drafts, the scale's step
/// nearest the 17 that frame 13 draws. Private drafts shows and does nothing yet: drafts are B3's
/// and B4's. `heading` is where VoiceOver's focus goes when this replaces the loading label it
/// was on (`TabContent`).
struct HomeAwaiting: View {
    let club: String
    let review: Bool
    let heading: AccessibilityFocusState<TabFocus?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(review ? "home.review.title" : "home.awaiting.title")
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
                .accessibilityFocused(heading, equals: .heading)
            Group {
                if review {
                    Text(
                        verbatim: String(format: String(localized: "home.review.body"), club))
                } else {
                    Text("home.awaiting.body")
                }
            }
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxl)
            PrivateDraftsEntry(
                title: Text("drafts.title"), subtitle: Text("drafts.subtitle"), action: {}
            )
            .padding(.top, Spacing.l)
            Text("home.awaiting.private")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.l)
        }
    }
}

/// Review members, pinned at the foot of H01-awaiting-activation (`handoff3.awaitingHome`). Its
/// label is Review members with the hint "Review the proposed roster for {clubName}." (handoff
/// 5's `a11y.reviewMembers`, which replaces handoff 3's label), or, when the review is pending,
/// "Review {clubName}’s updated members." with no hint (handoff 8's
/// `pending.review.action.vo`, frame 13). It does nothing yet: the proposed roster's review is
/// `G05-members-proposed`, plan PR 7 (FQ85).
struct ReviewMembersButton: View {
    let club: String
    let review: Bool

    var body: some View {
        if review {
            button.accessibilityLabel(
                Text(
                    verbatim: String(format: String(localized: "home.review.action.label"), club)
                ))
        } else {
            button.accessibilityHint(
                Text(
                    verbatim: String(format: String(localized: "home.awaiting.action.hint"), club)
                ))
        }
    }

    private var button: some View {
        Button {
        } label: {
            Text("home.awaiting.action")
        }
        .buttonStyle(.tadayoPrimary)
    }
}

/// H01-unavailable, F01-unavailable and M01-unavailable (handoff 6's frames): a suspended club's
/// tabs, with nothing of the club (T9, spec 22). "Club unavailable" in `emptyTitle` 25/30, 32
/// under the denied header (`homeContentTopAfterHeader`), and "This club isn’t available right
/// now." 24 under it, read together as one heading (handoff 6's `denied.group.vo`, "{titleText}.
/// {bodyText}"), as the failures are. Every tab shows the same.
struct ClubUnavailable: View {
    let heading: AccessibilityFocusState<TabFocus?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("unavailable.title")
                .textRole(.emptyTitle)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("unavailable.body")
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxl)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: Self.spoken))
        .accessibilityAddTraits(.isHeader)
        .accessibilityFocused(heading, equals: .heading)
        .padding(.top, Spacing.xxxl)
    }

    /// The title and the line, as VoiceOver reads them, and as they're said when they show.
    static var spoken: String {
        let title = String(localized: "unavailable.title")
        return "\(title). \(String(localized: "unavailable.body"))"
    }
}

/// A suspended club's two actions, pinned at the foot: Choose a club, the one primary action,
/// which opens the switcher (handoff 6's `deniedHeader.oneChooseAction`), and Get help under it,
/// a text action 8 below (`primaryToSecondaryTargetGap`). Get help shows and does nothing: no
/// support address is configured, and none is invented (`deniedHeader.GetHelp`). Its hint is
/// handoff 5's `home.help.hint`.
struct ClubUnavailableActions: View {
    let chooseClub: () -> Void

    var body: some View {
        VStack(spacing: TabGap.primaryToSecondary) {
            Button(action: chooseClub) {
                Text("unavailable.choose")
            }
            .buttonStyle(.tadayoPrimary)
            Button {
            } label: {
                Text("unavailable.help")
            }
            .buttonStyle(.tadayoText)
            .accessibilityHint(Text("unavailable.help.hint"))
        }
    }
}
