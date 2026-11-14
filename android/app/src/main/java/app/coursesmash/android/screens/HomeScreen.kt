package app.coursesmash.android.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Catalog
import app.coursesmash.android.CourseList
import app.coursesmash.android.CourseSummary
import app.coursesmash.android.Created
import app.coursesmash.android.Route
import app.coursesmash.android.Section
import app.coursesmash.android.art.SvgDocument
import app.coursesmash.android.art.SvgView
import app.coursesmash.android.art.art
import app.coursesmash.android.art.rememberArt
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.Chip
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.TextArea
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.card
import app.coursesmash.android.ui.panel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Home: say what you want to learn, see your city, and pick a course back up. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen(model: AppModel) {
    var prompt by remember { mutableStateOf("") }
    var ideas by remember { mutableStateOf(emptyList<String>()) }
    var error by remember { mutableStateOf<String?>(null) }
    var starting by remember { mutableStateOf(false) }
    var courses by remember { mutableStateOf<List<CourseSummary>?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()
    val composer = remember { FocusRequester() }
    val focus = LocalFocusManager.current

    LaunchedEffect(Unit) {
        launch { runCatching { model.loadConfig() }.onSuccess { ideas = it.ideas } }
        launch { runCatching { model.loadCatalog() }.onSuccess { catalog = it } } // the library is optional on the home page
        try {
            courses = model.api.get<CourseList>("/api/courses").courses
        } catch (failure: Exception) {
            loadError = messageOf(failure)
        }
    }

    fun build() {
        if (starting) return
        error = null
        starting = true
        focus.clearFocus()
        scope.launch {
            try {
                val created: Created = model.api.send("POST", "/api/courses", buildJsonObject { put("prompt", prompt) }.toString())
                prompt = ""
                model.open(Route.Course(created.id))
            } catch (failure: Exception) {
                error = messageOf(failure)
            }
            starting = false
        }
    }

    Page(list) {
        item("hero") {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Theme.PanelRadius)).panel().padding(24.dp)) {
                T("Course Smash", TypeStyle.Hero, heading = true)
                T("Say what you want to learn. I'll build a course of questions, read how you answer, and change what comes next.", TypeStyle.Lead, Modifier.padding(top = 28.dp, bottom = 12.dp))
                T("Every course goes up as a building in your city, one floor per module. Pass a module and its floor lights up.", TypeStyle.Small, Modifier.padding(bottom = 24.dp), color = Theme.Muted)

                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    TextArea(prompt, { prompt = it }, "I want to understand... so that I can...", label = "What do you want to learn?", limit = 2000, modifier = Modifier.focusRequester(composer), tag = "prompt")
                    if (ideas.isNotEmpty()) {
                        FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (idea in ideas) Chip(idea, { prompt = "I want to learn $idea."; composer.requestFocus() })
                        }
                    }
                    error?.let { ErrorText(it) }
                    PillButton(if (starting) "Starting..." else "Build my course", ::build, enabled = !starting, fullWidth = true, tag = "build-course")
                }

                val shown = courses.orEmpty()
                val city = rememberArt(model.city, model.city.city(shown.map { it.art }))
                SvgView(
                    city ?: SvgDocument.Empty,
                    Modifier.padding(top = 8.dp).fillMaxWidth().aspectRatio(city?.aspectRatio ?: 1.5f).testTag("city")
                        .semantics { contentDescription = "Your courses as buildings in a small isometric city" },
                    floats = true,
                    onTapLot = { lot ->
                        val course = lot.toIntOrNull()?.let(shown::getOrNull)
                        if (course != null) model.open(Route.Course(course.id)) else scope.launch {
                            list.animateScrollToItem(0)
                            composer.requestFocus()
                        }
                    },
                )
            }
        }

        item("courses-head") {
            SectionHead("Your courses", "Pick up where you left off. Every answer you give shapes the next set of questions.", Modifier.padding(top = 64.dp))
        }
        val mine = courses
        when {
            loadError != null && mine == null -> item("courses-error") { ErrorText(loadError!!) }
            mine == null -> item("courses-loading") { T("Loading your courses...", TypeStyle.Body, color = Theme.Muted) }
            mine.isEmpty() -> item("courses-empty") {
                T("Nothing here yet. Your first building starts with one sentence.", TypeStyle.Body, Modifier.card(44.dp), color = Theme.Muted, align = TextAlign.Center)
            }
            else -> items(mine, key = { "course-${it.id}" }) { course ->
                Column(Modifier.padding(bottom = Theme.Gap)) { CourseCard(model, course) }
            }
        }

        val library = catalog
        if (library != null && library.courses.isNotEmpty()) {
            item("library-head") {
                SectionHead(
                    "Library",
                    "${library.courses.size} ready-made courses with a question bank behind each module. Start one and it adapts to you like any other.",
                    Modifier.padding(top = 48.dp),
                ) {
                    PillButton("Browse the library", { model.show(Section.Library) }, kind = Pill.Quiet, tag = "browse-library")
                }
            }
            for (track in library.trackList) {
                val inTrack = library.courses.filter { it.track == track.id }
                if (inTrack.isEmpty()) continue
                item("track-${track.id}") {
                    Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        T(track.title, TypeStyle.TitleLarge, Modifier.weight(1f), heading = true)
                        LinkButton("All ${inTrack.size}", { model.show(Section.Library, track.id) })
                    }
                }
                items(inTrack.take(3), key = { "library-${it.id}" }) { course ->
                    Column(Modifier.padding(bottom = Theme.Gap)) { LibraryCard(model, course) }
                }
                item("track-end-${track.id}") { Gap(48) }
            }
        }
    }
}
