package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.coursesmash.android.Streak
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.plural

/** A day's window: yellow when the day was done, blue for a rest day, unlit otherwise. */
private fun windowColour(state: String): Color = when (state) {
    "done" -> Theme.Yellow
    "rest" -> Theme.Blue
    else -> Theme.Unlit
}

private fun described(days: List<Streak.Day>): String =
    "${plural(days.count { it.state == "done" }, "day")} done, ${plural(days.count { it.state == "rest" }, "rest day")}"

/**
 * The streak in the corner of Today, City, Library and the screens opened from them: a lit window and the number of days.
 * A tap opens the streak in a sheet over the screen, so a course or a half-written answer stays where it is.
 */
@Composable
fun StreakChip(streak: Streak) {
    var open by remember { mutableStateOf(false) }
    val days = if (streak.current == 1) "1 day in a row" else "${streak.current} days in a row"
    Box(
        Modifier.testTag("streak-chip").heightIn(min = 48.dp).widthIn(min = 48.dp)
            .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Button) { open = true }
            .clearAndSetSemantics { contentDescription = "$days. Open your streak."; role = Role.Button; onClick { open = true; true } },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.background(Theme.Surface, CircleShape).padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(12.dp).background(Theme.Yellow, RoundedCornerShape(3.dp)))
            T(streak.current.toString(), TypeStyle(15, FontWeight.SemiBold), maxLines = 1)
        }
    }
    if (open) StreakSheet(streak) { open = false }
}

/** The streak card from You in a sheet, presented like the building picker. System back and a tap above it close it. */
@Composable
private fun StreakSheet(streak: Streak, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // The space above the sheet closes it too.
        Box(
            // Plain tap handlers, not buttons: the sheet's title and "Close" stay separate things for a screen reader.
            Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { onClose() } },
            contentAlignment = Alignment.BottomCenter,
        ) {
            Column(
                Modifier.fillMaxWidth()
                    .background(Theme.Surface, RoundedCornerShape(topStart = Theme.PanelRadius, topEnd = Theme.PanelRadius))
                    // Taps on the sheet itself stay on the sheet.
                    .pointerInput(Unit) { detectTapGestures { } }
                    .verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    T("Your streak", TypeStyle.TitleLarge, Modifier.weight(1f).testTag("streak-sheet"), heading = true)
                    LinkButton("Close", onClose, tag = "streak-close")
                }
                // The card is the sheet's own colour, so it reads as the sheet's content. It needs no padding of its own here.
                StreakCard(streak, padding = 0.dp)
                // What is left to do today, until the day has counted.
                if (!streak.today.counted) T(streak.label, TypeStyle.Small, Modifier.padding(top = 8.dp).testTag("streak-sheet-label"), color = Theme.Muted)
            }
        }
    }
}

/** This week as seven windows, Monday first. Today's letter is paper and the rest are muted. */
@Composable
fun WeekStrip(streak: Streak, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().testTag("week-strip").clearAndSetSemantics { contentDescription = "This week: ${described(streak.week)}" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        streak.week.forEachIndexed { index, day ->
            val now = day.state == "today" || day.day == streak.day
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.fillMaxWidth().aspectRatio(1f).background(windowColour(day.state), RoundedCornerShape(10.dp)))
                T("MTWTFSS".getOrElse(index) { ' ' }.toString(), TypeStyle(12, FontWeight.Medium), color = if (now) Theme.Paper else Theme.Muted)
            }
        }
    }
}

/** The streak card on You and on Stats: the number, the longest run, rest days saved and the last four weeks. */
@Composable
fun StreakCard(streak: Streak, modifier: Modifier = Modifier, padding: Dp = 18.dp) {
    CardColumn(modifier.testTag("streak-card"), padding = padding) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                T(streak.current.toString(), TypeStyle(44, FontWeight.SemiBold, -0.04f, 1.02f), Modifier.testTag("streak-current"))
                T(if (streak.current == 1) "day in a row" else "days in a row", TypeStyle.Small, color = Theme.Muted)
            }
            Column(horizontalAlignment = Alignment.End) {
                T("Longest ${streak.longest}", TypeStyle.Small, color = Theme.Muted, align = TextAlign.End)
                streak.restLabel?.let { T(it, TypeStyle.Small, color = Theme.Muted, align = TextAlign.End) }
            }
        }
        if (streak.calendar.isNotEmpty()) {
            T("The last 4 weeks", TypeStyle.Small, Modifier.padding(top = 14.dp, bottom = 10.dp), color = Theme.Muted)
            Column(
                Modifier.clearAndSetSemantics { contentDescription = "The last 4 weeks: ${described(streak.calendar)}" },
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                for (week in streak.calendar.chunked(7)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        for (day in week) Box(Modifier.weight(1f).aspectRatio(1f).background(windowColour(day.state), RoundedCornerShape(6.dp)))
                        // A short last row keeps its windows the same size.
                        repeat(7 - week.size) { Box(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

/**
 * One pip per question in today's set: green, orange or yellow by verdict, muted when skipped,
 * paper for the question on screen and unlit for the ones still to come.
 */
@Composable
fun RowScope.Pips(marks: List<String>, current: Int?) {
    val done = marks.count { it != "open" }
    Row(
        Modifier.weight(1f).testTag("recall-pips").clearAndSetSemantics { contentDescription = "$done of ${marks.size} done" },
        horizontalArrangement = Arrangement.spacedBy(if (marks.size > 15) 3.dp else 5.dp),
    ) {
        marks.forEachIndexed { index, mark ->
            val colour = when (mark) {
                "correct" -> Theme.Green
                "incorrect" -> Theme.Orange
                "partial" -> Theme.Yellow
                "skipped" -> Theme.Muted
                else -> if (index == current) Theme.Paper else Theme.Unlit
            }
            Box(Modifier.weight(1f).height(8.dp).background(colour, RoundedCornerShape(4.dp)))
        }
    }
}
