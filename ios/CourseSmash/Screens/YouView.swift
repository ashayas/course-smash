import SwiftUI

/// You: the streak, stats, settings, and the way out.
struct YouView: View {
    @Environment(AppModel.self) private var app
    @State private var settings: LearnerSettings?
    @State private var error: String?
    @State private var saving = false
    /// Switches flipped on screen and waiting for the Worker's answer, so a switch doesn't spring back while it saves.
    @State private var pending: [String: Bool] = [:]

    var body: some View {
        ScrollViewReader { scroll in
            page
                .onChange(of: settings) { _, _ in focusRecallCourses(scroll) }
                .onAppear { focusRecallCourses(scroll) }
        }
    }

    /// "Choose courses" on Today opens You on the courses in daily recall.
    private func focusRecallCourses(_ scroll: ScrollViewProxy) {
        guard app.focusRecallCourses, settings?.recallCourses?.isEmpty == false else { return }
        app.focusRecallCourses = false
        DispatchQueue.main.async { withAnimation { scroll.scrollTo("recall-courses", anchor: .top) } }
    }

    private var page: some View {
        Page(footer: false) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("You").type(.heading).accessibilityAddTraits(.isHeader).accessibilityIdentifier("you-heading")
                    Spacer(minLength: 0)
                    if let name = app.session.session?.username {
                        Text(name).type(.sub).foregroundStyle(Theme.muted).lineLimit(1).accessibilityIdentifier("you-username")
                    }
                }
                if let streak = app.today.streak { StreakCard(streak: streak) }

                Button { app.open(.stats) } label: {
                    HStack(spacing: 12) {
                        Text("Stats").foregroundStyle(Theme.paper)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                    .type(.sub)
                    .frame(minHeight: 30)
                    .card(padding: 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(LiftButtonStyle(lift: 2))
                .accessibilityIdentifier("stats-row")

                if let error { ErrorText(message: error).accessibilityIdentifier("settings-error") }
                if let settings {
                    settingsCard(settings)
                    if let courses = settings.recallCourses, !courses.isEmpty { recallCoursesCard(courses) }
                }

                HStack(spacing: 20) {
                    link("Privacy", "/privacy")
                    link("Support", "/support")
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)

                Button("Log out") { app.signOut() }
                    .buttonStyle(LinkButtonStyle())
                    .padding(.horizontal, 4)
                    .accessibilityIdentifier("log-out")
            }
            .padding(.top, 6)
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func settingsCard(_ settings: LearnerSettings) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                row("Daily goal", plural(settings.dailyGoal, "question")).accessibilityIdentifier("daily-goal")
                FlowLayout(spacing: 8) {
                    ForEach(settings.goals, id: \.self) { goal in
                        Button(String(goal)) { save(Change(dailyGoal: goal)) }
                            .buttonStyle(ChipButtonStyle(on: goal == settings.dailyGoal))
                            .accessibilityLabel(plural(goal, "question"))
                            .accessibilityAddTraits(goal == settings.dailyGoal ? .isSelected : [])
                            .accessibilityIdentifier("goal-\(goal)")
                    }
                }
            }
            Button { save(Change(shortAnswers: !settings.shortAnswers)) } label: {
                HStack(spacing: 12) {
                    Text("Short answers in recall").foregroundStyle(Theme.paper)
                    Spacer(minLength: 0)
                    Text(settings.shortAnswers ? "On" : "Off").foregroundStyle(Theme.muted)
                    Switch(on: settings.shortAnswers)
                }
                .type(.sub)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Short answers in recall")
            .accessibilityValue(settings.shortAnswers ? "On" : "Off")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("short-answers")
            row("Time zone", settings.timeZone).accessibilityIdentifier("time-zone")
        }
        .card(padding: 18)
        .disabled(saving)
    }

    /// One switch per course: daily recall draws from the ones left on.
    private func recallCoursesCard(_ courses: [LearnerSettings.RecallCourse]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Courses in daily recall").type(.cardTitle).accessibilityAddTraits(.isHeader)
                Text("Daily recall draws from the courses you leave on. You can still recall any course from its page.")
                    .type(.sub).foregroundStyle(Theme.muted)
            }
            ForEach(courses) { entry in
                Toggle(isOn: Binding(
                    get: { pending[entry.id] ?? entry.included },
                    set: { on in
                        pending[entry.id] = on
                        save(Change(recallCourses: [entry.id: on]))
                    }
                )) {
                    HStack(spacing: 12) {
                        if let course = entry.course { CourseThumb(subject: course.art) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(RichText.plain(entry.title)).type(.subMedium).foregroundStyle(Theme.paper)
                            Text(entry.detail).type(.sub).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .tint(Theme.green)
                .frame(minHeight: 44)
                .accessibilityIdentifier("recall-course-\(entry.id)")
            }
        }
        .card(padding: 18)
        .disabled(saving)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("recall-courses")
        .id("recall-courses")
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
            Spacer(minLength: 0)
            Text(value).foregroundStyle(Theme.muted)
        }
        .type(.sub)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }

    private func link(_ title: String, _ path: String) -> some View {
        Link(title, destination: URL(string: "https://coursesmash.app\(path)")!)
            .type(.small)
            .underline()
            .foregroundStyle(Theme.muted)
            .frame(minHeight: 44)
    }

    private struct Change: Encodable {
        var dailyGoal: Int?
        var shortAnswers: Bool?
        /// Course id to on or off for daily recall.
        var recallCourses: [String: Bool]?

        enum CodingKeys: String, CodingKey {
            case dailyGoal = "daily_goal", shortAnswers = "short_answers", recallCourses = "recall_courses"
        }
    }

    private func save(_ change: Change) {
        guard !saving else { return }
        saving = true
        error = nil
        Task {
            do {
                settings = try await app.api.send("PUT", "/api/settings", body: change)
            } catch {
                self.error = message(of: error)
            }
            // The response is the truth now, or the switch goes back to what it was.
            pending = [:]
            saving = false
        }
    }

    private func load() async {
        async let today: Void = app.today.load()
        do {
            settings = try await app.api.get("/api/settings")
            error = nil
        } catch is CancellationError {
        } catch {
            if settings == nil { self.error = message(of: error) }
        }
        await today
    }
}

/// An on/off switch in the kit's flat style: a lit window when on.
private struct Switch: View {
    let on: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Capsule().fill(on ? Theme.yellow : Theme.ink)
            .frame(width: 50, height: 30)
            .overlay(alignment: on ? .trailing : .leading) {
                Circle().fill(on ? Theme.ink : Theme.muted).frame(width: 22, height: 22).padding(4)
            }
            .animation(reduceMotion ? nil : Theme.spring, value: on)
            .accessibilityHidden(true)
    }
}
