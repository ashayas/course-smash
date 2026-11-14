import SwiftUI

/// Home: say what you want to learn, see your city, and pick a course back up.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var prompt = ""
    @State private var ideas: [String] = []
    @State private var error: String?
    @State private var starting = false
    @State private var courses: [CourseSummary]?
    @State private var loadError: String?
    @State private var catalog: Catalog?
    @FocusState private var promptFocused: Bool

    var body: some View {
        ScrollViewReader { scroll in
            Page {
                hero(scroll)
                yourCourses.padding(.top, 64)
                if let catalog, !catalog.courses.isEmpty { library(catalog).padding(.top, 64) }
            }
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func hero(_ scroll: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Course Smash").type(.hero).accessibilityAddTraits(.isHeader)
            Text("Say what you want to learn. I'll build a course of questions, read how you answer, and change what comes next.")
                .type(.lead).padding(.top, 28).padding(.bottom, 12)
            Text("Every course goes up as a building in your city, one floor per module. Pass a module and its floor lights up.")
                .type(.small).foregroundStyle(Theme.muted).padding(.bottom, 24)

            VStack(alignment: .leading, spacing: 14) {
                TextArea(text: $prompt, placeholder: "I want to understand... so that I can...", limit: 2000, focused: $promptFocused, label: "What do you want to learn?", identifier: "prompt")
                if !ideas.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(ideas, id: \.self) { idea in
                            Button(idea) {
                                prompt = "I want to learn \(idea)."
                                promptFocused = true
                            }
                            .buttonStyle(ChipButtonStyle())
                        }
                    }
                    .padding(.top, 4)
                }
                if let error { ErrorText(message: error) }
                Button(starting ? "Starting..." : "Build my course", action: build)
                    .buttonStyle(PillButtonStyle(fullWidth: true))
                    .disabled(starting)
                    .accessibilityIdentifier("build-course")
            }
            .id("composer")

            let shown = courses ?? []
            let city = CityEngine.shared.city(shown.map(\.art))
            SVGView(document: city, floats: true) { lot in
                if let index = Int(lot), shown.indices.contains(index) {
                    model.open(.course(shown[index].id))
                } else {
                    withAnimation { scroll.scrollTo("composer", anchor: .top) }
                    promptFocused = true
                }
            }
            .aspectRatio(city.aspectRatio, contentMode: .fit)
            .padding(.horizontal, -12)
            .padding(.bottom, -28)
            .accessibilityElement()
            .accessibilityLabel("Your courses as buildings in a small isometric city")
            .accessibilityAddTraits(.isImage)
            .accessibilityIdentifier("city")
        }
        .padding(24)
        .panel()
        .clipShape(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
    }

    @ViewBuilder
    private var yourCourses: some View {
        SectionHead(title: "Your courses", note: "Pick up where you left off. Every answer you give shapes the next set of questions.")
        if let loadError {
            ErrorText(message: loadError)
        } else if let courses {
            if courses.isEmpty {
                Text("Nothing here yet. Your first building starts with one sentence.")
                    .type(.body).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).card(padding: 44)
            } else {
                LazyVStack(spacing: Theme.gap) {
                    ForEach(courses) { course in
                        Button { model.open(.course(course.id)) } label: { CourseCard(course: course) }
                            .buttonStyle(LiftButtonStyle())
                            .accessibilityIdentifier("course-card")
                    }
                }
            }
        } else {
            Text("Loading your courses...").type(.body).foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder
    private func library(_ catalog: Catalog) -> some View {
        SectionHead(title: "Library", note: "\(catalog.courses.count) ready-made courses with a question bank behind each module. Start one and it adapts to you like any other.") {
            Button("Browse the library") { model.show(.library) }
                .buttonStyle(PillButtonStyle(kind: .quiet))
                .accessibilityIdentifier("browse-library")
        }
        ForEach(catalog.trackList.filter { track in catalog.courses.contains { $0.track == track.id } }) { track in
            let inTrack = catalog.courses.filter { $0.track == track.id }
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .firstTextBaseline) {
                    Text(track.title).type(.titleLarge).accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button("All \(inTrack.count)") { model.show(.library, track: track.id) }.buttonStyle(LinkButtonStyle())
                }
                LazyVStack(spacing: Theme.gap) {
                    ForEach(inTrack.prefix(3)) { course in
                        Button { model.open(.libraryCourse(course.id)) } label: { LibraryCard(course: course) }
                            .buttonStyle(LiftButtonStyle())
                    }
                }
            }
            .padding(.bottom, 64)
        }
    }

    private func build() {
        guard !starting else { return }
        error = nil
        starting = true
        promptFocused = false
        Task {
            do {
                struct Body: Encodable { let prompt: String }
                let created: Created = try await model.api.send("POST", "/api/courses", body: Body(prompt: prompt))
                prompt = ""
                model.open(.course(created.id))
            } catch {
                self.error = message(of: error)
            }
            starting = false
        }
    }

    private func load() async {
        async let config = try? await model.loadConfig()
        async let library = try? await model.loadCatalog() // the library is optional on the home page
        do {
            let list: CourseList = try await model.api.get("/api/courses")
            courses = list.courses
            loadError = nil
        } catch is CancellationError {
        } catch {
            if courses == nil { loadError = message(of: error) }
        }
        if let config = await config { ideas = config.ideas }
        if let library = await library { catalog = library }
    }
}
