import XCTest

/// Walks every flow of the app against a real Worker and saves a screenshot of each screen.
///
/// Settings come from the environment, passed by xcodebuild with a TEST_RUNNER_ prefix:
///   TEST_RUNNER_CS_USER, TEST_RUNNER_CS_PW   the login to use (never commit these)
///   TEST_RUNNER_CS_BASE_URL                  optional, a Worker other than the one in Info.plist
///   TEST_RUNNER_CS_SHOTS                     optional, a folder for the PNGs
///   TEST_RUNNER_CS_LIBRARY_COURSE            optional, the library course to start (default "Kubernetes architecture")
///   TEST_RUNNER_CS_MOTION                    optional, set to 1 to leave the looping art running (slower)
///   TEST_RUNNER_CS_QUICK                     optional, set to 1 to stop after login, Today and the city
///   TEST_RUNNER_CS_KEY_URL                   optional, a local answer-key helper for demo data (scripts/demo-keys.mjs).
///                                            With it the test answers correctly, apart from one recall question and one
///                                            course question it gets wrong on purpose. Without it, or when the helper has
///                                            no answer, the test picks options in turn, as it does against production.
/// Captures whose names start with "store-" are the ones the store screenshots are made from.
/// The test answers today's recall set when there is one, and puts the settings it changes back.
/// It starts one library course and one planned course, and deletes both before it ends.
final class WalkthroughTests: XCTestCase {
    private var app: XCUIApplication!
    private let environment = ProcessInfo.processInfo.environment
    private var counter = 0
    /// How many recall questions have had a verdict, so the second one can be answered wrong on purpose.
    private var recallAnswered = 0

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipIf(environment["CS_USER"] == nil || environment["CS_PW"] == nil, "Set TEST_RUNNER_CS_USER and TEST_RUNNER_CS_PW to run the walkthrough.")
        // Keep a picture of where a failed run stopped.
        addTeardownBlock { [weak self] in
            guard let self, (self.testRun?.failureCount ?? 0) > 0 else { return }
            self.shot("failure")
        }
        app = XCUIApplication()
        if let base = environment["CS_BASE_URL"] { app.launchEnvironment["CS_API_BASE_URL"] = base }
        // Looping art keeps the app from ever going idle, which makes every tap wait. CS_MOTION=1 leaves it on.
        if environment["CS_MOTION"] == nil { app.launchArguments.append("-still") }
        app.launch()
    }

    func testWalkthrough() throws {
        let user = environment["CS_USER"]!, password = environment["CS_PW"]!

        // Start signed out, whatever an earlier run left behind.
        if app.buttons["tab-you"].waitForExistence(timeout: 3) { logOut() }

        // Login: a wrong password is refused, the right one gets in.
        XCTAssertTrue(app.buttons["log-in"].waitForExistence(timeout: 15))
        shot("login")
        app.textFields["username"].tap()
        app.textFields["username"].typeText(user)
        app.secureTextFields["password"].tap()
        app.secureTextFields["password"].typeText("not-the-password\n")
        XCTAssertTrue(app.staticTexts["That username or password isn't right."].waitForExistence(timeout: 20))
        shot("login-wrong-password")
        app.secureTextFields["password"].tap()
        app.secureTextFields["password"].typeText(password + "\n")

        // The app opens on Today, with the tab bar under it.
        XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 30), "Login did not reach Today")
        XCTAssertTrue(app.buttons["tab-today"].isSelected, "Today is not the selected tab")
        sleep(1)
        shot("today")
        if app.staticTexts["recall-question"].exists { shot("store-today") }
        // The streak chip opens the streak on a sheet, over whatever is on screen.
        walkStreakSheet(capture: "streak-sheet")
        let quick = environment["CS_QUICK"] != nil
        if !quick { walkToday() }

        // City: the composer, the city and the learner's courses.
        app.buttons["tab-city"].tap()
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 30), "The City tab did not open")
        XCTAssertTrue(app.buttons["TCP well enough to debug slow APIs"].waitForExistence(timeout: 20), "Starter ideas did not load")
        sleep(2)
        shot("city")
        app.buttons["TCP well enough to debug slow APIs"].tap()
        XCTAssertEqual(app.textViews["prompt"].value as? String, "I want to learn TCP well enough to debug slow APIs.")
        dismissKeyboard()
        XCTAssertTrue(scrollTo(app.buttons["build-course"]))
        app.swipeUp(velocity: .slow)
        shot("city-island")

        // The city is a map: the front lot is the newest course, or the building site when there are none.
        let city = app.images["city"]
        XCTAssertTrue(city.waitForExistence(timeout: 10))
        bring(city, toY: 100, within: 6)
        shot("store-city")
        city.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.74)).tap()
        if app.staticTexts["course-title"].waitForExistence(timeout: 8) {
            // A course opens on top of its tab: a back control at the top, and the bar still under it.
            XCTAssertTrue(app.buttons["tab-city"].isSelected)
            shot("city-building-opens-course")
            // From a pushed screen too, and the course is still there when the sheet closes.
            walkStreakSheet(capture: nil)
            XCTAssertTrue(app.staticTexts["course-title"].exists, "Closing the streak sheet left the course")
            if app.buttons["check-answer"].waitForExistence(timeout: 60) {
                shotFigureIfAny()
            }
            scrollToTop()
            app.buttons["back"].tap()
        } else {
            XCTAssertTrue(app.keyboards.count > 0, "Tapping the front lot neither opened a course nor focused the composer")
            dismissKeyboard()
        }
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 20))
        if quick { return } // a smoke test: login, Today and the city only
        app.swipeUp()
        app.swipeUp()
        shot("city-courses")

        // A finished course, when the learner has one: the lit building under confetti.
        let finished = app.buttons.matching(NSPredicate(format: "identifier == 'course-card' AND label CONTAINS 'Finished'")).firstMatch
        if scrollTo(finished, tries: 6) {
            finished.tap()
            XCTAssertTrue(app.staticTexts["finished"].waitForExistence(timeout: 30))
            sleep(1)
            shot("finished-course")
            app.swipeUp()
            shot("finished-course-mastery")
            app.buttons["back"].tap()
        }

        // Library: browse, search, filter by track.
        app.buttons["tab-library"].tap()
        XCTAssertTrue(app.textFields["library-search"].waitForExistence(timeout: 30))
        // By topic, the first card can be below the fold, so the count is the sign the library has loaded.
        XCTAssertTrue(app.staticTexts["library-count"].waitForExistence(timeout: 20))
        shot("library")

        // By topic: each topic is a learning path, with its courses in study order.
        if app.buttons["group-topic"].exists {
            var path = false
            if scrollTo(app.buttons["topic-path"].firstMatch, tries: 8) {
                shot("library-topics")
                // For the store: one topic's path from its name down, then what it covers and its courses in study order.
                bring(app.staticTexts["topic-name"].firstMatch, toY: 128, within: 6)
                shot("store-library-path")
                path = true
                scrollTo(app.buttons["topic-path"].firstMatch)
                app.buttons["topic-path"].firstMatch.tap()
                scrollToTop()
                settle(app.staticTexts["library-count"])
                shot("library-path")
            }
            if !path {
                // No path to open: the library by topic, from its count down.
                scrollToTop()
                bring(app.staticTexts["library-count"], toY: 106, within: 5)
                shot("store-library-path")
            }
            scrollToTop()
            app.buttons["group-track"].tap()
            settle(app.staticTexts["library-count"])
        }
        let total = app.staticTexts["library-count"].label
        app.buttons["Cybersecurity"].tap()
        waitForChange(of: app.staticTexts["library-count"], from: total)
        settle(app.staticTexts["library-count"])
        shot("library-track")
        app.buttons["All tracks"].tap()
        waitFor(app.staticTexts["library-count"], toRead: total)
        app.textFields["library-search"].tap()
        app.textFields["library-search"].typeText(environment["CS_LIBRARY_COURSE"] ?? "Kubernetes architecture")
        waitForChange(of: app.staticTexts["library-count"], from: total)
        dismissKeyboard()
        settle(app.staticTexts["library-count"])
        shot("library-search")

        // A library course: what it covers, then start it.
        app.buttons["library-card"].firstMatch.tap()
        XCTAssertTrue(app.buttons["start-course"].waitForExistence(timeout: 30))
        shot("library-course")
        app.swipeUp()
        shot("library-course-modules")
        // The learning path around the course, similar courses and where learners slip, when the course has them.
        for (id, name) in [("slips", "where-learners-slip"), ("path-prerequisites", "take-these-first"), ("path-leads-to", "leads-to"), ("similar-courses", "similar-courses")] {
            // These sit below a run of course cards, so allow a long scroll.
            if scrollTo(app.staticTexts[id].firstMatch, tries: 30) { shot("library-course-\(name)") }
        }
        scrollToTop()
        scrollTo(app.buttons["start-course"])
        app.buttons["start-course"].tap()

        // The course: the agent opens it and the first question arrives.
        XCTAssertTrue(app.staticTexts["question"].waitForExistence(timeout: 240), "The first question never arrived")
        // The title of the course this run started, so only that one is deleted later.
        let started = app.staticTexts["course-title"].label
        shot("question")
        app.swipeUp()
        shot("question-options")
        app.swipeUp()
        app.swipeUp()
        shot("course-side-panels")
        scrollToTop()

        // Answer until a short answer comes up, or five questions in. With an answer key every answer is right,
        // apart from the second, which is wrong on purpose so the "Not quite" verdict is still walked.
        var sawChoice = false, sawShort = false, asked = 0, storeQuestion = false
        for _ in 0..<5 where !(sawChoice && sawShort) {
            // A new question is on screen once its "Check my answer" button is.
            XCTAssertTrue(app.buttons["check-answer"].waitForExistence(timeout: 240), "The next question never arrived")
            asked += 1
            if asked > 1 { shot("question-\(asked)") }
            shotFigureIfAny()
            let known = answerKey("/course", query: [URLQueryItem(name: "title", value: started)])
            let miss = known != nil && asked == 2
            if app.buttons["option-1"].exists {
                if !storeQuestion {
                    bring(app.staticTexts["question"], toY: 190)
                    shot("store-question")
                    storeQuestion = true
                }
                var option = app.buttons["option-1"]
                if let known, known.kind == "mcq", let index = known.index {
                    let count = (0..<6).filter { app.buttons["option-\($0)"].exists }.count
                    let pick = app.buttons["option-\(miss ? (index + 1) % max(count, 1) : index)"]
                    if pick.exists { option = pick }
                }
                scrollTo(option)
                option.tap()
                if !sawChoice { shot("option-selected") }
                scrollTo(app.buttons["check-answer"])
                app.buttons["check-answer"].tap()
                XCTAssertTrue(app.staticTexts["verdict"].waitForExistence(timeout: 60), "No verdict for a multiple choice answer")
                scrollTo(app.staticTexts["verdict"])
                if !sawChoice { shot("verdict-multiple-choice") }
                if miss { shot("verdict-wrong-on-purpose") }
                sawChoice = true
            } else {
                let answer = app.textViews["short-answer"]
                XCTAssertTrue(answer.waitForExistence(timeout: 10))
                scrollTo(answer)
                answer.tap()
                var text = "The control plane decides what should run and where, and each node's kubelet makes it so."
                if let known, known.kind == "short", let reference = known.answer, !reference.isEmpty { text = miss ? "I don't know this one yet." : typed(reference) }
                answer.typeText(text)
                dismissKeyboard()
                shot("short-answer")
                scrollTo(app.buttons["check-answer"])
                app.buttons["check-answer"].tap()
                // Short answers are graded by a model. If it is unavailable the app says so and keeps the answer.
                let graded = waitForAny([app.staticTexts["verdict"], app.staticTexts["answer-error"]], timeout: 120) == 0
                if graded { scrollTo(app.staticTexts["verdict"]) } else { scrollTo(app.buttons["check-answer"]) }
                shot(graded ? "verdict-short-answer" : "short-answer-not-graded")
                sawShort = true
                if !graded { break }
            }
            scrollTo(app.buttons["keep-going"])
            app.buttons["keep-going"].tap()
            XCTAssertTrue(waitForGone(app.buttons["keep-going"], timeout: 240), "The course did not move on")
        }
        XCTAssertTrue(sawChoice, "No multiple choice question was answered")

        // Building picker: pick, shuffle, save.
        scrollToTop()
        app.buttons["change-building"].tap()
        XCTAssertTrue(app.buttons["archetype-lighthouse"].waitForExistence(timeout: 20))
        shot("building-picker")
        app.buttons["surprise-me"].tap()
        app.buttons["archetype-lighthouse"].tap()
        shot("building-picker-chosen")
        shot("store-building")
        app.swipeUp()
        app.swipeUp()
        shot("building-picker-roof-and-trim")
        scrollTo(app.buttons["save-building"])
        app.buttons["save-building"].tap()
        XCTAssertTrue(app.buttons["change-building"].waitForExistence(timeout: 20), "The picker did not close after saving")
        sleep(1)
        shot("course-new-building")

        // You: the streak, the last four weeks and the settings.
        app.buttons["tab-you"].tap()
        XCTAssertTrue(app.staticTexts["you-heading"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["streak-current"].waitForExistence(timeout: 20), "The streak card did not load")
        XCTAssertTrue(app.buttons["short-answers"].waitForExistence(timeout: 20), "The settings did not load")
        sleep(1)
        shot("you")
        shot("store-you")
        walkSettings()

        // Stats, from its row on You.
        scrollToTop()
        scrollTo(app.buttons["stats-row"])
        app.buttons["stats-row"].tap()
        XCTAssertTrue(app.otherElements["activity-chart"].waitForExistence(timeout: 30) || app.staticTexts["Last 30 days"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-you"].isSelected, "Stats did not open on top of You")
        sleep(1)
        shot("stats")
        app.swipeUp()
        shot("stats-activity")
        app.swipeUp()
        shot("stats-by-course")

        // Delete the library course started above, and no other.
        let mine = app.buttons.matching(NSPredicate(format: "identifier == 'stat-course' AND label CONTAINS %@", started)).firstMatch
        XCTAssertTrue(scrollTo(mine, tries: 30), "The course this run started is not in the stats")
        mine.tap()
        deleteOpenCourse()

        // Plan a course from a sentence. With the planner available a question arrives. Without it, the app offers to try again.
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 30))
        scrollToTop()
        app.textViews["prompt"].tap()
        app.textViews["prompt"].typeText("I want to learn how DNS resolution works so that I can debug slow lookups.")
        dismissKeyboard()
        shot("city-prompt")
        scrollTo(app.buttons["build-course"])
        app.buttons["build-course"].tap()
        XCTAssertTrue(app.buttons["delete-course"].waitForExistence(timeout: 30))
        shot("course-planning")
        let planned = waitForAny([app.staticTexts["question"], app.buttons["try-again"]], timeout: 240)
        XCTAssertNotNil(planned, "Planning neither finished nor failed")
        shot(planned == 0 ? "planned-course-question" : "course-planner-unavailable")
        deleteOpenCourse()

        // Log out, the last thing on You.
        logOut()
        XCTAssertTrue(app.buttons["log-in"].waitForExistence(timeout: 15))
    }

    // MARK: Today and daily recall

    /// Walks Today. With a recall set waiting it answers the set, in and out of the session. An account with
    /// nothing to recall yet, which is how every account starts, only has its cards looked at.
    private func walkToday() {
        // An earlier run may have stopped with recall skipped for the day.
        if app.buttons["do-it-anyway"].exists {
            app.buttons["do-it-anyway"].tap()
            _ = waitForAny([app.buttons["skip-today"], app.buttons["continue-course"]], timeout: 20)
        }
        guard app.buttons["skip-today"].waitForExistence(timeout: 3) else {
            // Nothing to recall, or today's set is already done: the week, Continue and Up next.
            XCTAssertTrue(app.otherElements["week-strip"].waitForExistence(timeout: 10), "Today has no week strip")
            walkTodayCards()
            return
        }
        XCTAssertTrue(app.staticTexts["recall-question"].exists, "Today has no live question")

        // "Skip for today" swaps the question for the week and the course, and "Do it anyway" brings it back.
        scrollTo(app.buttons["skip-today"])
        app.buttons["skip-today"].tap()
        XCTAssertTrue(app.buttons["do-it-anyway"].waitForExistence(timeout: 20), "Skipping today did not hide recall")
        XCTAssertTrue(app.otherElements["week-strip"].exists)
        shot("today-recall-skipped")
        app.buttons["do-it-anyway"].tap()
        XCTAssertTrue(app.buttons["skip-today"].waitForExistence(timeout: 20), "Recall did not come back")
        scrollToTop()

        // The first answer is sent from Today, which opens the session.
        var seen = Seen()
        XCTAssertTrue(answerRecall(0, &seen, from: "today"), "The first recall answer got no verdict")
        XCTAssertTrue(app.otherElements["recall-pips"].exists, "The session has no pips")
        XCTAssertFalse(app.buttons["tab-today"].exists, "The tab bar is showing during a recall session")
        nextRecall()

        // Skip a question: nothing is recorded and the set moves on.
        if app.buttons["skip-question"].waitForExistence(timeout: 5) {
            sleep(1)
            shot("recall-question")
            let count = app.staticTexts["recall-count"].label
            app.buttons["skip-question"].tap()
            let moved = Date().addingTimeInterval(20)
            while Date() < moved, !app.staticTexts["recall-done"].exists, app.staticTexts["recall-count"].exists, app.staticTexts["recall-count"].label == count { usleep(200_000) }
            XCTAssertTrue(app.staticTexts["recall-done"].exists || app.staticTexts["recall-count"].label != count, "Skipping a question did not move on")
        }

        // Close the session and come back: the answers are kept and the rest wait on Today.
        if app.buttons["recall-close"].exists {
            app.buttons["recall-close"].tap()
            XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 20), "Closing the session did not return to Today")
            XCTAssertTrue(app.buttons["tab-today"].waitForExistence(timeout: 10))
            XCTAssertTrue(app.buttons["skip-today"].waitForExistence(timeout: 20), "The rest of the set is not waiting on Today")
            sleep(1)
            shot("today-recall-in-progress")
        }

        // Finish the set.
        answerRecallSet(&seen, from: 1)
        sleep(1)
        shot("recall-done")
        shot("store-recall-done")
        app.swipeUp()
        shot("recall-done-next-steps")

        // "Done" goes back to Today, which now shows the week, the course to continue and what is up next.
        scrollTo(app.buttons["recall-finish"])
        app.buttons["recall-finish"].tap()
        XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 20), "Done did not return to Today")
        XCTAssertTrue(app.otherElements["week-strip"].waitForExistence(timeout: 20), "Today does not show the week once recall is done")
        sleep(1)
        shot("today-recall-done")
        shot("store-today-after")
        walkTodayCards()

        // "5 more recall" on the Continue card goes straight into the session.
        scrollToTop()
        guard scrollTo(app.buttons["more-recall"], tries: 4) else { return }
        app.buttons["more-recall"].tap()
        XCTAssertTrue(app.buttons["recall-close"].waitForExistence(timeout: 30), "5 more recall did not open the session")
        XCTAssertTrue(app.staticTexts["recall-question"].waitForExistence(timeout: 10), "5 more recall did not add any")
        XCTAssertFalse(app.buttons["tab-today"].exists, "The tab bar is showing during a recall session")
        sleep(1)
        shot("today-more-recall")
        answerRecallSet(&seen, from: 2)
        sleep(1)
        shot("recall-done-after-more")

        // "5 more questions" on the finished screen adds to the set, and the session carries on.
        if scrollTo(app.buttons["more-questions"], tries: 4) {
            app.buttons["more-questions"].tap()
            XCTAssertTrue(app.buttons["check-recall"].waitForExistence(timeout: 30), "5 more questions did not add any")
            answerRecallSet(&seen, from: 3)
        }

        // From the finished screen: on to the course, or back to Today.
        if scrollTo(app.buttons["continue-your-course"], tries: 4) {
            app.buttons["continue-your-course"].tap()
            XCTAssertTrue(app.staticTexts["course-title"].waitForExistence(timeout: 30), "Continue your course did not open the course")
            XCTAssertTrue(app.buttons["tab-today"].isSelected)
            shot("recall-done-continue-course")
            app.buttons["back"].tap()
        } else {
            scrollTo(app.buttons["recall-finish"])
            app.buttons["recall-finish"].tap()
        }
        XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 20))
        scrollToTop()
    }

    /// Continue opens the course in progress, and Up next opens a library course's page. Both come back to Today.
    private func walkTodayCards() {
        if scrollTo(app.buttons["continue-course"], tries: 4) {
            app.buttons["continue-course"].tap()
            XCTAssertTrue(app.staticTexts["course-title"].waitForExistence(timeout: 30), "Continue did not open the course")
            XCTAssertTrue(app.buttons["tab-today"].isSelected, "The course did not open on top of Today")
            shot("today-continue-course")
            app.buttons["back"].tap()
            XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 20))
        } else if app.buttons["plan-a-course"].exists {
            shot("today-first-course")
        }
        if scrollTo(app.buttons["up-next"], tries: 6) {
            shot("today-up-next")
            app.buttons["up-next"].tap()
            XCTAssertTrue(app.buttons["start-course"].waitForExistence(timeout: 30), "Up next did not open the library course")
            shot("today-up-next-course")
            app.buttons["back"].tap()
            XCTAssertTrue(app.staticTexts["today-heading"].waitForExistence(timeout: 20))
        }
    }

    /// Which pictures of recall have been taken, so each is taken once.
    private struct Seen {
        var right = false, wrong = false, short = false, picked = false, storeRight = false
    }

    /// Answers until the finished screen shows.
    private func answerRecallSet(_ seen: inout Seen, from round: Int) {
        for turn in 0..<40 {
            if app.staticTexts["recall-done"].exists { return }
            XCTAssertTrue(answerRecall(round + turn, &seen, from: "recall") || app.staticTexts["recall-done"].exists || app.buttons["check-recall"].exists || app.buttons["skip-question"].exists,
                          "Recall stopped moving")
            if app.buttons["recall-next"].exists { nextRecall() }
        }
        XCTAssertTrue(app.staticTexts["recall-done"].waitForExistence(timeout: 20), "The recall set never finished")
    }

    /// Answers the recall question on screen, on Today's card or in the session, and stops on its verdict.
    /// Returns false when a short answer could not be graded. That question is skipped, as a learner would.
    private func answerRecall(_ turn: Int, _ seen: inout Seen, from place: String) -> Bool {
        let answer = app.textViews["short-answer"]
        let kind = waitForAny([app.buttons["option-0"], answer, app.staticTexts["recall-done"]], timeout: 30)
        XCTAssertNotNil(kind, "No recall question on screen")
        if kind == 2 { return true }
        // With an answer key every answer is right, apart from the second, which is wrong on purpose.
        let known = answerKey("/recall")
        let miss = known != nil && recallAnswered == 1
        if kind == 0 {
            // Without a key: a different option each time, so both right and wrong answers come up.
            var option = app.buttons["option-\(turn % 4)"].exists ? app.buttons["option-\(turn % 4)"] : app.buttons["option-0"]
            if let known, known.kind == "mcq", let index = known.index {
                let count = (0..<6).filter { app.buttons["option-\($0)"].exists }.count
                let pick = app.buttons["option-\(miss ? (index + 1) % max(count, 1) : index)"]
                if pick.exists { option = pick }
            }
            scrollTo(option)
            option.tap()
            XCTAssertTrue(app.buttons["check-recall"].waitForExistence(timeout: 5), "Check did not show after picking an option")
            if !seen.picked { shot("\(place)-option-selected") }
            seen.picked = true
        } else {
            scrollTo(answer)
            answer.tap()
            var text = "I think the client keeps retrying with a growing wait, so I would set a short timeout and fewer retries for this call."
            if let known, known.kind == "short", let reference = known.answer, !reference.isEmpty { text = miss ? "I don't know this one yet." : typed(reference) }
            answer.typeText(text)
            dismissKeyboard()
            if !seen.short { shot("\(place)-short-answer") }
        }
        scrollTo(app.buttons["check-recall"])
        app.buttons["check-recall"].tap()
        // A short answer is graded by a model, which can take a while or be unavailable.
        let graded = waitForAny([app.staticTexts["verdict"], app.staticTexts["answer-error"]], timeout: kind == 0 ? 60 : 150)
        XCTAssertNotNil(graded, "No verdict for a recall answer")
        guard graded == 0 else {
            shot("recall-short-answer-not-graded")
            app.buttons["skip-question"].tap()
            XCTAssertTrue(waitForGone(app.staticTexts["answer-error"], timeout: 20))
            return false
        }
        sleep(1) // the verdict scrolls into view
        recallAnswered += 1
        let right = app.staticTexts["verdict"].label == "You got it"
        // For the store: a right answer, with the line that says when the subtopic comes back. The capture is cropped
        // from the top, so it starts at the answer when the line still fits under it, and at the verdict otherwise.
        if right, kind == 0, !seen.storeRight, app.staticTexts["comes-back"].exists {
            let line = app.staticTexts["comes-back"], window = app.windows.firstMatch.frame
            if let index = known?.index, app.buttons["option-\(index)"].exists { bring(app.buttons["option-\(index)"], toY: 126, within: 6) }
            if !(line.isHittable && line.frame.maxY < window.maxY - 110) { bring(app.staticTexts["verdict"], toY: 156, within: 6) }
            shot("store-recall-right")
            seen.storeRight = true
        }
        if kind == 1, !seen.short {
            shot("recall-verdict-short-answer")
        } else if right, !seen.right {
            shot("recall-verdict-right")
            seen.right = true
        } else if !right, !seen.wrong {
            shot("recall-verdict-wrong")
            seen.wrong = true
        }
        if kind == 1 { seen.short = true }
        return true
    }

    /// "Next", or "Finish" on the last question.
    private func nextRecall() {
        XCTAssertTrue(app.buttons["recall-next"].waitForExistence(timeout: 10))
        app.buttons["recall-next"].tap()
        XCTAssertTrue(waitForGone(app.staticTexts["verdict"], timeout: 20), "The session did not move on")
    }

    // MARK: You

    /// Changes the daily goal and the short answers switch, then puts both back as they were.
    private func walkSettings() {
        let goals = [5, 10, 15, 20].map { app.buttons["goal-\($0)"] }.filter(\.exists)
        scrollTo(app.buttons["short-answers"])
        if let original = goals.first(where: \.isSelected), let other = goals.first(where: { !$0.isSelected }) {
            other.tap()
            XCTAssertTrue(waitUntil { other.isSelected }, "The daily goal did not change")
            shot("you-daily-goal")
            original.tap()
            XCTAssertTrue(waitUntil { original.isSelected }, "The daily goal did not change back")
        } else {
            XCTFail("The daily goal has no choices")
        }
        let short = app.buttons["short-answers"]
        let before = short.value as? String
        XCTAssertNotNil(before)
        short.tap()
        XCTAssertTrue(waitUntil { (short.value as? String) != before }, "Short answers did not switch")
        shot("you-short-answers")
        short.tap()
        XCTAssertTrue(waitUntil { (short.value as? String) == before }, "Short answers did not switch back")
    }

    /// Taps the streak chip, looks at the sheet and closes it. An account with no streak has no chip.
    private func walkStreakSheet(capture: String?) {
        let chip = app.buttons["streak-chip"]
        guard chip.waitForExistence(timeout: 3) else { return }
        XCTAssertGreaterThanOrEqual(chip.frame.height, 44, "The streak chip's tap target is under 44 points")
        chip.tap()
        XCTAssertTrue(app.staticTexts["streak-sheet-title"].waitForExistence(timeout: 10), "Tapping the streak chip did not open the streak")
        XCTAssertTrue(app.staticTexts["streak-current"].exists, "The streak sheet has no streak card")
        sleep(1)
        if let capture { shot(capture) }
        app.buttons["streak-close"].tap()
        XCTAssertTrue(waitForGone(app.staticTexts["streak-sheet-title"], timeout: 10), "The streak sheet did not close")
    }

    private func logOut() {
        app.buttons["tab-you"].tap()
        XCTAssertTrue(scrollTo(app.buttons["log-out"]), "Log out is not on You")
        app.buttons["log-out"].tap()
    }

    // MARK: Answer keys

    private struct AnswerKey: Decodable {
        let kind: String
        let index: Int?
        let answer: String?
    }

    /// The right answer to the question the demo learner is on, from the local helper named by CS_KEY_URL.
    /// Nil without the setting, when the helper has nothing open, or when it can't be reached.
    private func answerKey(_ path: String, query: [URLQueryItem] = []) -> AnswerKey? {
        guard let base = environment["CS_KEY_URL"], !base.isEmpty, var components = URLComponents(string: base + path) else { return nil }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        let done = DispatchSemaphore(value: 0)
        var found: AnswerKey?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if (response as? HTTPURLResponse)?.statusCode == 200, let data { found = try? JSONDecoder().decode(AnswerKey.self, from: data) }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 6)
        return found
    }

    /// A reference answer as one line a keyboard can type.
    private func typed(_ reference: String) -> String {
        String(reference.replacingOccurrences(of: "\n", with: " ").prefix(600))
    }

    // MARK: Helpers

    /// Scrolls the page until the element's top edge is at `y`, or as near as the page allows. Used for the store
    /// captures, which are cropped from the top.
    private func bring(_ element: XCUIElement, toY target: CGFloat, within: CGFloat = 16) {
        let window = app.windows.firstMatch.frame
        var last = CGFloat.nan
        for _ in 0..<8 {
            guard element.exists, element.frame.minY.isFinite else { app.swipeUp(velocity: .slow); continue }
            let top = element.frame.minY
            let delta = top - target
            if abs(delta) < within || top == last { return } // there, or the page can't scroll any further
            last = top
            let step = max(-window.height * 0.5, min(window.height * 0.5, delta))
            let startY = step > 0 ? window.height * 0.78 : window.height * 0.25
            // Drag in the page's right gutter and hold at the end, so the page stops where the finger does.
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: window.width - 5, dy: startY))
                .press(forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: window.width - 5, dy: startY - step)), withVelocity: .slow, thenHoldForDuration: 0.5)
        }
    }

    /// Questions can carry a diagram. When the one on screen does, scroll to it and keep a picture.
    private func shotFigureIfAny() {
        let figure = app.images["figure"]
        guard figure.exists else { return }
        scrollTo(figure)
        sleep(1) // the diagram is drawn by a web view
        shot("question-diagram")
    }

    private func deleteOpenCourse() {
        XCTAssertTrue(app.buttons["delete-course"].waitForExistence(timeout: 60))
        scrollToTop()
        app.buttons["delete-course"].tap()
        XCTAssertTrue(app.alerts.buttons["Delete"].waitForExistence(timeout: 10))
        shot("delete-course")
        app.alerts.buttons["Delete"].tap()
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 30), "Deleting did not return to the home screen")
    }

    private func shot(_ name: String) {
        counter += 1
        let screenshot = XCUIScreen.main.screenshot()
        let title = String(format: "%02d-%@", counter, name)
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = title
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder = environment["CS_SHOTS"] {
            try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(title).png"))
        }
    }

    private func dismissKeyboard() {
        guard app.keyboards.count > 0 else { return }
        // Dragging the page down pulls the keyboard away with it.
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.98)))
        if app.keyboards.count > 0 { app.swipeDown() }
    }

    private func scrollToTop() {
        for _ in 0..<6 { app.swipeDown(velocity: .fast) }
    }

    /// Scrolls until the element can be tapped. Returns false if it never shows up.
    @discardableResult
    private func scrollTo(_ element: XCUIElement, tries: Int = 14) -> Bool {
        let window = app.windows.firstMatch.frame
        func visible() -> Bool {
            // Clear of the top row and of the tab bar, with room to spare so a heading is never half hidden.
            element.exists && element.isHittable && element.frame.maxY < window.maxY - 130 && element.frame.minY > 150
        }
        if visible() { return true }
        for _ in 0..<tries {
            if element.exists, !element.frame.minY.isFinite || element.frame.minY <= 150 {
                app.swipeDown(velocity: .slow)
            } else {
                // Drag in the page's right gutter, so the drag never lands on a control.
                let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.985, dy: 0.7))
                from.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.985, dy: 0.4)))
            }
            if visible() { return true }
        }
        return element.exists && element.isHittable
    }

    private func waitForChange(of element: XCUIElement, from old: String, timeout: TimeInterval = 20) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists, element.label != old { return }
            usleep(200_000)
        }
        XCTFail("\(element) still reads \(old)")
    }

    private func waitFor(_ element: XCUIElement, toRead text: String, timeout: TimeInterval = 20) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists, element.label == text { return }
            usleep(200_000)
        }
        XCTFail("\(element) never read \(text)")
    }

    /// Waits until an element's text has stopped changing, so a search that is still on its way is not mistaken for the result.
    private func settle(_ element: XCUIElement, timeout: TimeInterval = 20) {
        let deadline = Date().addingTimeInterval(timeout)
        var last = element.label
        var since = Date()
        while Date() < deadline {
            let now = element.label
            if now != last { last = now; since = Date() }
            if Date().timeIntervalSince(since) > 1.5 { return }
            usleep(200_000)
        }
    }

    private func waitUntil(timeout: TimeInterval = 20, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            usleep(200_000)
        }
        return false
    }

    private func waitForGone(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !element.exists { return true }
            usleep(300_000)
        }
        return false
    }

    /// The position of the first element to show up, or nil if none did. Two queries for the same element are not equal, so this returns the position.
    private func waitForAny(_ elements: [XCUIElement], timeout: TimeInterval) -> Int? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let found = elements.firstIndex(where: { $0.exists }) { return found }
            usleep(300_000)
        }
        return nil
    }
}
