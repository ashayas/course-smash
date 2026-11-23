package app.coursesmash.android.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Route
import app.coursesmash.android.Settings
import app.coursesmash.android.art.art
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.Chip
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.LocalStill
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.card
import app.coursesmash.android.ui.lift
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.plural
import app.coursesmash.android.ui.tag
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** You: the streak, the way to Stats, the recall settings, and Log out as the last thing on the screen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun YouScreen(model: AppModel) {
    var settings by remember { mutableStateOf<Settings?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var choosingGoal by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val links = LocalUriHandler.current
    val streak = model.recall.streak
    val list = rememberLazyListState()

    LaunchedEffect(Unit) {
        try {
            settings = model.api.settings()
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: Exception) {
            error = messageOf(failure)
        }
    }

    // From Today's "Choose courses": once the settings are in, bring the courses card to the top.
    LaunchedEffect(settings != null, model.showRecallCourses) {
        if (settings == null || !model.showRecallCourses) return@LaunchedEffect
        model.showRecallCourses = false
        list.animateScrollToItem(recallCoursesIndex(streak != null))
    }

    fun save(dailyGoal: Int? = null, shortAnswers: Boolean? = null, recallCourses: Map<String, Boolean>? = null) {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            try {
                settings = model.api.saveSettings(dailyGoal, shortAnswers, recallCourses)
                choosingGoal = false
            } catch (failure: Exception) {
                error = messageOf(failure)
            }
            saving = false
        }
    }

    Page(list, footer = false) {
        item("head") {
            Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                T("You", TypeStyle.PageTitle, Modifier.weight(1f).testTag("you-title"), heading = true)
                T(model.session.session?.username.orEmpty(), TypeStyle.Small, color = Theme.Muted, maxLines = 1)
            }
        }
        if (streak != null) item("streak") { StreakCard(streak, Modifier.padding(bottom = Theme.Gap)) }
        item("stats") {
            val source = remember { MutableInteractionSource() }
            Row(
                Modifier.tag("open-stats").lift(source, 2.dp).clickable(source, indication = null, role = Role.Button) { model.open(Route.Stats) }
                    .card(18.dp).heightIn(min = 26.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T("Stats", TypeStyle.Small, Modifier.weight(1f))
                T("›", TypeStyle.Body, color = Theme.Muted)
            }
        }
        item("settings") {
            CardColumn(Modifier.padding(top = Theme.Gap), padding = 18.dp) {
                val current = settings
                if (current == null) {
                    T(if (error == null) "Loading your settings..." else "Your settings didn't load.", TypeStyle.Small, color = Theme.Muted)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        SettingRow("Daily goal", Modifier.tag("daily-goal").clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Button) { choosingGoal = !choosingGoal }) {
                            T(plural(current.dailyGoal, "question"), TypeStyle.Small, Modifier.testTag("daily-goal-value"), color = Theme.Muted, underline = true)
                        }
                        if (choosingGoal) {
                            FlowRow(Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                for (goal in current.goals) Chip(goal.toString(), { save(dailyGoal = goal) }, on = goal == current.dailyGoal, tag = "goal-$goal")
                            }
                        }
                        SettingRow(
                            "Short answers in recall",
                            Modifier.tag("short-answers")
                                .toggleable(current.shortAnswers, remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { save(shortAnswers = it) }
                                .semantics { stateDescription = if (current.shortAnswers) "On" else "Off" },
                        ) { Switch(current.shortAnswers) }
                        SettingRow("Time zone") { T(current.timeZone, TypeStyle.Small, Modifier.testTag("time-zone"), color = Theme.Muted, maxLines = 1) }
                    }
                }
            }
        }
        val courses = settings?.recallCourses.orEmpty()
        if (courses.isNotEmpty()) {
            // Keep recallCoursesIndex in step with the items above this one.
            item("recall-courses") {
                CardColumn(Modifier.padding(top = Theme.Gap).testTag("recall-courses"), padding = 18.dp) {
                    T("Courses in daily recall", TypeStyle.CardTitle, Modifier.padding(bottom = 6.dp), heading = true)
                    T("Daily recall draws from the courses you leave on. You can still recall any course from its page.", TypeStyle.Small, Modifier.padding(bottom = 12.dp), color = Theme.Muted)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (entry in courses) {
                            Row(
                                Modifier.tag("recall-course").fillMaxWidth().heightIn(min = 52.dp)
                                    .toggleable(entry.included, remember { MutableInteractionSource() }, indication = null, enabled = !saving, role = Role.Switch) {
                                        save(recallCourses = mapOf(entry.id to it))
                                    }
                                    .semantics { stateDescription = if (entry.included) "On" else "Off" },
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                entry.course?.let { Thumb(model, model.city.building(it.art)) }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                    T(plain(entry.title), TypeStyle(15, FontWeight.Medium))
                                    if (entry.detail.isNotEmpty()) T(entry.detail, TypeStyle.Caption, color = Theme.Muted)
                                }
                                Switch(entry.included, colour = Theme.Green)
                            }
                        }
                    }
                }
            }
        }
        error?.let { item("error") { ErrorText(it, Modifier.padding(top = Theme.Gap)) } }
        item("links") {
            Column(Modifier.fillMaxWidth().padding(top = 20.dp, start = 4.dp, end = 4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    LinkButton("Privacy", { links.openUri("https://coursesmash.app/privacy") }, tag = "privacy")
                    LinkButton("Support", { links.openUri("https://coursesmash.app/support") }, tag = "support")
                }
                LinkButton("Log out", { model.signOut() }, tag = "log-out")
            }
        }
    }
}

@Composable
private fun SettingRow(label: String, modifier: Modifier = Modifier, value: @Composable () -> Unit) {
    Row(modifier.fillMaxWidth().heightIn(min = 44.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        T(label, TypeStyle.Small, Modifier.weight(1f))
        value()
    }
}

/** Where the courses card is in You's list: after the heading, the streak when there is one, Stats and the settings. */
private fun recallCoursesIndex(hasStreak: Boolean) = if (hasStreak) 4 else 3

/**
 * An on or off switch drawn by the app: an ink track that turns yellow, like a window with its light on.
 * The courses in daily recall use green, the kit's colour for what is done and kept.
 */
@Composable
private fun Switch(on: Boolean, colour: Color = Theme.Yellow) {
    val still = LocalStill.current
    val target = if (on) 22.dp else 0.dp
    val shift by animateDpAsState(target, Theme.spring(), label = "switch")
    Box(Modifier.size(52.dp, 30.dp).background(if (on) colour else Theme.Ink, CircleShape).padding(4.dp)) {
        Box(Modifier.offset(x = if (still) target else shift).size(22.dp).background(if (on) Theme.Ink else Theme.Muted, CircleShape))
    }
}
