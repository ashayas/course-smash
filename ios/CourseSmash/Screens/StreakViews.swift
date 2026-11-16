import SwiftUI

/// Yellow for a day done, blue for a rest day, and an unlit window for everything else.
private func windowColour(_ state: String) -> Color {
    switch state {
    case "done": return Theme.yellow
    case "rest": return Theme.blue
    default: return Theme.unlit
    }
}

private func spoken(_ days: [Streak.Day]) -> String {
    let done = days.filter { $0.state == "done" }.count
    let rest = days.filter { $0.state == "rest" }.count
    return "\(done) of \(plural(days.count, "day")) done" + (rest > 0 ? ", \(plural(rest, "rest day"))" : "")
}

/// The streak in the corner: a lit window and the number of days. A tap opens the streak in full.
struct StreakChip: View {
    let streak: Streak
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 7) {
                RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Theme.yellow).frame(width: 12, height: 12)
                Text(String(streak.current)).font(.custom(InterTight.semibold.rawValue, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.paper)
            }
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(Theme.surface, in: Capsule())
            // The pill is 36 points tall. The part that takes a tap is 44.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(LiftButtonStyle(lift: 2))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(plural(streak.current, "day")) in a row. Open your streak.")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("streak-chip")
    }
}

/// The streak in full, on a sheet over whatever the learner was doing, so a course or a half-written answer stays put.
struct StreakSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 16) {
                    Text("Your streak").type(.titleLarge).accessibilityAddTraits(.isHeader).accessibilityIdentifier("streak-sheet-title")
                    Spacer(minLength: 0)
                    Button("Close") { dismiss() }.buttonStyle(LinkButtonStyle()).accessibilityIdentifier("streak-close")
                }
                if let streak = app.today.streak {
                    StreakCard(streak: streak, onSurface: true)
                    if !streak.today.counted {
                        Text(streak.label).type(.body).foregroundStyle(Theme.muted).accessibilityIdentifier("streak-sheet-label")
                    }
                }
            }
            .padding(20)
        }
        .background(Theme.surface)
        .foregroundStyle(Theme.paper)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Theme.panelRadius)
    }
}

/// This week as seven windows, Monday first.
struct WeekStrip: View {
    let week: [Streak.Day]
    /// The day the Worker calls today, which is the label to pick out once today is done.
    let today: String

    private static let letters = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(Array(week.enumerated()), id: \.element.id) { index, day in
                VStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(windowColour(day.state)).aspectRatio(1, contentMode: .fit)
                    Text(WeekStrip.letters[index % 7])
                        .font(.custom(InterTight.medium.rawValue, size: 12, relativeTo: .caption))
                        .foregroundStyle(day.state == "today" || day.day == today ? Theme.paper : Theme.muted)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("This week")
        .accessibilityValue(spoken(week))
        .accessibilityIdentifier("week-strip")
    }
}

/// The streak in full: the run, the longest run, rest days and the last four weeks.
struct StreakCard: View {
    let streak: Streak
    /// On a sheet the card is ink, so it still reads as a block on the sheet's surface.
    var onSurface = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(streak.current))
                        .type(TypeStyle(size: 44, weight: .semibold, tracking: -0.04, leading: 1, relativeTo: .largeTitle))
                        .accessibilityIdentifier("streak-current")
                    Text("days in a row").type(.sub).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Longest \(streak.longest)")
                    if let rest = streak.restLabel { Text(rest) }
                }
                .type(.sub)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
            Text("The last 4 weeks").type(.sub).foregroundStyle(Theme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(streak.calendar) { day in
                    RoundedRectangle(cornerRadius: 6, style: .continuous).fill(windowColour(day.state)).aspectRatio(1, contentMode: .fit)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("The last 4 weeks")
            .accessibilityValue(spoken(streak.calendar))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(onSurface ? Theme.ink : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("streak-card")
    }
}

/// Today's set as a row of pips, one per question.
struct RecallPips: View {
    let marks: [String]
    /// The position of the question on screen, from 0.
    var current: Int?

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(marks.enumerated()), id: \.offset) { index, mark in
                Capsule().fill(colour(mark, at: index)).frame(height: 8).frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Today's questions")
        .accessibilityValue("\(marks.filter { $0 == "correct" }.count) right, \(marks.filter { $0 == "partial" }.count) partly, \(marks.filter { $0 == "incorrect" }.count) wrong, \(marks.filter { $0 == "skipped" }.count) skipped, \(marks.filter { $0 == "open" }.count) to go")
        .accessibilityIdentifier("recall-pips")
    }

    private func colour(_ mark: String, at index: Int) -> Color {
        switch mark {
        case "correct": return Theme.green
        case "incorrect": return Theme.orange
        case "partial": return Theme.yellow
        case "skipped": return Theme.muted
        default: return index == current ? Theme.paper : Theme.unlit
        }
    }
}

/// A course's building in a small rounded square.
struct CourseThumb: View {
    let subject: ArtSubject
    var progress: ArtProgress?
    var large = false
    /// On the page the square is a surface. On a card it is ink.
    var onInk = false

    var body: some View {
        BuildingArt(subject: subject, progress: progress)
            .padding(large ? 6 : 3)
            .frame(width: large ? 84 : 42, height: large ? 84 : 42)
            .background(onInk ? Theme.surface : Theme.ink, in: RoundedRectangle(cornerRadius: large ? 20 : 13, style: .continuous))
    }
}

/// A building, a title and one line under it: where a question is from, or what comes after recall.
struct SourceRow: View {
    let subject: ArtSubject
    let title: String
    let detail: String
    var onInk = false

    var body: some View {
        HStack(spacing: 10) {
            CourseThumb(subject: subject, onInk: onInk)
            VStack(alignment: .leading, spacing: 1) {
                Text(RichText.plain(title)).font(.custom(InterTight.medium.rawValue, size: 13.5, relativeTo: .footnote)).foregroundStyle(Theme.paper)
                Text(RichText.plain(detail)).font(.custom(InterTight.regular.rawValue, size: 13.5, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}
