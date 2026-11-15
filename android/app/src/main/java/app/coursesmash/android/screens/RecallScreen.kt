package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Recall
import app.coursesmash.android.RecallAnswer
import app.coursesmash.android.RecallQuestion
import app.coursesmash.android.Route
import app.coursesmash.android.Streak
import app.coursesmash.android.art.art
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.plain

/** A recall session, over the whole screen: one question at a time, its verdict, then the finished screen. */
@Composable
fun ColumnScope.RecallScreen(model: AppModel) {
    val recall = model.recall
    val set = recall.recall
    val streak = recall.streak
    val question = recall.question
    val verdict = recall.verdict
    val announcer = LocalView.current
    LaunchedEffect(question?.id) { if (question != null) announcer.announceForAccessibility("Question ${question.number}.") }

    if (set == null || streak == null) {
        // Only reachable if the learner signed out mid-session.
        LaunchedEffect(Unit) { recall.close() }
        return
    }
    if (question == null) RecallDone(model, set, streak) else RecallQuestionScreen(model, set, question, verdict)
}

@Composable
private fun ColumnScope.RecallQuestionScreen(model: AppModel, set: Recall, question: RecallQuestion, verdict: RecallAnswer?) {
    val recall = model.recall
    val focus = LocalFocusManager.current
    val list = rememberLazyListState()
    LaunchedEffect(question.id, verdict != null) {
        // A new question starts at its top. A verdict comes into view under it: whole when it fits, from its title when it is long.
        if (verdict == null) list.scrollToItem(0) else list.animateScrollToItem(1)
    }

    Row(
        Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundControl("Close recall", { recall.close() }, tag = "recall-close") { drawCross(it) }
        Pips(set.marks, current = if (verdict == null) question.number - 1 else null)
        T("${question.number} of ${set.total}", TypeStyle.Small, Modifier.testTag("recall-count"), color = Theme.Muted, maxLines = 1)
    }
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth().background(Theme.Ink),
        state = list,
        contentPadding = PaddingValues(start = Theme.Gutter, end = Theme.Gutter, top = 10.dp, bottom = 16.dp),
    ) {
        item("question") { RecallQuestionBody(model, question, verdict?.result, onInk = true) }
        if (verdict != null) {
            item("verdict") {
                Box(Modifier.padding(top = 6.dp)) {
                    VerdictBlock(verdict.result, isChoice = question.options != null, grader = null, note = verdict.schedule?.label, tag = "recall-verdict", next = null)
                }
            }
        }
        recall.error?.let { item("error") { ErrorText(it, Modifier.padding(top = 14.dp), tag = "recall-error") } }
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter).padding(top = 6.dp, bottom = 10.dp).heightIn(min = 50.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (verdict == null) {
            // Nothing is recorded for a skipped question, and its subtopic stays due.
            if (!recall.busy) LinkButton("Skip question", { focus.clearFocus(); recall.skipQuestion() }, tag = "recall-skip")
            Box(Modifier.weight(1f))
            PillButton(if (recall.busy) "Checking..." else "Check", { focus.clearFocus(); recall.check() }, enabled = !recall.busy && recall.hasAnswer, tag = "recall-check")
        } else {
            Box(Modifier.weight(1f))
            PillButton(if (set.question == null) "Finish" else "Next", { recall.next() }, tag = "recall-next")
        }
    }
}

/** The set is finished: the day's window lights up, and the course is one button away. */
@Composable
private fun ColumnScope.RecallDone(model: AppModel, set: Recall, streak: Streak) {
    val recall = model.recall
    val next = recall.today?.next
    // Answers don't come back with the course to continue, and recall can change which one that is, so ask again.
    LaunchedEffect(Unit) { recall.refresh() }
    Row(Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter).padding(top = 24.dp, bottom = 6.dp)) { Pips(set.marks, current = null) }
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth().background(Theme.Ink),
        contentPadding = PaddingValues(start = Theme.Gutter, end = Theme.Gutter, top = 14.dp, bottom = 16.dp),
    ) {
        item("head") {
            Column(Modifier.padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                T(if (streak.today.counted) "Day ${streak.current}" else "Recall done", TypeStyle.PageTitle, Modifier.testTag("recall-done"), heading = true)
                T(set.lead, TypeStyle.Small, color = Theme.Muted)
                T(streak.label, TypeStyle.Small, color = Theme.Muted)
            }
        }
        item("week") { WeekStrip(streak, Modifier.padding(bottom = 20.dp)) }
        if (set.comingBack.isNotEmpty()) {
            item("coming-back") {
                CardColumn(Modifier.testTag("coming-back"), padding = 18.dp) {
                    T("Coming back", TypeStyle.Small, Modifier.padding(bottom = 12.dp), color = Theme.Muted, heading = true)
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (item in set.comingBack) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                T(item.concept, TypeStyle.Small, Modifier.weight(1f))
                                T(item.`when`, TypeStyle.Small, color = Theme.Muted, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
        recall.error?.let { item("error") { ErrorText(it, Modifier.padding(top = 14.dp), tag = "recall-error") } }
    }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Theme.Gutter).padding(top = 6.dp, bottom = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (next != null) {
            SourceRow(model, model.city.building(next.course.art), plain(next.course.name), next.detail, onInk = true)
            PillButton("Continue your course", { recall.close(); model.open(Route.Course(next.course.id)) }, fullWidth = true, tag = "recall-continue")
        }
        if (set.moreAvailable) {
            PillButton(if (recall.busy) "Adding..." else "5 more questions", { recall.more() }, kind = Pill.Quiet, enabled = !recall.busy, fullWidth = true, tag = "recall-more")
        }
        LinkButton("Done", { recall.close() }, tag = "recall-finish")
    }
}
