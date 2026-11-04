#if LAB
    import SwiftUI
    import TadayoCore
    import TadayoDesign

    /// The Lab: every token and component with the fixture cast (docs/TECH-DESIGN.md section 4).
    /// Compiled only into builds that point at `dev` (LAB); the snapshot tests draw each section
    /// in light, dark and at three text sizes. It is a workbench, not a screen of the product, so
    /// its headings are plain labels.
    struct LabView: View {
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
            }
        }
    }

    /// The Lab's sections, each drawn alone by the snapshot tests.
    enum LabSection: String, CaseIterable, Identifiable {
        case colours, type, plaque, avatars, cards, highlights, actions, photos

        var id: String { rawValue }

        @MainActor @ViewBuilder var view: some View {
            switch self {
            case .colours: LabColours()
            case .type: LabType()
            case .plaque: LabPlaques()
            case .avatars: LabAvatars()
            case .cards: LabCards()
            case .highlights: LabHighlights()
            case .actions: LabActions()
            case .photos: LabPhotos()
            }
        }
    }

    /// A section's heading and its content, inset from the screen's edges.
    struct LabGroup<Content: View>: View {
        let title: String
        @ViewBuilder let content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: Spacing.m) {
                Text(title)
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
                    .accessibilityAddTraits(.isHeader)
                content
            }
            .padding(.horizontal, Spacing.inset)
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

    struct LabAvatars: View {
        @Environment(\.dynamicTypeSize) private var dynamicTypeSize

        /// Avatars grow with the text, about three times at the largest size, so the grid's
        /// columns do too.
        private func column(_ size: CGFloat) -> GridItem {
            GridItem(
                .adaptive(minimum: size * (dynamicTypeSize.isAccessibilitySize ? 3.2 : 1)),
                spacing: Spacing.m)
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
                    columns: [column(52)],
                    alignment: .leading, spacing: Spacing.m
                ) {
                    ForEach(0..<Palette.covers.count, id: \.self) { slot in
                        Avatar(name: "Ben", size: .row, on: .cover)
                            .padding(Spacing.s)
                            .background(Palette.cover(slot: slot).fill, in: Circle())
                    }
                }
            }
        }
    }

    struct LabCards: View {
        private let labels = DateLabels(locale: Locale(identifier: "en_US"))

        private var status: String {
            "Opens \(labels.shortDate(FixtureCast.collecting))"
        }

        var body: some View {
            LabGroup(title: "Folded cards") {
                FoldedCard(
                    status: status, caption: .text("Your future living room."),
                    sender: FixtureCast.maya.name, cover: Palette.cover(slot: FixtureCast.maya.slot)
                )
                FoldedCard(
                    status: status, tag: "Highlight", caption: .text("Coffee, obviously."),
                    sender: "\(FixtureCast.ben.name) · You",
                    cover: Palette.cover(slot: FixtureCast.ben.slot))
                FoldedCard(
                    status: status, caption: .blank("Photo for Debby"),
                    sender: FixtureCast.sam.name, cover: Palette.cover(slot: FixtureCast.sam.slot))
                FoldedCard(
                    status: status, caption: .text("We said we’d go back here."),
                    sender: FixtureCast.alexandriaRose.name,
                    cover: Palette.cover(slot: FixtureCast.alexandriaRose.slot))
            }
        }
    }

    struct LabHighlights: View {
        @Environment(\.dynamicTypeSize) private var dynamicTypeSize

        /// A rail at the default size and below; a vertical list above it, where the covers
        /// become full-width rows (book p26; `HighlightCover.usesList(at:)`).
        var body: some View {
            let rail =
                HighlightCover.usesList(at: dynamicTypeSize)
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.m))
                : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.m))
            LabGroup(title: "Highlight covers") {
                rail {
                    cover(FixtureCast.debby, label: "Debby’s pick")
                    cover(FixtureCast.maya, label: "Maya’s highlight")
                    cover(FixtureCast.deborahAnne, label: "Deborah-Anne’s pick")
                }
            }
        }

        private func cover(_ person: FixtureCast.Person, label: String) -> some View {
            HighlightCover(
                label: label, sender: person.name, cover: Palette.cover(slot: person.slot),
                accessibilityName: "Open \(person.name)’s highlight", action: {})
        }
    }

    struct LabActions: View {
        var body: some View {
            LabGroup(title: "Actions") {
                Button("Add for Debby") {}
                    .buttonStyle(.tadayoPrimary)
                Button("Verify code") {}
                    .buttonStyle(.tadayoPrimary)
                    .disabled(true)
                AllowanceLine("2 of 6 drops · 0 of 2 video links")
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
