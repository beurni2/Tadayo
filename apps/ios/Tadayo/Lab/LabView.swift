#if LAB
    import SwiftUI
    import TadayoCore
    import TadayoDesign

    /// The Lab: every token and component with the fixture cast (docs/TECH-DESIGN.md section 4).
    /// Compiled only into builds that point at `dev` (LAB), where it is the tabs' fourth tab; the
    /// snapshot tests draw each section in light, dark and at three text sizes. It is a
    /// workbench, not a screen of the product, so its headings are plain labels. Its Log out
    /// (spec 23's word) ends the session as Leave sign-in does, so a dev build can sign in again
    /// before the product's account screen exists.
    struct LabView: View {
        let logOut: @MainActor () async -> Void

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: Spacing.xxxl) {
                        ForEach(LabSection.allCases) { section in
                            section.view
                        }
                    }
                    .padding(.vertical, Spacing.xxl)
                }
                .background(Palette.canvas)
                .navigationTitle("Lab")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        NavigationLink("Video (S3)") { LabVideoSpike() }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Log out") { Task { await logOut() } }
                    }
                }
            }
        }
    }

    /// The Lab's sections, each drawn alone by the snapshot tests.
    enum LabSection: String, CaseIterable, Identifiable {
        case colours, type, plaque, day, avatars, people
        case peopleMore = "people-more"
        case cards, drops, revealed, receipt, target, highlights, actions, fields, header, photos

        var id: String { rawValue }

        @MainActor @ViewBuilder var view: some View {
            switch self {
            case .colours: LabColours()
            case .type: LabType()
            case .plaque: LabPlaques()
            case .day: LabDayHeader()
            case .avatars: LabAvatars()
            case .people: LabPeople()
            case .peopleMore: LabPeopleMore()
            case .cards: LabCards()
            case .drops: LabDrops()
            case .revealed: LabRevealed()
            case .receipt: LabReceipt()
            case .target: LabTarget()
            case .highlights: LabHighlights()
            case .actions: LabActions()
            case .fields: LabFields()
            case .header: LabHeader()
            case .photos: LabPhotos()
            }
        }
    }

    /// A section's heading and its content, inset from the screen's edges, or, for a component
    /// that keeps its own insets (`insetsContent` false), across the whole width.
    struct LabGroup<Content: View>: View {
        let title: String
        var insetsContent = true
        @ViewBuilder let content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: Spacing.m) {
                Text(title)
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.horizontal, insetsContent ? 0 : Spacing.inset)
                content
            }
            .padding(.horizontal, insetsContent ? Spacing.inset : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    struct LabColours: View {
        private let roles: [(String, Color)] = [
            ("canvas", Palette.canvas), ("surface", Palette.surface),
            ("primaryText", Palette.primaryText), ("secondaryText", Palette.secondaryText),
            ("action", Palette.action), ("onAction", Palette.onAction),
            ("actionPressed", Palette.actionPressed), ("onActionPressed", Palette.onActionPressed),
            ("actionDisabled", Palette.actionDisabled),
            ("onActionDisabled", Palette.onActionDisabled), ("focusRing", Palette.focusRing),
            ("separator", Palette.separator), ("accent", Palette.accent),
            ("onAccent", Palette.onAccent), ("destructive", Palette.destructive),
            ("inputBorder", Palette.inputBorder), ("avatarCanvas", Palette.avatarCanvas),
            ("onAvatarCanvas", Palette.onAvatarCanvas), ("avatarOnCover", Palette.avatarOnCover),
            ("onAvatarOnCover", Palette.onAvatarOnCover), ("photoLabel", Palette.photoLabel),
            ("onPhotoLabel", Palette.onPhotoLabel), ("foldCornerLine", Palette.foldCornerLine),
        ]

        var body: some View {
            LabGroup(title: "Colours") {
                ForEach(roles, id: \.0) { role in
                    swatch(role.0, role.1)
                }
                ForEach(0..<Palette.covers.count, id: \.self) { slot in
                    swatch("cover\(slot + 1)", Palette.cover(slot: slot).fill)
                }
            }
        }

        private func swatch(_ name: String, _ colour: Color) -> some View {
            HStack(spacing: Spacing.m) {
                RoundedRectangle(cornerRadius: Radius.surface)
                    .fill(colour)
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.surface)
                            .stroke(Palette.separator, lineWidth: 1)
                    }
                    .frame(width: Size.touchTarget, height: Size.touchTarget)
                Text(name).textRole(.body).foregroundStyle(Palette.primaryText)
            }
        }
    }

    struct LabType: View {
        var body: some View {
            LabGroup(title: "Type") {
                ForEach(TypeRole.allCases, id: \.self) { role in
                    Text("\(String(describing: role)) \(Int(role.size))/\(Int(role.lineHeight))")
                        .textRole(role)
                        .foregroundStyle(Palette.primaryText)
                }
            }
        }
    }

    struct LabPlaques: View {
        private let labels = DateLabels(locale: Locale(identifier: "en_US"))

        var body: some View {
            LabGroup(title: "Weekday plaque") {
                HStack(spacing: Spacing.l) {
                    WeekdayPlaque(date: FixtureCast.open, labels: labels)
                    WeekdayPlaque(date: FixtureCast.collecting, labels: labels)
                    WeekdayPlaque(date: LocalDate(iso: "2026-11-09")!, labels: labels)
                }
            }
        }
    }

    /// The day header in its two forms: each specimen stands alone, so its date has the year,
    /// with the current year's form once each (handoff 6's `travellingRows.targetYear`).
    struct LabDayHeader: View {
        var body: some View {
            LabGroup(title: "Day header") {
                LabState("Collecting: Debby’s Friday") {
                    DayHeader(collecting: FixtureCast.collectingDay, labels: FixtureCast.labels)
                }
                LabState("Collecting, in the current year") {
                    DayHeader(
                        collecting: FixtureCast.collectingDayThisYear, labels: FixtureCast.labels)
                }
                LabState("Collecting: the longest weekday") {
                    DayHeader(collecting: FixtureCast.alexsWednesday, labels: FixtureCast.labels)
                }
                LabState("Open: Debby’s Friday") {
                    DayHeader(open: FixtureCast.openDay, labels: FixtureCast.labels)
                }
                LabState("Open, in the current year") {
                    DayHeader(open: FixtureCast.openDayThisYear, labels: FixtureCast.labels)
                }
                LabState("Open: Ben’s own Monday") {
                    DayHeader(open: FixtureCast.bensOpenDay, labels: FixtureCast.labels)
                }
            }
        }
    }

    struct LabAvatars: View {
        /// Avatars keep their size at every text size, so the grid's columns do too.
        private func column(_ size: CGFloat) -> GridItem {
            GridItem(.adaptive(minimum: size), spacing: Spacing.m)
        }

        var body: some View {
            LabGroup(title: "Avatars") {
                ForEach(AvatarSize.allCases, id: \.self) { size in
                    LazyVGrid(
                        columns: [column(size.rawValue)],
                        alignment: .leading, spacing: Spacing.m
                    ) {
                        ForEach(FixtureCast.sundayPeople) { person in
                            Avatar(name: person.name, photo: person.image, size: size)
                        }
                    }
                }
                LazyVGrid(
                    columns: [column(AvatarSize.row.rawValue + 2 * Spacing.s)],
                    alignment: .leading, spacing: Spacing.m
                ) {
                    ForEach(0..<Palette.covers.count, id: \.self) { slot in
                        Avatar(name: "Ben", size: .row, on: .cover)
                            .padding(Spacing.s)
                            .background(Palette.cover(slot: slot).fill, in: Circle())
                    }
                }
                LabState("No readable initial") {
                    withoutAnInitial(on: .canvas)
                }
                LabState("No readable initial, on a cover") {
                    withoutAnInitial(on: .cover)
                        .padding(Spacing.l)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            Palette.cover(slot: 1).fill,
                            in: RoundedRectangle(cornerRadius: Radius.card))
                }
            }
        }

        /// Handoff 7's sheet, "Avatar with no readable initial": the person symbol at each size,
        /// on the canvas and on the second cover (every cover takes the same pair), for a name
        /// with nothing typed yet.
        private func withoutAnInitial(on placement: Avatar.Placement) -> some View {
            HStack(spacing: Spacing.xxl) {
                ForEach(AvatarSize.allCases, id: \.self) { size in
                    Avatar(name: "", size: size, on: placement)
                }
            }
        }
    }

    /// The folded card, as others see it and as its author sees it (`DropCard`'s `collecting`
    /// state): Maya with her photograph, Ben's own with its Highlight, Sam's with no caption,
    /// and book p27's long name, for Debby's Friday, November 13 (handoff 7's fixtures).
    struct LabCards: View {
        var body: some View {
            LabGroup(title: "Folded cards") {
                card(FixtureCast.maya, "Your future living room.")
                card(FixtureCast.ben, "Coffee, obviously.", viewer: .author(isHighlight: true))
                card(FixtureCast.sam, nil)
                card(FixtureCast.alexandriaRose, "We said we’d go back here.")
            }
        }

        private func card(
            _ person: FixtureCast.Person, _ caption: String?,
            viewer: HiddenDrop.Viewer = .member
        ) -> some View {
            DropCard(
                .collecting(
                    HiddenDrop(
                        caption: caption, mediaClass: .photo, sender: person.sender,
                        cover: Palette.cover(slot: person.slot),
                        occasion: FixtureCast.collectingDay, viewer: viewer)),
                labels: FixtureCast.labels)
        }
    }

    /// The owner's drop before it's added, and the removed placeholder (`DropCard`), with
    /// handoff 7's fixtures: the dog draft, and the coffee upload Ben is adding for Debby's
    /// Friday, November 13, 2026 at 7 AM, uploading and then processing.
    struct LabDrops: View {
        private var upload: OwnUpload {
            OwnUpload(
                photo: Image("fixture-coffee"), caption: "This has your name on it.",
                occasion: FixtureCast.collectingDay)
        }

        var body: some View {
            LabGroup(title: "Drop card, not added") {
                LabState("Private draft") {
                    DropCard(
                        .privateDraft(
                            PrivateDraft(
                                photo: Image("fixture-dog"),
                                note: "He sat still for exactly one photo.")),
                        labels: FixtureCast.labels)
                }
                LabState("Uploading") {
                    DropCard(.uploading(upload, progress: 0.57), labels: FixtureCast.labels)
                }
                LabState("Processing") {
                    DropCard(.processing(upload), labels: FixtureCast.labels)
                }
                LabState("Removed") {
                    DropCard(.removed, labels: FixtureCast.labels)
                }
            }
        }
    }

    /// A drop once its day is open (`DropCard`'s `revealed` state): Maya's chair, her Highlight,
    /// on Debby's Friday, November 6; and Sam's drop with no caption while its photograph loads.
    struct LabRevealed: View {
        var body: some View {
            LabGroup(title: "Drop card, revealed") {
                LabState("Revealed, a highlight") {
                    DropCard(
                        .revealed(
                            RevealedDrop(
                                caption: "Your future living room.",
                                sender: FixtureCast.maya.sender, photo: Image("fixture-chair"),
                                isHighlight: true)),
                        labels: FixtureCast.labels)
                }
                LabState("No caption, photo loading") {
                    DropCard(
                        .revealed(
                            RevealedDrop(
                                caption: nil, sender: FixtureCast.sam.sender, photo: nil,
                                isHighlight: false)),
                        labels: FixtureCast.labels)
                }
            }
        }
    }

    /// The compact receipt for Debby's Friday, with Make my highlight, and without it once the
    /// drop is already the highlight.
    struct LabReceipt: View {
        var body: some View {
            LabGroup(title: "Compact receipt") {
                LabState("Added") {
                    CompactReceipt(
                        AddedDrop(occasion: FixtureCast.collectingDay, isHighlight: false),
                        labels: FixtureCast.labels, makeHighlight: {})
                }
                LabState("Added, already the highlight") {
                    CompactReceipt(
                        AddedDrop(occasion: FixtureCast.collectingDay, isHighlight: true),
                        labels: FixtureCast.labels, makeHighlight: {})
                }
            }
        }
    }

    /// Who a drop is for, before Add, as 2.1's `C02-photo` draws it: standalone specimens with
    /// the year, and the current year's form once.
    struct LabTarget: View {
        var body: some View {
            LabGroup(title: "Target block") {
                LabState("For Debby, with a photograph") {
                    target(FixtureCast.collectingDay, FixtureCast.debby)
                }
                LabState("In the current year") {
                    target(FixtureCast.collectingDayThisYear, FixtureCast.debby)
                }
                LabState("With an initial") {
                    target(FixtureCast.alexsWednesday, FixtureCast.alex)
                }
                LabState("A long name") {
                    // A test-data choice: the cast gives Alexandria-Rose no day.
                    target(FixtureCast.alexandriaRosesWednesday, FixtureCast.alexandriaRose)
                }
            }
        }

        private func target(_ occasion: Occasion, _ star: FixtureCast.Person) -> some View {
            TargetBlock(
                for: occasion, photo: star.image, club: FixtureCast.club,
                labels: FixtureCast.labels, action: {})
        }
    }

    /// A state's name over the component, as a workbench labels it.
    struct LabState<Content: View>: View {
        let name: String
        @ViewBuilder let content: Content

        init(_ name: String, @ViewBuilder content: () -> Content) {
            self.name = name
            self.content = content()
        }

        var body: some View {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text(name).textRole(.metadata).foregroundStyle(Palette.secondaryText)
                content
            }
        }
    }

    /// The roster as Friends lists it, in the server's order (Ben, Maya, Alex, Sam, Debby,
    /// Nina, as every roster frame draws it), viewed by Ben, in the current year, so with no year
    /// (handoff 6's `travellingRows.targetYear`: "Snapshot current-year live Home/Friends omit
    /// year").
    struct LabPeople: View {
        var body: some View {
            LabGroup(title: "Person row") {
                LabState("Friends") {
                    LabRoster(members: FixtureCast.sundayPeople.map { FixtureCast.member($0) })
                }
                LabState("First days: Ben and Debby have no day yet") {
                    LabRoster(
                        members: FixtureCast.sundayPeople.map {
                            FixtureCast.member($0, dated: $0.id != "Ben" && $0.id != "Debby")
                        })
                }
            }
        }
    }

    /// The person row's other forms: travelling, long names (the second marked Next up, a
    /// test-data choice that shows Next up under a name that wraps: no frame draws it), the viewer
    /// as Next up (the same), and one row standing alone, with the year.
    struct LabPeopleMore: View {
        var body: some View {
            LabGroup(title: "Person row, more") {
                LabState("In Auckland: the next day there") {
                    LabRoster(
                        members: [FixtureCast.ben, FixtureCast.nina].map { FixtureCast.member($0) },
                        device: FixtureCast.auckland)
                }
                LabState("In London: the same date") {
                    LabRoster(
                        members: [FixtureCast.member(FixtureCast.nina)], device: FixtureCast.london)
                }
                LabState("Long names, the second Next up") {
                    // As 2.1's F01-long-names: in Alex's and Debby's places, with Debby's photo;
                    // Debby's is marked Next up, which 2.1 doesn't draw there.
                    LabRoster(members: [
                        FixtureCast.member(FixtureCast.alexandriaRose, day: FixtureCast.alex),
                        FixtureCast.member(
                            FixtureCast.deborahAnne, day: FixtureCast.debby,
                            photo: FixtureCast.debby.image, isNextUp: true),
                    ])
                }
                LabState("Ben, Next up") {
                    LabRoster(members: [FixtureCast.member(FixtureCast.ben, isNextUp: true)])
                }
                LabState("Standing alone, with the year") {
                    LabRoster(members: [FixtureCast.member(FixtureCast.nina, includingYear: true)])
                }
            }
        }
    }

    /// Roster rows one under another, each drawing its own separator.
    struct LabRoster: View {
        let members: [PersonRow.Member]
        var device = FixtureCast.zone

        var body: some View {
            VStack(spacing: 0) {
                ForEach(members.indices, id: \.self) { index in
                    PersonRow(
                        members[index], device: device, labels: FixtureCast.labels, action: {})
                }
            }
        }
    }

    struct LabHighlights: View {
        @Environment(\.dynamicTypeSize) private var dynamicTypeSize

        /// A rail at the default size and below; a vertical list above it, where the covers
        /// become full-width rows (book p26; `HighlightCover.usesList(at:)`). The star's own pick
        /// carries "Debby’s pick" and its star; another member's cover carries their name alone,
        /// "Maya" (handoff 7's `highlight.contributor`, as 2.1's `H01-open` draws it), and is still
        /// named "Open Maya’s highlight" to VoiceOver (T47). The long name is a star's own pick
        /// too, "Deborah-Anne’s pick" with its star, as handoff 7's row specimen draws it, so the
        /// row's star is seen beside a label that wraps (`star.rowOrigin`).
        var body: some View {
            let rail =
                HighlightCover.usesList(at: dynamicTypeSize)
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.m))
                : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.m))
            LabGroup(title: "Highlight covers") {
                rail {
                    cover(FixtureCast.debby, label: "Debby’s pick", isStarPick: true)
                    cover(FixtureCast.maya, label: "Maya")
                    cover(FixtureCast.deborahAnne, label: "Deborah-Anne’s pick", isStarPick: true)
                }
            }
        }

        private func cover(
            _ person: FixtureCast.Person, label: String, isStarPick: Bool = false
        ) -> some View {
            HighlightCover(
                label: label, sender: person.name, cover: Palette.cover(slot: person.slot),
                isStarPick: isStarPick,
                accessibilityName: "Open \(person.name)’s highlight", action: {})
        }
    }

    struct LabActions: View {
        /// The primary button's four states, as the sheet's "Primary button states" shows them,
        /// then the secondary button (handoff 2's `invitationEntryAction`). A snapshot can't
        /// press a button or give it keyboard focus, so those are drawn with the buttons' faces.
        var body: some View {
            LabGroup(title: "Actions") {
                state("Default") {
                    Button("Add for Debby") {}
                        .buttonStyle(.tadayoPrimary)
                }
                state("Pressed") {
                    PrimaryButtonFace(isPressed: true) { Text("Add for Debby") }
                }
                state("Disabled") {
                    Button("Verify code") {}
                        .buttonStyle(.tadayoPrimary)
                        .disabled(true)
                }
                state("Keyboard focus") {
                    PrimaryButtonFace(isFocused: true) { Text("Add for Debby") }
                }
                state("Busy") {
                    Button {
                    } label: {
                        Text("auth.email.send")
                    }
                    .buttonStyle(.tadayoPrimary(isBusy: true))
                    .disabled(true)
                }
                state("Secondary") {
                    Button {
                    } label: {
                        Text("noClub.invite")
                    }
                    .buttonStyle(.tadayoSecondary)
                }
                state("Secondary, keyboard focus") {
                    SecondaryButtonFace(isFocused: true) { Text("noClub.invite") }
                }
                AllowanceLine("2 of 6 drops · 0 of 2 video links")
                state("Text action") {
                    Button("auth.code.resend") {}
                        .buttonStyle(.tadayoText)
                }
                state("Text action, unavailable") {
                    Button("auth.changeEmail") {}
                        .buttonStyle(.tadayoText)
                        .disabled(true)
                }
            }
        }

        private func state<Content: View>(
            _ name: String, @ViewBuilder content: () -> Content
        ) -> some View {
            // The focus ring reaches 4 points beyond the button, so the label sits 8 above it.
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text(name).textRole(.metadata).foregroundStyle(Palette.secondaryText)
                content()
            }
        }
    }

    /// The labelled field in each of its states, and a failure's line (handoff 2 and 4's
    /// `fieldFocus`; the sheet's "Focused error field"). Focus is drawn, not taken.
    struct LabFields: View {
        var body: some View {
            LabGroup(title: "Fields") {
                state("Default") {
                    field("auth.email.label", "ben@example.com", isFocused: false)
                }
                state("Focused, empty") {
                    field("auth.code.label", "", isFocused: true)
                }
                state("Focused, not verified") {
                    field("auth.code.label", "529614", isFocused: true, isInvalid: true)
                    InlineError(Text("auth.code.notVerified"))
                }
                state("Not verified, not focused") {
                    field("auth.code.label", "529614", isFocused: false, isInvalid: true)
                }
                state("Failure line") {
                    InlineError(Text("auth.error.sendNetwork"))
                }
            }
        }

        private func field(
            _ label: LocalizedStringKey, _ value: String, isFocused: Bool, isInvalid: Bool = false
        ) -> some View {
            LabelledField(Text(label), isFocused: isFocused, isInvalid: isInvalid) {
                TextField(String(), text: .constant(value))
            }
        }

        private func state<Content: View>(
            _ name: String, @ViewBuilder content: () -> Content
        ) -> some View {
            // The focus ring reaches 4 points beyond the field, so the name sits 8 above it.
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text(name).textRole(.metadata).foregroundStyle(Palette.secondaryText)
                content()
            }
        }
    }

    /// The no-club header with Ben's initial (handoff 7's `noClubRootHeader`), across the width
    /// as the tabs draw it, and the Private drafts row (`privateDraftsEntry`).
    struct LabHeader: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Spacing.xxxl) {
                LabGroup(title: "No-club header", insetsContent: false) {
                    NoClubHeader(
                        wordmark: Image("Wordmark"), wordmarkLabel: Text("brand.wordmark"),
                        add: Text("header.add"), addHint: Text("header.add.hint"),
                        account: Text("header.account"),
                        accountHint: Text("header.account.hint"), name: FixtureCast.ben.name,
                        onAdd: {}, onAccount: {})
                }
                LabGroup(title: "Private drafts") {
                    PrivateDraftsEntry(
                        title: Text("drafts.title"), subtitle: Text("drafts.subtitle"),
                        action: {})
                }
            }
        }
    }

    struct LabPhotos: View {
        var body: some View {
            LabGroup(title: "Fixture photographs") {
                ForEach(FixtureCast.photos, id: \.self) { name in
                    Image(name)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: Radius.photo))
                        .accessibilityLabel(name)
                }
            }
        }
    }
#endif
