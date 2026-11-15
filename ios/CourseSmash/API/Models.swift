import Foundation

// The shapes the Worker returns from /api/. Keys are snake_case on the wire.

/// A course's building: one choice from each fixed list in src/icon.ts.
struct Icon: Codable, Hashable {
    var archetype: String
    var material: String
    var roof: String
    var accent: String
}

struct LoginResponse: Decodable {
    let token: String
    let username: String
    let expiresAt: Double
}

struct Me: Decodable { let username: String }
struct Created: Decodable { let id: String }
struct Okay: Decodable { let ok: Bool? }
struct IconSaved: Decodable { let icon: Icon }

/// GET /api/app
struct AppConfig: Decodable {
    struct Choice: Decodable, Identifiable, Hashable { let id: String; let label: String }
    struct Buildings: Decodable { let archetypes: [Choice]; let materials: [Choice]; let roofs: [Choice]; let accents: [Choice] }
    let ideas: [String]
    let buildings: Buildings
}

/// A row of GET /api/courses
struct CourseSummary: Decodable, Identifiable, Hashable {
    let id: String
    let prompt: String
    let title: String?
    let summary: String?
    let status: String
    let icon: Icon?
    let createdAt: Double
    let modules: Int
    let passed: Int
    let answered: Int
    let average: Double?

    var name: String { title ?? prompt }
}
struct CourseList: Decodable { let courses: [CourseSummary] }

/// GET /api/catalog
struct Catalog: Decodable {
    struct Track: Decodable, Identifiable, Hashable { let id: String; let title: String }

    /// A cluster of courses by meaning, across tracks. `courseIds` is in study order: each course follows the ones it builds on.
    struct Topic: Decodable, Identifiable, Hashable {
        let id: Int
        let name: String
        let summary: String
        let courses: Int
        let courseIds: [String]
    }

    /// Tracks in the order the library shows them.
    let trackList: [Track]
    let topics: [Topic]?
    let courses: [CatalogCourse]
}

struct CatalogCourse: Decodable, Identifiable, Hashable {
    let id: String
    let track: String
    let trackTitle: String
    let title: String
    let summary: String
    let level: String
    let tags: [String]
    let icon: Icon?
    let modules: Int
    let questions: Int
    let topic: String?
    /// Ids of the library courses this one builds on.
    let requires: [String]?
}

/// GET /api/catalog/:id
struct CatalogCourseDetail: Decodable {
    struct Module: Decodable, Hashable { let title: String; let concepts: [String] }
    let id: String
    let track: String
    let trackTitle: String
    let title: String
    let summary: String
    let level: String
    let topic: String?
    let modules: [Module]
    /// The learning path around this course: what to take first, and what it opens up.
    let prerequisites: [CatalogCourse]?
    let leadsTo: [CatalogCourse]?
}

/// GET /api/catalog/:id/similar. `pending` until the course has been read for meaning.
struct SimilarCourses: Decodable {
    let pending: Bool
    let courses: [CatalogCourse]
}

/// GET /api/catalog/:id/misses: the subtopics and questions learners miss most in a course.
struct CourseMisses: Decodable {
    struct Concept: Decodable, Hashable { let concept: String; let missRate: Double }
    struct Hard: Decodable, Hashable { let prompt: String }
    let concepts: [Concept]
    let questions: [Hard]
}

/// GET /api/courses/:id
struct CourseDetail: Decodable {
    struct Module: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let status: String
        let masteryTarget: Double?
        let questions: Int
        let answered: Int
    }
    struct Event: Decodable, Hashable { let message: String }
    struct Models: Decodable { let writer: String; let grader: String }

    let id: String
    let prompt: String
    let title: String?
    let summary: String?
    var icon: Icon?
    let status: String
    let error: String?
    let agentBusy: Bool
    let needsAgent: Bool
    let modules: [Module]
    let round: Int
    let roundQuestions: [Question]
    let currentQuestion: Question?
    let mastery: [Mastery]
    let events: [Event]
    let models: Models

    var name: String { title ?? prompt }
    var passed: Int { modules.filter { $0.status == "passed" }.count }
}

struct Question: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let prompt: String
    let options: [String]?
    let why: String?
    let figure: String?
    let figureAlt: String?
}

struct Mastery: Decodable, Hashable {
    let concept: String
    let mastery: Double
}

/// POST /api/questions/:id/answer
struct AnswerResult: Decodable, Hashable {
    let response: String
    let verdict: String
    let confidence: Double?
    let feedback: String
    let correctIndex: Int?
    let reference: String?
    let sourceUrl: String?
}

/// POST /api/courses/:id/advance
struct AdvanceResult: Decodable {
    let status: String
    let error: String?
}

/// GET /api/stats
struct Stats: Decodable {
    struct Totals: Decodable {
        let courses: Int
        let finished: Int
        let modulesPassed: Int
        let answered: Int
        let correct: Int
        let partial: Int
        let incorrect: Int
        let average: Double?
        let activeDays: Int
        let streak: Int
        /// Answers given in daily recall, which `answered` already counts.
        let recallAnswered: Int?
    }
    struct Day: Decodable, Hashable {
        let date: String
        let answered: Int
        let correct: Int
        let partial: Int
        let incorrect: Int
    }
    struct ModuleStat: Decodable, Hashable {
        let title: String
        let status: String
        let answered: Int
        let average: Double?
    }
    struct Course: Decodable, Identifiable, Hashable {
        let id: String
        let title: String?
        let prompt: String
        let status: String
        let icon: Icon?
        let modules: Int
        let passed: Int
        let answered: Int
        let correct: Int
        let partial: Int
        let incorrect: Int
        let average: Double?
        let moduleStats: [ModuleStat]
        let strongest: [Mastery]
        let weakest: [Mastery]
        /// "Up 12 points lately", worked out by the Worker. Nil until there are enough answers.
        let trendLabel: String?

        var name: String { title ?? prompt }
    }

    let totals: Totals
    let days: [Day]
    let courses: [Course]
    /// The top of the activity chart's scale.
    let chartMax: Int
    /// The same streak as on Today and You.
    let streak: Streak?
}

/// The learner's run of days, written by the Worker. Every response that can change it carries one.
struct Streak: Decodable, Hashable {
    struct Progress: Decodable, Hashable {
        let answered: Int
        let needed: Int
        let counted: Bool
    }
    /// One day. `state` is one of: done, rest, missed, today, future, none.
    struct Day: Decodable, Hashable, Identifiable {
        let day: String
        let state: String
        var id: String { day }
    }

    let day: String
    let current: Int
    let longest: Int
    let label: String
    let restLabel: String?
    let today: Progress
    /// Monday first.
    let week: [Day]
    /// The last 28 days, oldest first, ending today.
    let calendar: [Day]
}

/// Today's recall set and the next question in it.
struct Recall: Decodable, Hashable {
    struct ComingBack: Decodable, Hashable { let concept: String; let when: String }

    /// ready, done, skipped or empty.
    let status: String
    let lead: String
    let total: Int
    let answered: Int
    let correct: Int
    /// One per question, in order: correct, partial, incorrect, skipped or open.
    let marks: [String]
    let moreAvailable: Bool
    let question: RecallQuestion?
    let comingBack: [ComingBack]
}

/// A recall question. It never carries its answer key.
struct RecallQuestion: Decodable, Hashable, Identifiable {
    let id: String
    let kind: String
    let prompt: String
    let options: [String]?
    /// "Message roles and turns · last seen 10 days ago", written by the Worker.
    let detail: String
    let why: String?
    let figure: String?
    let figureAlt: String?
    /// Its place in today's set, from 1.
    let number: Int
    let course: CourseSummary?
}

/// GET /api/today
struct Today: Decodable {
    struct Continue: Decodable, Hashable {
        let course: CourseSummary
        let detail: String
    }
    struct UpNext: Decodable, Hashable {
        let course: CatalogCourse
        let detail: String
    }

    var streak: Streak
    var recall: Recall
    /// The course in progress, or nil.
    let resume: Continue?
    let upNext: UpNext?
    /// Library courses to start with, only when the learner has no courses.
    let picks: [CatalogCourse]

    private enum CodingKeys: String, CodingKey {
        case streak, recall, resume = "continue", upNext, picks
    }
}

/// POST /api/recall/:id/skip, /api/recall/more and /api/recall/skip-day
struct RecallState: Decodable {
    let streak: Streak
    let recall: Recall
}

/// POST /api/recall/:id/answer. `recall.question` is the next question, or nil when the set is finished.
struct RecallAnswer: Decodable {
    struct Schedule: Decodable, Hashable { let label: String }
    let result: AnswerResult
    /// When the subtopic comes back. Nil for a question that is new in a course.
    let schedule: Schedule?
    let streak: Streak
    let recall: Recall
}

/// GET and PUT /api/settings
struct LearnerSettings: Decodable, Hashable {
    let dailyGoal: Int
    let shortAnswers: Bool
    let timeZone: String
    let goals: [Int]
}
