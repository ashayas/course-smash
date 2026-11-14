import XCTest

/// Walks every flow of the app against a real Worker and saves a screenshot of each screen.
///
/// Settings come from the environment, passed by xcodebuild with a TEST_RUNNER_ prefix:
///   TEST_RUNNER_CS_USER, TEST_RUNNER_CS_PW   the login to use (never commit these)
///   TEST_RUNNER_CS_BASE_URL                  optional, a Worker other than the one in Info.plist
///   TEST_RUNNER_CS_SHOTS                     optional, a folder for the PNGs
///   TEST_RUNNER_CS_LIBRARY_COURSE            optional, the library course to start (default "Kubernetes architecture")
///   TEST_RUNNER_CS_MOTION                    optional, set to 1 to leave the looping art running (slower)
///   TEST_RUNNER_CS_QUICK                     optional, set to 1 to stop after login, home and the city
/// The test starts one library course and one planned course, and deletes both before it ends.
final class WalkthroughTests: XCTestCase {
    private var app: XCUIApplication!
    private let environment = ProcessInfo.processInfo.environment
    private var counter = 0

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipIf(environment["CS_USER"] == nil || environment["CS_PW"] == nil, "Set TEST_RUNNER_CS_USER and TEST_RUNNER_CS_PW to run the walkthrough.")
        app = XCUIApplication()
        if let base = environment["CS_BASE_URL"] { app.launchEnvironment["CS_API_BASE_URL"] = base }
        // Looping art keeps the app from ever going idle, which makes every tap wait. CS_MOTION=1 leaves it on.
        if environment["CS_MOTION"] == nil { app.launchArguments.append("-still") }
        app.launch()
    }

    func testWalkthrough() throws {
        let user = environment["CS_USER"]!, password = environment["CS_PW"]!

        // Start signed out, whatever an earlier run left behind.
        if app.buttons["log-out"].waitForExistence(timeout: 3) { app.buttons["log-out"].tap() }

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

        // Home: the composer, the city and the learner's courses.
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 30), "Login did not reach the home screen")
        XCTAssertTrue(app.buttons["TCP well enough to debug slow APIs"].waitForExistence(timeout: 20), "Starter ideas did not load")
        sleep(2)
        shot("home")
        app.buttons["TCP well enough to debug slow APIs"].tap()
        XCTAssertEqual(app.textViews["prompt"].value as? String, "I want to learn TCP well enough to debug slow APIs.")
        dismissKeyboard()
        XCTAssertTrue(scrollTo(app.buttons["build-course"]))
        app.swipeUp(velocity: .slow)
        shot("home-city")

        // The city is a map: the front lot is the newest course, or the building site when there are none.
        let city = app.images["city"]
        XCTAssertTrue(city.waitForExistence(timeout: 10))
        city.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.74)).tap()
        if app.staticTexts["course-title"].waitForExistence(timeout: 8) {
            shot("city-building-opens-course")
            if app.buttons["check-answer"].waitForExistence(timeout: 60) {
                shotFigureIfAny()
            }
            app.buttons["nav-courses"].tap()
        } else {
            XCTAssertTrue(app.keyboards.count > 0, "Tapping the front lot neither opened a course nor focused the composer")
            dismissKeyboard()
        }
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 20))
        if environment["CS_QUICK"] != nil { return } // a smoke test: login, home and the city only
        app.swipeUp()
        app.swipeUp()
        shot("home-courses")

        // A finished course, when the learner has one: the lit building under confetti.
        let finished = app.buttons.matching(NSPredicate(format: "identifier == 'course-card' AND label CONTAINS 'Finished'")).firstMatch
        if scrollTo(finished, tries: 6) {
            finished.tap()
            XCTAssertTrue(app.staticTexts["finished"].waitForExistence(timeout: 30))
            sleep(1)
            shot("finished-course")
            app.swipeUp()
            shot("finished-course-mastery")
            app.buttons["nav-courses"].tap()
        }

        // Library: browse, search, filter by track.
        app.buttons["nav-library"].tap()
        XCTAssertTrue(app.textFields["library-search"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["library-card"].firstMatch.waitForExistence(timeout: 20))
        shot("library")
        let total = app.staticTexts["library-count"].label
        app.buttons["Cybersecurity"].tap()
        waitForChange(of: app.staticTexts["library-count"], from: total)
        shot("library-track")
        app.buttons["All tracks"].tap()
        app.textFields["library-search"].tap()
        app.textFields["library-search"].typeText(environment["CS_LIBRARY_COURSE"] ?? "Kubernetes architecture")
        waitForChange(of: app.staticTexts["library-count"], from: total)
        dismissKeyboard()
        sleep(1)
        shot("library-search")

        // A library course: what it covers, then start it.
        app.buttons["library-card"].firstMatch.tap()
        XCTAssertTrue(app.buttons["start-course"].waitForExistence(timeout: 30))
        shot("library-course")
        app.swipeUp()
        shot("library-course-modules")
        app.swipeDown()
        app.buttons["start-course"].tap()

        // The course: the agent opens it and the first question arrives.
        XCTAssertTrue(app.staticTexts["question"].waitForExistence(timeout: 240), "The first question never arrived")
        shot("question")
        app.swipeUp()
        shot("question-options")
        app.swipeUp()
        app.swipeUp()
        shot("course-side-panels")
        scrollToTop()

        // Answer until a short answer comes up, or five questions in.
        var sawChoice = false, sawShort = false, asked = 0
        for _ in 0..<5 where !(sawChoice && sawShort) {
            // A new question is on screen once its "Check my answer" button is.
            XCTAssertTrue(app.buttons["check-answer"].waitForExistence(timeout: 240), "The next question never arrived")
            asked += 1
            if asked > 1 { shot("question-\(asked)") }
            shotFigureIfAny()
            if app.buttons["option-1"].exists {
                scrollTo(app.buttons["option-1"])
                app.buttons["option-1"].tap()
                if !sawChoice { shot("option-selected") }
                scrollTo(app.buttons["check-answer"])
                app.buttons["check-answer"].tap()
                XCTAssertTrue(app.staticTexts["verdict"].waitForExistence(timeout: 60), "No verdict for a multiple choice answer")
                scrollTo(app.staticTexts["verdict"])
                if !sawChoice { shot("verdict-multiple-choice") }
                sawChoice = true
            } else {
                let answer = app.textViews["short-answer"]
                XCTAssertTrue(answer.waitForExistence(timeout: 10))
                scrollTo(answer)
                answer.tap()
                answer.typeText("The control plane decides what should run and where, and each node's kubelet makes it so.")
                dismissKeyboard()
                shot("short-answer")
                scrollTo(app.buttons["check-answer"])
                app.buttons["check-answer"].tap()
                // Short answers are graded by a model. If it is unavailable the app says so and keeps the answer.
                let graded = waitForAny([app.staticTexts["verdict"], app.staticTexts["answer-error"]], timeout: 120) == app.staticTexts["verdict"]
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
        app.swipeUp()
        app.swipeUp()
        shot("building-picker-roof-and-trim")
        scrollTo(app.buttons["save-building"])
        app.buttons["save-building"].tap()
        XCTAssertTrue(app.buttons["change-building"].waitForExistence(timeout: 20), "The picker did not close after saving")
        sleep(1)
        shot("course-new-building")

        // Stats.
        app.buttons["nav-stats"].tap()
        XCTAssertTrue(app.otherElements["activity-chart"].waitForExistence(timeout: 30) || app.staticTexts["Last 30 days"].waitForExistence(timeout: 5))
        sleep(1)
        shot("stats")
        app.swipeUp()
        shot("stats-activity")
        app.swipeUp()
        shot("stats-by-course")

        // Delete the library course started above.
        XCTAssertTrue(scrollTo(app.buttons["stat-course"].firstMatch))
        app.buttons["stat-course"].firstMatch.tap()
        deleteOpenCourse()

        // Plan a course from a sentence. With the planner available a question arrives. Without it, the app offers to try again.
        XCTAssertTrue(app.buttons["build-course"].waitForExistence(timeout: 30))
        scrollToTop()
        app.textViews["prompt"].tap()
        app.textViews["prompt"].typeText("I want to learn how DNS resolution works so that I can debug slow lookups.")
        dismissKeyboard()
        shot("home-prompt")
        scrollTo(app.buttons["build-course"])
        app.buttons["build-course"].tap()
        XCTAssertTrue(app.buttons["delete-course"].waitForExistence(timeout: 30))
        shot("course-planning")
        let planned = waitForAny([app.staticTexts["question"], app.buttons["try-again"]], timeout: 240)
        XCTAssertNotNil(planned, "Planning neither finished nor failed")
        shot(planned == app.staticTexts["question"] ? "planned-course-question" : "course-planner-unavailable")
        deleteOpenCourse()

        // Log out.
        XCTAssertTrue(app.buttons["log-out"].waitForExistence(timeout: 20))
        app.buttons["log-out"].tap()
        XCTAssertTrue(app.buttons["log-in"].waitForExistence(timeout: 15))
    }

    // MARK: Helpers

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
            element.exists && element.isHittable && element.frame.maxY < window.maxY - 40 && element.frame.minY > 110
        }
        if visible() { return true }
        for _ in 0..<tries {
            if element.exists, !element.frame.minY.isFinite || element.frame.minY <= 110 {
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

    private func waitForGone(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !element.exists { return true }
            usleep(300_000)
        }
        return false
    }

    private func waitForAny(_ elements: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let found = elements.first(where: { $0.exists }) { return found }
            usleep(300_000)
        }
        return nil
    }
}
