import SwiftUI

/// A course's building, drawn by city.js.
struct BuildingArt: View {
    let subject: ArtSubject
    var progress: ArtProgress?

    var body: some View {
        SVGView(document: CityEngine.shared.building(subject, progress: progress))
            .accessibilityHidden(true)
    }
}

/// The loader: floors dropping onto a tower, with what the agent is doing.
struct WorkingView: View {
    let title: String
    var detail: String?

    var body: some View {
        VStack(spacing: 24) {
            SVGView(document: CityEngine.shared.stack())
                .frame(width: 150, height: 150 * 78 / 84)
                .accessibilityHidden(true)
            Text(title).type(.titleLarge).multilineTextAlignment(.center)
            if let detail {
                Text(detail).type(.body).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 400)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// The inset behind a card's building.
struct ArtInset<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(height: 190)
            .frame(maxWidth: .infinity, minHeight: 214)
            .padding(12)
            .inset()
            .padding(.horizontal, -6)
            .padding(.top, -6)
            .padding(.bottom, 16)
    }
}

/// A card for one of the learner's courses.
struct CourseCard: View {
    let course: CourseSummary

    private var status: String {
        var status = "The agent is planning this one"
        if course.status == "complete" { status = "Finished" } else if course.modules > 0 { status = "\(course.passed) of \(course.modules) modules done" }
        if let average = course.average { status += " · \(Int((average * 100).rounded()))% so far" }
        return status
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ArtInset { BuildingArt(subject: course.art) }
            if course.modules > 0 {
                HStack(spacing: 5) {
                    ForEach(0..<course.modules, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 3).fill(index < course.passed ? Theme.yellow : Theme.ink).frame(width: 22, height: 10)
                    }
                }
                .padding(.bottom, 14)
                .accessibilityHidden(true)
            }
            Text(RichText.plain(course.name)).type(.titleSmall).padding(.bottom, 8)
            Text(status).type(.small).foregroundStyle(Theme.muted)
        }
        .card()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// A card for a ready-made library course.
struct LibraryCard: View {
    let course: CatalogCourse

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ArtInset { BuildingArt(subject: course.art, progress: ArtProgress(floors: course.modules, lit: 0, ambient: 0.18)) }
            Text("\(course.trackTitle) · \(course.level)").type(.small).foregroundStyle(Theme.muted).padding(.bottom, 6)
            Text(course.title).type(.titleSmall).padding(.bottom, 8)
            Text("\(course.modules) modules · \(course.questions) questions").type(.small).foregroundStyle(Theme.muted)
        }
        .card()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// A section's heading with its line of muted copy under it.
struct SectionHead<Trailing: View>: View {
    let title: String
    let note: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            Text(title).type(.section).accessibilityAddTraits(.isHeader)
            Text(note).type(.body).foregroundStyle(Theme.muted)
            trailing
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 28)
    }
}

extension SectionHead where Trailing == EmptyView {
    init(title: String, note: String) {
        self.init(title: title, note: note) { EmptyView() }
    }
}

/// A page's title and intro, as `.course-head` on the web.
struct PageHead<Extra: View>: View {
    let title: String
    var eyebrow: String?
    var note: String?
    @ViewBuilder var extra: Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let eyebrow { Text(eyebrow).type(.small).foregroundStyle(Theme.muted) }
            Text(RichText.plain(title)).type(TypeStyle(size: 36, weight: .semibold, tracking: -0.04, leading: 1.05, relativeTo: .largeTitle)).accessibilityAddTraits(.isHeader)
            if let note { Text(RichText.plain(note)).type(.body).foregroundStyle(Theme.muted) }
            extra
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 20)
        .padding(.bottom, 40)
    }
}

extension PageHead where Extra == EmptyView {
    init(title: String, eyebrow: String? = nil, note: String? = nil) {
        self.init(title: title, eyebrow: eyebrow, note: note) { EmptyView() }
    }
}

struct SiteFooter: View {
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 4) {
                Text("Made by").foregroundStyle(Theme.muted)
                Link("Ashaya", destination: URL(string: "https://x.com/ashaya")!).underline().foregroundStyle(Theme.paper)
            }
            HStack(spacing: 16) {
                Link("Privacy", destination: URL(string: "https://coursesmash.app/privacy")!).underline()
                Link("Support", destination: URL(string: "https://coursesmash.app/support")!).underline()
            }
            .foregroundStyle(Theme.muted)
        }
        .type(.small)
        .frame(maxWidth: .infinity)
        .padding(.top, 44)
        .padding(.bottom, 24)
    }
}

/// The scrolling page every screen sits in: ink behind, the phone gutter at the sides, the footer at the end.
struct Page<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
                SiteFooter()
            }
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.ink)
        .toolbar(.hidden, for: .navigationBar)
    }
}

func percent(_ value: Double?) -> String {
    guard let value else { return "–" }
    return "\(Int((value * 100).rounded()))%"
}

func plural(_ count: Int, _ word: String) -> String {
    "\(count) \(word)\(count == 1 ? "" : "s")"
}

func message(of error: Error) -> String {
    (error as? APIError)?.message ?? APIError.generic.message
}
