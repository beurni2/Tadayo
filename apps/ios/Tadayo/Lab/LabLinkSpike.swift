#if LAB
    import SwiftUI
    import TadayoCore
    import TadayoDesign

    /// Spike S6's workbench (docs/plans/ios-b0-spike-links.md): what each link that opened Tadayo
    /// since it started was, and which of SwiftUI's two ways handed it over, so the founder's
    /// iPhone can show that an invitation link reaches the app with its token. It keeps neither a
    /// link nor a token, only what kind each was (T7, T52); B1's `ios/b1-invitation` takes the
    /// link for real. Like the rest of the Lab it is no screen of the product: its words and
    /// layout are plain labels.
    struct LabLinkSpike: View {
        let links: OpenedLinks

        var body: some View {
            Form {
                Section("Links that opened Tadayo") {
                    if links.receipts.isEmpty {
                        Text("None since Tadayo started.")
                            .foregroundStyle(Palette.secondaryText)
                    }
                    ForEach(Array(links.receipts.enumerated()), id: \.offset) { index, receipt in
                        Text(verbatim: "\(index + 1). \(receipt.summary)")
                    }
                }
            }
            .navigationTitle("Links (S6)")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    /// The links that opened the app since it started, newest last and at most ten, each kept as
    /// its kind and the way it came, in memory only.
    @MainActor @Observable final class OpenedLinks {
        static let shared = OpenedLinks()

        /// How many receipts are kept.
        static let kept = 10

        /// The way SwiftUI handed the link over: `onOpenURL`, or the browsing activity a
        /// universal link arrives as (`onContinueUserActivity`, `NSUserActivityTypeBrowsingWeb`).
        enum Way: Equatable {
            case openURL
            case browsingActivity
        }

        enum Kind: Hashable {
            /// tadayo.app's invitation link, whose token `InvitationToken(url:)` read; the token
            /// is dropped at once.
            case invitation
            /// A tadayo.app link that isn't an invitation link with a token.
            case otherTadayo
            /// A link to another address.
            case elsewhere

            init(url: URL) {
                if InvitationToken(url: url) != nil {
                    self = .invitation
                } else if url.host()?.lowercased() == "tadayo.app" {
                    self = .otherTadayo
                } else {
                    self = .elsewhere
                }
            }
        }

        struct Receipt: Equatable {
            let kind: Kind
            let way: Way

            var summary: String {
                let how =
                    switch way {
                    case .openURL: "onOpenURL"
                    case .browsingActivity: "The browsing activity"
                    }
                let what =
                    switch kind {
                    case .invitation: "an invitation link, its token read and not kept"
                    case .otherTadayo: "a tadayo.app link with no invitation token"
                    case .elsewhere: "a link to another address"
                    }
                return "\(how): \(what)."
            }
        }

        private(set) var receipts: [Receipt] = []

        func received(_ url: URL, way: Way) {
            receipts.append(Receipt(kind: Kind(url: url), way: way))
            if receipts.count > Self.kept { receipts.removeFirst(receipts.count - Self.kept) }
        }
    }

    extension View {
        /// Hands every link that opens the app to the Lab's record of them (`OpenedLinks`).
        func labLinkReceipts() -> some View {
            onOpenURL { OpenedLinks.shared.received($0, way: .openURL) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    OpenedLinks.shared.received(url, way: .browsingActivity)
                }
        }
    }
#endif
