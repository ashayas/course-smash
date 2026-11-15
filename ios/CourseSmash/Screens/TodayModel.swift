import SwiftUI

/// Today: the streak, today's recall set and the session that answers it.
/// One of these lives for the whole sign-in, so every tab shows the same streak.
@MainActor
@Observable
final class TodayModel {
    enum Stage { case question, result, done }

    private let api: APIClient
    private(set) var today: Today?
    private(set) var loadError: String?

    /// A session covers the whole screen. It starts when the first answer is sent from Today.
    private(set) var inSession = false
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

    var streak: Streak? { today?.streak }
    var recall: Recall? { today?.recall }

    /// True once the learner has picked an option or written something, which is when "Check" shows.
    var canCheck: Bool {
        guard let question else { return false }
        return question.options != nil ? selected != nil : !shortAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func reset() {
        today = nil
        loadError = nil
        inSession = false
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

    /// "5 more questions": adds to today's set. In a session, the session carries on.
    func more() {
        act("/api/recall/more") { self.advance() }
    }

    /// "Skip for today" hides recall for the day. `false` brings it back.
    func skipDay(_ skipped: Bool) {
        act("/api/recall/skip-day", skipped: skipped) { self.advance() }
    }

    /// Back to Today. Answers so far are kept.
    func close() {
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
        today?.recall = recall
    }

    private func act(_ path: String, skipped: Bool? = nil, then: @escaping () -> Void) {
        guard !working else { return }
        working = true
        error = nil
        Task {
            do {
                let state: RecallState
                struct Body: Encodable { let skipped: Bool }
                if let skipped { state = try await api.send("POST", path, body: Body(skipped: skipped)) } else { state = try await api.send("POST", path) }
                apply(state.streak, state.recall)
                then()
            } catch {
                self.error = message(of: error)
            }
            working = false
        }
    }
}
