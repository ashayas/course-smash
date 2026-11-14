package app.coursesmash.android.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.coursesmash.android.AdvanceResult
import app.coursesmash.android.AnswerResult
import app.coursesmash.android.ApiClient
import app.coursesmash.android.ApiException
import app.coursesmash.android.CourseDetail
import app.coursesmash.android.Icon
import app.coursesmash.android.Okay
import app.coursesmash.android.messageOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.coroutines.coroutineContext

sealed interface Stage {
    data object Opening : Stage

    /** The agent is planning, writing questions or reading answers. */
    data object Working : Stage

    /** The agent failed. The learner decides whether to try again. */
    data class AgentError(val message: String) : Stage
    data object Asking : Stage
    data class Result(val result: AnswerResult) : Stage
    data object Complete : Stage
    data class Fatal(val message: String) : Stage
}

/** One course on screen. Mirrors `syncCourse` in the web app: show the course, and run the agent whenever it has work to do. */
class CourseModel(val id: String, private val api: ApiClient, private val scope: CoroutineScope) {
    var view by mutableStateOf<CourseDetail?>(null)
        private set
    var stage by mutableStateOf<Stage>(Stage.Opening)
        private set
    var checking by mutableStateOf(false)
        private set
    var answerError by mutableStateOf<String?>(null)
        private set
    var selected by mutableStateOf<Int?>(null)
    var shortAnswer by mutableStateOf("")

    private var retried = false
    private var job: Job? = null

    fun start() {
        job?.cancel()
        job = scope.launch {
            try {
                sync()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                stage = Stage.Fatal(messageOf(failure))
            }
        }
    }

    fun retry() {
        retried = true
        start()
    }

    private suspend fun sync() {
        // The course on screen only changes together with its stage, so a new question never shows under an old verdict.
        var next: CourseDetail = api.get("/api/courses/$id")
        while (next.needsAgent) {
            coroutineContext.ensureActive()
            view = next
            val error = next.error
            if (error != null && !next.agentBusy && !retried) {
                // Show the failure and wait for the learner, rather than spending tokens in a loop.
                stage = Stage.AgentError(error)
                return
            }
            stage = Stage.Working
            retried = false
            val result: AdvanceResult = api.send("POST", "/api/courses/$id/advance")
            if (result.status == "busy") delay(2500)
            next = api.get("/api/courses/$id")
        }
        coroutineContext.ensureActive()
        view = next
        stage = when {
            next.status == "complete" -> Stage.Complete
            next.currentQuestion != null -> {
                selected = null
                shortAnswer = ""
                answerError = null
                Stage.Asking
            }
            else -> Stage.Fatal(ApiException.GENERIC)
        }
    }

    fun submit() {
        val question = view?.currentQuestion ?: return
        if (checking) return
        val response = if (question.options != null) {
            selected?.toString() ?: run { answerError = "Pick one of the options."; return }
        } else {
            shortAnswer.takeIf { it.isNotBlank() } ?: run { answerError = "Write an answer first."; return }
        }
        checking = true
        answerError = null
        scope.launch {
            try {
                val result: AnswerResult = api.send("POST", "/api/questions/${question.id}/answer", buildJsonObject { put("response", response) }.toString())
                stage = Stage.Result(result)
            } catch (failure: Exception) {
                answerError = messageOf(failure)
            }
            checking = false
        }
    }

    fun setIcon(icon: Icon) {
        view = view?.copy(icon = icon)
    }

    suspend fun delete() {
        api.send<Okay>("DELETE", "/api/courses/$id")
    }

    val workingTitle: String
        get() {
            val course = view
            return if (course == null || course.modules.isEmpty()) "Planning your course" else if (course.roundQuestions.isEmpty()) "Writing your questions" else "Reading your answers"
        }

    val workingDetail: String
        get() {
            val course = view
            return if (course == null || course.modules.isEmpty()) "This usually takes under a minute. You can leave and come back."
            else if (course.roundQuestions.isEmpty()) "Using what I know about you so far."
            else "Deciding whether to follow up or move on, then writing what's next."
        }
}
