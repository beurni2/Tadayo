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

/// The screen for each route. While the session and the account are read, and while Leave
/// sign-in runs, the canvas alone, as Tadayo's launch screen shows it (`global-launch`; the launch
/// screen's colour is `LaunchBackground`, canvas's two values, in `project.yml`). A failure says
/// what failed, with Retry (`RootFailure`). The tabs show the club list for the account.
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
        case .failed(let failure):
            RootFailure(kind: .account(failure), retry: { await root.retry() })
        case .leaveFailed:
            RootFailure(kind: .leave, retry: { await root.retry() })
        case .signInNotKept:
            RootFailure(kind: .keep, retry: { await root.retry() })
        case .tabs:
            TabsView(
                clubs: root.clubs, name: root.account?.displayName ?? "",
                retry: { await root.retry() }, logOut: { await root.leave() })
        case .starting:
            Palette.canvas.ignoresSafeArea()
        }
    }
}
