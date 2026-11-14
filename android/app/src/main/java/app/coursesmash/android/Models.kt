package app.coursesmash.android

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
) {
    val name: String get() = title ?: prompt
}

@Serializable
data class CourseList(val courses: List<CourseSummary>)

/** GET /api/catalog */
@Serializable
data class Catalog(val trackList: List<Track>, val courses: List<CatalogCourse>) {
    /** Tracks come as a list so they keep the order the library shows them in. */
    @Serializable
    data class Track(val id: String, val title: String)
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
    val modules: List<Module>,
) {
    @Serializable
    data class Module(val title: String, val concepts: List<String> = emptyList())
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
data class Stats(val totals: Totals, val days: List<Day>, val courses: List<Course>, val chartMax: Int) {
    @Serializable
    data class Totals(
        val courses: Int, val finished: Int, val modulesPassed: Int, val answered: Int, val correct: Int, val partial: Int,
        val incorrect: Int, val average: Double? = null, val activeDays: Int, val streak: Int,
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
