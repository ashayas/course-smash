package app.coursesmash.android.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Route
import app.coursesmash.android.Section
import app.coursesmash.android.art.Art
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.tag

/** The signed-in app: the header on top and the current screen under it. */
@Composable
fun Shell(model: AppModel) {
    BackHandler(enabled = model.path.isNotEmpty()) { model.back() }
    Column(Modifier.fillMaxSize().background(Theme.Ink)) {
        HeaderBar(model)
        when (val top = model.path.lastOrNull()) {
            is Route.Course -> key(top) { CourseScreen(model, top.id) }
            is Route.LibraryCourse -> key(top) { LibraryCourseScreen(model, top.id) }
            null -> key(model.section) {
                when (model.section) {
                    Section.Courses -> HomeScreen(model)
                    Section.Library -> LibraryScreen(model)
                    Section.Stats -> StatsScreen(model)
                }
            }
        }
    }
}

/** The logo mark, the three sections and the log out pill. */
@Composable
private fun HeaderBar(model: AppModel) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.padding(end = 4.dp)
                .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Button) { model.show(Section.Courses) }
                .semantics { contentDescription = "Course Smash home" },
        ) {
            Art(model.city, model.city.mark, Modifier.size(38.dp, 28.dp))
        }
        for (section in Section.entries) {
            val current = model.path.isEmpty() && model.section == section
            Box(
                Modifier.tag("nav-${section.name.lowercase()}")
                    .clip(CircleShape)
                    .background(if (current) Theme.Surface else Color.Transparent)
                    .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { model.show(section) }
                    .semantics { selected = current }
                    .heightIn(min = 44.dp)
                    .padding(horizontal = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                T(section.title, TypeStyle.Button, color = if (current) Theme.Paper else Theme.Muted, maxLines = 1)
            }
        }
        Spacer(Modifier.weight(1f))
        PillButton("Log out", { model.signOut() }, kind = Pill.Quiet, minHeight = 44.dp, padding = 16.dp, tag = "log-out")
    }
}
