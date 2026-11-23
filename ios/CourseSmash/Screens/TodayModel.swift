import SwiftUI

/// Today: the streak, today's recall set and the session that answers it.
/// One of these lives for the whole sign-in, so every tab shows the same streak.
/// It also runs a "Recall this course" session, started from a course's page, on the same session screen.
@MainActor
@Observable
final class TodayModel {
    enum Stage { case question, result, done }

    private let api: APIClient
    private(set) var today: Today?
    private(set) var loadError: String?

    /// A session covers the whole screen. It starts when the first answer is sent from Today, with "5 more recall",
    /// or with "Recall" on a course.
    private(set) var inSession = false
    /// The set of a "Recall this course" session while one is on screen. Today's own set stays in `today`.
    private(set) var courseRecall: Recall?
    /// The streak from the last response, for a course session started before Today has loaded.
    private var latestStreak: Streak?
    private(set) var stage: Stage = .question
    /// The question on screen. During a verdict this is the one just answered, not the next one.
    private(set) var question: RecallQuestion?
    private(set) var answer: RecallAnswer?
    private(set) var checking = false
    /// Skipping, adding questions, or bringing recall back for the day.
    private(set) var working = false
    private(set) var error: String?
    var selected: Int?
    var shortAnswer = ""

    init(api: APIClient) {
        self.api = api
    }

    var streak: Streak? { today?.streak ?? latestStreak }
    /// The set the session is answering: a course's, or today's.
    var recall: Recall? { courseRecall ?? today?.recall }
    /// True while the session is a "Recall this course" one, which closes back to the course it came from.
    var inCourseSession: Bool { courseRecall != nil }

    /// True once the learner has picked an option or written something, which is when "Check" shows.
    var canCheck: Bool {
        guard let question else { return false }
        return question.options != nil ? selected != nil : !shortAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func reset() {
        today = nil
        loadError = nil
        inSession = false
        courseRecall = nil
        latestStreak = nil
        stage = .question
        question = nil
        answer = nil
        error = nil
        selected = nil
        shortAnswer = ""
    }

    func load() async {
        do {
            let loaded: Today = try await api.get("/api/today")
            today = loaded
            loadError = nil
            // A session keeps the question it is on. Today always shows the next one.
            if !inSession { show(loaded.recall.question) }
        } catch is CancellationError {
        } catch {
            if today == nil { loadError = message(of: error) }
        }
    }

    /// Sends the answer. From Today this is what opens the session.
    func check() {
        guard let question, !checking else { return }
        let response: String
        if question.options != nil {
            guard let selected else { error = "Pick one of the options."; return }
            response = String(selected)
        } else {
            guard canCheck else { error = "Write an answer first."; return }
            response = shortAnswer
        }
        inSession = true
        checking = true
        error = nil
        Task {
            do {
                struct Body: Encodable { let response: String }
                let answer: RecallAnswer = try await api.send("POST", "/api/recall/\(question.id)/answer", body: Body(response: response))
                apply(answer.streak, answer.recall)
                if inSession {
                    self.answer = answer
                    stage = .result
                } else {
                    show(answer.recall.question)
                }
            } catch {
                self.error = message(of: error)
            }
            checking = false
        }
    }

    /// After a verdict: the next question, or the finished screen.
    func next() {
        answer = nil
        advance()
    }

    /// Leaves the question unanswered. Its subtopic stays due.
    func skipQuestion() {
        guard let question else { return }
        act("/api/recall/\(question.id)/skip") { self.advance() }
    }

    /// "5 more questions" and "5 more recall": adds to the set and carries on in the session,
    /// opening one when the button was on Today. A course session sends its id, so the questions come from that course.
    func more() {
        struct Body: Encodable { let session: String }
        let session = courseRecall?.session
        act("/api/recall/more", body: session.map { Body(session: $0) }) {
            if self.recall?.question != nil { self.inSession = true }
            self.advance()
        }
    }

    /// "Skip for today" hides recall for the day. `false` brings it back.
    func skipDay(_ skipped: Bool) {
        struct Body: Encodable { let skipped: Bool }
        act("/api/recall/skip-day", body: Body(skipped: skipped)) { self.advance() }
    }

    /// "Recall" on a course or its library page: starts a session on that course, or carries on with today's open one,
    /// and opens it over the whole screen. Returns the reason when there is nothing to ask, for the page to show.
    func startCourse(_ id: String) async -> String? {
        guard !working, !checking else { return nil }
        working = true
        defer { working = false }
        do {
            let state: RecallState = try await api.send("POST", "/api/courses/\(id)/recall")
            courseRecall = state.recall
            latestStreak = state.streak
            today?.streak = state.streak
            answer = nil
            error = nil
            if let first = state.recall.question {
                show(first, fresh: true)
                stage = .question
            } else {
                question = nil
                stage = .done
            }
            inSession = true
            return nil
        } catch is CancellationError {
            return nil
        } catch {
            return message(of: error)
        }
    }

    /// Back to Today, or to the course a course session was started from. Answers so far are kept.
    func close() {
        courseRecall = nil
        inSession = false
        answer = nil
        error = nil
        stage = .question
        show(recall?.question, fresh: true)
        Task { await load() }
    }

    private func advance() {
        if let next = recall?.question {
            show(next, fresh: true)
            stage = .question
        } else {
            question = nil
            if inSession {
                stage = .done
                UIAccessibility.post(notification: .announcement, argument: "Recall done.")
                // The course to continue may have moved on while recall was answered.
                Task { await load() }
            }
        }
    }

    private func show(_ next: RecallQuestion?, fresh: Bool = false) {
        guard fresh || next?.id != question?.id else { return }
        question = next
        selected = nil
        shortAnswer = ""
    }

    private func apply(_ streak: Streak, _ recall: Recall) {
        today?.streak = streak
        latestStreak = streak
        // A course session's answers come back with that session's set. Today's set is read again when it closes.
        if recall.isCourseSession || inCourseSession { courseRecall = recall } else { today?.recall = recall }
    }

    private func act(_ path: String, body: (any Encodable)? = nil, then: @escaping () -> Void) {
        guard !working else { return }
        working = true
        error = nil
        Task {
            do {
                let state: RecallState
                if let body { state = try await api.send("POST", path, body: body) } else { state = try await api.send("POST", path) }
                apply(state.streak, state.recall)
                then()
            } catch {
                self.error = message(of: error)
            }
            working = false
        }
    }
}
