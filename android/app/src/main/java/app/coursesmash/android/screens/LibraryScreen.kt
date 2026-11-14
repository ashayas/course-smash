package app.coursesmash.android.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Catalog
import app.coursesmash.android.CatalogCourse
import app.coursesmash.android.CatalogCourseDetail
import app.coursesmash.android.Created
import app.coursesmash.android.Route
import app.coursesmash.android.Section
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.Chip
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.Field
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.TextArea
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.panel
import app.coursesmash.android.ui.plural
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The library: ready-made courses, searched and filtered by the Worker. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LibraryScreen(model: AppModel) {
    var tracks by remember { mutableStateOf(emptyList<Catalog.Track>()) }
    var shown by remember { mutableStateOf<List<CatalogCourse>?>(null) }
    var search by remember { mutableStateOf("") }
    var track by remember { mutableStateOf(model.libraryTrack) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(search, track) {
        // Wait for a pause in typing before asking the Worker.
        if (shown != null) delay(250)
        try {
            val catalog = if (search.isEmpty() && track.isEmpty()) model.loadCatalog() else model.api.get<Catalog>("/api/catalog", mapOf("q" to search, "track" to track))
            tracks = catalog.trackList
            shown = catalog.courses
            error = null
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            if (shown == null) error = messageOf(failure)
        }
    }

    val courses = shown
    Page {
        if (error != null) {
            item("error") { ErrorText(error!!, Modifier.padding(top = 20.dp)) }
        } else if (courses == null) {
            item("opening") { WorkingPanel(model, "Opening the library") }
        } else {
            item("head") {
                PageHead("Library", note = "Short courses on AI engineering, infrastructure, security, identity, robotics and AI policy. Each module has a bank of questions, so follow-ups target exactly what you missed.")
            }
            item("tools") {
                Column(Modifier.padding(bottom = 44.dp).fillMaxWidth().panel().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Field(
                        search, { search = it }, label = "Search the library", placeholder = "Search by topic, like KV cache or HPA", pill = true, tag = "library-search",
                        keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (item in listOf(Catalog.Track("", "All tracks")) + tracks) Chip(item.title, { track = item.id }, on = item.id == track)
                    }
                    T(plural(courses.size, "course"), TypeStyle.Body, Modifier.testTag("library-count"), color = Theme.Muted)
                }
            }
            items(courses, key = { it.id }) { course ->
                Column(Modifier.padding(bottom = Theme.Gap)) { LibraryCard(model, course) }
            }
        }
    }
}

/** One library course: what it covers, and a place to say what you want out of it before starting. */
@Composable
fun LibraryCourseScreen(model: AppModel, id: String) {
    var course by remember { mutableStateOf<CatalogCourseDetail?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var goal by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var starting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current

    LaunchedEffect(id) {
        try {
            course = model.api.get("/api/catalog/$id")
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
                // The new course replaces this page, so going back lands on the library.
                model.back()
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
                    PillButton("Back to the library", { model.show(Section.Library) }, kind = Pill.Quiet)
                }
            }
        } else if (detail == null) {
            item("opening") { WorkingPanel(model, "Opening the course") }
        } else {
            item("head") {
                PageHead(detail.title, eyebrow = "${detail.trackTitle} · ${detail.level}", note = detail.summary) {
                    LinkButton("Back to the library", { model.show(Section.Library, detail.track) })
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
        }
    }
}
