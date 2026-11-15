package app.coursesmash.android

import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Walks every flow of the app against a real Worker and saves a screenshot of each screen.
 *
 * Settings are instrumentation arguments (`-e name value`), passed by android/scripts/walkthrough.sh:
 *   csUser, csPw        the login to use (never commit these)
 *   csBaseUrl           optional, a Worker other than the one the app is built for
 *   csLibraryCourse     optional, the library course to start (default "Kubernetes architecture")
 *   csQuick             optional, set to 1 to stop after login, Today and the city
 * The test answers today's recall questions when the learner has any, and passes without them (`recall.status` of `empty`).
 * It starts one library course and one planned course, and deletes both before it ends. It changes the daily goal and
 * the short answers setting, and puts both back.
 * Screenshots go to the app's files/walkthrough folder.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(AndroidJUnit4::class)
class WalkthroughTest {
    @get:Rule
    val rule = createEmptyComposeRule()

    private val arguments = InstrumentationRegistry.getArguments()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val shots = File(instrumentation.targetContext.filesDir, "walkthrough")
    private var counter = 0

    @Test
    fun walkthrough() {
        try {
            walk()
        } catch (failure: Throwable) {
            // Keep a picture of where it stopped.
            runCatching { shot("failure") }
            throw failure
        }
    }

    private fun walk() {
        val user = arguments.getString("csUser")
        val password = arguments.getString("csPw")
        assumeTrue("Pass csUser and csPw to run the walkthrough.", user != null && password != null)
        shots.deleteRecursively()
        shots.mkdirs()

        val intent = Intent(instrumentation.targetContext, MainActivity::class.java)
            .putExtra("cs_still", true) // looping art would keep the app from ever going idle
        arguments.getString("csBaseUrl")?.let { intent.putExtra("cs_base_url", it) }
        ActivityScenario.launch<MainActivity>(intent)

        // Start signed out, whatever an earlier run left behind.
        if (waitForAny(listOf("log-in", "tab-you"), 30) == "tab-you") {
            press("tab-you")
            tap("log-out")
        }

        // Login: a wrong password is refused, the right one gets in.
        waitFor("log-in", 15)
        shot("login")
        rule.onNodeWithTag("username").performTextInput(user!!)
        rule.onNodeWithTag("password").performTextInput("not-the-password")
        rule.onNodeWithTag("password").performImeAction()
        rule.waitUntilAtLeastOneExists(hasText("That username or password isn't right."), 20_000)
        Espresso.closeSoftKeyboard()
        shot("login-wrong-password")
        rule.onNodeWithTag("password").performTextReplacement(password!!)
        rule.onNodeWithTag("password").performImeAction()

        // The app opens on Today.
        today()

        // City: the composer, the city and the learner's courses.
        press("tab-city")
        waitFor("build-course", 30)
        rule.waitUntilAtLeastOneExists(hasText("TCP well enough to debug slow APIs"), 20_000)
        Thread.sleep(2000)
        Espresso.closeSoftKeyboard()
        shot("city")
        rule.onNodeWithText("TCP well enough to debug slow APIs").performClick()
        assertEquals("I want to learn TCP well enough to debug slow APIs.", text("prompt"))
        Espresso.closeSoftKeyboard()
        rule.onNodeWithTag("prompt").performTextReplacement("")

        // The city is a map: the front lot is the newest course, or the building site when there are none.
        scrollTo("city")
        Thread.sleep(1500)
        shot("city-map")
        rule.onNodeWithTag("city").performTouchInput { click(Offset(width * 0.5f, height * 0.74f)) }
        // A course opens on its question, try-again or finished panel. The page scrolls there, so the title may be off screen.
        if (runCatching { waitForAny(listOf("check-answer", "try-again", "finished"), 12) }.isSuccess) {
            Thread.sleep(1000)
            shot("city-building-opens-course")
            if (exists("figure")) { scrollTo("figure"); Thread.sleep(1500); shot("question-diagram") }
            press("tab-city")
        }
        Espresso.closeSoftKeyboard()
        waitFor("build-course", 20)
        if (arguments.getString("csQuick") != null) return

        scrollToFirst("course-card")
        shot("city-courses")

        // A finished course, when the learner has one: the lit building under confetti.
        val finished = hasTestTag("course-card") and hasText("Finished", substring = true)
        if (runCatching { rule.onNode(hasScrollToNodeAction()).performScrollToNode(finished) }.isSuccess) {
            rule.onNode(finished).performClick()
            waitFor("finished", 30)
            Thread.sleep(1500)
            shot("finished-course")
            press("back")
        }

        // Library: browse, filter by track, search.
        press("tab-library")
        waitFor("library-search", 30)
        waitFor("library-count", 20) // by topic, the first card can be below the fold
        Thread.sleep(1500)
        shot("library")

        // By topic: each topic is a learning path, with its courses in study order.
        if (exists("group-topic")) {
            if (runCatching { scrollTo("topic-path") }.isSuccess) {
                Thread.sleep(1200)
                shot("library-topics")
                rule.onAllNodesWithTag("topic-path").onFirst().performClick()
                scrollTo("library-count")
                settle("library-count")
                shot("library-path")
            }
            tap("group-track")
            scrollTo("library-count")
            settle("library-count")
        }
        val total = text("library-count")
        rule.onNodeWithText("Cybersecurity").performClick()
        rule.waitUntil(20_000) { text("library-count") != total }
        settle("library-count")
        shot("library-track")
        rule.onNodeWithText("All tracks").performClick()
        rule.waitUntil(20_000) { text("library-count") == total }
        rule.onNodeWithTag("library-search").performTextInput(arguments.getString("csLibraryCourse") ?: "Kubernetes architecture")
        rule.waitUntil(20_000) { text("library-count") != total }
        Espresso.closeSoftKeyboard()
        settle("library-count")
        shot("library-search")

        // A library course: what it covers, then start it.
        scrollTo("library-card")
        rule.onAllNodesWithTag("library-card").onFirst().performClick()
        waitFor("start-course", 30)
        shot("library-course")
        // The learning path around the course, similar courses and where learners slip, when the course has them.
        for ((tag, name) in listOf("slips" to "where-learners-slip", "path-prerequisites" to "take-these-first", "path-leads-to" to "leads-to", "similar-courses" to "similar-courses")) {
            if (runCatching { scrollTo(tag) }.isSuccess) {
                Thread.sleep(1200)
                shot("library-course-$name")
            }
        }
        tap("start-course")

        // The course: the agent opens it and the first question arrives.
        waitFor("check-answer", 240)
        Thread.sleep(1000)
        shot("question")

        // Answer until a short answer comes up, or five questions in.
        var sawChoice = false
        var sawShort = false
        var asked = 0
        while (asked < 5 && !(sawChoice && sawShort)) {
            // A new question is on screen once its "Check my answer" button is.
            waitFor("check-answer", 240)
            asked += 1
            if (asked > 1) { Thread.sleep(800); shot("question-$asked") }
            if (exists("figure")) { scrollTo("figure"); Thread.sleep(1500); shot("question-diagram") }
            if (exists("option-1")) {
                tap("option-1")
                if (!sawChoice) shot("option-selected")
                tap("check-answer")
                waitFor("verdict", 60)
                Thread.sleep(1200)
                if (!sawChoice) shot("verdict-multiple-choice")
                sawChoice = true
            } else {
                scrollTo("short-answer")
                rule.onNodeWithTag("short-answer").performTextInput("The control plane decides what should run and where, and each node's kubelet makes it so.")
                Espresso.closeSoftKeyboard()
                shot("short-answer")
                tap("check-answer")
                // Short answers are graded by a model. If it is unavailable the app says so and keeps the answer.
                val graded = waitForAny(listOf("verdict", "answer-error"), 120) == "verdict"
                scrollTo(if (graded) "verdict" else "answer-error")
                Thread.sleep(1200)
                shot(if (graded) "verdict-short-answer" else "short-answer-not-graded")
                sawShort = true
                if (!graded) break
            }
            tap("keep-going")
            rule.waitUntil(240_000) { !exists("keep-going") }
        }
        assertTrue("No multiple choice question was answered", sawChoice)

        // Building picker: pick, shuffle, save.
        tap("change-building")
        waitFor("archetype-lighthouse", 20)
        Thread.sleep(2500) // every thumbnail is drawn by city.js
        shot("building-picker")
        tapInDialog("surprise-me")
        tapInDialog("archetype-lighthouse")
        Thread.sleep(2500)
        shot("building-picker-chosen")
        tapInDialog("save-building")
        rule.waitUntil(20_000) { !exists("save-building") }
        scrollTo("change-building")
        Thread.sleep(1500)
        shot("course-new-building")

        // Delete the library course started above, while it is the one on screen.
        deleteOpenCourse()

        // Plan a course from a sentence. With the planner available a question arrives. Without it, the app offers to try again.
        waitFor("build-course", 30)
        rule.onNodeWithTag("prompt").performTextInput("I want to learn how DNS resolution works so that I can debug slow lookups.")
        Espresso.closeSoftKeyboard()
        shot("city-prompt")
        tap("build-course")
        waitForAny(listOf("delete-course", "check-answer", "try-again"), 30)
        shot("course-planning")
        val planned = waitForAny(listOf("check-answer", "try-again"), 240)
        Thread.sleep(800)
        shot(if (planned == "check-answer") "planned-course-question" else "course-planner-unavailable")
        deleteOpenCourse()

        you()

        // System back goes from a tab to Today. Log out is the last thing on You.
        Espresso.pressBack()
        waitFor("today-title", 20)
        press("tab-you")
        waitFor("you-title", 10)
        tap("log-out")
        waitFor("log-in", 15)
    }

    /** Today: the live question, a recall session from start to finish, then Continue and Up next. */
    private fun today() {
        // The heading is there once /api/today has answered, whatever the state of recall. The first answer of the day
        // can take a while: the Worker picks the day's questions, and may have to read a course's question bank first.
        waitFor("today-title", 240)
        Thread.sleep(2000) // the buildings are drawn by city.js
        shot("today")
        if (exists("recall-question")) recall() else if (exists("recall-soon")) shot("today-no-recall-yet")

        if (exists("continue-card")) {
            tap("continue-course")
            // The course opens on a question, or the agent writes the next ones first.
            waitForAny(listOf("check-answer", "try-again", "finished", "keep-going"), 240)
            Thread.sleep(1000)
            shot("continue-course")
            press("back")
            waitFor("today-title", 20)
        }
        if (runCatching { scrollTo("up-next") }.isSuccess) {
            Thread.sleep(1200)
            shot("today-up-next")
            tap("up-next")
            waitFor("start-course", 30)
            shot("up-next-course")
            press("back")
            waitFor("today-title", 20)
        }
        if (exists("first-course")) {
            tap("plan-course")
            waitFor("build-course", 20)
            press("tab-today")
            waitFor("today-title", 20)
        }
    }

    private fun recall() {
        // Skipping for today swaps the question for the rest of Today, and "Do it anyway" brings it back.
        tap("skip-today")
        waitFor("do-it-anyway", 20)
        Thread.sleep(1200)
        shot("today-recall-skipped")
        tap("do-it-anyway")
        waitFor("recall-question", 20)

        // The first answer is sent from Today, which starts the session. The tab bar steps aside.
        if (exists("recall-option-1")) {
            tap("recall-option-1")
            shot("today-option-selected")
            tap("recall-check")
            waitFor("recall-verdict", 60)
            assertTrue("The tab bar is hidden during a session", !exists("tab-today"))
            Thread.sleep(1200)
            noteVerdict()
            press("recall-next")
            rule.waitUntil(20_000) { !exists("recall-verdict") }
        }

        // Skip a question: nothing is recorded and the set moves on.
        if (exists("recall-skip") && exists("recall-question")) {
            Thread.sleep(800)
            shot("recall-question")
            val before = text("recall-count")
            press("recall-skip")
            rule.waitUntil(20_000) { exists("recall-done") || text("recall-count") != before }
        }

        // Close the session part of the way through. The rest waits on Today, and answering there carries on.
        if (exists("recall-close")) {
            press("recall-close")
            waitFor("tab-today", 20)
            waitFor("recall-question", 20)
            Thread.sleep(1200)
            shot("today-recall-in-progress")
        }

        answerUntilDone()
        Thread.sleep(1200)
        shot("recall-done")
        if (exists("recall-more")) {
            press("recall-more")
            waitFor("recall-question", 30)
            Thread.sleep(800)
            shot("recall-more-questions")
            answerUntilDone()
        }
        press("recall-finish")
        waitFor("tab-today", 20)
        waitFor("week-strip", 20)
        Thread.sleep(1500)
        shot("today-recall-done")
    }

    private var sawRight = false
    private var sawWrong = false
    private var sawShortRecall = false
    private var recallAsked = 0

    /** Answers whatever is asked, on Today or in the session, until the finished screen shows. */
    private fun answerUntilDone() {
        repeat(60) {
            if (waitForAny(listOf("recall-done", "recall-question"), 60) == "recall-done") return
            recallAsked += 1
            if (exists("recall-option-0")) {
                // Different options in turn, so that some answers are right and some are wrong.
                val pick = (0..3).map { (recallAsked + it) % 4 }.first { exists("recall-option-$it") }
                tap("recall-option-$pick")
                if (recallAsked == 2) shot("recall-option-selected")
                check()
                waitFor("recall-verdict", 60)
            } else {
                scrollTo("recall-short-answer")
                rule.onNodeWithTag("recall-short-answer").performTextInput("The control plane decides what should run and where, and each node's kubelet makes it so.")
                Espresso.closeSoftKeyboard()
                if (!sawShortRecall) shot("recall-short-answer")
                check()
                // Short answers are graded by a model. If it is unavailable the app says so, and the question can be skipped.
                if (waitForAny(listOf("recall-verdict", "recall-error"), 120) == "recall-error") {
                    shot("recall-short-answer-not-graded")
                    val before = text("recall-count")
                    press("recall-skip")
                    rule.waitUntil(20_000) { exists("recall-done") || text("recall-count") != before }
                    return@repeat
                }
            }
            Thread.sleep(1000)
            noteVerdict(short = !exists("recall-option-0"))
            press("recall-next")
            rule.waitUntil(20_000) { !exists("recall-verdict") }
        }
        waitFor("recall-done", 10)
    }

    /** "Check" is in the question's card on Today, and under the question in a session. */
    private fun check() = if (exists("tab-today")) tap("recall-check") else press("recall-check")

    /** Takes a picture of the first right answer, the first wrong one and the first short answer. */
    private fun noteVerdict(short: Boolean = false) {
        val right = text("recall-verdict") == "You got it"
        if (short && !sawShortRecall) {
            sawShortRecall = true
            scrollTo("recall-verdict")
            shot("recall-verdict-short-answer")
        } else if (right && !sawRight) {
            shot("recall-verdict-right")
        } else if (!right && !sawWrong) {
            shot("recall-verdict-wrong")
        }
        if (right) sawRight = true else sawWrong = true
    }

    /** You: the streak, Stats, and the settings, which are changed and then put back. */
    private fun you() {
        press("tab-you")
        waitFor("daily-goal", 30)
        Thread.sleep(1200)
        shot("you")

        tap("open-stats")
        // The streak card sits above the chart, which may be below the fold until the page scrolls to it.
        waitForAny(listOf("streak-card", "activity-chart"), 30)
        Thread.sleep(1500)
        shot("stats")
        if (runCatching { scrollTo("streak-card") }.isSuccess) shot("stats-streak")
        scrollTo("activity-chart")
        rule.onNodeWithTag("activity-chart").performTouchInput { click(Offset(width - 4f, height / 2f)) }
        Thread.sleep(800)
        shot("stats-activity")
        if (runCatching { scrollToFirst("stat-course") }.isSuccess) {
            Thread.sleep(1200)
            shot("stats-by-course")
        }
        press("back")
        waitFor("you-title", 20)

        // Daily goal: pick another one, then the one it was.
        val goal = text("daily-goal-value")
        val other = if (goal.startsWith("15 ")) 20 else 15
        tap("daily-goal")
        waitFor("goal-$other", 10)
        shot("you-daily-goal")
        tap("goal-$other")
        rule.waitUntil(20_000) { text("daily-goal-value") == "$other questions" }
        shot("you-daily-goal-changed")
        tap("daily-goal")
        tap("goal-${goal.substringBefore(' ')}")
        rule.waitUntil(20_000) { text("daily-goal-value") == goal }

        // Short answers in recall: off and on again, or the other way round.
        val shortAnswers = isOn("short-answers")
        tap("short-answers")
        rule.waitUntil(20_000) { isOn("short-answers") != shortAnswers }
        shot("you-short-answers-changed")
        tap("short-answers")
        rule.waitUntil(20_000) { isOn("short-answers") == shortAnswers }
        scrollTo("log-out")
        shot("you-log-out")
    }

    // Helpers

    private fun exists(tag: String) = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun waitFor(tag: String, seconds: Int) = rule.waitUntilAtLeastOneExists(hasTestTag(tag), seconds * 1000L)

    private fun appears(tag: String, seconds: Int) = runCatching { waitFor(tag, seconds) }.isSuccess

    private fun waitForAny(tags: List<String>, seconds: Int): String {
        var found: String? = null
        rule.waitUntil(seconds * 1000L) { tags.firstOrNull(::exists)?.also { found = it } != null }
        return found!!
    }

    /** Scrolls the page until the element is on screen. Pages are lazy lists, so it may not exist until then. */
    private fun scrollTo(tag: String, matcher: SemanticsMatcher = hasTestTag(tag)) {
        val page = rule.onAllNodes(hasScrollToNodeAction()).onFirst()
        repeat(3) {
            if (runCatching { page.performScrollToNode(matcher) }.isSuccess) {
                rule.waitForIdle()
                return
            }
            // The page may still have been loading when the search went past. Go back to the top and look again.
            runCatching { page.performScrollToIndex(0) }
            Thread.sleep(1500)
        }
        page.performScrollToNode(matcher)
        rule.waitForIdle()
    }

    private fun scrollToFirst(tag: String) = scrollTo(tag)

    /** Taps a control that sits outside the scrolling page: a tab, the back control, the buttons under a recall question. */
    private fun press(tag: String) {
        rule.onAllNodesWithTag(tag).onFirst().performClick()
        rule.waitForIdle()
    }

    private fun isOn(tag: String) =
        rule.onNodeWithTag(tag).fetchSemanticsNode().config.getOrNull(SemanticsProperties.ToggleableState) == androidx.compose.ui.state.ToggleableState.On

    private fun tap(tag: String) {
        // Pages are lazy lists, so the element may not exist until the page has scrolled to it.
        runCatching { scrollTo(tag) }
        rule.onAllNodesWithTag(tag).onFirst().performClick()
        rule.waitForIdle()
    }

    /** The building picker is a dialog that scrolls on its own, so its buttons are brought into view directly. */
    private fun tapInDialog(tag: String) {
        rule.onNodeWithTag(tag).performScrollTo().performClick()
        rule.waitForIdle()
    }

    private fun text(tag: String): String {
        // Unmerged, so text inside a row that is one button, such as a setting's value, can be read on its own.
        val config = rule.onNodeWithTag(tag, useUnmergedTree = true).fetchSemanticsNode().config
        return config.getOrNull(SemanticsProperties.EditableText)?.text ?: config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }.orEmpty()
    }

    /** Waits until an element's text has stopped changing, so a search that is still on its way is not mistaken for the result. */
    private fun settle(tag: String) {
        var last = text(tag)
        var since = System.currentTimeMillis()
        rule.waitUntil(20_000) {
            val now = text(tag)
            if (now != last) { last = now; since = System.currentTimeMillis() }
            System.currentTimeMillis() - since > 1500
        }
    }

    private fun deleteOpenCourse() {
        // The course page scrolls to its question, so the delete link at the top may be off screen. tap() scrolls back to it.
        waitForAny(listOf("delete-course", "check-answer", "keep-going", "try-again", "finished"), 60)
        tap("delete-course")
        waitFor("confirm-delete", 10)
        shot("delete-course")
        tap("confirm-delete")
        waitFor("build-course", 30)
    }

    private fun shot(name: String) {
        runCatching { rule.waitForIdle() }
        counter += 1
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        File(shots, "%02d-%s.png".format(counter, name)).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
