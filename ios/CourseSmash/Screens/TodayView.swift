import SwiftUI

/// Today: the first thing the app opens on. Today's recall, the streak, and the course to carry on with.
struct TodayView: View {
    @Environment(AppModel.self) private var app
    @FocusState private var answerFocused: Bool

    var body: some View {
        let model = app.today
        Page(footer: false) {
            if let today = model.today {
                VStack(alignment: .leading, spacing: 14) {
                    switch today.recall.status {
                    case "ready": ready(today, model)
                    case "empty": empty(today)
                    default: rest(today, model)
                    }
                }
                .padding(.top, 6)
            } else if let error = model.loadError {
                VStack(alignment: .leading, spacing: 16) {
                    ErrorText(message: error)
                    Button("Try again") { Task { await model.load() } }.buttonStyle(PillButtonStyle()).accessibilityIdentifier("try-again")
                }
                .padding(.top, 20)
            } else {
                WorkingView(title: "Opening today").padding(22).panel().padding(.top, 20)
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private func head(_ title: String, _ lead: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).type(.heading).accessibilityAddTraits(.isHeader).accessibilityIdentifier("today-heading")
            Text(lead).type(.sub).foregroundStyle(Theme.muted).accessibilityIdentifier("today-lead")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Recall is waiting: the next question is live on its card.
    @ViewBuilder
    private func ready(_ today: Today, _ model: TodayModel) -> some View {
        head("Daily recall", today.recall.lead)
        if let question = model.question {
            VStack(alignment: .leading, spacing: 14) {
                RecallQuestionView(question: question, model: model, answerFocused: $answerFocused)
                if let error = model.error { ErrorText(message: error) }
                if model.canCheck {
                    Button("Check") {
                        answerFocused = false
                        model.check()
                    }
                    .buttonStyle(PillButtonStyle(fullWidth: true))
                    .accessibilityIdentifier("check-recall")
                }
            }
            .card(padding: 18)
            HStack {
                Button("Skip for today") {
                    answerFocused = false
                    model.skipDay(true)
                }
                .buttonStyle(LinkButtonStyle())
                .disabled(model.working)
                .accessibilityIdentifier("skip-today")
                Spacer()
                Text("\(question.number) of \(today.recall.total)").type(.sub).foregroundStyle(Theme.muted).accessibilityIdentifier("recall-count")
            }
            .padding(.horizontal, 4)
        }
        if let resume = today.resume {
            Button { app.open(.course(resume.course.id)) } label: {
                SourceRow(subject: resume.course.art, title: "Then: \(resume.course.name)", detail: resume.detail, onInk: true)
                    .padding(.horizontal, 4)
                    .contentShape(Rectangle())
            }
            .buttonStyle(LiftButtonStyle(lift: 2))
            .accessibilityIdentifier("then-course")
        }
    }

    /// Recall is done or skipped for the day.
    @ViewBuilder
    private func rest(_ today: Today, _ model: TodayModel) -> some View {
        head("Today", [today.recall.lead, today.streak.restLabel.map { "\($0)." }].compactMap { $0 }.joined(separator: " "))
        if today.recall.status == "skipped" {
            Button("Do it anyway") { model.skipDay(false) }
                .buttonStyle(LinkButtonStyle())
                .disabled(model.working)
                .padding(.vertical, -8)
                .accessibilityIdentifier("do-it-anyway")
        }
        if let error = model.error { ErrorText(message: error) }
        WeekStrip(week: today.streak.week, today: today.streak.day)
        if let resume = today.resume {
            ContinueCard(resume: resume, open: { app.open(.course(resume.course.id)) },
                         more: today.recall.status == "done" && today.recall.moreAvailable ? { model.more() } : nil, working: model.working)
        }
        if let next = today.upNext {
            UpNextCard(next: next) { app.open(.libraryCourse(next.course.id)) }
        }
    }

    /// Nothing to recall yet, or every course is turned off for it: the course leads, with how far today's answers have got.
    @ViewBuilder
    private func empty(_ today: Today) -> some View {
        let off = today.recall.off == true
        head("Today", today.streak.label)
        WeekStrip(week: today.streak.week, today: today.streak.day)
        if let resume = today.resume {
            ContinueCard(resume: resume, open: { app.open(.course(resume.course.id)) }, progress: today.streak.today)
            if let next = today.upNext {
                UpNextCard(next: next) { app.open(.libraryCourse(next.course.id)) }
            }
        }
        if off {
            VStack(alignment: .leading, spacing: 12) {
                Text("Daily recall is off").type(.cardTitle).accessibilityAddTraits(.isHeader)
                Text(today.recall.lead).type(.sub).foregroundStyle(Theme.muted)
                Button("Choose courses") {
                    app.focusRecallCourses = true
                    app.show(.you)
                }
                .buttonStyle(PillButtonStyle(fullWidth: true))
                .accessibilityIdentifier("choose-courses")
            }
            .card(padding: 18)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("recall-off")
        } else if today.resume != nil {
            VStack(alignment: .leading, spacing: 8) {
                Text("Recall starts soon").type(.cardTitle).accessibilityAddTraits(.isHeader)
                Text(today.recall.lead).type(.sub).foregroundStyle(Theme.muted)
            }
            .card(padding: 18)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("recall-starts-soon")
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("Start your first course").type(.cardTitle).accessibilityAddTraits(.isHeader)
                Text("Say what you want to learn, or pick a ready-made course. Questions you get right come back here a few days later.")
                    .type(.sub).foregroundStyle(Theme.muted)
                Button("Plan a course") { app.show(.city) }
                    .buttonStyle(PillButtonStyle(fullWidth: true))
                    .accessibilityIdentifier("plan-a-course")
            }
            .card(padding: 18)
            ForEach(today.picks) { course in
                Button { app.open(.libraryCourse(course.id)) } label: { LibraryCard(course: course) }
                    .buttonStyle(LiftButtonStyle())
                    .accessibilityIdentifier("pick-card")
            }
        }
    }
}

/// The course in progress, one tap from its next question.
private struct ContinueCard: View {
    let resume: Today.Continue
    let open: () -> Void
    /// "5 more recall", when today's set is finished and there is more to ask.
    var more: (() -> Void)?
    var working = false
    /// Today's answers against the number that count the day, shown while there is no recall yet.
    var progress: Streak.Progress?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                CourseThumb(subject: resume.course.art, large: true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Continue").type(.sub).foregroundStyle(Theme.muted)
                    Text(RichText.plain(resume.course.name)).type(.cardTitle).accessibilityAddTraits(.isHeader)
                    Text(resume.detail).type(.sub).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            if let progress {
                GeometryReader { proxy in
                    Capsule().fill(Theme.yellow)
                        .frame(width: proxy.size.width * min(1, Double(progress.answered) / Double(max(progress.needed, 1))))
                }
                .frame(height: 8)
                .background(Theme.ink, in: Capsule())
                .accessibilityHidden(true)
                Text("\(progress.answered) of \(progress.needed) today").type(.sub).foregroundStyle(Theme.muted)
                    .accessibilityIdentifier("today-progress")
            }
            HStack(spacing: 12) {
                Button("Continue", action: open)
                    .buttonStyle(PillButtonStyle(fullWidth: true))
                    .accessibilityIdentifier("continue-course")
                if let more {
                    Button("5 more recall", action: more)
                        .buttonStyle(InkPillButtonStyle())
                        .disabled(working)
                        .accessibilityIdentifier("more-recall")
                }
            }
        }
        .card(padding: 18)
    }
}

/// The course that follows the one being finished. It opens that course's library page.
private struct UpNextCard: View {
    let next: Today.UpNext
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                CourseThumb(subject: next.course.art, progress: ArtProgress(floors: next.course.modules, lit: 0), large: true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Up next").type(.sub).foregroundStyle(Theme.muted)
                    Text(next.course.title).type(.cardTitle).foregroundStyle(Theme.paper)
                    Text(next.detail).type(.sub).foregroundStyle(Theme.muted)
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .card(padding: 18)
        }
        .buttonStyle(LiftButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("up-next")
    }
}

/// A quiet pill on a card: ink where `PillButtonStyle`'s quiet kind would vanish into the surface.
struct InkPillButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.button)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 22)
            .frame(minHeight: 50)
            .foregroundStyle(Theme.paper)
            .background(Theme.ink, in: Capsule())
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.55)
            .contentShape(Capsule())
    }
}
