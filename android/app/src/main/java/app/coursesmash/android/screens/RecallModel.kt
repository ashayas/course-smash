package app.coursesmash.android.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.coursesmash.android.ApiClient
import app.coursesmash.android.Recall
import app.coursesmash.android.RecallAnswer
import app.coursesmash.android.RecallQuestion
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

    /** Goes up with every change made here, so a slower refresh never overwrites a newer answer. */
    private var changes = 0

    val streak: Streak? get() = today?.streak
    val recall: Recall? get() = today?.recall

    /** The question on screen: the one just answered while its verdict shows, otherwise the next one. */
    val question: RecallQuestion? get() = if (verdict != null) answered else recall?.question

    /** True once the learner has picked an option or written something, which is when "Check" appears. */
    val hasAnswer: Boolean get() = if (question?.options != null) selected != null else shortAnswer.isNotBlank()

    suspend fun refresh() {
        val before = changes
        try {
            val loaded = api.today()
            if (before != changes) return
            // A new question clears what was picked for the old one.
            if (loaded.recall.question?.id != today?.recall?.question?.id) clearAnswer()
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

    /** Five more questions, then on with the session. */
    fun more() = change({ api.moreRecall() }) { result ->
        next()
        take(result.streak, result.recall)
        inSession = result.recall.question != null
    }

    fun skipDay(skipped: Boolean) = change({ api.skipRecallDay(skipped) }) { result ->
        clearAnswer()
        take(result.streak, result.recall)
    }

    /** Back to Today. Answers so far are kept by the Worker, and the rest of the set waits there. */
    fun close() {
        next()
        error = null
        inSession = false
    }

    fun reset() {
        changes += 1
        close()
        today = null
        loadError = null
        busy = false
    }

    private fun clearAnswer() {
        selected = null
        shortAnswer = ""
        error = null
    }

    private fun take(streak: Streak, recall: Recall) {
        today = today?.copy(streak = streak, recall = recall)
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
