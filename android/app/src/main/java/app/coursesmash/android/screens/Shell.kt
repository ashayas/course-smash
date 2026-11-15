package app.coursesmash.android.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Route
import app.coursesmash.android.Tab
import app.coursesmash.android.art.Art
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.tag

/** The signed-in app: the current screen with the tab bar under it, or a recall session over the whole screen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Shell(model: AppModel) {
    val recall = model.recall
    // Back leaves a session or a pushed screen first, then goes to Today. From Today it leaves the app.
    BackHandler(enabled = recall.inSession || model.path.isNotEmpty() || model.tab != Tab.Today) {
        when {
            recall.inSession -> recall.close()
            model.path.isNotEmpty() -> model.back()
            else -> model.show(Tab.Today)
        }
    }
    // Today and the streak chip catch up whenever the learner moves, since course answers count toward the day.
    LaunchedEffect(model.tab, model.path.size, recall.inSession) {
        if (!recall.inSession) recall.refresh()
    }

    Column(Modifier.fillMaxSize().background(Theme.Ink)) {
        if (recall.inSession) {
            RecallScreen(model)
            return@Column
        }
        val top = model.path.lastOrNull()
        TopBar(model, pushed = top != null)
        Box(Modifier.weight(1f)) {
            when (top) {
                is Route.Course -> key(top) { CourseScreen(model, top.id) }
                is Route.LibraryCourse -> key(top) { LibraryCourseScreen(model, top.id) }
                Route.Stats -> StatsScreen(model)
                null -> key(model.tab) {
                    when (model.tab) {
                        Tab.Today -> TodayScreen(model)
                        Tab.City -> HomeScreen(model)
                        Tab.Library -> LibraryScreen(model)
                        Tab.You -> YouScreen(model)
                    }
                }
            }
        }
        // The bar steps aside for the keyboard, so the field being typed in keeps the room.
        if (!WindowInsets.isImeVisible) TabBar(model)
    }
}

/** The logo mark and the streak on a tab, or the way back on a screen opened from one. You has its own heading instead. */
@Composable
private fun TopBar(model: AppModel, pushed: Boolean) {
    if (!pushed && model.tab == Tab.You) return
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter, vertical = 6.dp).heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (pushed) {
            RoundControl("Back", { model.back() }, tag = "back") { drawChevron(it) }
        } else {
            Art(model.city, model.city.mark, Modifier.size(38.dp, 28.dp).clearAndSetSemantics {})
            Spacer(Modifier.weight(1f))
            model.recall.streak?.takeIf { it.current > 0 }?.let { StreakChip(it) }
        }
    }
}

/** A round control on the surface colour with a drawn glyph: back, or close. */
@Composable
fun RoundControl(label: String, onClick: () -> Unit, tag: String? = null, glyph: DrawScope.(Color) -> Unit) {
    Box(
        Modifier.tag(tag).size(44.dp)
            .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(36.dp).background(Theme.Surface, CircleShape)) { glyph(Theme.Paper) }
    }
}

private fun DrawScope.drawChevron(colour: Color) {
    val w = size.width
    val path = Path().apply { moveTo(w * 0.56f, w * 0.32f); lineTo(w * 0.40f, w * 0.5f); lineTo(w * 0.56f, w * 0.68f) }
    drawPath(path, colour, style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
}

fun DrawScope.drawCross(colour: Color) {
    val w = size.width
    drawLine(colour, Offset(w * 0.36f, w * 0.36f), Offset(w * 0.64f, w * 0.64f), 2.dp.toPx(), StrokeCap.Round)
    drawLine(colour, Offset(w * 0.64f, w * 0.36f), Offset(w * 0.36f, w * 0.64f), 2.dp.toPx(), StrokeCap.Round)
}

/** Today, City, Library and You. The selected tab has a surface pill behind it and paper text. */
@Composable
private fun TabBar(model: AppModel) {
    Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (tab in Tab.entries) {
            val current = model.tab == tab
            val colour = if (current) Theme.Paper else Theme.Muted
            Column(
                Modifier.weight(1f).tag("tab-${tab.name.lowercase()}")
                    .background(if (current) Theme.Surface else Color.Transparent, RoundedCornerShape(20.dp))
                    .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { model.show(tab) }
                    .semantics(mergeDescendants = true) { selected = current }
                    .padding(top = 9.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Canvas(Modifier.size(22.dp)) { drawTabIcon(tab, colour, current) }
                T(tab.title, TypeStyle(12, FontWeight.Medium, 0f), color = colour, maxLines = 1)
            }
        }
    }
}

/** The tab icons from the mockups, on a 22 unit grid: four windows, a skyline, shelves and a person. */
private fun DrawScope.drawTabIcon(tab: Tab, colour: Color, current: Boolean) {
    val u = size.width / 22f
    fun block(x: Float, y: Float, w: Float, h: Float, r: Float, fill: Color = colour) =
        drawRoundRect(fill, Offset(x * u, y * u), Size(w * u, h * u), CornerRadius(r * u))
    when (tab) {
        Tab.Today -> {
            // Today's window is lit when the tab is the current one.
            block(3f, 3f, 7f, 7f, 2f, if (current) Theme.Yellow else colour)
            block(12f, 3f, 7f, 7f, 2f)
            block(3f, 12f, 7f, 7f, 2f)
            block(12f, 12f, 7f, 7f, 2f)
        }
        Tab.City -> {
            block(2f, 10f, 5f, 9f, 1f)
            block(8.5f, 3f, 5f, 16f, 1f)
            block(15f, 7f, 5f, 12f, 1f)
        }
        Tab.Library -> {
            block(3f, 3.5f, 16f, 4f, 1.5f)
            block(3f, 9f, 16f, 4f, 1.5f)
            block(3f, 14.5f, 16f, 4f, 1.5f)
        }
        Tab.You -> {
            drawCircle(colour, 4 * u, Offset(11 * u, 7 * u))
            drawPath(Path().apply {
                moveTo(3 * u, 19 * u)
                cubicTo(3 * u, 15 * u, 6.6f * u, 13 * u, 11 * u, 13 * u)
                cubicTo(15.4f * u, 13 * u, 19 * u, 15 * u, 19 * u, 19 * u)
                close()
            }, colour)
        }
    }
}
