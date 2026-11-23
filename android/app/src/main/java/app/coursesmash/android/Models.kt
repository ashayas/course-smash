package app.coursesmash.android

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The shapes the Worker returns from /api/. Keys are snake_case on the wire.

/** A course's building: one choice from each fixed list in src/icon.ts. */
@Serializable
data class Icon(val archetype: String, val material: String, val roof: String, val accent: String)

@Serializable
data class LoginResponse(val token: String, val username: String, val expiresAt: Long)

@Serializable
data class Created(val id: String)

@Serializable
data class Okay(val ok: Boolean? = null)

@Serializable
data class IconSaved(val icon: Icon)

/** GET /api/app */
@Serializable
data class AppConfig(val ideas: List<String>, val buildings: Buildings) {
    @Serializable
    data class Choice(val id: String, val label: String)

    @Serializable
    data class Buildings(val archetypes: List<Choice>, val materials: List<Choice>, val roofs: List<Choice>, val accents: List<Choice>)
}

/** A row of GET /api/courses */
@Serializable
data class CourseSummary(
    val id: String,
    val prompt: String,
    val title: String? = null,
    val status: String,
    val icon: Icon? = null,
    val modules: Int = 0,
    val passed: Int = 0,
    val average: Double? = null,
    /** Whether the course feeds daily recall. Older Workers don't send it, and every course fed recall then. */
    val inRecall: Boolean = true,
) {
    val name: String get() = title ?: prompt
}

/**
 * Whether "Recall this course" can start. `label` is the note under the Recall button ("15 ideas from 3 passed
 * modules · 15 due"), and `reason` says why it can't when it isn't `available`. Both are written by the Worker.
 */
@Serializable
data class CourseRecall(val available: Boolean = false, val ideas: Int = 0, val due: Int = 0, val label: String = "", val reason: String? = null)

@Serializable
data class CourseList(val courses: List<CourseSummary>)

/** GET /api/catalog */
@Serializable
data class Catalog(val trackList: List<Track>, val topics: List<Topic> = emptyList(), val courses: List<CatalogCourse>) {
    /** Tracks come as a list so they keep the order the library shows them in. */
    @Serializable
    data class Track(val id: String, val title: String)

    /** A cluster of courses by meaning, across tracks. `courseIds` is in study order: each course follows the ones it builds on. */
    @Serializable
    data class Topic(val id: Int, val name: String, val summary: String, val courses: Int, val courseIds: List<String> = emptyList())
}

@Serializable
data class CatalogCourse(
    val id: String,
    val track: String,
    val trackTitle: String,
    val title: String,
    val level: String,
    val tags: List<String> = emptyList(),
    val icon: Icon? = null,
    val modules: Int = 0,
    val questions: Int = 0,
    val topic: String? = null,
    /** Ids of the library courses this one builds on. */
    val requires: List<String> = emptyList(),
)

/** GET /api/catalog/:id */
@Serializable
data class CatalogCourseDetail(
    val id: String,
    val track: String,
    val trackTitle: String,
    val title: String,
    val summary: String,
    val level: String,
    val topic: String? = null,
    val modules: List<Module>,
    /** The learning path around this course: what to take first, and what it opens up. */
    val prerequisites: List<CatalogCourse> = emptyList(),
    val leadsTo: List<CatalogCourse> = emptyList(),
    /** The learner's own course started from this one, or null. Then the page offers Continue and Recall instead of Start. */
    val yours: Yours? = null,
) {
    @Serializable
    data class Module(val title: String, val concepts: List<String> = emptyList())

    @Serializable
    data class Yours(val course: CourseSummary, val recall: CourseRecall? = null)
}

/** GET /api/catalog/:id/similar. `pending` until the course has been read for meaning. */
@Serializable
data class SimilarCourses(val pending: Boolean = false, val courses: List<CatalogCourse> = emptyList())

/** GET /api/catalog/:id/misses: the subtopics and questions learners miss most in a course. */
@Serializable
data class CourseMisses(val concepts: List<Concept> = emptyList(), val questions: List<Hard> = emptyList()) {
    @Serializable
    data class Concept(val concept: String, val missRate: Double)

    @Serializable
    data class Hard(val prompt: String)
}

/** GET /api/courses/:id */
@Serializable
data class CourseDetail(
    val id: String,
    val prompt: String,
    val title: String? = null,
    val summary: String? = null,
    val icon: Icon? = null,
    val status: String,
    val error: String? = null,
    val agentBusy: Boolean = false,
    val needsAgent: Boolean = false,
    val modules: List<Module> = emptyList(),
    val round: Int = 0,
    val roundQuestions: List<Question> = emptyList(),
    val currentQuestion: Question? = null,
    val mastery: List<Mastery> = emptyList(),
    val events: List<Event> = emptyList(),
    val models: Models,
    /** Whether the course can be recalled on its own. Null from an older Worker, and then there is no Recall button. */
    val recall: CourseRecall? = null,
) {
    @Serializable
    data class Module(val id: String, val title: String, val status: String, val masteryTarget: Double? = null, val answered: Int = 0)

    @Serializable
    data class Event(val message: String)

    @Serializable
    data class Models(val writer: String, val grader: String)

    val name: String get() = title ?: prompt
    val passed: Int get() = modules.count { it.status == "passed" }
}

@Serializable
data class Question(
    val id: String,
    val prompt: String,
    val options: List<String>? = null,
    val why: String? = null,
    val figure: String? = null,
    val figureAlt: String? = null,
)

@Serializable
data class Mastery(val concept: String, val mastery: Double)

/** POST /api/questions/:id/answer */
@Serializable
data class AnswerResult(
    val response: String,
    val verdict: String,
    val confidence: Double? = null,
    val feedback: String,
    val correctIndex: Int? = null,
    val reference: String? = null,
    val sourceUrl: String? = null,
)

/** POST /api/courses/:id/advance */
@Serializable
data class AdvanceResult(val status: String, val error: String? = null)

/** GET /api/stats */
@Serializable
data class Stats(val totals: Totals, val days: List<Day>, val courses: List<Course>, val chartMax: Int, val streak: Streak? = null) {
    @Serializable
    data class Totals(
        val courses: Int, val finished: Int, val modulesPassed: Int, val answered: Int, val correct: Int, val partial: Int,
        val incorrect: Int, val average: Double? = null, val activeDays: Int, val streak: Int, val recallAnswered: Int = 0,
    )

    @Serializable
    data class Day(val date: String, val answered: Int, val correct: Int, val partial: Int, val incorrect: Int)

    @Serializable
    data class ModuleStat(val title: String, val status: String, val answered: Int, val average: Double? = null)

    @Serializable
    data class Course(
        val id: String,
        val title: String? = null,
        val prompt: String,
        val status: String,
        val icon: Icon? = null,
        val modules: Int = 0,
        val passed: Int = 0,
        val answered: Int = 0,
        val correct: Int = 0,
        val partial: Int = 0,
        val incorrect: Int = 0,
        val average: Double? = null,
        val moduleStats: List<ModuleStat> = emptyList(),
        val strongest: List<Mastery> = emptyList(),
        val weakest: List<Mastery> = emptyList(),
        /** "Up 12 points lately", worked out by the Worker. Null until there are enough answers. */
        val trendLabel: String? = null,
    ) {
        val name: String get() = title ?: prompt
    }
}

/** The learner's streak, as every recall endpoint and /api/stats return it. The Worker writes `label` and `restLabel`. */
@Serializable
data class Streak(
    val day: String,
    val current: Int,
    val longest: Int = 0,
    val restDays: Int = 0,
    val label: String,
    val restLabel: String? = null,
    val today: Progress = Progress(),
    val recallSkipped: Boolean = false,
    /** This week, Monday first. */
    val week: List<Day> = emptyList(),
    /** The last 28 days, oldest first, ending today. */
    val calendar: List<Day> = emptyList(),
) {
    @Serializable
    data class Progress(val answered: Int = 0, val needed: Int = 0, val counted: Boolean = false)

    /** `state` is one of done, rest, missed, today, future, none. */
    @Serializable
    data class Day(val day: String, val state: String, val recall: Int = 0, val course: Int = 0)
}

/** Today's recall set. `question` is the next unanswered one and never carries its answer key. */
@Serializable
data class Recall(
    /** ready, done, skipped or empty. */
    val status: String,
    val lead: String,
    val total: Int = 0,
    val answered: Int = 0,
    val correct: Int = 0,
    /** One per question, in order: correct, partial, incorrect, skipped or open. */
    val marks: List<String> = emptyList(),
    val moreAvailable: Boolean = false,
    val question: RecallQuestion? = null,
    val comingBack: List<ComingBack> = emptyList(),
    /** "day" for Today's set, "course" for a "Recall this course" session. */
    val scope: String = "day",
    /** The session's id when `scope` is "course". Sent back with /api/recall/more. */
    val session: String? = null,
    val courseId: String? = null,
    /** True when every course is turned off for daily recall. Then `status` is "empty". */
    val off: Boolean = false,
) {
    @Serializable
    data class ComingBack(val concept: String, val `when`: String)
}

@Serializable
data class RecallQuestion(
    val id: String,
    /** mcq or short. */
    val kind: String,
    val prompt: String,
    val options: List<String>? = null,
    val concept: String = "",
    /** "Taints and tolerations · last seen 9 days ago", written by the Worker. */
    val detail: String = "",
    val why: String? = null,
    val figure: String? = null,
    val figureAlt: String? = null,
    val number: Int = 1,
    val course: CourseSummary? = null,
)

/** GET /api/today */
@Serializable
data class Today(
    val day: String,
    val streak: Streak,
    val recall: Recall,
    @SerialName("continue") val next: ContinueCard? = null,
    val upNext: UpNext? = null,
    /** Library courses to start with, only when the learner has no courses. */
    val picks: List<CatalogCourse> = emptyList(),
) {
    /** The course to carry on with. */
    @Serializable
    data class ContinueCard(val course: CourseSummary, val waiting: Int = 0, val lastModule: Boolean = false, val detail: String)

    @Serializable
    data class UpNext(val course: CatalogCourse, val reason: String = "", val detail: String)
}

/** POST /api/recall/:id/answer. `result` has the shape of a course answer; `recall.question` is the next question. */
@Serializable
data class RecallAnswer(val result: AnswerResult, val schedule: Schedule? = null, val streak: Streak, val recall: Recall) {
    /** When the subtopic comes back. Null for a question that is new in a course. */
    @Serializable
    data class Schedule(val days: Int = 0, val label: String)
}

/** POST /api/recall/:id/skip, /api/recall/more and /api/recall/skip-day */
@Serializable
data class RecallUpdate(val streak: Streak, val recall: Recall)

/** GET and PUT /api/settings */
@Serializable
data class Settings(
    val dailyGoal: Int,
    val shortAnswers: Boolean,
    val timeZone: String,
    val goals: List<Int> = emptyList(),
    /** The learner's courses, newest first, each with whether it feeds daily recall. Empty from an older Worker. */
    val recallCourses: List<RecallCourse> = emptyList(),
) {
    /** `detail` is shown as it is: "25 ideas to recall", "Nothing to recall yet". `course` draws the building. */
    @Serializable
    data class RecallCourse(val id: String, val title: String, val included: Boolean = true, val detail: String = "", val course: CourseSummary? = null)
}
