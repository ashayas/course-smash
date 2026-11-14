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
 *   csQuick             optional, set to 1 to stop after login, home and the city
 * The test starts one library course and one planned course, and deletes both before it ends.
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
        waitForAny(listOf("log-in", "log-out"), 30)
        if (exists("log-out")) tap("log-out")

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

        // Home: the composer, the city and the learner's courses.
        waitFor("build-course", 30)
        rule.waitUntilAtLeastOneExists(hasText("TCP well enough to debug slow APIs"), 20_000)
        Thread.sleep(2000)
        Espresso.closeSoftKeyboard()
        shot("home")
        rule.onNodeWithText("TCP well enough to debug slow APIs").performClick()
        assertEquals("I want to learn TCP well enough to debug slow APIs.", text("prompt"))
        Espresso.closeSoftKeyboard()
        rule.onNodeWithTag("prompt").performTextReplacement("")

        // The city is a map: the front lot is the newest course, or the building site when there are none.
        scrollTo("city")
        Thread.sleep(1500)
        shot("home-city")
        rule.onNodeWithTag("city").performTouchInput { click(Offset(width * 0.5f, height * 0.74f)) }
        // A course opens on its question, try-again or finished panel. The page scrolls there, so the title may be off screen.
        if (runCatching { waitForAny(listOf("check-answer", "try-again", "finished"), 12) }.isSuccess) {
            Thread.sleep(1000)
            shot("city-building-opens-course")
            if (exists("figure")) { scrollTo("figure"); Thread.sleep(1500); shot("question-diagram") }
            tap("nav-courses")
        }
        Espresso.closeSoftKeyboard()
        waitFor("build-course", 20)
        if (arguments.getString("csQuick") != null) return

        scrollToFirst("course-card")
        shot("home-courses")

        // A finished course, when the learner has one: the lit building under confetti.
        val finished = hasTestTag("course-card") and hasText("Finished", substring = true)
        if (runCatching { rule.onNode(hasScrollToNodeAction()).performScrollToNode(finished) }.isSuccess) {
            rule.onNode(finished).performClick()
            waitFor("finished", 30)
            Thread.sleep(1500)
            shot("finished-course")
            tap("nav-courses")
        }

        // Library: browse, filter by track, search.
        tap("nav-library")
        waitFor("library-search", 30)
        waitFor("library-card", 20)
        Thread.sleep(1500)
        shot("library")
        val total = text("library-count")
        rule.onNodeWithText("Cybersecurity").performClick()
        rule.waitUntil(20_000) { text("library-count") != total }
        Thread.sleep(1000)
        shot("library-track")
        rule.onNodeWithText("All tracks").performClick()
        rule.onNodeWithTag("library-search").performTextInput(arguments.getString("csLibraryCourse") ?: "Kubernetes architecture")
        rule.waitUntil(20_000) { text("library-count") != total }
        Espresso.closeSoftKeyboard()
        Thread.sleep(1000)
        shot("library-search")

        // A library course: what it covers, then start it.
        scrollTo("library-card")
        rule.onAllNodesWithTag("library-card").onFirst().performClick()
        waitFor("start-course", 30)
        shot("library-course")
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

        // Stats.
        tap("nav-stats")
        waitFor("activity-chart", 30)
        Thread.sleep(1500)
        shot("stats")
        scrollTo("activity-chart")
        rule.onNodeWithTag("activity-chart").performTouchInput { click(Offset(width - 4f, height / 2f)) }
        Thread.sleep(800)
        shot("stats-activity")
        scrollToFirst("stat-course")
        Thread.sleep(1200)
        shot("stats-by-course")

        // Delete the library course started above. It is the most recently studied, so it is first.
        rule.onAllNodesWithTag("stat-course").onFirst().performClick()
        deleteOpenCourse()

        // Plan a course from a sentence. With the planner available a question arrives. Without it, the app offers to try again.
        waitFor("build-course", 30)
        rule.onNodeWithTag("prompt").performTextInput("I want to learn how DNS resolution works so that I can debug slow lookups.")
        Espresso.closeSoftKeyboard()
        shot("home-prompt")
        tap("build-course")
        waitForAny(listOf("delete-course", "check-answer", "try-again"), 30)
        shot("course-planning")
        val planned = waitForAny(listOf("check-answer", "try-again"), 240)
        Thread.sleep(800)
        shot(if (planned == "check-answer") "planned-course-question" else "course-planner-unavailable")
        deleteOpenCourse()

        // Log out.
        waitFor("log-out", 20)
        tap("log-out")
        waitFor("log-in", 15)
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
        rule.onAllNodes(hasScrollToNodeAction()).onFirst().performScrollToNode(matcher)
        rule.waitForIdle()
    }

    private fun scrollToFirst(tag: String) = scrollTo(tag)

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
        val config = rule.onNodeWithTag(tag).fetchSemanticsNode().config
        return config.getOrNull(SemanticsProperties.EditableText)?.text ?: config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }.orEmpty()
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
        rule.waitForIdle()
        counter += 1
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        File(shots, "%02d-%s.png".format(counter, name)).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
