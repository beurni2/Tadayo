#if LAB
    import SwiftUI
    import TadayoCore
    import TadayoDesign

    /// Spike S3's workbench (docs/plans/ios-b0-spike-video.md): one TikTok link in the viewer's
    /// isolated web view, with the log of what the player said and what the web view was
    /// stopped from loading. Like the rest of the Lab it is no screen of the product: its words
    /// and layout are plain labels, and B7 builds E01 from its design.
    struct LabVideoSpike: View {
        /// The post TikTok's own documentation embeds.
        @State private var link = "https://www.tiktok.com/@scout2015/video/6718335390845095173"
        @State private var onTadayoSite = false
        @State private var viewer: VideoViewerModel?
        @State private var lastLog: [String] = []

        private var post: TikTokPost? { TikTokPost(link: link) }

        var body: some View {
            Form {
                Section("TikTok link") {
                    TextField("https://www.tiktok.com/@name/video/1", text: $link, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    if post == nil {
                        Text("Not a full TikTok video link.")
                            .foregroundStyle(Palette.destructive)
                    }
                }
                Section("Shell address") {
                    Toggle("Load the shell as https://tadayo.app/", isOn: $onTadayoSite)
                    Text(
                        onTadayoSite
                            ? "The player sees tadayo.app as the page that embeds it."
                            : "The player sees a page with no address."
                    )
                    .foregroundStyle(Palette.secondaryText)
                }
                Section {
                    Button("Load video") {
                        guard let post else { return }
                        let model = VideoViewerModel(post: post)
                        model.open()
                        viewer = model
                    }
                    .disabled(post == nil)
                }
                if !lastLog.isEmpty {
                    Section("Last viewing's log") {
                        Button("Copy log") { UIPasteboard.general.string = report }
                        ForEach(Array(lastLog.enumerated()), id: \.offset) { _, line in
                            Text(line).font(.footnote.monospaced())
                        }
                    }
                }
            }
            .navigationTitle("Video viewer (S3)")
            .navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(isPresented: viewing) {
                if let model = viewer {
                    LabVideoViewer(
                        model: model,
                        base: onTadayoSite ? URL(string: "https://tadayo.app/") : nil
                    ) {
                        lastLog = model.log
                        viewer = nil
                    }
                }
            }
        }

        private var viewing: Binding<Bool> {
            Binding(get: { viewer != nil }, set: { shown in if !shown { viewer = nil } })
        }

        /// The log with the choices it was made under, for pasting into a message.
        private var report: String {
            let shell = onTadayoSite ? "https://tadayo.app/" : "none"
            return (["S3 log", "shell address: \(shell)"] + lastLog).joined(separator: "\n")
        }
    }

    /// The viewing: Close, the player's fixed-size area, what state the viewer is in, Open
    /// original, and the running log.
    struct LabVideoViewer: View {
        let model: VideoViewerModel
        let base: URL?
        let done: () -> Void
        @State private var handle = PlayerHandle()
        @State private var started = ContinuousClock.now
        @Environment(\.scenePhase) private var scenePhase
        @Environment(\.openURL) private var openURL

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: Spacing.l) {
                        player
                        Text(status).textRole(.body).foregroundStyle(Palette.primaryText)
                        if case .failed = model.phase {
                            Button("Retry") {
                                started = .now
                                model.retry()
                            }
                        }
                        Button("Open original") { openURL(model.post.original) }
                        ForEach(Array(model.log.enumerated()), id: \.offset) { _, line in
                            Text(line).font(.footnote.monospaced())
                                .foregroundStyle(Palette.secondaryText)
                        }
                    }
                    .padding(Spacing.inset)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Palette.canvas)
                .navigationTitle("TikTok")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") {
                            handle.pause()
                            model.close()
                            done()
                        }
                    }
                }
            }
            .task(id: model.attempt) {
                let attempt = model.attempt
                try? await Task.sleep(for: VideoViewerModel.timeout)
                if !Task.isCancelled { model.timedOut(attempt: attempt) }
            }
            .onChange(of: model.phase) { old, new in
                if old == .loading, case .ready = new {
                    let taken = (ContinuousClock.now - started).components
                    let milliseconds =
                        taken.seconds * 1000 + taken.attoseconds / 1_000_000_000_000_000
                    model.note("ready after \(milliseconds) ms")
                }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase != .active, model.showsPlayer else { return }
                handle.pause()
                model.note("paused: app \(phase == .background ? "in background" : "inactive")")
            }
            .alert(
                "Leave Tadayo?", isPresented: asking, presenting: model.leaving
            ) { _ in
                Button("Open") {
                    if let url = model.answerLeaving(leave: true) {
                        handle.pause()
                        openURL(url)
                    }
                }
                Button("Stay", role: .cancel) { _ = model.answerLeaving(leave: false) }
            } message: { url in
                Text("This opens \(url.host ?? "a web page") outside Tadayo.")
            }
        }

        private var asking: Binding<Bool> {
            Binding(
                get: { model.leaving != nil },
                set: { shown in
                    if !shown, model.leaving != nil { _ = model.answerLeaving(leave: false) }
                })
        }

        /// The player's area: 9 by 16, the same size whatever the state (spec 17: "Fixed size
        /// player shell with Close available").
        private var player: some View {
            Color.black
                .aspectRatio(9 / 16, contentMode: .fit)
                .frame(maxWidth: 320)
                .overlay {
                    if model.showsPlayer {
                        PlayerWebView(
                            model: model, attempt: model.attempt, base: base, handle: handle
                        )
                        .id(model.attempt)
                    }
                }
                .overlay {
                    if model.phase == .loading { ProgressView().tint(.white) }
                }
                .frame(maxWidth: .infinity)
        }

        private var status: String {
            switch model.phase {
            case .idle: "Closed."
            case .loading: "Loading the player."
            case .ready(let playback): "The player is ready (state \(playback.rawValue))."
            case .failed(.unavailable): "The player says this video is no longer available."
            case .failed(.cannotPlay): "The player couldn't play this video."
            case .failed(.timeout): "The player didn't answer in time."
            case .failed(.network): "No connection."
            }
        }
    }
#endif
