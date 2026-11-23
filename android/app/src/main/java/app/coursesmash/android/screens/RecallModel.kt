package app.coursesmash.android.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.coursesmash.android.ApiClient
import app.coursesmash.android.Recall
import app.coursesmash.android.RecallAnswer
import app.coursesmash.android.RecallQuestion
import app.coursesmash.android.RecallUpdate
import app.coursesmash.android.Streak
import app.coursesmash.android.Today
import app.coursesmash.android.messageOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Today: the recall set, the streak, and the course to carry on with. It lives for the whole sign-in,
 * so Today shows what it last knew at once and then catches up with the Worker.
 */
class RecallModel(private val api: ApiClient, private val scope: CoroutineScope) {
    var today by mutableStateOf<Today?>(null)
        private set
    var loadError by mutableStateOf<String?>(null)
        private set

    /** A session covers the screen from the first answer until the learner closes it. */
    var inSession by mutableStateOf(false)
        private set

    /** The verdict on screen, with the question it is for. `today.recall.question` is already the next one. */
    var verdict by mutableStateOf<RecallAnswer?>(null)
        private set
    private var answered by mutableStateOf<RecallQuestion?>(null)

    var selected by mutableStateOf<Int?>(null)
    var shortAnswer by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    /**
     * A "Recall this course" session, from a course or library page: its own set, driven by what the Worker returns.
     * While there is one, the session screen shows it instead of Today's set. Closing it goes back to that page.
     */
    var courseSession by mutableStateOf<RecallUpdate?>(null)
        private set

    /** Goes up with every change made here, so a slower refresh never overwrites a newer answer. */
    private var changes = 0

    val streak: Streak? get() = courseSession?.streak ?: today?.streak

    /** The set on screen: the course session's while there is one, otherwise Today's. */
    val recall: Recall? get() = courseSession?.recall ?: today?.recall

    /** The question on screen: the one just answered while its verdict shows, otherwise the next one. */
    val question: RecallQuestion? get() = if (verdict != null) answered else recall?.question

    /** True once the learner has picked an option or written something, which is when "Check" appears. */
    val hasAnswer: Boolean get() = if (question?.options != null) selected != null else shortAnswer.isNotBlank()

    suspend fun refresh() {
        val before = changes
        try {
            val loaded = api.today()
            if (before != changes) return
            // A new question clears what was picked for the old one. A course session's question is not Today's.
            if (courseSession == null && loaded.recall.question?.id != today?.recall?.question?.id) clearAnswer()
            today = loaded
            loadError = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            if (today == null) loadError = messageOf(failure)
        }
    }

    /** Sends the answer. From Today this is what starts the session. */
    fun check() {
        val question = recall?.question ?: return
        if (busy || verdict != null) return
        val response = if (question.options != null) {
            selected?.toString() ?: run { error = "Pick one of the options."; return }
        } else {
            shortAnswer.takeIf { it.isNotBlank() } ?: run { error = "Write an answer first."; return }
        }
        inSession = true
        change({ api.answerRecall(question.id, response) }) { result ->
            answered = question
            verdict = result
            take(result.streak, result.recall)
        }
    }

    /** On from the verdict to the next question, or to the finished screen when there is none. */
    fun next() {
        verdict = null
        answered = null
        clearAnswer()
    }

    fun skipQuestion() {
        val question = recall?.question ?: return
        if (verdict != null) return
        change({ api.skipRecall(question.id) }) { result ->
            clearAnswer()
            take(result.streak, result.recall)
        }
    }

    /**
     * Starts "Recall this course" and opens its session over the whole screen. A 409 says why there is nothing to ask,
     * and goes to `failed` so the page can show it under its Recall button.
     */
    fun startCourse(courseId: String, failed: (String) -> Unit) {
        if (busy) return
        busy = true
        error = null
        val mine = ++changes
        scope.launch {
            try {
                val result = api.startCourseRecall(courseId)
                if (mine == changes) {
                    next()
                    courseSession = result
                    today = today?.copy(streak = result.streak)
                    inSession = true
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (mine == changes) failed(messageOf(failure))
            } finally {
                if (mine == changes) busy = false
            }
        }
    }

    /** Five more questions, then on with the session. A course session gets five more from its own course. */
    fun more() = change({ api.moreRecall(courseSession?.recall?.session) }) { result ->
        next()
        take(result.streak, result.recall)
        inSession = result.recall.question != null
        if (!inSession) courseSession = null
    }

    fun skipDay(skipped: Boolean) = change({ api.skipRecallDay(skipped) }) { result ->
        clearAnswer()
        take(result.streak, result.recall)
    }

    /**
     * Back to Today, or to the page a course session was started from. Answers so far are kept by the Worker,
     * and the rest of the set waits there.
     */
    fun close() {
        // A result still on its way is for the session being closed, so it is dropped, as on sign-out. The Worker has
        // kept the answer, and Today asks again once the session is gone.
        changes += 1
        busy = false
        next()
        error = null
        inSession = false
        courseSession = null
    }

    fun reset() {
        close()
        today = null
        loadError = null
    }

    private fun clearAnswer() {
        selected = null
        shortAnswer = ""
        error = null
    }

    /** A course session's set never becomes Today's, even if it arrives after the session has gone. */
    private fun take(streak: Streak, recall: Recall) {
        if (courseSession != null) courseSession = RecallUpdate(streak, recall)
        today = today?.let { it.copy(streak = streak, recall = if (recall.scope == "course") it.recall else recall) }
    }

    /** One change at a time. Its result is dropped if the learner signed out while it was on its way. */
    private fun <T> change(call: suspend () -> T, apply: (T) -> Unit) {
        if (busy) return
        busy = true
        error = null
        val mine = ++changes
        scope.launch {
            try {
                val result = call()
                if (mine == changes) apply(result)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (mine == changes) error = messageOf(failure)
            } finally {
                if (mine == changes) busy = false
            }
        }
    }
}
