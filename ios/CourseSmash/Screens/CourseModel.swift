import SwiftUI

/// One course on screen. Mirrors `syncCourse` in the web app: show the course, and run the agent whenever it has work to do.
@MainActor
@Observable
final class CourseModel {
    enum Stage: Equatable {
        case opening
        /// The agent is planning, writing questions or reading answers.
        case working
        /// The agent failed. The learner decides whether to try again.
        case agentError(String)
        case question
        case result(AnswerResult)
        case complete
        case fatal(String)
    }

    let id: String
    private let api: APIClient
    private(set) var view: CourseDetail?
    private(set) var stage: Stage = .opening
    private(set) var checking = false
    private(set) var answerError: String?
    var selected: Int?
    var shortAnswer = ""

    private var retried = false
    private var task: Task<Void, Never>?

    init(id: String, api: APIClient) {
        self.id = id
        self.api = api
    }

    func start() {
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.sync()
            } catch is CancellationError {
            } catch {
                self.stage = .fatal(message(of: error))
            }
        }
    }

    func stop() {
        task?.cancel()
    }

    func retry() {
        retried = true
        start()
    }

    private func sync() async throws {
        // The course on screen only changes together with its stage, so a new question never shows under an old verdict.
        var view: CourseDetail = try await api.get("/api/courses/\(id)")
        while view.needsAgent {
            try Task.checkCancellation()
            self.view = view
            if let error = view.error, !view.agentBusy, !retried {
                // Show the failure and wait for the learner, rather than spending tokens in a loop.
                stage = .agentError(error)
                return
            }
            stage = .working
            retried = false
            let result: AdvanceResult = try await api.send("POST", "/api/courses/\(id)/advance")
            if result.status == "busy" { try await Task.sleep(for: .milliseconds(2500)) }
            view = try await api.get("/api/courses/\(id)")
        }
        try Task.checkCancellation()
        self.view = view
        if view.status == "complete" {
            stage = .complete
            UIAccessibility.post(notification: .announcement, argument: "Course finished.")
        } else if view.currentQuestion != nil {
            selected = nil
            shortAnswer = ""
            answerError = nil
            stage = .question
            UIAccessibility.post(notification: .announcement, argument: "New question ready.")
        } else {
            stage = .fatal(APIError.generic.message)
        }
    }

    func submit() {
        guard let question = view?.currentQuestion, !checking else { return }
        let response: String
        if question.options != nil {
            guard let selected else { answerError = "Pick one of the options."; return }
            response = String(selected)
        } else {
            guard !shortAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { answerError = "Write an answer first."; return }
            response = shortAnswer
        }
        checking = true
        answerError = nil
        Task {
            do {
                struct Body: Encodable { let response: String }
                let result: AnswerResult = try await api.send("POST", "/api/questions/\(question.id)/answer", body: Body(response: response))
                stage = .result(result)
            } catch {
                answerError = message(of: error)
            }
            checking = false
        }
    }

    func setIcon(_ icon: Icon) {
        view?.icon = icon
    }

    func delete() async throws {
        let _: Okay = try await api.send("DELETE", "/api/courses/\(id)")
    }

    var workingTitle: String {
        guard let view, !view.modules.isEmpty else { return "Planning your course" }
        return view.roundQuestions.isEmpty ? "Writing your questions" : "Reading your answers"
    }

    var workingDetail: String {
        guard let view, !view.modules.isEmpty else { return "This usually takes under a minute. You can leave and come back." }
        return view.roundQuestions.isEmpty ? "Using what I know about you so far." : "Deciding whether to follow up or move on, then writing what's next."
    }
}
