import SwiftUI

/// A course: its building, the current question, and how the learner is doing.
struct CourseScreen: View {
    let id: String
    @Environment(AppModel.self) private var app
    @State private var model: CourseModel?
    @State private var picking = false
    @State private var confirmingDelete = false
    @State private var deleteError: String?

    var body: some View {
        ScrollViewReader { scroll in
            page.onChange(of: model?.stage) { _, stage in
                // A new question starts at its top, and a verdict comes into view, as focus does on the web.
                switch stage {
                case .question: withAnimation { scroll.scrollTo("stage", anchor: .top) }
                case .result: withAnimation { scroll.scrollTo("verdict", anchor: .center) }
                default: break
                }
            }
        }
    }

    private var page: some View {
        Page {
            if let model, let view = model.view {
                head(view, model)
                if model.stage == .complete {
                    FinishedPanel(view: view)
                } else {
                    stage(view, model)
                        .padding(22)
                        .frame(maxWidth: .infinity, minHeight: 480, alignment: .topLeading)
                        .panel()
                        .id("stage")
                }
                SidePanels(view: view).padding(.top, Theme.gap)
            } else if let model, case let .fatal(text) = model.stage {
                fatal(text, model).padding(22).frame(maxWidth: .infinity, alignment: .leading).panel().padding(.top, 20)
            } else {
                WorkingView(title: "Opening your course").padding(22).panel().padding(.top, 20)
            }
        }
        .onAppear {
            if model == nil { model = CourseModel(id: id, api: app.api) }
            model?.start()
        }
        .onDisappear { model?.stop() }
        .sheet(isPresented: $picking) {
            if let model, let view = model.view {
                BuildingPicker(view: view) { icon in model.setIcon(icon) }
            }
        }
        .alert("Delete \"\(RichText.plain(model?.view?.name ?? ""))\" and all its answers?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { delete() }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func head(_ view: CourseDetail, _ model: CourseModel) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .center, spacing: 22) {
                BuildingArt(subject: view.art)
                    .padding(8)
                    .frame(width: 84, height: 100)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
                VStack(alignment: .leading, spacing: 14) {
                    Text(RichText.plain(view.name))
                        .type(TypeStyle(size: 36, weight: .semibold, tracking: -0.04, leading: 1.05, relativeTo: .largeTitle))
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("course-title")
                    if let summary = view.summary { Text(RichText.plain(summary)).type(.body).foregroundStyle(Theme.muted) }
                }
            }
            HStack(spacing: 14) {
                if !view.modules.isEmpty {
                    Button("Change building") { picking = true }
                        .buttonStyle(PillButtonStyle(kind: .quiet))
                        .accessibilityIdentifier("change-building")
                }
                Button("Delete course") { confirmingDelete = true }
                    .buttonStyle(LinkButtonStyle())
                    .accessibilityIdentifier("delete-course")
            }
            if let deleteError { ErrorText(message: deleteError) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 20)
        .padding(.bottom, 40)
    }

    @ViewBuilder
    private func stage(_ view: CourseDetail, _ model: CourseModel) -> some View {
        switch model.stage {
        case .opening, .working:
            WorkingView(title: model.workingTitle, detail: model.workingDetail)
        case let .agentError(text):
            VStack(alignment: .leading, spacing: 24) {
                ErrorText(message: text)
                Button("Try again") { model.retry() }.buttonStyle(PillButtonStyle()).accessibilityIdentifier("try-again")
            }
        case let .fatal(text):
            fatal(text, model)
        case .question:
            if let question = view.currentQuestion { QuestionView(view: view, question: question, result: nil, model: model) }
        case let .result(result):
            if let question = view.currentQuestion { QuestionView(view: view, question: question, result: result, model: model) }
        case .complete:
            EmptyView()
        }
    }

    private func fatal(_ text: String, _ model: CourseModel) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            ErrorText(message: text)
            FlowLayout(spacing: 14) {
                Button("Try again") { model.start() }.buttonStyle(PillButtonStyle())
                Button("Back to courses") { app.show(.courses) }.buttonStyle(PillButtonStyle(kind: .quiet))
            }
        }
    }

    private func delete() {
        guard let model else { return }
        Task {
            do {
                try await model.delete()
                app.show(.courses)
            } catch {
                deleteError = message(of: error)
            }
        }
    }
}

/// The question, the learner's answer, and the verdict once it is graded.
private struct QuestionView: View {
    let view: CourseDetail
    let question: Question
    let result: AnswerResult?
    @Bindable var model: CourseModel
    @FocusState private var answerFocused: Bool

    private var eyebrow: String {
        let index = (view.roundQuestions.firstIndex { $0.id == question.id } ?? 0) + 1
        let module = view.modules.first { $0.status == "active" }?.title ?? ""
        return "\(RichText.plain(module)) · \(view.round > 1 ? "Follow-up" : "Question") \(index) of \(view.roundQuestions.count)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow).type(.small).foregroundStyle(Theme.muted).padding(.bottom, 18)
            if let why = question.why, !why.isEmpty {
                RichText(why, style: .small)
                    .padding(.horizontal, 18).padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .inset()
                    .padding(.bottom, 22)
            }
            RichText(question.prompt, style: .question)
                .padding(.bottom, 28)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("question")
            if let figure = question.figure {
                FigureView(svg: figure, alt: question.figureAlt).padding(.bottom, 28)
            }

            if let options = question.options {
                VStack(spacing: 12) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        OptionRow(index: index, text: option, state: state(of: index)) {
                            if result == nil { model.selected = index }
                        }
                        .accessibilityIdentifier("option-\(index)")
                    }
                }
                .padding(.bottom, result == nil ? 24 : 20)
            } else if let result {
                Text(result.response)
                    .type(.body)
                    .padding(.horizontal, 20).padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .inset()
                    .padding(.bottom, 20)
            } else {
                TextArea(text: $model.shortAnswer, placeholder: "Answer in your own words, in a sentence or three.", limit: 4000, focused: $answerFocused, label: "Your answer", identifier: "short-answer")
            }

            if let result {
                VerdictBlock(result: result, isChoice: question.options != nil, grader: view.models.grader) { model.start() }
                    .id("verdict")
            } else {
                if let error = model.answerError { ErrorText(message: error).padding(.top, 16).accessibilityIdentifier("answer-error") }
                Button(model.checking ? "Checking..." : "Check my answer") {
                    answerFocused = false
                    model.submit()
                }
                .buttonStyle(PillButtonStyle())
                .disabled(model.checking)
                .padding(.top, 24)
                .accessibilityIdentifier("check-answer")
            }
        }
    }

    private func state(of index: Int) -> OptionRow.State {
        if let result {
            if index == result.correctIndex { return .correct }
            return index == model.selected ? .wrong : .locked
        }
        return index == model.selected ? .selected : .open
    }
}

private struct OptionRow: View {
    enum State { case open, selected, correct, wrong, locked }
    let index: Int
    let text: String
    let state: State
    let choose: () -> Void

    private var background: Color {
        switch state {
        case .open, .locked: return Theme.ink
        case .selected: return Theme.blue
        case .correct: return Theme.green
        case .wrong: return Theme.orange
        }
    }

    private var onColour: Bool { state == .selected || state == .correct || state == .wrong }

    var body: some View {
        Button(action: choose) {
            HStack(alignment: .top, spacing: 14) {
                Text(String(Array("ABCD")[min(index, 3)]))
                    .font(.custom(InterTight.semibold.rawValue, size: 15))
                    .foregroundStyle(Theme.paper)
                    .frame(width: 28, height: 28)
                    .background(onColour ? Theme.ink : Theme.surface, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .accessibilityHidden(true)
                RichText(text).multilineTextAlignment(.leading)
            }
            .padding(.horizontal, 20).padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(onColour ? Theme.ink : Theme.paper)
            .background(background, in: RoundedRectangle(cornerRadius: Theme.insetRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(state == .open || state == .selected)
        .accessibilityAddTraits(state == .selected ? .isSelected : [])
        .accessibilityValue(state == .correct ? "Correct answer" : state == .wrong ? "Your answer, wrong" : "")
    }
}

/// The one full-colour block on the screen: what the grader decided, and why.
private struct VerdictBlock: View {
    let result: AnswerResult
    let isChoice: Bool
    let grader: String
    let next: () -> Void
    @State private var shown = false
    @State private var going = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var title: String {
        switch result.verdict {
        case "correct": return "You got it"
        case "partial": return "Part of the way there"
        default: return "Not quite"
        }
    }

    private var colour: Color {
        switch result.verdict {
        case "correct": return Theme.green
        case "partial": return Theme.yellow
        default: return Theme.orange
        }
    }

    /// Only https links are shown, labelled with their host.
    private var source: (url: URL, host: String)? {
        guard let text = result.sourceUrl, text.hasPrefix("https://"), let url = URL(string: text), let host = url.host else { return nil }
        return (url, host.hasPrefix("www.") ? String(host.dropFirst(4)) : host)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).type(.titleLarge).padding(.bottom, 10).accessibilityAddTraits(.isHeader).accessibilityIdentifier("verdict")
            RichText(result.feedback)
            if result.verdict != "correct", !isChoice, let reference = result.reference {
                RichText(reference, style: .small)
                    .foregroundStyle(Theme.paper)
                    .padding(.horizontal, 18).padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.top, 14)
            }
            if let source {
                HStack(spacing: 4) {
                    Text("Source:")
                    Link(source.host, destination: source.url).underline()
                }
                .type(.small)
                .padding(.top, 10)
            }
            if let confidence = result.confidence {
                Text("Graded by \(grader), \(Int((confidence * 100).rounded()))% sure.").type(.small).padding(.top, 10)
            }
            Button("Keep going") {
                going = true
                next()
            }
            .buttonStyle(PillButtonStyle(kind: .ink))
            .disabled(going)
            .padding(.top, 18)
            .accessibilityIdentifier("keep-going")
        }
        .padding(26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Theme.ink)
        .tint(Theme.ink)
        .background(colour, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .padding(.top, 8)
        .scaleEffect(shown || reduceMotion ? 1 : 0.96)
        .opacity(shown || reduceMotion ? 1 : 0)
        .onAppear { withAnimation(Theme.spring) { shown = true } }
    }
}

/// The finished course: the kit's pink panel with the fully lit building.
private struct FinishedPanel: View {
    let view: CourseDetail
    @Environment(AppModel.self) private var app

    private var summary: String? {
        guard let strongest = view.mastery.max(by: { $0.mastery < $1.mastery }) else { return nil }
        var text = "You're strongest on \(strongest.concept)."
        if let weakest = view.mastery.min(by: { $0.mastery < $1.mastery }), weakest.mastery < 0.7 { text += " Come back to \(weakest.concept) when you can." }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 14) {
                Text("You did it").type(.section).accessibilityAddTraits(.isHeader).accessibilityIdentifier("finished")
                if let summary { Text(summary).type(.body) }
                Button("Build another course") { app.show(.courses) }.buttonStyle(PillButtonStyle(kind: .ink)).padding(.top, 10)
            }
            let scene = CityEngine.shared.finished(view.art)
            SVGView(document: scene)
                .aspectRatio(scene.aspectRatio, contentMode: .fit)
                .padding(10)
                .frame(maxWidth: 220)
                .background(Theme.ink, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
                .accessibilityElement()
                .accessibilityLabel("Your building with every floor lit")
                .accessibilityAddTraits(.isImage)
        }
        .padding(26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Theme.ink)
        .background(Theme.pink, in: RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
    }
}

/// Modules, mastery by concept, and what the agent has done so far.
private struct SidePanels: View {
    let view: CourseDetail

    var body: some View {
        VStack(spacing: Theme.gap) {
            if !view.modules.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Modules").type(.titleSmall).padding(.bottom, 16).accessibilityAddTraits(.isHeader)
                    ForEach(view.modules) { module in
                        let state = module.status == "passed" ? "Done" : module.status == "active" ? "\(module.answered) answered" : "Up next"
                        let bar = module.masteryTarget.map { " · bar \(Int(($0 * 100).rounded()))%" } ?? ""
                        ModuleRow(title: module.title, note: state + bar, status: module.status)
                    }
                }
                .card()
            }
            if !view.mastery.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("What you know").type(.titleSmall).padding(.bottom, 16).accessibilityAddTraits(.isHeader)
                    ForEach(view.mastery, id: \.self) { item in
                        Meter(label: item.concept, value: percent(item.mastery), fraction: max(item.mastery, 0.03), colour: Theme.score(item.mastery))
                            .padding(.bottom, 14)
                    }
                }
                .card()
            }
            if !view.events.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("What the agent did").type(.titleSmall).padding(.bottom, 4).accessibilityAddTraits(.isHeader)
                    ForEach(Array(view.events.prefix(6).enumerated()), id: \.offset) { index, event in
                        Text(RichText.plain(event.message)).type(.small).foregroundStyle(index == 0 ? Theme.paper : Theme.muted)
                    }
                }
                .card()
            }
        }
    }
}

/// A labelled bar on an ink track.
struct Meter: View {
    let label: String
    let value: String
    let fraction: Double
    var colour: Color?
    var dimLabel = false

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(RichText.plain(label)).foregroundStyle(dimLabel ? Theme.muted : Theme.paper)
                Spacer(minLength: 0)
                Text(value).foregroundStyle(Theme.muted)
            }
            .type(.small)
            GeometryReader { proxy in
                Capsule().fill(colour ?? .clear).frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
            .frame(height: 12)
            .background(Theme.ink, in: Capsule())
        }
        .accessibilityElement(children: .combine)
    }
}
