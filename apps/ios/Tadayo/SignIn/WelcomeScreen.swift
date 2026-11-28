import SwiftUI
import TadayoCore
import TadayoDesign

/// `A01-welcome` (handoff 9's frames 18 to 20, which redraw handoff 8's frames 1 to 3 with Already
/// here? Sign in): the sign-in stack's root, with no bar, one scrolling column 20 in from each edge
/// on `canvas` (`docs/plans/ios-b1-welcome.md` section 3):
/// - the wordmark, 144 wide, an image named "Tadayo" (`brand.wordmark`), 12 under the safe area's
///   top (frame 18: 13);
/// - 32 under it, the brand line in `dayTitle` `primaryText`, a heading; 20 under that, the
///   explanation in `body` `secondaryText` (`handoff8.welcome`);
/// - 24 under it, the example: its label in `metadata` `secondaryText`, 12 under it the target in
///   `metadata` `primaryText`, "Debby’s Friday · November 6, 2026", whose date the phone's region
///   writes (FQ44; the frame's is en-GB's), and 12 under that the two stages, each its label in
///   `metadata` `secondaryText` 8 over it: Maya's caption on Maya's card (`ExampleCard`) and the
///   photograph on the day, radius 14, two columns 13 apart and 172 high. At the accessibility
///   sizes, one column, as frame 20 draws it: "Caption now", the card, 32 under it "Photo on the
///   day" and the photograph, the column's width and 300 high, each label 12 over its stage;
/// - the routes, at least 24 under the example (32 at the accessibility sizes), at the foot of a
///   screen the column doesn't fill, as frame 18 draws them: Create a club, 16 under it I have an
///   invite, and 8 under that Already here? Sign in, a centred text action hinted "Sign in to
///   your existing account." (`handoff9.welcome`). Each is read by its visible words. At the
///   accessibility sizes the column ends 24 under the last, as frame 20's does.
///
/// Where the column is longer than the screen, at the accessibility sizes, it scrolls under the
/// status bar's band, on `canvas` as frame 20 draws it, as the tabs' columns do (`TabScroll`).
///
/// VoiceOver reads the example as the frames lay it out: the label, the target, "Caption now",
/// the card as one element ("Maya. Your future living room."), then "Photo on the day"; the
/// photograph itself is hidden, so nothing reads it as a real drop (spec 04: a labelled example).
///
/// The chair and Maya's portrait are fixtures, only in builds that point at `dev` (`LAB`; FQ23,
/// FQ24): a build that points at `prod` shows Maya's initial and an empty photograph slot, on
/// `surface`, until the founder's photograph comes, before Gate D.
struct WelcomeScreen: View {
    /// One of the three routes.
    let choose: @MainActor (SignInModel.Way) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    /// The phone's region, which writes the example's date (FQ44).
    @Environment(\.locale) private var locale

    /// The example's date, Debby's Friday (handoff 8's `welcome.exampleDate`).
    private static let exampleDate = LocalDate(iso: "2026-11-06")!

    var body: some View {
        GeometryReader { viewport in
            ScrollView {
                PinnedFooterLayout(
                    minHeight: viewport.size.height - Spacing.m - bottomGap,
                    spacing: stacked ? Spacing.xxxl : Spacing.xxl
                ) {
                    VStack(alignment: .leading, spacing: 0) {
                        introduction
                        example.padding(.top, Spacing.xxl)
                    }
                    routes
                }
                .padding(.horizontal, Spacing.inset)
                .padding(.top, Spacing.m)
                .padding(.bottom, bottomGap)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background { Palette.canvas.ignoresSafeArea() }
        .overlay(alignment: .top) {
            // The status bar's band, as `TabScroll`'s: the column scrolls under it on `canvas`,
            // never through the clock, as frame 20 draws it. No height of its own: all of it is
            // the safe area it reaches into.
            Palette.canvas
                .ignoresSafeArea(edges: .top)
                .frame(height: 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    /// The accessibility sizes stack the example's stages.
    private var stacked: Bool { typeSize.isAccessibilitySize }

    /// Under the last route: none where the routes sit at the safe area's foot (frame 18), 24 at
    /// the accessibility sizes (frame 20).
    private var bottomGap: CGFloat { stacked ? Spacing.xxl : 0 }

    /// The wordmark, the brand line and the explanation.
    @ViewBuilder private var introduction: some View {
        Image("Wordmark")
            .resizable()
            .scaledToFit()
            .frame(width: Size.welcomeWordmark)
            .accessibilityLabel(Text("brand.wordmark"))
        Text("welcome.brand")
            .textRole(.dayTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxxl)
        Text("welcome.explanation")
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xl)
    }

    /// The labelled example: its label, the target, and the two stages.
    private var example: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("welcome.example")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: target)
                .textRole(.metadata)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.m)
            stages.padding(.top, Spacing.m)
        }
    }

    /// "Debby’s Friday · November 6, 2026".
    private var target: String {
        let date = Self.exampleDate
        let labels = DateLabels(locale: locale)
        return String(
            format: String(localized: "welcome.example.target"),
            String(localized: "welcome.example.star"), labels.weekday(date),
            labels.dayMonth(date, includingYear: true))
    }

    /// Two columns, each a stage under its label, or, at the accessibility sizes, one after the
    /// other. Each column is read in turn, its label then its stage.
    @ViewBuilder private var stages: some View {
        if stacked {
            VStack(alignment: .leading, spacing: Spacing.xxxl) {
                stage("welcome.example.captionNow", gap: Spacing.m) { card }
                stage("welcome.example.photoOnDay", gap: Spacing.m) {
                    photo.frame(height: Size.exampleStackedPhotoHeight)
                }
            }
        } else {
            HStack(alignment: .top, spacing: Size.exampleGap) {
                stage("welcome.example.captionNow", gap: Spacing.s) { card }
                // As high as the card, which grows with its text past the default size.
                stage("welcome.example.photoOnDay", gap: Spacing.s) {
                    photo.frame(minHeight: Size.exampleHeight, maxHeight: .infinity)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func stage(
        _ label: LocalizedStringKey, gap: CGFloat, @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: gap) {
            Text(label)
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            content()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .contain)
    }

    /// Maya's caption, before the day.
    private var card: some View {
        ExampleCard(
            caption: String(localized: "welcome.example.caption"),
            sender: String(localized: "welcome.example.sender"),
            photo: mayasPhoto, cover: Palette.cover(slot: 1))
    }

    private var mayasPhoto: Image? {
        #if LAB
            FixtureCast.maya.image
        #else
            nil
        #endif
    }

    /// The photograph on the day, or, with no fixtures, its empty slot. Hidden from VoiceOver:
    /// its label says what it is.
    private var photo: some View {
        RoundedRectangle(cornerRadius: Radius.photo)
            .fill(Palette.surface)
            .overlay {
                #if LAB
                    Image("fixture-chair")
                        .resizable()
                        .scaledToFill()
                #endif
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.photo))
            .accessibilityHidden(true)
    }

    /// Create a club, I have an invite, and Already here? Sign in.
    private var routes: some View {
        VStack(spacing: 0) {
            Button {
                choose(.createClub)
            } label: {
                Text("welcome.create")
            }
            .buttonStyle(.tadayoPrimary)
            Button {
                choose(.invitation)
            } label: {
                Text("welcome.invite")
            }
            .buttonStyle(.tadayoSecondary)
            .padding(.top, Spacing.l)
            Button {
                choose(.signIn)
            } label: {
                Text("welcome.signIn")
            }
            .buttonStyle(.tadayoTextUnderPrimary)
            .accessibilityHint(Text("welcome.signIn.hint"))
            .padding(.top, Spacing.s)
        }
    }
}
