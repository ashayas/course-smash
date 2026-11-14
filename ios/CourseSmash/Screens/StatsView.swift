import SwiftUI

/// How the learner is doing: totals, the last 30 days, and each course.
struct StatsView: View {
    @Environment(AppModel.self) private var model
    @State private var stats: Stats?
    @State private var error: String?

    var body: some View {
        Page {
            if let error {
                ErrorText(message: error).padding(.top, 20)
            } else if let stats {
                PageHead(title: "Your stats", note: "How you're doing on every course. Scores count partly right answers as half.")
                tiles(stats.totals)
                ActivityPanel(days: stats.days, max: stats.chartMax).padding(.top, Theme.gap)
                SectionHead(title: "By course", note: stats.courses.contains { $0.answered > 0 } ? "Most recently studied first. Open a course to keep going." : "Answer a few questions and your scores show up here.")
                    .padding(.top, 72)
                if stats.courses.isEmpty {
                    VStack(spacing: 14) {
                        Text("No courses yet.").type(.body).foregroundStyle(Theme.muted)
                        Button("Start one.") { model.show(.courses) }.buttonStyle(LinkButtonStyle())
                    }
                    .frame(maxWidth: .infinity)
                    .card(padding: 44)
                } else {
                    LazyVStack(spacing: Theme.gap) {
                        ForEach(stats.courses) { course in StatCourseCard(course: course) }
                    }
                }
            } else {
                WorkingView(title: "Counting your answers").padding(22).panel().padding(.top, 20)
            }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func tiles(_ t: Stats.Totals) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.gap), GridItem(.flexible(), spacing: Theme.gap)], spacing: Theme.gap) {
            StatTile(value: String(t.answered), title: "questions answered", note: t.activeDays > 0 ? "over \(plural(t.activeDays, "day"))" : nil)
            StatTile(value: percent(t.average), title: "average score", note: t.answered > 0 ? "\(t.correct) right, \(t.partial) partly, \(t.incorrect) wrong" : nil)
            StatTile(value: String(t.modulesPassed), title: "modules passed", note: "\(t.finished) of \(plural(t.courses, "course")) finished")
            StatTile(value: String(t.streak), title: "day streak", note: t.streak > 0 ? "Answer today to keep it going" : "Answer a question to start one")
        }
    }

    private func load() async {
        do {
            stats = try await model.api.get("/api/stats")
            error = nil
        } catch is CancellationError {
        } catch {
            if stats == nil { self.error = message(of: error) }
        }
    }
}

private struct StatTile: View {
    let value: String
    let title: String
    let note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value).type(TypeStyle(size: 40, weight: .semibold, tracking: -0.04, leading: 1, relativeTo: .largeTitle))
            Text(title).type(.small)
            if let note { Text(note).type(.small).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .card(padding: 20)
        .accessibilityElement(children: .combine)
    }
}

/// Answers per day for 30 days, stacked by verdict. The same geometry as `activitySvg` in the web app.
private struct ActivityPanel: View {
    let days: [Stats.Day]
    let max: Int
    @State private var picked: Int?

    private static let height: CGFloat = 172
    private static let top: CGFloat = 12
    private static let base: CGFloat = 170

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Last 30 days").type(.titleLarge).accessibilityAddTraits(.isHeader)
            HStack(spacing: 16) {
                legend(Theme.green, "Right")
                legend(Theme.yellow, "Partly")
                legend(Theme.orange, "Wrong")
            }
            .accessibilityHidden(true)

            VStack(spacing: 10) {
                GeometryReader { proxy in
                    let width = proxy.size.width
                    ZStack(alignment: .topLeading) {
                        chart
                        yLabel(max)
                        yLabel(max / 2)
                        if let picked, days.indices.contains(picked) {
                            tip(days[picked])
                                .fixedSize()
                                .alignmentGuide(.top) { $0[.bottom] + 8 }
                                .alignmentGuide(.leading) { $0.width / 2 - min(Swift.max((CGFloat(picked) + 0.5) * width / CGFloat(days.count), 90), width - 90) }
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let index = Int(location.x / (width / CGFloat(Swift.max(days.count, 1))))
                        picked = picked == index ? nil : Swift.min(Swift.max(index, 0), days.count - 1)
                    }
                }
                .frame(height: ActivityPanel.height)
                .accessibilityElement()
                .accessibilityLabel("Answers per day for the last 30 days")
                .accessibilityValue(summary)
                .accessibilityIdentifier("activity-chart")

                HStack {
                    Text(shortDate(days.first?.date))
                    Spacer()
                    Text("Today")
                }
                .type(.tiny)
                .foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .panel()
    }

    private var summary: String {
        let answered = days.reduce(0) { $0 + $1.answered }
        guard answered > 0 else { return "No answers" }
        return "\(plural(answered, "answer")): \(days.reduce(0) { $0 + $1.correct }) right, \(days.reduce(0) { $0 + $1.partial }) partly, \(days.reduce(0) { $0 + $1.incorrect }) wrong"
    }

    private func legend(_ colour: Color, _ text: String) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 3).fill(colour).frame(width: 12, height: 12)
            Text(text).type(.small).foregroundStyle(Theme.muted)
        }
    }

    private func y(_ value: Double) -> CGFloat {
        (ActivityPanel.base - ActivityPanel.top) * CGFloat(value) / CGFloat(Swift.max(max, 1))
    }

    private func yLabel(_ value: Int) -> some View {
        Text(String(value)).type(.tiny).foregroundStyle(Theme.muted)
            .alignmentGuide(.top) { $0.height * 1.2 - (ActivityPanel.top + 158 * CGFloat(max - value) / CGFloat(Swift.max(max, 1))) }
            .accessibilityHidden(true)
    }

    private func tip(_ day: Stats.Day) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(shortDate(day.date)).font(.custom(InterTight.semibold.rawValue, size: 14))
            Text(day.answered > 0 ? "\(plural(day.answered, "answer")) · \(day.correct) right, \(day.partial) partly, \(day.incorrect) wrong" : "No answers").type(.caption)
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var chart: some View {
        Canvas { context, size in
            guard !days.isEmpty else { return }
            let base = ActivityPanel.base, gap: CGFloat = 2
            let sx = size.width / 900 // the web chart is 900 units wide and stretches to fit
            let step = size.width / CGFloat(days.count)
            let barWidth = Swift.max(6 * sx, step - 8 * sx)
            for fraction in [0.5, 1.0] {
                let lineY = base - y((Double(max) * fraction).rounded())
                context.stroke(Path { $0.move(to: CGPoint(x: 0, y: lineY)); $0.addLine(to: CGPoint(x: size.width, y: lineY)) }, with: .color(Theme.gridLine), lineWidth: 1)
            }
            context.stroke(Path { $0.move(to: CGPoint(x: 0, y: base)); $0.addLine(to: CGPoint(x: size.width, y: base)) }, with: .color(Theme.baseLine), lineWidth: 1)

            for (index, day) in days.enumerated() {
                let x = CGFloat(index) * step + (step - barWidth) / 2
                if index == picked {
                    context.fill(Path(CGRect(x: CGFloat(index) * step, y: 0, width: step, height: size.height)), with: .color(Theme.paper.opacity(0.04)))
                }
                let parts: [(Int, Color)] = [(day.correct, Theme.green), (day.partial, Theme.yellow), (day.incorrect, Theme.orange)].filter { $0.0 > 0 }
                var z = base
                for (position, part) in parts.enumerated() {
                    let isTop = position == parts.count - 1
                    let height = Swift.max(2, y(Double(part.0)) - (isTop ? 0 : gap))
                    if isTop {
                        let rx = 4 * sx, ry: CGFloat = 4
                        var path = Path()
                        path.move(to: CGPoint(x: x, y: z))
                        path.addLine(to: CGPoint(x: x, y: z - height + ry))
                        path.addQuadCurve(to: CGPoint(x: x + rx, y: z - height), control: CGPoint(x: x, y: z - height))
                        path.addLine(to: CGPoint(x: x + barWidth - rx, y: z - height))
                        path.addQuadCurve(to: CGPoint(x: x + barWidth, y: z - height + ry), control: CGPoint(x: x + barWidth, y: z - height))
                        path.addLine(to: CGPoint(x: x + barWidth, y: z))
                        path.closeSubpath()
                        context.fill(path, with: .color(part.1))
                    } else {
                        context.fill(Path(CGRect(x: x, y: z - height, width: barWidth, height: height)), with: .color(part.1))
                    }
                    z -= height + gap
                }
                if parts.isEmpty {
                    context.fill(Path(CGRect(x: x, y: base - 2, width: barWidth, height: 2)), with: .color(Theme.gridLine))
                }
            }
        }
    }
}

/// "2026-11-13" as "Nov 13". Days are UTC on the server, so they are read as UTC here too.
private func shortDate(_ iso: String?) -> String {
    guard let iso else { return "" }
    let parser = DateFormatter()
    parser.calendar = Calendar(identifier: .gregorian)
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.timeZone = TimeZone(identifier: "UTC")
    parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: iso) else { return "" }
    let formatter = DateFormatter()
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.setLocalizedDateFormatFromTemplate("MMMd")
    return formatter.string(from: date)
}

private struct StatCourseCard: View {
    let course: Stats.Course
    @Environment(AppModel.self) private var model

    private var status: String {
        course.status == "complete" ? "Finished" : course.modules > 0 ? "\(course.passed) of \(course.modules) modules done" : "Being planned"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Button { model.open(.course(course.id)) } label: {
                HStack(spacing: 16) {
                    BuildingArt(subject: course.art)
                        .padding(6)
                        .frame(width: 88, height: 100)
                        .inset(radius: 18)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(RichText.plain(course.name)).type(.titleSmall).foregroundStyle(Theme.paper).multilineTextAlignment(.leading)
                        Text(status).type(.small).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(LiftButtonStyle(lift: 2))
            .accessibilityIdentifier("stat-course")

            HStack(spacing: 10) {
                number(percent(course.average), "average score")
                number(String(course.answered), "answered")
                number(course.answered > 0 ? percent(Double(course.correct) / Double(course.answered)) : "–", "fully right")
            }

            verdictBar

            if let trend = course.trendLabel { Text(trend).type(.small).foregroundStyle(Theme.muted) }

            if !course.moduleStats.isEmpty {
                VStack(spacing: 10) {
                    ForEach(Array(course.moduleStats.enumerated()), id: \.offset) { _, module in
                        Meter(label: module.title,
                              value: module.answered > 0 ? "\(percent(module.average)) · \(module.answered)" : module.status == "locked" ? "Up next" : "Not started",
                              fraction: module.average.map { Swift.max(0.03, ($0 * 100).rounded() / 100) } ?? 0,
                              colour: module.average.map(Theme.score),
                              dimLabel: module.status == "locked")
                    }
                }
            }

            if !course.strongest.isEmpty || !course.weakest.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    concepts("Strongest", course.strongest)
                    concepts("Needs work", course.weakest)
                }
            }
        }
        .card()
    }

    private func number(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).type(.titleSmall)
            Text(label).type(.caption).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .inset(radius: 16)
        .accessibilityElement(children: .combine)
    }

    private var verdictBar: some View {
        GeometryReader { proxy in
            let parts: [(Int, Color)] = [(course.correct, Theme.green), (course.partial, Theme.yellow), (course.incorrect, Theme.orange)].filter { $0.0 > 0 }
            let total = CGFloat(parts.reduce(0) { $0 + $1.0 })
            let room = proxy.size.width - CGFloat(Swift.max(parts.count - 1, 0)) * 2
            HStack(spacing: 2) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    Rectangle().fill(part.1).frame(width: Swift.max(4, room * CGFloat(part.0) / Swift.max(total, 1)))
                }
            }
        }
        .frame(height: 12)
        .background(Theme.ink)
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel("\(course.correct) right, \(course.partial) partly right, \(course.incorrect) wrong")
    }

    @ViewBuilder
    private func concepts(_ title: String, _ list: [Mastery]) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).type(.smallMedium).padding(.bottom, 2)
                ForEach(list, id: \.self) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(item.concept)
                        Spacer(minLength: 0)
                        Text(percent(item.mastery)).foregroundStyle(Theme.muted)
                    }
                    .font(.custom(InterTight.regular.rawValue, size: 15, relativeTo: .callout))
                }
            }
        }
    }
}
