package app.coursesmash.android.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.coursesmash.android.AnswerResult
import app.coursesmash.android.AppModel
import app.coursesmash.android.CourseDetail
import app.coursesmash.android.Question
import app.coursesmash.android.Section
import app.coursesmash.android.art.Art
import app.coursesmash.android.art.SvgDocument
import app.coursesmash.android.art.SvgView
import app.coursesmash.android.art.art
import app.coursesmash.android.art.rememberArt
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.CardColumn
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.FigureView
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.LocalInk
import app.coursesmash.android.ui.LocalStill
import app.coursesmash.android.ui.Meter
import app.coursesmash.android.ui.OnColour
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.RichText
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.TextArea
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.inset
import app.coursesmash.android.ui.panel
import app.coursesmash.android.ui.percent
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.tag
import kotlinx.coroutines.launch

/** A course: its building, the current question, and how the learner is doing. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CourseScreen(app: AppModel, id: String) {
    val scope = rememberCoroutineScope()
    val model = remember(id) { CourseModel(id, app.api, scope) }
    var picking by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()
    val announcer = LocalView.current

    LaunchedEffect(model) { model.start() }
    LaunchedEffect(model.stage) {
        // A new question starts at its top, as focus moves there on the web.
        when (model.stage) {
            Stage.Asking -> { list.animateScrollToItem(1); announcer.announceForAccessibility("New question ready.") }
            Stage.Complete -> announcer.announceForAccessibility("Course finished.")
            else -> {}
        }
    }

    val view = model.view
    val stage = model.stage
    Page(list) {
        if (view == null) {
            item("opening") {
                if (stage is Stage.Fatal) Fatal(app, model, stage.message, Modifier.padding(top = 20.dp)) else WorkingPanel(app, "Opening your course")
            }
            return@Page
        }
        item("head") {
            Column(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(84.dp, 100.dp).background(Theme.Surface, RoundedCornerShape(Theme.CardRadius)).padding(8.dp)) {
                        Art(app.city, app.city.building(view.art), Modifier.fillMaxWidth().aspectRatio(68f / 84f).clearAndSetSemantics {})
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        T(plain(view.name), TypeStyle.PageTitle, Modifier.testTag("course-title"), heading = true)
                        view.summary?.let { T(plain(it), TypeStyle.Body, color = Theme.Muted) }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (view.modules.isNotEmpty()) PillButton("Change building", { picking = true }, kind = Pill.Quiet, tag = "change-building")
                    LinkButton("Delete course", { confirmingDelete = true }, tag = "delete-course")
                }
                deleteError?.let { ErrorText(it) }
            }
        }
        item("stage") {
            if (stage == Stage.Complete) FinishedPanel(app, view) else {
                Column(Modifier.fillMaxWidth().panel().heightIn(min = 480.dp).padding(22.dp)) {
                    when (stage) {
                        Stage.Opening, Stage.Working -> WorkingView(app, model.workingTitle, model.workingDetail)
                        is Stage.AgentError -> Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                            ErrorText(stage.message)
                            PillButton("Try again", { model.retry() }, tag = "try-again")
                        }
                        is Stage.Fatal -> Fatal(app, model, stage.message)
                        Stage.Asking -> view.currentQuestion?.let { QuestionView(view, it, null, model) }
                        is Stage.Result -> view.currentQuestion?.let { QuestionView(view, it, stage.result, model) }
                        Stage.Complete -> {}
                    }
                }
            }
        }
        item("side") { SidePanels(view) }
    }

    if (picking) BuildingPicker(app, view ?: return, onClose = { picking = false }, onSaved = model::setIcon)
    if (confirmingDelete && view != null) {
        Dialog(onDismissRequest = { confirmingDelete = false }) {
            Column(Modifier.panel(Theme.CardRadius).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                T("Delete \"${plain(view.name)}\" and all its answers?", TypeStyle.Body)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    PillButton("Delete", {
                        confirmingDelete = false
                        scope.launch {
                            try {
                                model.delete()
                                app.show(Section.Courses)
                            } catch (failure: Exception) {
                                deleteError = messageOf(failure)
                            }
                        }
                    }, tag = "confirm-delete")
                    PillButton("Cancel", { confirmingDelete = false }, kind = Pill.Ink)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Fatal(app: AppModel, model: CourseModel, message: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(24.dp)) {
        ErrorText(message)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            PillButton("Try again", { model.start() })
            PillButton("Back to courses", { app.show(Section.Courses) }, kind = Pill.Quiet)
        }
    }
}

/** The question, the learner's answer, and the verdict once it is graded. */
@Composable
private fun QuestionView(view: CourseDetail, question: Question, result: AnswerResult?, model: CourseModel) {
    val focus = LocalFocusManager.current
    val index = view.roundQuestions.indexOfFirst { it.id == question.id }.coerceAtLeast(0) + 1
    val module = view.modules.firstOrNull { it.status == "active" }?.title.orEmpty()
    Column {
        T("${plain(module)} · ${if (view.round > 1) "Follow-up" else "Question"} $index of ${view.roundQuestions.size}", TypeStyle.Small, Modifier.padding(bottom = 18.dp), color = Theme.Muted)
        question.why?.takeIf { it.isNotEmpty() }?.let {
            RichText(it, TypeStyle.Small, Modifier.padding(bottom = 22.dp).fillMaxWidth().inset().padding(horizontal = 18.dp, vertical = 14.dp))
        }
        RichText(question.prompt, TypeStyle.Question, Modifier.padding(bottom = 28.dp).testTag("question"), heading = true)
        question.figure?.let { FigureView(it, question.figureAlt, Modifier.padding(bottom = 28.dp)) }

        val options = question.options
        if (options != null) {
            Column(Modifier.padding(bottom = if (result == null) 0.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                options.forEachIndexed { at, option ->
                    val state = when {
                        result != null && at == result.correctIndex -> OptionState.Correct
                        result != null && at == model.selected -> OptionState.Wrong
                        result != null -> OptionState.Locked
                        at == model.selected -> OptionState.Selected
                        else -> OptionState.Open
                    }
                    OptionRow(at, option, state) { if (result == null) model.selected = at }
                }
            }
        } else if (result != null) {
            T(result.response, TypeStyle.Body, Modifier.padding(bottom = 20.dp).fillMaxWidth().inset().padding(horizontal = 20.dp, vertical = 16.dp))
        } else {
            TextArea(model.shortAnswer, { model.shortAnswer = it }, "Answer in your own words, in a sentence or three.", label = "Your answer", limit = 4000, tag = "short-answer")
        }

        if (result != null) {
            VerdictBlock(result, isChoice = options != null, grader = view.models.grader) { model.start() }
        } else {
            model.answerError?.let { ErrorText(it, Modifier.padding(top = 16.dp), tag = "answer-error") }
            PillButton(if (model.checking) "Checking..." else "Check my answer", { focus.clearFocus(); model.submit() }, Modifier.padding(top = 24.dp), enabled = !model.checking, tag = "check-answer")
        }
    }
}

private enum class OptionState { Open, Selected, Correct, Wrong, Locked }

@Composable
private fun OptionRow(index: Int, text: String, state: OptionState, choose: () -> Unit) {
    val onColour = state == OptionState.Selected || state == OptionState.Correct || state == OptionState.Wrong
    val background = when (state) {
        OptionState.Selected -> Theme.Blue
        OptionState.Correct -> Theme.Green
        OptionState.Wrong -> Theme.Orange
        else -> Theme.Ink
    }
    Row(
        Modifier.tag("option-$index").fillMaxWidth().background(background, RoundedCornerShape(Theme.InsetRadius))
            .clickable(remember { MutableInteractionSource() }, indication = null, enabled = state == OptionState.Open || state == OptionState.Selected, role = Role.RadioButton, onClick = choose)
            .semantics {
                selected = state == OptionState.Selected
                if (state == OptionState.Correct) stateDescription = "Correct answer" else if (state == OptionState.Wrong) stateDescription = "Your answer, wrong"
            }
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(28.dp).background(if (onColour) Theme.Ink else Theme.Surface, RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
            T("ABCD".getOrElse(index) { 'D' }.toString(), TypeStyle(15, FontWeight.SemiBold), color = Theme.Paper)
        }
        RichText(text, TypeStyle.Body, Modifier.weight(1f), color = if (onColour) Theme.Ink else Theme.Paper)
    }
}

/** The one full-colour block on the screen: what the grader decided, and why. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VerdictBlock(result: AnswerResult, isChoice: Boolean, grader: String, next: () -> Unit) {
    var going by remember { mutableStateOf(false) }
    val links = LocalUriHandler.current
    val still = LocalStill.current
    val intoView = remember { BringIntoViewRequester() }
    val pop = remember { Animatable(if (still) 1f else 0f) }
    LaunchedEffect(Unit) {
        launch { pop.animateTo(1f, Theme.spring()) }
        // The verdict comes into view, as focus brings it there on the web.
        intoView.bringIntoView()
    }
    val title = when (result.verdict) { "correct" -> "You got it"; "partial" -> "Part of the way there"; else -> "Not quite" }
    val colour = when (result.verdict) { "correct" -> Theme.Green; "partial" -> Theme.Yellow; else -> Theme.Orange }
    // Only https links are shown, labelled with their host.
    val source = result.sourceUrl?.takeIf { it.startsWith("https://") }?.let { url ->
        runCatching { java.net.URI(url).host }.getOrNull()?.let { url to it.removePrefix("www.") }
    }
    OnColour {
        Column(
            Modifier.padding(top = 8.dp).bringIntoViewRequester(intoView)
                .graphicsLayer { val s = 0.96f + 0.04f * pop.value; scaleX = s; scaleY = s; alpha = pop.value.coerceIn(0f, 1f) }
                .fillMaxWidth().background(colour, RoundedCornerShape(Theme.CardRadius)).padding(26.dp),
        ) {
            T(title, TypeStyle.TitleLarge, Modifier.padding(bottom = 10.dp).testTag("verdict"), heading = true)
            RichText(result.feedback, TypeStyle.Body)
            val reference = result.reference
            if (result.verdict != "correct" && !isChoice && reference != null) {
                RichText(reference, TypeStyle.Small, Modifier.padding(top = 14.dp).fillMaxWidth().background(Theme.Ink, RoundedCornerShape(18.dp)).padding(horizontal = 18.dp, vertical = 14.dp), color = Theme.Paper)
            }
            if (source != null) {
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    T("Source:", TypeStyle.Small)
                    LinkButton(source.second, { links.openUri(source.first) }, color = LocalInk.current)
                }
            }
            result.confidence?.let { T("Graded by $grader, ${Math.round(it * 100)}% sure.", TypeStyle.Small, Modifier.padding(top = 10.dp)) }
            PillButton("Keep going", { going = true; next() }, Modifier.padding(top = 18.dp), kind = Pill.Ink, enabled = !going, tag = "keep-going")
        }
    }
}

/** The finished course: the kit's pink panel with the fully lit building. */
@Composable
private fun FinishedPanel(app: AppModel, view: CourseDetail) {
    val strongest = view.mastery.maxByOrNull { it.mastery }
    val weakest = view.mastery.minByOrNull { it.mastery }
    OnColour {
        Column(Modifier.fillMaxWidth().background(Theme.Pink, RoundedCornerShape(Theme.PanelRadius)).padding(26.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                T("You did it", TypeStyle.Section, Modifier.testTag("finished"), heading = true)
                if (strongest != null) {
                    T("You're strongest on ${strongest.concept}." + if (weakest != null && weakest.mastery < 0.7) " Come back to ${weakest.concept} when you can." else "", TypeStyle.Body)
                }
                PillButton("Build another course", { app.show(Section.Courses) }, Modifier.padding(top = 10.dp), kind = Pill.Ink)
            }
            val scene = rememberArt(app.city, app.city.finished(view.art))
            Box(Modifier.widthIn(max = 220.dp).fillMaxWidth().background(Theme.Ink, RoundedCornerShape(Theme.CardRadius)).padding(10.dp)) {
                SvgView(scene ?: SvgDocument.Empty, Modifier.fillMaxWidth().aspectRatio(scene?.aspectRatio ?: 1f).semantics { contentDescription = "Your building with every floor lit" })
            }
        }
    }
}

/** Modules, mastery by concept, and what the agent has done so far. */
@Composable
private fun SidePanels(view: CourseDetail) {
    Column(Modifier.padding(top = Theme.Gap), verticalArrangement = Arrangement.spacedBy(Theme.Gap)) {
        if (view.modules.isNotEmpty()) {
            CardColumn {
                T("Modules", TypeStyle.TitleSmall, Modifier.padding(bottom = 16.dp), heading = true)
                for (module in view.modules) {
                    val state = when (module.status) { "passed" -> "Done"; "active" -> "${module.answered} answered"; else -> "Up next" }
                    ModuleRow(module.title, state + (module.masteryTarget?.let { " · bar ${Math.round(it * 100)}%" } ?: ""), module.status)
                }
            }
        }
        if (view.mastery.isNotEmpty()) {
            CardColumn {
                T("What you know", TypeStyle.TitleSmall, Modifier.padding(bottom = 16.dp), heading = true)
                for (item in view.mastery) {
                    Meter(item.concept, percent(item.mastery), maxOf(item.mastery, 0.03), Theme.score(item.mastery), Modifier.padding(bottom = 14.dp))
                }
            }
        }
        if (view.events.isNotEmpty()) {
            CardColumn {
                T("What the agent did", TypeStyle.TitleSmall, Modifier.padding(bottom = 16.dp), heading = true)
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    view.events.take(6).forEachIndexed { index, event ->
                        T(plain(event.message), TypeStyle.Small, color = if (index == 0) Theme.Paper else Theme.Muted)
                    }
                }
            }
        }
    }
}
