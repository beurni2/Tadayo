import SwiftUI
import TadayoDesign

/// G06-no-club (handoff 4's frame): Home for an account with no club. "Start your club." in
/// `utilityTitle` 32/35, its two lines, Create a club and I have an invite 16 points apart
/// (`noClubButtonGap`), and Private drafts. No example people, club or date (handoff 1). Create a
/// club, I have an invite and Private drafts show and do nothing yet (FQ85, ADR-029): club
/// creation and invitations are stage B1's, drafts B3's.
///
/// The two lines are one text, each on its own line, so `body`'s 23-point leading spaces them as
/// the frame does. `heading` is where VoiceOver's focus goes when this replaces the loading label
/// it was on (`TabContent`).
struct HomeNoClub: View {
    let heading: AccessibilityFocusState<TabFocus?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("noClub.title")
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
                .accessibilityFocused(heading, equals: .heading)
            Text(
                verbatim:
                    "\(String(localized: "noClub.body1"))\n\(String(localized: "noClub.body2"))"
            )
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxl)
            NoClubActions()
                .padding(.top, TabGap.homeActions)
            PrivateDraftsEntry(
                title: Text("drafts.title"), subtitle: Text("drafts.subtitle"), action: {}
            )
            .padding(.top, TabGap.homeDrafts)
        }
    }
}

/// F01-no-club (handoff 2's frame): Friends for an account with no club, with no example
/// roster, avatars or suggested contacts, and no contacts permission (handoff 1). Its page title,
/// Private drafts first below it (handoff 2), then "Your friends will appear here." in
/// `emptyTitle` 25/30, its line, and the same two actions as Home.
struct FriendsNoClub: View {
    let heading: AccessibilityFocusState<TabFocus?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PageTitle(words: "friends.title")
                .accessibilityFocused(heading, equals: .heading)
            PrivateDraftsEntry(
                title: Text("drafts.title"), subtitle: Text("drafts.subtitle"), action: {}
            )
            .padding(.top, TabGap.friendsSection)
            EmptyTitle(words: "friends.noClub.title")
                .padding(.top, TabGap.friendsSection)
            EmptyLine(words: "friends.noClub.body")
            NoClubActions()
                .padding(.top, TabGap.friendsActions)
        }
    }
}

/// M01-no-club (handoff 2's frame): Memories for an account with no club, with no made-up months,
/// photographs or dates (handoff 1). Its page title, "Your shared days, kept together.", the
/// history boundary's line (`historyBoundary.display`), and Go to Home, a text action that
/// selects the Home tab (handoff 1: "Go to Home selects the existing Home tab").
struct MemoriesNoClub: View {
    let heading: AccessibilityFocusState<TabFocus?>.Binding
    let goHome: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PageTitle(words: "memories.title")
                .accessibilityFocused(heading, equals: .heading)
            EmptyTitle(words: "memories.noClub.title")
                .padding(.top, TabGap.memoriesEmpty)
            EmptyLine(words: "memories.noClub.body")
            Button("memories.goHome", action: goHome)
                .buttonStyle(.tadayoText)
                .padding(.top, TabGap.goHome)
        }
    }
}

/// Create a club, then I have an invite, 16 points apart (`handoff6.spacing.noClubButtonGap`).
/// Create a club's VoiceOver label is handoff 4's `noClub.create.vo`; I have an invite's hint is
/// handoff 5's `a11y.haveInvite.hint`.
private struct NoClubActions: View {
    var body: some View {
        VStack(spacing: Spacing.l) {
            Button {
            } label: {
                Text("noClub.createClub")
            }
            .buttonStyle(.tadayoPrimary)
            .accessibilityLabel(Text("noClub.createClub.label"))
            Button {
            } label: {
                Text("noClub.invite")
            }
            .buttonStyle(.tadayoSecondary)
            .accessibilityHint(Text("noClub.invite.hint"))
        }
    }
}

/// Friends' and Memories' page title, `utilityTitle` 32/35, as a heading.
private struct PageTitle: View {
    let words: LocalizedStringKey

    var body: some View {
        Text(words)
            .textRole(.utilityTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, TabGap.pageTitle)
    }
}

/// An empty state's title, `emptyTitle` 25/30, as a heading, wrapping naturally (handoff 2's
/// frames break it in two only for their width).
private struct EmptyTitle: View {
    let words: LocalizedStringKey

    var body: some View {
        Text(words)
            .textRole(.emptyTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The line under an empty state's title, in `body` `secondaryText`.
private struct EmptyLine: View {
    let words: LocalizedStringKey

    var body: some View {
        Text(words)
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, TabGap.emptyTitleToBody)
    }
}
