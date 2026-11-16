package app.coursesmash.android.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Catalog
import app.coursesmash.android.CatalogCourse
import app.coursesmash.android.CatalogCourseDetail
import app.coursesmash.android.CourseMisses
import app.coursesmash.android.Created
import app.coursesmash.android.Route
import app.coursesmash.android.Tab
import app.coursesmash.android.SimilarCourses
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.Chip
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.Field
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Meter
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.TextArea
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.panel
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.plural
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.max
import kotlin.math.roundToInt

/** The library: ready-made courses, by track or by topic, searched by the Worker. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LibraryScreen(model: AppModel) {
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    // Ids of the courses that match the search. Null while nothing is typed, which means all of them.
    var matching by remember { mutableStateOf<Set<String>?>(null) }
    var search by remember { mutableStateOf("") }
    var track by remember { mutableStateOf(model.libraryTrack) }
    // Tracks are how the library was written. Topics are clusters by meaning, across tracks.
    var byTopic by remember { mutableStateOf(false) }
    var topic by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            val loaded = model.loadCatalog()
            // With topics, the library opens by topic, unless a track was asked for.
            byTopic = loaded.topics.isNotEmpty() && track.isEmpty()
            catalog = loaded
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: Exception) {
            error = messageOf(failure)
        }
    }
    LaunchedEffect(search) {
        // The search runs on the Worker, so every client matches the same way.
        if (search.isBlank()) { matching = null; return@LaunchedEffect }
        delay(250) // wait for a pause in typing
        try {
            matching = model.api.get<Catalog>("/api/catalog", mapOf("q" to search)).courses.map { it.id }.toSet()
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: Exception) {
            // Keep what is on screen. The next keystroke asks again.
        }
    }

    val data = catalog
    Page {
        if (error != null) {
            item("error") { ErrorText(error!!, Modifier.padding(top = 20.dp)) }
        } else if (data == null) {
            item("opening") { WorkingPanel(model, "Opening the library") }
        } else {
            val byId = data.courses.associateBy { it.id }
            val matches = { course: CatalogCourse -> matching?.contains(course.id) ?: true }
            // A topic's courses in study order, so each one follows the courses it builds on.
            val inTopic = { item: Catalog.Topic -> item.courseIds.mapNotNull(byId::get).filter(matches) }
            val chosen = data.topics.firstOrNull { it.id == topic }
            val shown = when {
                !byTopic -> data.courses.filter { (track.isEmpty() || it.track == track) && matches(it) }
                chosen != null -> inTopic(chosen)
                else -> data.topics.flatMap(inTopic)
            }
            val after = { course: CatalogCourse -> course.requires.mapNotNull { byId[it]?.title } }

            item("head") {
                PageHead("Library", note = "Short courses on AI engineering, infrastructure, systems design, security, identity, robotics and AI policy. Each module has a bank of questions, so follow-ups target exactly what you missed.")
            }
            item("tools") {
                Column(Modifier.padding(bottom = 44.dp).fillMaxWidth().panel().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Field(
                        search, { search = it }, label = "Search the library", placeholder = "Search by topic, like KV cache or HPA", pill = true, tag = "library-search",
                        keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
                    )
                    if (data.topics.isNotEmpty()) {
                        FlowRow(Modifier.semantics { contentDescription = "Group the library" }, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Chip("By track", { byTopic = false }, on = !byTopic, tag = "group-track")
                            Chip("By topic", { byTopic = true }, on = byTopic, tag = "group-topic")
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (byTopic) {
                            Chip("All topics", { topic = 0 }, on = topic == 0)
                            for (item in data.topics) Chip("${item.name} · ${item.courses}", { topic = item.id }, on = item.id == topic)
                        } else {
                            for (item in listOf(Catalog.Track("", "All tracks")) + data.trackList) Chip(item.title, { track = item.id }, on = item.id == track)
                        }
                    }
                    val about = if (byTopic) chosen?.summary else null
                    T(plural(shown.size, "course") + (about?.let { ". $it" } ?: ""), TypeStyle.Body, Modifier.testTag("library-count"), color = Theme.Muted)
                }
            }
            if (byTopic && chosen == null) {
                // Every topic as its own learning path.
                for (item in data.topics) {
                    val list = inTopic(item)
                    if (list.isEmpty()) continue
                    item("topic-${item.id}") {
                        Column(Modifier.padding(bottom = 20.dp).testTag("topic-head"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            T(item.name, TypeStyle.TitleLarge, heading = true)
                            T(item.summary, TypeStyle.Small, color = Theme.Muted)
                            LinkButton("Path of ${list.size}", { topic = item.id }, tag = "topic-path")
                        }
                    }
                    libraryCards(model, list, "topic-${item.id}", after)
                    item("topic-end-${item.id}") { Gap(48) }
                }
            } else {
                libraryCards(model, shown, "all", if (byTopic) after else { _ -> emptyList() })
            }
        }
    }
}

private fun LazyListScope.libraryCards(model: AppModel, courses: List<CatalogCourse>, group: String, after: (CatalogCourse) -> List<String>) {
    items(courses, key = { "$group-${it.id}" }) { course ->
        Column(Modifier.padding(bottom = Theme.Gap)) { LibraryCard(model, course, after(course)) }
    }
}

/** One library course: what it covers, where it sits on its learning path, and a place to say what you want out of it. */
@Composable
fun LibraryCourseScreen(model: AppModel, id: String) {
    var course by remember { mutableStateOf<CatalogCourseDetail?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var goal by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var starting by remember { mutableStateOf(false) }
    var similar by remember { mutableStateOf<SimilarCourses?>(null) }
    var misses by remember { mutableStateOf<CourseMisses?>(null) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current

    LaunchedEffect(id) {
        // Similar courses and where learners slip are optional: the page is complete without them.
        launch { similar = runCatching { model.api.get<SimilarCourses>("/api/catalog/$id/similar") }.getOrNull() }
        launch { misses = runCatching { model.api.get<CourseMisses>("/api/catalog/$id/misses") }.getOrNull() }
        try {
            course = model.api.get("/api/catalog/$id")
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: Exception) {
            loadError = messageOf(failure)
        }
    }

    fun start() {
        if (starting) return
        starting = true
        error = null
        focus.clearFocus()
        scope.launch {
            try {
                val created: Created = model.api.send("POST", "/api/catalog/$id/start", buildJsonObject { put("goal", goal) }.toString())
                // The new course replaces the library pages, so going back lands on the library.
                model.path.clear()
                model.open(Route.Course(created.id))
            } catch (failure: Exception) {
                error = messageOf(failure)
                starting = false
            }
        }
    }

    val detail = course
    Page {
        if (loadError != null) {
            item("error") {
                Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    ErrorText(loadError!!)
                    PillButton("Back to the library", { model.show(Tab.Library) }, kind = Pill.Quiet)
                }
            }
        } else if (detail == null) {
            item("opening") { WorkingPanel(model, "Opening the course") }
        } else {
            item("head") {
                PageHead(detail.title, eyebrow = listOfNotNull(detail.trackTitle, detail.topic, detail.level).joinToString(" · "), note = detail.summary) {
                    LinkButton("Back to the library", { model.show(Tab.Library, detail.track) })
                }
            }
            item("start") {
                Column(Modifier.fillMaxWidth().panel().padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    T("Make it yours", TypeStyle.TitleLarge, heading = true)
                    TextArea(goal, { goal = it }, "Optional: what you want out of it, like \"I'm on call for our GPU cluster\". It sets how well you need to know each module.", label = "What you want out of this course", limit = 1000)
                    error?.let { ErrorText(it) }
                    PillButton(if (starting) "Starting..." else "Start this course", ::start, enabled = !starting, fullWidth = true, tag = "start-course")
                }
            }
            item("modules") {
                CardColumn(Modifier.padding(top = Theme.Gap)) {
                    T("Modules", TypeStyle.TitleSmall, Modifier.padding(bottom = 16.dp), heading = true)
                    for (module in detail.modules) ModuleRow(module.title, module.concepts.joinToString(" · "), "locked")
                }
            }
            val slips = misses
            if (slips != null && slips.concepts.isNotEmpty()) {
                item("slips") {
                    // The subtopics and the question learners miss most in this course.
                    CardColumn(Modifier.padding(top = Theme.Gap)) {
                        T("Where learners slip", TypeStyle.TitleSmall, Modifier.padding(bottom = 16.dp).testTag("slips"), heading = true)
                        T("Missed most often. Follow-ups pick questions close to the ones you get wrong.", TypeStyle.Small, Modifier.padding(bottom = 14.dp), color = Theme.Muted)
                        for (item in slips.concepts) {
                            val percent = (item.missRate * 100).roundToInt()
                            Meter(item.concept, "$percent% missed", max(percent, 3) / 100.0, Theme.Orange, Modifier.padding(bottom = 14.dp))
                        }
                        slips.questions.firstOrNull()?.let { T("Hardest question: “${plain(it.prompt)}”", TypeStyle.Small, color = Theme.Muted) }
                    }
                }
            }
            path(model, "Take these first", "This course builds on them. Skip any you already know.", detail.prerequisites, "path-prerequisites")
            path(model, "Leads to", "Courses that build on this one.", detail.leadsTo, "path-leads-to")
            val near = similar
            if (near != null) {
                // Courses already on the path above are not repeated here.
                val onPath = (detail.prerequisites + detail.leadsTo).map { it.id }.toSet()
                val others = near.courses.filter { it.id !in onPath }
                if (near.pending || others.isNotEmpty()) {
                    path(
                        model, "Similar courses",
                        if (near.pending) "Still reading this course. Courses that cover similar ground will show here in a few minutes." else "Courses that cover similar ground, closest first, from any track.",
                        others, "similar-courses", evenIfEmpty = true,
                    )
                }
            }
        }
    }
}

/** A titled run of library cards on a course's page. */
private fun LazyListScope.path(model: AppModel, title: String, lead: String, courses: List<CatalogCourse>, tag: String, evenIfEmpty: Boolean = false) {
    if (courses.isEmpty() && !evenIfEmpty) return
    item(tag) { SectionHead(title, lead, Modifier.padding(top = 64.dp).testTag(tag)) }
    libraryCards(model, courses, tag) { emptyList() }
}
