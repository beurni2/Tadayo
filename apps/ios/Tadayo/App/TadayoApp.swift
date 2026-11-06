import SwiftUI
import TadayoCore
import TadayoDesign

/// The app's entry point: sign-in and the profile route by the session and the account
/// (`RootModel`). Hosting a test bundle, it builds nothing and shows the canvas.
@main
struct TadayoApp: App {
    @State private var launch = AppLaunch.make()

    var body: some Scene {
        WindowGroup {
            RootView(launch: launch)
        }
    }
}

struct RootView: View {
    let launch: AppLaunch

    var body: some View {
        switch launch {
        case .live(let graph):
            RoutedView(root: graph.root)
                .task { await graph.root.start() }
        case .inert, .unconfigured:
            Palette.canvas.ignoresSafeArea()
        }
    }
}

/// The screen for each route. The launch screen, the failure states and the tabs are
/// `ios/b0-tabs`' (the next PR); until then the launch shows the canvas, as the system's launch
/// screen does, a failure offers Retry, and the tabs open the Lab in builds that have it.
struct RoutedView: View {
    let root: RootModel

    var body: some View {
        switch root.route {
        case .signIn:
            if let signIn = root.signIn { SignInFlow(model: signIn) }
        case .confirmAge:
            if let profile = root.profile {
                AgeScreen(model: profile, leave: { await root.leave() })
            }
        case .profile:
            if let profile = root.profile { ProfileScreen(model: profile) }
        case .failed:
            Button("common.retry") { Task { await root.retry() } }
                .buttonStyle(.tadayoText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background { Palette.canvas.ignoresSafeArea() }
        case .tabs:
            #if LAB
                LabView()
            #else
                Palette.canvas.ignoresSafeArea()
            #endif
        case .starting:
            Palette.canvas.ignoresSafeArea()
        }
    }
}
