import SwiftUI

/// The library: ready-made courses, searched and filtered by the Worker.
struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var tracks: [Catalog.Track] = []
    @State private var shown: [CatalogCourse]?
    @State private var search = ""
    @State private var track = ""
    @State private var error: String?

    var body: some View {
        Page {
            if let error {
                ErrorText(message: error).padding(.top, 20)
            } else if let shown {
                PageHead(title: "Library", note: "Short courses on AI engineering, infrastructure, security, identity, robotics and AI policy. Each module has a bank of questions, so follow-ups target exactly what you missed.")
                tools(count: shown.count)
                LazyVStack(spacing: Theme.gap) {
                    ForEach(shown) { course in
                        Button { model.open(.libraryCourse(course.id)) } label: { LibraryCard(course: course) }
                            .buttonStyle(LiftButtonStyle())
                            .accessibilityIdentifier("library-card")
                    }
                }
            } else {
                WorkingView(title: "Opening the library").padding(22).panel()
            }
        }
        .task {
            if shown == nil { track = model.libraryTrack }
            await load()
        }
        .onChange(of: model.libraryTrack) { _, new in track = new }
        .task(id: Query(search: search, track: track)) {
            guard shown != nil else { return }
            // Wait for a pause in typing before asking the Worker.
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { await load() }
        }
    }

    private struct Query: Hashable { let search: String; let track: String }

    private func tools(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("", text: $search, prompt: Text("Search by topic, like KV cache or HPA").foregroundStyle(Theme.muted))
                .type(.body)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .padding(.horizontal, 22)
                .padding(.vertical, 16)
                .background(Theme.ink, in: Capsule())
                .accessibilityLabel("Search the library")
                .accessibilityIdentifier("library-search")
            FlowLayout(spacing: 8) {
                ForEach([Catalog.Track(id: "", title: "All tracks")] + tracks) { item in
                    Button(item.title) { track = item.id }
                        .buttonStyle(ChipButtonStyle(on: item.id == track))
                        .accessibilityAddTraits(item.id == track ? .isSelected : [])
                }
            }
            Text(plural(count, "course")).type(.body).foregroundStyle(Theme.muted).accessibilityIdentifier("library-count")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .panel()
        .padding(.bottom, 44)
    }

    private func load() async {
        do {
            if search.isEmpty, track.isEmpty {
                let catalog = try await model.loadCatalog()
                tracks = catalog.trackList
                shown = catalog.courses
            } else {
                let catalog: Catalog = try await model.api.get("/api/catalog", query: [URLQueryItem(name: "q", value: search), URLQueryItem(name: "track", value: track)])
                tracks = catalog.trackList
                shown = catalog.courses
            }
            error = nil
        } catch is CancellationError {
        } catch {
            if shown == nil { self.error = message(of: error) }
        }
    }
}

/// One library course: what it covers, and a place to say what you want out of it before starting.
struct LibraryCourseView: View {
    let id: String
    @Environment(AppModel.self) private var model
    @State private var course: CatalogCourseDetail?
    @State private var loadError: String?
    @State private var goal = ""
    @State private var error: String?
    @State private var starting = false
    @FocusState private var goalFocused: Bool

    var body: some View {
        Page {
            if let loadError {
                ErrorText(message: loadError).padding(.top, 20)
                Button("Back to the library") { model.show(.library) }.buttonStyle(PillButtonStyle(kind: .quiet)).padding(.top, 16)
            } else if let course {
                PageHead(title: course.title, eyebrow: "\(course.trackTitle) · \(course.level)", note: course.summary) {
                    Button("Back to the library") { model.show(.library, track: course.track) }.buttonStyle(LinkButtonStyle())
                }
                VStack(alignment: .leading, spacing: 14) {
                    Text("Make it yours").type(.titleLarge).accessibilityAddTraits(.isHeader)
                    TextArea(text: $goal, placeholder: "Optional: what you want out of it, like \"I'm on call for our GPU cluster\". It sets how well you need to know each module.", limit: 1000, focused: $goalFocused, label: "What you want out of this course")
                    if let error { ErrorText(message: error) }
                    Button(starting ? "Starting..." : "Start this course", action: start)
                        .buttonStyle(PillButtonStyle(fullWidth: true))
                        .disabled(starting)
                        .accessibilityIdentifier("start-course")
                }
                .padding(22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .panel()

                VStack(alignment: .leading, spacing: 0) {
                    Text("Modules").type(.titleSmall).padding(.bottom, 16).accessibilityAddTraits(.isHeader)
                    ForEach(course.modules, id: \.self) { module in
                        ModuleRow(title: module.title, note: module.concepts.joined(separator: " · "), status: "locked")
                    }
                }
                .card()
                .padding(.top, Theme.gap)
            } else {
                WorkingView(title: "Opening the course").padding(22).panel()
            }
        }
        .task {
            do {
                course = try await model.api.get("/api/catalog/\(id)")
            } catch is CancellationError {
            } catch {
                loadError = message(of: error)
            }
        }
    }

    private func start() {
        guard !starting else { return }
        starting = true
        error = nil
        goalFocused = false
        Task {
            do {
                struct Body: Encodable { let goal: String }
                let created: Created = try await model.api.send("POST", "/api/catalog/\(id)/start", body: Body(goal: goal))
                // The new course replaces this page, so going back lands on the library.
                model.path = [.course(created.id)]
            } catch {
                self.error = message(of: error)
            }
            starting = false
        }
    }
}

/// A module in a list: a square for locked, yellow for the one in progress, a green dot once passed.
struct ModuleRow: View {
    let title: String
    let note: String
    let status: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Group {
                if status == "passed" { Circle().fill(Theme.green) } else {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(status == "active" ? Theme.yellow : Theme.ink)
                }
            }
            .frame(width: 28, height: 28)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(RichText.plain(title)).type(.smallMedium)
                Text(note).type(.small).foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
