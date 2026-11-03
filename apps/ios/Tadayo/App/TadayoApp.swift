import SwiftUI
import TadayoDesign

/// The app's entry point. Slice 11's second part adds sign-in and the three tabs; until then a
/// build that points at `dev` opens the Lab, and one that points at `prod` shows only the canvas.
@main
struct TadayoApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    var body: some View {
        #if LAB
            LabView()
        #else
            Palette.canvas.ignoresSafeArea()
        #endif
    }
}
