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
    /// Tracks in the order the library shows them.
    let trackList: [Track]
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
    let modules: [Module]
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
}
