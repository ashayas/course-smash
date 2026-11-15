import Combine
import SwiftUI
import UIKit

/// The signed-in app: a top row, the current tab, and the tab bar. A recall session covers all of it.
struct ShellView: View {
    @Environment(AppModel.self) private var model
    @State private var keyboardUp = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        @Bindable var model = model
        ZStack {
            if model.today.inSession {
                RecallSessionView().transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    TopBar()
                    NavigationStack(path: $model.path) {
                        Group {
                            switch model.tab {
                            case .today: TodayView()
                            case .city: HomeView()
                            case .library: LibraryView()
                            case .you: YouView()
                            }
                        }
                        .id(model.tab)
                        .navigationDestination(for: Route.self) { route in
                            switch route {
                            case let .course(id): CourseScreen(id: id).id(id)
                            case let .libraryCourse(id): LibraryCourseView(id: id).id(id)
                            case .stats: StatsView()
                            }
                        }
                    }
                    // The bar steps aside for the keyboard, so it never rides up over what is being typed.
                    if !keyboardUp { TabBar() }
                }
                .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: model.today.inSession)
        .background(Theme.ink)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardUp = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardUp = false }
        .onChange(of: model.path.count) { old, new in
            // Answers in a course count toward the day, so the streak is read again on the way back.
            if new < old { Task { await model.today.load() } }
        }
    }
}

/// The logo mark, or a back control on a pushed screen, and the streak on the right.
private struct TopBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 12) {
            if model.path.isEmpty {
                let mark = CityEngine.shared.mark()
                SVGView(document: mark).frame(width: 30, height: 30 / mark.aspectRatio)
                    .frame(height: 44)
                    .accessibilityHidden(true)
            } else {
                Button { model.path.removeLast() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.paper)
                        .frame(width: 36, height: 36).background(Theme.surface, in: Circle())
                        .frame(width: 44, height: 44, alignment: .leading).contentShape(Rectangle())
                }
                .accessibilityLabel("Back")
                .accessibilityIdentifier("back")
            }
            Spacer(minLength: 0)
            if model.tab != .you, let streak = model.today.streak, streak.current > 0 {
                StreakChip(streak: streak)
            }
        }
        .padding(.horizontal, Theme.gutter + 4)
        .padding(.vertical, 2)
        .background(Theme.ink)
    }
}

/// The app's own tab bar: flat, with a surface pill behind the selected tab.
private struct TabBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AppTab.allCases) { tab in
                let on = model.tab == tab
                Button { model.show(tab) } label: {
                    VStack(spacing: 4) {
                        TabIcon(tab: tab, on: on).frame(width: 22, height: 22)
                        Text(tab.title).font(.custom(InterTight.medium.rawValue, size: 12, relativeTo: .caption))
                    }
                    .foregroundStyle(on ? Theme.paper : Theme.muted)
                    .padding(.top, 9).padding(.bottom, 8)
                    .frame(maxWidth: .infinity)
                    .background(on ? Theme.surface : .clear, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("tab-\(tab.rawValue)")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(Theme.ink)
    }
}

/// The four tab icons, drawn on a 22 point grid from flat rounded shapes.
private struct TabIcon: View {
    let tab: AppTab
    let on: Bool

    var body: some View {
        Canvas { context, size in
            let unit = size.width / 22
            func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, _ radius: CGFloat) -> Path {
                Path(roundedRect: CGRect(x: x * unit, y: y * unit, width: width * unit, height: height * unit), cornerRadius: radius * unit, style: .continuous)
            }
            let colour = GraphicsContext.Shading.color(on ? Theme.paper : Theme.muted)
            switch tab {
            case .today:
                // Four windows. The first one is lit on the tab you are on.
                context.fill(rect(3, 3, 7, 7, 2), with: on ? .color(Theme.yellow) : colour)
                context.fill(rect(12, 3, 7, 7, 2), with: colour)
                context.fill(rect(3, 12, 7, 7, 2), with: colour)
                context.fill(rect(12, 12, 7, 7, 2), with: colour)
            case .city:
                context.fill(rect(2, 10, 5, 9, 1), with: colour)
                context.fill(rect(8.5, 3, 5, 16, 1), with: colour)
                context.fill(rect(15, 7, 5, 12, 1), with: colour)
            case .library:
                context.fill(rect(3, 3.5, 16, 4, 1.5), with: colour)
                context.fill(rect(3, 9, 16, 4, 1.5), with: colour)
                context.fill(rect(3, 14.5, 16, 4, 1.5), with: colour)
            case .you:
                context.fill(Path(ellipseIn: CGRect(x: 7 * unit, y: 3 * unit, width: 8 * unit, height: 8 * unit)), with: colour)
                var shoulders = Path()
                shoulders.move(to: CGPoint(x: 3 * unit, y: 19 * unit))
                shoulders.addCurve(to: CGPoint(x: 11 * unit, y: 13 * unit), control1: CGPoint(x: 3 * unit, y: 15 * unit), control2: CGPoint(x: 6.6 * unit, y: 13 * unit))
                shoulders.addCurve(to: CGPoint(x: 19 * unit, y: 19 * unit), control1: CGPoint(x: 15.4 * unit, y: 13 * unit), control2: CGPoint(x: 19 * unit, y: 15 * unit))
                shoulders.closeSubpath()
                context.fill(shoulders, with: colour)
            }
        }
        .accessibilityHidden(true)
    }
}

// The system bar is hidden so the top row stays put, which would also switch off the swipe back. This keeps it.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
