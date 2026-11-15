package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AnswerResult
import app.coursesmash.android.AppModel
import app.coursesmash.android.RecallQuestion
import app.coursesmash.android.Route
import app.coursesmash.android.Streak
import app.coursesmash.android.Tab
import app.coursesmash.android.Today
import app.coursesmash.android.art.ArtProgress
import app.coursesmash.android.art.art
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.FigureView
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.RichText
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.TextArea
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.inset
import app.coursesmash.android.ui.plain
import kotlinx.coroutines.launch

/** Today: the first recall question, live, or what the day looks like once recall is done, skipped or not started yet. */
@Composable
fun TodayScreen(model: AppModel) {
    val recall = model.recall
    val today = recall.today
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current

    Page {
        if (today == null) {
            item("opening") {
                val failure = recall.loadError
                if (failure == null) WorkingPanel(model, "Getting today ready") else {
                    Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        ErrorText(failure)
                        PillButton("Try again", { scope.launch { recall.refresh() } }, tag = "try-again")
                    }
                }
            }
            return@Page
        }
        val set = today.recall
        val streak = today.streak
        val question = set.question
        if (set.status == "ready" && question != null) {
            item("head") { TodayHead("Daily recall", set.lead) }
            item("question") {
                CardColumn(padding = 18.dp) {
                    RecallQuestionBody(model, question, result = null, onInk = false)
                    recall.error?.let { ErrorText(it, Modifier.padding(top = 14.dp), tag = "recall-error") }
                    if (recall.hasAnswer) {
                        PillButton(if (recall.busy) "Checking..." else "Check", { focus.clearFocus(); recall.check() }, Modifier.padding(top = 16.dp), enabled = !recall.busy, tag = "recall-check")
                    }
                }
            }
            item("under") {
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    LinkButton("Skip for today", { recall.skipDay(true) }, Modifier.weight(1f), tag = "skip-today")
                    T("${question.number} of ${set.total}", TypeStyle.Small, Modifier.testTag("recall-count"), color = Theme.Muted)
                }
            }
            today.next?.let { next ->
                item("then") {
                    // What follows recall, so the whole visit is in view.
                    SourceRow(model, model.city.building(next.course.art), "Then: ${plain(next.course.name)}", next.detail, onInk = true, Modifier.padding(top = 18.dp).testTag("then-course"))
                }
            }
            return@Page
        }

        val empty = set.status == "empty"
        item("head") {
            val rest = streak.restLabel?.let { " $it." }.orEmpty()
            TodayHead("Today", if (empty) streak.label else set.lead + rest) {
                if (set.status == "skipped") LinkButton("Do it anyway", { recall.skipDay(false) }, tag = "do-it-anyway")
                recall.error?.let { ErrorText(it, tag = "recall-error") }
            }
        }
        item("week") { WeekStrip(streak, Modifier.padding(bottom = 20.dp)) }
        today.next?.let { next ->
            item("continue") {
                ContinueCard(model, next, progress = streak.today.takeIf { empty }, more = set.status == "done" && set.moreAvailable)
            }
        }
        today.upNext?.let { item("up-next") { Column(Modifier.padding(top = Theme.Gap)) { UpNextCard(model, it) } } }
        if (empty) {
            item("soon") {
                CardColumn(Modifier.padding(top = Theme.Gap).testTag("recall-soon"), padding = 18.dp) {
                    T("Recall starts soon", TypeStyle.CardTitle, Modifier.padding(bottom = 8.dp), heading = true)
                    T(set.lead, TypeStyle.Small, color = Theme.Muted)
                }
            }
            if (today.next == null) {
                item("first") {
                    CardColumn(Modifier.padding(top = Theme.Gap, bottom = Theme.Gap).testTag("first-course"), padding = 18.dp) {
                        T("Start your first course", TypeStyle.CardTitle, Modifier.padding(bottom = 14.dp), heading = true)
                        PillButton("Plan a course", { model.show(Tab.City) }, tag = "plan-course")
                    }
                }
                items(today.picks, key = { "pick-${it.id}" }) { course ->
                    Column(Modifier.padding(bottom = Theme.Gap)) { LibraryCard(model, course) }
                }
            }
        }
    }
}

@Composable
private fun TodayHead(title: String, lead: String, extra: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T(title, TypeStyle.PageTitle, Modifier.testTag("today-title"), heading = true)
        T(lead, TypeStyle.Small, Modifier.testTag("today-lead"), color = Theme.Muted)
        extra()
    }
}

/** A building's thumbnail with a title and a muted line under it: where a question is from, or the course that comes next. */
@Composable
fun SourceRow(model: AppModel, art: String?, title: String, detail: String, onInk: Boolean, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (art != null) Thumb(model, art, onInk = onInk)
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            T(title, TypeStyle(15, FontWeight.Medium))
            if (detail.isNotEmpty()) T(detail, TypeStyle.Caption, color = Theme.Muted)
        }
    }
}

/**
 * A recall question: where it is from, why it is here, the prompt, and the options or a text box.
 * With a `result` the options are marked and the short answer is shown as it was sent.
 */
@Composable
fun RecallQuestionBody(model: AppModel, question: RecallQuestion, result: AnswerResult?, onInk: Boolean) {
    val recall = model.recall
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val course = question.course
        SourceRow(model, course?.let { model.city.building(it.art) }, plain(course?.name ?: question.concept), question.detail, onInk)
        question.why?.takeIf { it.isNotEmpty() }?.let { RichText(it, TypeStyle.Small, color = Theme.Muted) }
        RichText(question.prompt, TypeStyle.RecallQuestion, Modifier.testTag("recall-question"), heading = true)
        question.figure?.let { FigureView(it, question.figureAlt) }

        val options = question.options
        if (options != null) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                options.forEachIndexed { at, option ->
                    val state = when {
                        result != null && at == result.correctIndex -> OptionState.Correct
                        result != null && at == recall.selected -> OptionState.Wrong
                        result != null -> OptionState.Locked
                        at == recall.selected -> OptionState.Selected
                        else -> OptionState.Open
                    }
                    OptionRow(at, option, state, tag = "recall-option-$at", small = true, onInk = onInk) { if (result == null && !recall.busy) recall.selected = at }
                }
            }
        } else if (result != null) {
            T(result.response, TypeStyle.Small, Modifier.fillMaxWidth().background(if (onInk) Theme.Surface else Theme.Ink, androidx.compose.foundation.shape.RoundedCornerShape(Theme.InsetRadius)).padding(horizontal = 16.dp, vertical = 14.dp))
        } else {
            TextArea(recall.shortAnswer, { recall.shortAnswer = it }, "Answer in your own words, in a sentence or three.", label = "Your answer", limit = 4000, tag = "recall-short-answer", onInk = onInk)
        }
    }
}

/** The course to carry on with. `progress` adds the bar toward today's count, and `more` the button for five more recall questions. */
@Composable
private fun ContinueCard(model: AppModel, next: Today.ContinueCard, progress: Streak.Progress?, more: Boolean) {
    val recall = model.recall
    CardColumn(Modifier.testTag("continue-card"), padding = 18.dp) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(model, model.city.building(next.course.art), large = true)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                T("Continue", TypeStyle.Small, color = Theme.Muted)
                T(plain(next.course.name), TypeStyle.CardTitle, heading = true)
                T(next.detail, TypeStyle.Small, color = Theme.Muted)
            }
        }
        if (progress != null) {
            val fraction = if (progress.needed > 0) (progress.answered.toFloat() / progress.needed).coerceIn(0f, 1f) else 0f
            Box(Modifier.padding(top = 14.dp).fillMaxWidth().height(8.dp).background(Theme.Ink, CircleShape).clearAndSetSemantics {}) {
                if (fraction > 0f) Box(Modifier.fillMaxWidth(fraction).height(8.dp).background(Theme.Yellow, CircleShape))
            }
            T("${progress.answered} of ${progress.needed} today", TypeStyle.Small, Modifier.padding(top = 8.dp).testTag("today-progress"), color = Theme.Muted)
        }
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PillButton("Continue", { model.open(Route.Course(next.course.id)) }, Modifier.weight(1f), fullWidth = true, tag = "continue-course")
            if (more) PillButton(if (recall.busy) "Adding..." else "5 more recall", { recall.more() }, kind = Pill.Ink, enabled = !recall.busy, padding = 20.dp, tag = "today-more")
        }
    }
}

/** The library course that follows the one in progress, with its building unlit. It opens that course's library page. */
@Composable
private fun UpNextCard(model: AppModel, next: Today.UpNext) {
    TapCard({ model.open(Route.LibraryCourse(next.course.id)) }, tag = "up-next") {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(model, model.city.building(next.course.art, ArtProgress(floors = next.course.modules, lit = 0)), large = true)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                T("Up next", TypeStyle.Small, color = Theme.Muted)
                T(next.course.title, TypeStyle.CardTitle, heading = true)
                T(next.detail, TypeStyle.Small, color = Theme.Muted)
            }
        }
    }
}
