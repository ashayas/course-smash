import SwiftUI

/// The library: ready-made courses, by track or by topic, searched by the Worker.
struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var catalog: Catalog?
    /// Ids of the courses that match the search. Nil while nothing is typed, which means all of them.
    @State private var matching: Set<String>?
    @State private var search = ""
    @State private var track = ""
    /// Tracks are how the library was written. Topics are clusters by meaning, across tracks.
    @State private var byTopic = false
    @State private var topic = 0
    @State private var error: String?

    var body: some View {
        Page {
            if let error {
                ErrorText(message: error).padding(.top, 20)
            } else if let catalog {
                PageHead(title: "Library", note: "Short courses on AI engineering, infrastructure, security, identity, robotics and AI policy. Each module has a bank of questions, so follow-ups target exactly what you missed.")
                let topics = catalog.topics ?? []
                let shown = shown(catalog)
                tools(catalog, topics: topics, count: shown.count)
                if byTopic, topic == 0 {
                    // Every topic as its own learning path, in study order.
                    ForEach(topics) { item in
                        let list = courses(in: item, catalog)
                        if !list.isEmpty {
                            VStack(alignment: .leading, spacing: 20) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(item.name).type(.titleLarge).accessibilityAddTraits(.isHeader).accessibilityIdentifier("topic-name")
                                    Text(item.summary).type(.small).foregroundStyle(Theme.muted)
                                    Button("Path of \(list.count)") { topic = item.id }
                                        .buttonStyle(LinkButtonStyle())
                                        .accessibilityIdentifier("topic-path")
                                }
                                cards(list, catalog, path: true)
                            }
                            .padding(.bottom, 64)
                        }
                    }
                } else {
                    cards(shown, catalog, path: byTopic)
                }
            } else {
                WorkingView(title: "Opening the library").padding(22).panel()
            }
        }
        .task {
            if catalog == nil { track = model.libraryTrack }
            await load()
        }
        .onChange(of: model.libraryTrack) { _, new in
            track = new
            if !new.isEmpty { byTopic = false }
        }
        .task(id: search) {
            guard catalog != nil else { return }
            // Wait for a pause in typing before asking the Worker.
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { await find() }
        }
    }

    /// A topic's courses in study order, so each one follows the courses it builds on.
    private func courses(in topic: Catalog.Topic, _ catalog: Catalog) -> [CatalogCourse] {
        let byId = Dictionary(catalog.courses.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return topic.courseIds.compactMap { byId[$0] }.filter { matching?.contains($0.id) ?? true }
    }

    private func shown(_ catalog: Catalog) -> [CatalogCourse] {
        let topics = catalog.topics ?? []
        if byTopic {
            if let chosen = topics.first(where: { $0.id == topic }) { return courses(in: chosen, catalog) }
            return topics.flatMap { courses(in: $0, catalog) }
        }
        return catalog.courses.filter { (track.isEmpty || $0.track == track) && (matching?.contains($0.id) ?? true) }
    }

    private func cards(_ list: [CatalogCourse], _ catalog: Catalog, path: Bool) -> some View {
        let titles = Dictionary(catalog.courses.map { ($0.id, $0.title) }, uniquingKeysWith: { first, _ in first })
        return LazyVStack(spacing: Theme.gap) {
            ForEach(list) { course in
                Button { model.open(.libraryCourse(course.id)) } label: {
                    LibraryCard(course: course, after: path ? (course.requires ?? []).compactMap { titles[$0] } : [])
                }
                .buttonStyle(LiftButtonStyle())
                .accessibilityIdentifier("library-card")
            }
        }
    }

    private func tools(_ catalog: Catalog, topics: [Catalog.Topic], count: Int) -> some View {
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
            if !topics.isEmpty {
                FlowLayout(spacing: 8) {
                    chip("By track", on: !byTopic, id: "group-track") { byTopic = false }
                    chip("By topic", on: byTopic, id: "group-topic") { byTopic = true }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Group the library")
            }
            FlowLayout(spacing: 8) {
                if byTopic {
                    chip("All topics", on: topic == 0) { topic = 0 }
                    ForEach(topics) { item in
                        chip("\(item.name) · \(item.courses)", on: item.id == topic) { topic = item.id }
                    }
                } else {
                    ForEach([Catalog.Track(id: "", title: "All tracks")] + catalog.trackList) { item in
                        chip(item.title, on: item.id == track) { track = item.id }
                    }
                }
            }
            let about = byTopic ? topics.first { $0.id == topic }?.summary : nil
            Text(plural(count, "course") + (about.map { ". \($0)" } ?? ""))
                .type(.body).foregroundStyle(Theme.muted)
                .accessibilityIdentifier("library-count")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .panel()
        .padding(.bottom, 44)
    }

    private func chip(_ title: String, on: Bool, id: String? = nil, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(ChipButtonStyle(on: on))
            .accessibilityAddTraits(on ? .isSelected : [])
            .accessibilityIdentifier(id ?? "")
    }

    private func load() async {
        do {
            let loaded = try await model.loadCatalog()
            if catalog == nil {
                // With topics, the library opens by topic, unless a track was asked for.
                byTopic = !(loaded.topics ?? []).isEmpty && track.isEmpty
            }
            catalog = loaded
            error = nil
        } catch is CancellationError {
        } catch {
            if catalog == nil { self.error = message(of: error) }
        }
    }

    /// The search runs on the Worker, so every client matches the same way.
    private func find() async {
        guard !search.trimmingCharacters(in: .whitespaces).isEmpty else { matching = nil; return }
        do {
            let found: Catalog = try await model.api.get("/api/catalog", query: [URLQueryItem(name: "q", value: search)])
            matching = Set(found.courses.map(\.id))
        } catch {
            // Keep what is on screen. The next keystroke asks again.
        }
    }
}

/// One library course: what it covers, where it sits on its learning path, and a place to say what you want out of it.
struct LibraryCourseView: View {
    let id: String
    @Environment(AppModel.self) private var model
    @State private var course: CatalogCourseDetail?
    @State private var loadError: String?
    @State private var goal = ""
    @State private var error: String?
    @State private var starting = false
    @State private var similar: SimilarCourses?
    @State private var misses: CourseMisses?
    @FocusState private var goalFocused: Bool

    var body: some View {
        Page {
            if let loadError {
                ErrorText(message: loadError).padding(.top, 20)
                Button("Back to the library") { model.show(.library) }.buttonStyle(PillButtonStyle(kind: .quiet)).padding(.top, 16)
            } else if let course {
                PageHead(title: course.title, eyebrow: [course.trackTitle, course.topic, course.level].compactMap { $0 }.joined(separator: " · "), note: course.summary) {
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

                if let misses, !misses.concepts.isEmpty { slips(misses).padding(.top, Theme.gap) }

                let before = course.prerequisites ?? []
                let onward = course.leadsTo ?? []
                if !before.isEmpty {
                    path("Take these first", "This course builds on them. Skip any you already know.", before, id: "path-prerequisites")
                }
                if !onward.isEmpty {
                    path("Leads to", "Courses that build on this one.", onward, id: "path-leads-to")
                }
                if let similar {
                    // Courses already on the path above are not repeated here.
                    let onPath = Set((before + onward).map(\.id))
                    let others = similar.courses.filter { !onPath.contains($0.id) }
                    if similar.pending || !others.isEmpty {
                        path("Similar courses",
                             similar.pending ? "Still reading this course. Courses that cover similar ground will show here in a few minutes." : "Courses that cover similar ground, closest first, from any track.",
                             others, id: "similar-courses")
                    }
                }
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
        // Similar courses and where learners slip are optional: the page is complete without them.
        .task { similar = try? await model.api.get("/api/catalog/\(id)/similar") }
        .task { misses = try? await model.api.get("/api/catalog/\(id)/misses") }
    }

    private func path(_ title: String, _ lead: String, _ courses: [CatalogCourse], id: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHead(title: title, note: lead, identifier: id)
            LazyVStack(spacing: Theme.gap) {
                ForEach(courses) { course in
                    Button { model.open(.libraryCourse(course.id)) } label: { LibraryCard(course: course) }
                        .buttonStyle(LiftButtonStyle())
                }
            }
        }
        .padding(.top, 64)
    }

    /// The subtopics and the question learners miss most in this course.
    private func slips(_ misses: CourseMisses) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Where learners slip").type(.titleSmall).padding(.bottom, 16).accessibilityAddTraits(.isHeader).accessibilityIdentifier("slips")
            Text("Missed most often. Follow-ups pick questions close to the ones you get wrong.")
                .type(.small).foregroundStyle(Theme.muted).padding(.bottom, 14)
            ForEach(misses.concepts, id: \.self) { item in
                let percent = Int((item.missRate * 100).rounded())
                Meter(label: item.concept, value: "\(percent)% missed", fraction: Double(max(percent, 3)) / 100, colour: Theme.orange)
                    .padding(.bottom, 14)
            }
            if let hardest = misses.questions.first {
                Text("Hardest question: “\(RichText.plain(hardest.prompt))”").type(.small).foregroundStyle(Theme.muted)
            }
        }
        .card()
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
