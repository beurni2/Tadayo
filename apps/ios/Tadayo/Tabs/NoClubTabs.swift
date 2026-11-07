import SwiftUI
import TadayoDesign

/// G06-no-club (handoff 4's frame): Home for an account with no club. "Start your club." in
/// `utilityTitle` 32/35, its two lines, Create a club and I have an invite 16 points apart
/// (`noClubButtonGap`), and Private drafts. No example people, club or date (handoff 1). Create a
/// club, I have an invite and Private drafts show and do nothing yet (FQ85, ADR-029): club
/// creation and invitations are stage B1's, drafts B3's.
struct HomeNoClub: View {
    let name: String

    var body: some View {
        TabScroll(name: name) {
            Text("noClub.title")
                .textRole(.utilityTitle)
                .foregroundStyle(Palette.primaryText)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
            VStack(alignment: .leading, spacing: 0) {
                line("noClub.body1")
                line("noClub.body2")
            }
            .padding(.top, Spacing.xxl)
            NoClubActions()
                .padding(.top, TabGap.homeActions)
            PrivateDraftsEntry(
                title: Text("drafts.title"), subtitle: Text("drafts.subtitle"), action: {}
            )
            .padding(.top, TabGap.homeDrafts)
        }
    }

    private func line(_ words: LocalizedStringKey) -> some View {
        Text(words)
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// F01-no-club (handoff 2's frame): Friends for an account with no club, with no example
/// roster, avatars or suggested contacts, and no contacts permission (handoff 1). Its page title,
/// Private drafts first below it (handoff 2), then "Your friends will appear here." in
/// `emptyTitle` 25/30, its line, and the same two actions as Home.
struct FriendsNoClub: View {
    let name: String

    var body: some View {
        TabScroll(name: name) {
            PageTitle(words: "friends.title")
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
    let name: String
    let goHome: () -> Void

    var body: some View {
        TabScroll(name: name) {
            PageTitle(words: "memories.title")
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
