import SwiftUI

/// A recall question: where it is from, the prompt, and the options or a text box.
/// Today shows it on a card and the session shows it straight on the page.
struct RecallQuestionView: View {
    let question: RecallQuestion
    /// The verdict, once the answer is graded.
    var result: AnswerResult?
    var onInk = false
    @Bindable var model: TodayModel
    var answerFocused: FocusState<Bool>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let course = question.course {
                SourceRow(subject: course.art, title: course.name, detail: question.detail, onInk: onInk)
            } else {
                Text(question.detail).type(.sub).foregroundStyle(Theme.muted)
            }
            if let why = question.why, !why.isEmpty {
                RichText(why, style: .sub).foregroundStyle(Theme.muted)
            }
            RichText(question.prompt, style: .recallQuestion)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("recall-question")
            if let figure = question.figure {
                FigureView(svg: figure, alt: question.figureAlt)
            }

            if let options = question.options {
                VStack(spacing: 8) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        OptionRow(index: index, text: option, state: state(of: index), onInk: onInk, compact: true) {
                            if result == nil, !model.checking { model.selected = index }
                        }
                        .accessibilityIdentifier("option-\(index)")
                    }
                }
            } else if let result {
                Text(result.response)
                    .type(.small)
                    .padding(.horizontal, 16).padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(onInk ? Theme.surface : Theme.ink, in: RoundedRectangle(cornerRadius: Theme.insetRadius, style: .continuous))
            } else {
                TextArea(text: $model.shortAnswer, placeholder: "Answer in your own words, in a sentence or three.", minHeight: 112, limit: 4000,
                         focused: answerFocused, label: "Your answer", identifier: "short-answer", fill: onInk ? Theme.surface : Theme.ink)
                    .disabled(model.checking)
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

/// The recall session. It covers the whole screen, so the only things on it are the question and the way forward.
struct RecallSessionView: View {
    @Environment(AppModel.self) private var app
    @FocusState private var answerFocused: Bool

    var body: some View {
        let model = app.today
        Group {
            if model.stage == .done {
                RecallDoneView()
            } else if let question = model.question, let recall = model.recall {
                session(question, recall, model)
            } else {
                // Nothing to show: the set changed under the session. Today has the current state.
                Color.clear.onAppear { model.close() }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ink)
    }

    private func session(_ question: RecallQuestion, _ recall: Recall, _ model: TodayModel) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button { model.close() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.paper)
                        .frame(width: 36, height: 36).background(Theme.surface, in: Circle())
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(model.inCourseSession ? "Close recall and go back to the course" : "Close recall")
                .accessibilityIdentifier("recall-close")
                RecallPips(marks: recall.marks, current: question.number - 1)
                Text("\(question.number) of \(recall.total)").type(.sub).foregroundStyle(Theme.muted).fixedSize()
                    .accessibilityIdentifier("recall-count")
            }
            .padding(.leading, Theme.gutter - 4)
            .padding(.trailing, Theme.gutter + 4)
            .padding(.vertical, 6)

            ScrollViewReader { scroll in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        RecallQuestionView(question: question, result: model.answer?.result, onInk: true, model: model, answerFocused: $answerFocused)
                            .id(question.id)
                        if let answer = model.answer {
                            VerdictBlock(result: answer.result, isChoice: question.options != nil, schedule: answer.schedule?.label)
                                .id("verdict")
                        }
                        if let error = model.error { ErrorText(message: error).accessibilityIdentifier("answer-error") }
                    }
                    .padding(.horizontal, Theme.gutter + 4)
                    .padding(.top, 10)
                    .padding(.bottom, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: model.stage) { _, stage in
                    // A new question starts at its top, and a verdict comes into view.
                    if stage == .result { withAnimation { scroll.scrollTo("verdict", anchor: .bottom) } }
                }
                .onChange(of: question.id) { _, id in scroll.scrollTo(id, anchor: .top) }
            }

            HStack(spacing: 12) {
                if model.stage == .result {
                    Spacer()
                    Button(recall.question == nil ? "Finish" : "Next") { model.next() }
                        .buttonStyle(PillButtonStyle())
                        .accessibilityIdentifier("recall-next")
                } else {
                    Button("Skip question") {
                        answerFocused = false
                        model.skipQuestion()
                    }
                    .buttonStyle(LinkButtonStyle())
                    .disabled(model.checking || model.working)
                    .accessibilityIdentifier("skip-question")
                    Spacer()
                    Button(model.checking ? "Checking..." : "Check") {
                        answerFocused = false
                        model.check()
                    }
                    .buttonStyle(PillButtonStyle())
                    .disabled(model.checking || model.working || !model.canCheck)
                    .accessibilityIdentifier("check-recall")
                }
            }
            .padding(.horizontal, Theme.gutter + 4)
            .padding(.top, 10)
            .padding(.bottom, 10)
        }
    }
}

/// The end of the set: how it went, the week, what comes back when, and what to do next.
private struct RecallDoneView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let model = app.today
        ScrollView {
            if let recall = model.recall, let streak = model.streak {
                VStack(alignment: .leading, spacing: 14) {
                    RecallPips(marks: recall.marks).padding(.vertical, 14)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(streak.today.counted ? "Day \(streak.current)" : "Recall done")
                            .type(.heading).accessibilityAddTraits(.isHeader).accessibilityIdentifier("recall-done")
                        Text("\(recall.lead) \(streak.label)").type(.sub).foregroundStyle(Theme.muted)
                    }
                    WeekStrip(week: streak.week, today: streak.day).padding(.top, 4)
                    if !recall.comingBack.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Coming back").type(.sub).foregroundStyle(Theme.muted).accessibilityAddTraits(.isHeader)
                            ForEach(recall.comingBack, id: \.self) { item in
                                HStack(alignment: .firstTextBaseline, spacing: 12) {
                                    Text(item.concept)
                                    Spacer(minLength: 0)
                                    Text(item.when).foregroundStyle(Theme.muted).fixedSize()
                                }
                                .type(.sub)
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .card(padding: 18)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("coming-back")
                    }
                    if let error = model.error { ErrorText(message: error) }

                    VStack(spacing: 10) {
                        if model.inCourseSession {
                            // A course session goes back to where it was started from, the course or its library page.
                            Button("Back to the course") { model.close() }
                                .buttonStyle(PillButtonStyle(fullWidth: true))
                                .accessibilityIdentifier("back-to-course")
                        } else if let resume = model.today?.resume {
                            SourceRow(subject: resume.course.art, title: resume.course.name, detail: resume.detail, onInk: true)
                                .padding(.bottom, 2)
                            Button("Continue your course") {
                                app.show(.today)
                                app.open(.course(resume.course.id))
                                model.close()
                            }
                            .buttonStyle(PillButtonStyle(fullWidth: true))
                            .accessibilityIdentifier("continue-your-course")
                        }
                        if recall.moreAvailable {
                            Button(model.working ? "Finding questions..." : "5 more questions") { model.more() }
                                .buttonStyle(PillButtonStyle(kind: .quiet, fullWidth: true))
                                .disabled(model.working)
                                .accessibilityIdentifier("more-questions")
                        }
                        if !model.inCourseSession {
                            Button("Done") { model.close() }
                                .buttonStyle(LinkButtonStyle())
                                .accessibilityIdentifier("recall-finish")
                        }
                    }
                    .padding(.top, 10)
                }
                .padding(.horizontal, Theme.gutter + 4)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

/// "Recall" on a course's page or its library page: a quiet pill that starts a session on that course's passed modules.
/// With `resume`, a "Continue" button leads the row, as on a library course the learner has started.
struct RecallCourseAction: View {
    let courseId: String
    let recall: CourseRecall
    /// The row sits on a surface panel, where the quiet pill would vanish, so it is ink there.
    var onSurface = false
    var resume: (() -> Void)?
    @Environment(AppModel.self) private var app
    @State private var starting = false
    @State private var error: String?

    /// What there is to recall, or why there is nothing yet.
    private var note: String? { recall.available ? recall.label : recall.reason }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                if let resume {
                    Button("Continue", action: resume)
                        .buttonStyle(PillButtonStyle())
                        .accessibilityIdentifier("library-continue")
                }
                recallButton
                if resume == nil, let note { noteText(note) }
                Spacer(minLength: 0)
            }
            if resume != nil, let note { noteText(note) }
            if let error { ErrorText(message: error).accessibilityIdentifier("course-recall-error") }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var recallButton: some View {
        let button = Button(starting ? "Opening..." : "Recall", action: start)
            .disabled(!recall.available || starting)
            .accessibilityHint(note ?? "")
            .accessibilityIdentifier("course-recall")
        if onSurface { button.buttonStyle(InkPillButtonStyle()) } else { button.buttonStyle(PillButtonStyle(kind: .quiet)).fixedSize() }
    }

    private func noteText(_ text: String) -> some View {
        Text(text).type(.small).foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true) // read as the button's hint
    }

    private func start() {
        guard !starting else { return }
        starting = true
        error = nil
        Task {
            // On success the session covers the screen, and closing it comes back here.
            error = await app.today.startCourse(courseId)
            starting = false
        }
    }
}
