package app.coursesmash.android.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Mastery
import app.coursesmash.android.Route
import app.coursesmash.android.Section
import app.coursesmash.android.Stats
import app.coursesmash.android.art.Art
import app.coursesmash.android.art.art
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Meter
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.card
import app.coursesmash.android.ui.inset
import app.coursesmash.android.ui.lift
import app.coursesmash.android.ui.panel
import app.coursesmash.android.ui.percent
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.plural
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

/** How the learner is doing: totals, the last 30 days, and each course. */
@Composable
fun StatsScreen(model: AppModel) {
    var stats by remember { mutableStateOf<Stats?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            stats = model.api.get("/api/stats")
        } catch (failure: Exception) {
            error = messageOf(failure)
        }
    }

    val data = stats
    Page {
        if (error != null) {
            item("error") { ErrorText(error!!, Modifier.padding(top = 20.dp)) }
        } else if (data == null) {
            item("opening") { WorkingPanel(model, "Counting your answers") }
        } else {
            val t = data.totals
            item("head") { PageHead("Your stats", note = "How you're doing on every course. Scores count partly right answers as half.") }
            item("tiles") {
                Column(verticalArrangement = Arrangement.spacedBy(Theme.Gap)) {
                    Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(Theme.Gap)) {
                        StatTile(t.answered.toString(), "questions answered", if (t.activeDays > 0) "over ${plural(t.activeDays, "day")}" else null, Modifier.weight(1f))
                        StatTile(percent(t.average), "average score", if (t.answered > 0) "${t.correct} right, ${t.partial} partly, ${t.incorrect} wrong" else null, Modifier.weight(1f))
                    }
                    Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(Theme.Gap)) {
                        StatTile(t.modulesPassed.toString(), "modules passed", "${t.finished} of ${plural(t.courses, "course")} finished", Modifier.weight(1f))
                        StatTile(t.streak.toString(), "day streak", if (t.streak > 0) "Answer today to keep it going" else "Answer a question to start one", Modifier.weight(1f))
                    }
                }
            }
            item("activity") { ActivityPanel(data.days, data.chartMax, Modifier.padding(top = Theme.Gap)) }
            item("by-course") {
                SectionHead(
                    "By course",
                    if (data.courses.any { it.answered > 0 }) "Most recently studied first. Open a course to keep going." else "Answer a few questions and your scores show up here.",
                    Modifier.padding(top = 72.dp),
                )
            }
            if (data.courses.isEmpty()) {
                item("empty") {
                    Column(Modifier.card(44.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        T("No courses yet.", TypeStyle.Body, color = Theme.Muted)
                        LinkButton("Start one.", { model.show(Section.Courses) })
                    }
                }
            } else {
                items(data.courses, key = { it.id }) { course ->
                    Column(Modifier.padding(bottom = Theme.Gap)) { StatCourseCard(model, course) }
                }
            }
        }
    }
}

@Composable
private fun StatTile(value: String, title: String, note: String?, modifier: Modifier) {
    Column(modifier.fillMaxHeight().background(Theme.Surface, RoundedCornerShape(Theme.CardRadius)).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T(value, TypeStyle(40, FontWeight.SemiBold, -0.04f, 1f))
        T(title, TypeStyle.Small)
        if (note != null) T(note, TypeStyle.Small, color = Theme.Muted)
    }
}

/** Answers per day for 30 days, stacked by verdict. The same geometry as `activitySvg` in the web app. */
@Composable
private fun ActivityPanel(days: List<Stats.Day>, max: Int, modifier: Modifier) {
    var picked by remember { mutableStateOf<Int?>(null) }
    var chart by remember { mutableStateOf(IntSize.Zero) }
    var tip by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val top = max(max, 1)

    Column(modifier.fillMaxWidth().panel().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        T("Last 30 days", TypeStyle.TitleLarge, heading = true)
        Row(Modifier.clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            for ((colour, label) in listOf(Theme.Green to "Right", Theme.Yellow to "Partly", Theme.Orange to "Wrong")) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).background(colour, RoundedCornerShape(3.dp)))
                    T(label, TypeStyle.Small, color = Theme.Muted)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val answered = days.sumOf { it.answered }
            val summary = if (answered == 0) "No answers" else "${plural(answered, "answer")}: ${days.sumOf { it.correct }} right, ${days.sumOf { it.partial }} partly, ${days.sumOf { it.incorrect }} wrong"
            Box(
                Modifier.fillMaxWidth().height(172.dp).testTag("activity-chart").onSizeChanged { chart = it }
                    .semantics { contentDescription = "Answers per day for the last 30 days. $summary" }
                    .pointerInput(days) {
                        detectTapGestures { at ->
                            val index = (at.x / (size.width / max(days.size, 1).toFloat())).toInt().coerceIn(0, days.size - 1)
                            picked = if (picked == index) null else index
                        }
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    if (days.isEmpty()) return@Canvas
                    val unit = size.height / 172f // the web chart is 172 units tall
                    val base = 170 * unit
                    val gap = 2 * unit
                    val sx = size.width / 900f // and 900 wide, stretched to fit
                    val step = size.width / days.size
                    val bar = max(6 * sx, step - 8 * sx)
                    fun y(value: Double) = ((170 - 12) * unit * value / top).toFloat()
                    for (fraction in listOf(0.5, 1.0)) {
                        val line = base - y(Math.round(top * fraction).toDouble())
                        drawLine(Theme.GridLine, Offset(0f, line), Offset(size.width, line), 1.dp.toPx())
                    }
                    drawLine(Theme.BaseLine, Offset(0f, base), Offset(size.width, base), 1.dp.toPx())
                    days.forEachIndexed { index, day ->
                        val x = index * step + (step - bar) / 2
                        if (index == picked) drawRect(Theme.Paper.copy(alpha = 0.04f), Offset(index * step, 0f), Size(step, size.height))
                        val parts = listOf(day.correct to Theme.Green, day.partial to Theme.Yellow, day.incorrect to Theme.Orange).filter { it.first > 0 }
                        var z = base
                        parts.forEachIndexed { position, (count, colour) ->
                            val isTop = position == parts.lastIndex
                            val height = max(2 * unit, y(count.toDouble()) - if (isTop) 0f else gap)
                            if (isTop) {
                                val rx = 4 * sx
                                val ry = 4 * unit
                                drawPath(Path().apply {
                                    moveTo(x, z); lineTo(x, z - height + ry)
                                    quadraticTo(x, z - height, x + rx, z - height)
                                    lineTo(x + bar - rx, z - height)
                                    quadraticTo(x + bar, z - height, x + bar, z - height + ry)
                                    lineTo(x + bar, z); close()
                                }, colour)
                            } else {
                                drawRect(colour, Offset(x, z - height), Size(bar, height))
                            }
                            z -= height + gap
                        }
                        if (parts.isEmpty()) drawRect(Theme.GridLine, Offset(x, base - 2 * unit), Size(bar, 2 * unit))
                    }
                }
                // Scale labels sit just above their grid lines.
                for (value in listOf(top, top / 2)) {
                    val line = (12 + 158f * (top - value) / top).dp
                    T(value.toString(), TypeStyle.Tiny, Modifier.offset(y = line - 20.dp).clearAndSetSemantics {}, color = Theme.Muted)
                }
                picked?.let(days::getOrNull)?.let { day ->
                    val centre = (picked!! + 0.5f) * chart.width / max(days.size, 1)
                    val left = (centre - tip.width / 2f).coerceIn(0f, max(0f, (chart.width - tip.width).toFloat()))
                    Column(
                        Modifier.offset { IntOffset(left.roundToInt(), -tip.height - with(density) { 8.dp.roundToPx() }) }
                            .onSizeChanged { tip = it }
                            .background(Theme.Paper, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        T(shortDate(day.date), TypeStyle(14, FontWeight.SemiBold), color = Theme.Ink)
                        T(if (day.answered > 0) "${plural(day.answered, "answer")} · ${day.correct} right, ${day.partial} partly, ${day.incorrect} wrong" else "No answers", TypeStyle.Caption, color = Theme.Ink, maxLines = 1)
                    }
                }
            }
            Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, horizontalArrangement = Arrangement.SpaceBetween) {
                T(shortDate(days.firstOrNull()?.date), TypeStyle.Tiny, color = Theme.Muted)
                T("Today", TypeStyle.Tiny, color = Theme.Muted)
            }
        }
    }
}

/** "2026-11-13" as "Nov 13". */
private fun shortDate(iso: String?): String =
    runCatching { LocalDate.parse(iso).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())) }.getOrDefault("")

@Composable
private fun StatCourseCard(model: AppModel, course: Stats.Course) {
    val status = if (course.status == "complete") "Finished" else if (course.modules > 0) "${course.passed} of ${course.modules} modules done" else "Being planned"
    CardColumn {
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            val source = remember { MutableInteractionSource() }
            Row(
                Modifier.testTag("stat-course").fillMaxWidth().lift(source, 2.dp).clickable(source, indication = null, role = Role.Button) { model.open(Route.Course(course.id)) },
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(88.dp, 100.dp).inset(18.dp).padding(6.dp)) {
                    Art(model.city, model.city.building(course.art), Modifier.fillMaxSize().clearAndSetSemantics {})
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(plain(course.name), TypeStyle.TitleSmall)
                    T(status, TypeStyle.Small, color = Theme.Muted)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Number(percent(course.average), "average score", Modifier.weight(1f))
                Number(course.answered.toString(), "answered", Modifier.weight(1f))
                Number(if (course.answered > 0) percent(course.correct.toDouble() / course.answered) else "–", "fully right", Modifier.weight(1f))
            }
            Row(
                Modifier.fillMaxWidth().height(12.dp).clip(CircleShape).background(Theme.Ink)
                    .semantics { contentDescription = "${course.correct} right, ${course.partial} partly right, ${course.incorrect} wrong" },
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                for ((count, colour) in listOf(course.correct to Theme.Green, course.partial to Theme.Yellow, course.incorrect to Theme.Orange)) {
                    if (count > 0) Box(Modifier.weight(count.toFloat()).fillMaxHeight().background(colour))
                }
            }
            course.trendLabel?.let { T(it, TypeStyle.Small, color = Theme.Muted) }
            if (course.moduleStats.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (module in course.moduleStats) {
                        val average = module.average
                        Meter(
                            module.title,
                            if (module.answered > 0) "${percent(average)} · ${module.answered}" else if (module.status == "locked") "Up next" else "Not started",
                            if (average == null) 0.0 else max(0.03, Math.round(average * 100) / 100.0),
                            average?.let(Theme::score),
                            dimLabel = module.status == "locked",
                        )
                    }
                }
            }
            if (course.strongest.isNotEmpty() || course.weakest.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Concepts("Strongest", course.strongest)
                    Concepts("Needs work", course.weakest)
                }
            }
        }
    }
}

@Composable
private fun Number(value: String, label: String, modifier: Modifier) {
    Column(modifier.inset(16.dp).padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        T(value, TypeStyle.TitleSmall)
        T(label, TypeStyle.Caption, color = Theme.Muted, maxLines = 1)
    }
}

@Composable
private fun Concepts(title: String, list: List<Mastery>) {
    if (list.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T(title, TypeStyle.SmallMedium, Modifier.padding(bottom = 2.dp))
        for (item in list) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                T(item.concept, TypeStyle(15), Modifier.weight(1f))
                T(percent(item.mastery), TypeStyle(15), color = Theme.Muted)
            }
        }
    }
}
