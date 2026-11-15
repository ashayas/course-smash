package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.coursesmash.android.Streak
import app.coursesmash.android.ui.CardColumn
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

/** The streak in the corner of Today, City and Library: a lit window and the number of days. */
@Composable
fun StreakChip(streak: Streak) {
    Row(
        Modifier.testTag("streak-chip").background(Theme.Surface, CircleShape).padding(horizontal = 14.dp, vertical = 8.dp)
            .clearAndSetSemantics { contentDescription = "${streak.current}-day streak" },
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(12.dp).background(Theme.Yellow, RoundedCornerShape(3.dp)))
        T(streak.current.toString(), TypeStyle(15, FontWeight.SemiBold), maxLines = 1)
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
fun StreakCard(streak: Streak, modifier: Modifier = Modifier) {
    CardColumn(modifier.testTag("streak-card"), padding = 18.dp) {
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
