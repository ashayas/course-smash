package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.CatalogCourse
import app.coursesmash.android.CourseSummary
import app.coursesmash.android.art.Art
import app.coursesmash.android.art.ArtProgress
import app.coursesmash.android.art.art
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.card
import app.coursesmash.android.ui.inset
import app.coursesmash.android.ui.lift
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.tag

/** The scrolling page every screen sits in: ink behind, the phone gutter at the sides, the footer at the end. */
@Composable
fun Page(state: LazyListState = rememberLazyListState(), content: LazyListScope.() -> Unit) {
    LazyColumn(
        state = state,
        modifier = Modifier.fillMaxSize().background(Theme.Ink).imePadding(),
        contentPadding = PaddingValues(horizontal = Theme.Gutter),
    ) {
        content()
        item("footer") { SiteFooter() }
    }
}

@Composable
fun SiteFooter() {
    val links = LocalUriHandler.current
    Column(Modifier.fillMaxWidth().padding(top = 44.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            T("Made by", TypeStyle.Small, color = Theme.Muted)
            LinkButton("Ashaya", { links.openUri("https://x.com/ashaya") }, color = Theme.Paper)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            LinkButton("Privacy", { links.openUri("https://coursesmash.app/privacy") })
            LinkButton("Support", { links.openUri("https://coursesmash.app/support") })
        }
    }
}

/** The loader: floors dropping onto a tower, with what the agent is doing. */
@Composable
fun WorkingView(model: AppModel, title: String, detail: String? = null) {
    Column(
        Modifier.fillMaxWidth().heightIn(min = 400.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Art(model.city, model.city.stack, Modifier.size(150.dp, 139.dp).clearAndSetSemantics {})
        T(title, TypeStyle.TitleLarge, align = TextAlign.Center)
        if (detail != null) T(detail, TypeStyle.Body, color = Theme.Muted, align = TextAlign.Center)
    }
}

/** The loader on its own panel, for a page that is still opening. */
@Composable
fun WorkingPanel(model: AppModel, title: String) {
    Box(Modifier.padding(top = 20.dp).fillMaxWidth().background(Theme.Surface, RoundedCornerShape(Theme.PanelRadius)).padding(22.dp)) {
        WorkingView(model, title)
    }
}

/** A card the learner can tap, which lifts while pressed. */
@Composable
fun TapCard(onClick: () -> Unit, tag: String? = null, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    Column(Modifier.tag(tag).lift(source, 4.dp).clickable(source, indication = null, role = Role.Button, onClick = onClick).card()) { content() }
}

/** The inset behind a card's building. */
@Composable
fun ArtInset(model: AppModel, call: String) {
    Box(
        Modifier.fillMaxWidth().padding(bottom = 16.dp).inset().heightIn(min = 214.dp).padding(12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Art(model.city, call, Modifier.fillMaxWidth().height(190.dp).clearAndSetSemantics {})
    }
}

/** A card for one of the learner's courses. */
@Composable
fun CourseCard(model: AppModel, course: CourseSummary) {
    var status = "The agent is planning this one"
    if (course.status == "complete") status = "Finished" else if (course.modules > 0) status = "${course.passed} of ${course.modules} modules done"
    course.average?.let { status += " · ${Math.round(it * 100)}% so far" }
    TapCard({ model.open(app.coursesmash.android.Route.Course(course.id)) }, tag = "course-card") {
        ArtInset(model, model.city.building(course.art))
        if (course.modules > 0) {
            Row(Modifier.padding(bottom = 14.dp).clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(course.modules) { index ->
                    Box(Modifier.size(22.dp, 10.dp).background(if (index < course.passed) Theme.Yellow else Theme.Ink, RoundedCornerShape(3.dp)))
                }
            }
        }
        T(plain(course.name), TypeStyle.TitleSmall, Modifier.padding(bottom = 8.dp))
        T(status, TypeStyle.Small, color = Theme.Muted)
    }
}

/** A card for a ready-made library course. */
@Composable
fun LibraryCard(model: AppModel, course: CatalogCourse) {
    TapCard({ model.open(app.coursesmash.android.Route.LibraryCourse(course.id)) }, tag = "library-card") {
        ArtInset(model, model.city.building(course.art, ArtProgress(floors = course.modules, lit = 0, ambient = 0.18)))
        T("${course.trackTitle} · ${course.level}", TypeStyle.Small, Modifier.padding(bottom = 6.dp), color = Theme.Muted)
        T(course.title, TypeStyle.TitleSmall, Modifier.padding(bottom = 8.dp))
        T("${course.modules} modules · ${course.questions} questions", TypeStyle.Small, color = Theme.Muted)
    }
}

/** A section's heading with its line of muted copy under it. */
@Composable
fun SectionHead(title: String, note: String, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    Column(modifier.fillMaxWidth().padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(Theme.Gap)) {
        T(title, TypeStyle.Section, heading = true)
        T(note, TypeStyle.Body, color = Theme.Muted)
        trailing()
    }
}

/** A page's title and intro, as `.course-head` on the web. */
@Composable
fun PageHead(title: String, eyebrow: String? = null, note: String? = null, extra: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (eyebrow != null) T(eyebrow, TypeStyle.Small, color = Theme.Muted)
        T(plain(title), TypeStyle.PageTitle, heading = true)
        if (note != null) T(plain(note), TypeStyle.Body, color = Theme.Muted)
        extra()
    }
}

/** A module in a list: a square for locked, yellow for the one in progress, a green dot once passed. */
@Composable
fun ModuleRow(title: String, note: String, status: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier.size(28.dp).background(
                when (status) { "passed" -> Theme.Green; "active" -> Theme.Yellow; else -> Theme.Ink },
                if (status == "passed") CircleShape else RoundedCornerShape(9.dp),
            ),
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(plain(title), TypeStyle.SmallMedium)
            T(note, TypeStyle.Small, color = Theme.Muted)
        }
    }
}

/** Space between stacked cards. */
@Composable
fun Gap(height: Int = 16) = Box(Modifier.width(1.dp).height(height.dp))
