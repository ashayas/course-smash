import SwiftUI
import UIKit

/// The signed-in app: the header on top and the current section under it.
struct ShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            HeaderBar()
            NavigationStack(path: $model.path) {
                Group {
                    switch model.section {
                    case .courses: HomeView()
                    case .library: LibraryView()
                    case .stats: StatsView()
                    }
                }
                .id(model.section)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case let .course(id): CourseScreen(id: id).id(id)
                    case let .libraryCourse(id): LibraryCourseView(id: id).id(id)
                    }
                }
            }
        }
        .background(Theme.ink)
    }
}

/// The logo mark, the three sections and the log out pill.
private struct HeaderBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 4) {
            Button { model.show(.courses) } label: {
                let mark = CityEngine.shared.mark()
                SVGView(document: mark).frame(width: 38, height: 38 / mark.aspectRatio)
            }
            .accessibilityLabel("Course Smash home")
            .padding(.trailing, 4)

            ForEach(AppSection.allCases) { section in
                let current = model.path.isEmpty && model.section == section
                Button(section.title) { model.show(section) }
                    .buttonStyle(NavPillStyle(current: current))
                    .accessibilityAddTraits(current ? .isSelected : [])
                    .accessibilityIdentifier("nav-\(section.rawValue)")
            }
            Spacer(minLength: 4)
            Button("Log out") { model.signOut() }
                .buttonStyle(PillButtonStyle(kind: .quiet, minHeight: 44, padding: 16))
                .accessibilityIdentifier("log-out")
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.vertical, 10)
        .background(Theme.ink)
    }
}

private struct NavPillStyle: ButtonStyle {
    let current: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.button)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .foregroundStyle(current || configuration.isPressed ? Theme.paper : Theme.muted)
            .background(current ? Theme.surface : .clear, in: Capsule())
            .contentShape(Capsule())
    }
}

// The system bar is hidden so the header stays put, which would also switch off the swipe back. This keeps it.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
