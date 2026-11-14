import SwiftUI

@main
struct CourseSmashApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Theme.yellow)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()
            if model.session.session == nil {
                LoginView()
            } else {
                ShellView()
            }
        }
        .foregroundStyle(Theme.paper)
    }
}
