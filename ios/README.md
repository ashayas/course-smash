# Course Smash for iOS

The native iPhone app. It is a SwiftUI port of the web app in `public/`, screen for screen, and it talks to the same Worker endpoints under `/api/`.

| | |
|---|---|
| Bundle ID | `app.coursesmash.ios` |
| Version | `1.0.0`, build `1` (`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `project.yml`) |
| Runs on | iPhone, iOS 17 or later, portrait |
| Server | `https://coursesmash.app` (`CSAPIBaseURL` in `project.yml`) |
| Dependencies | [SwiftMath](https://github.com/mgriebling/SwiftMath) 1.7.3, for formulas |

## Build and run

You need Xcode 16 or later with an iOS simulator runtime, and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```sh
brew install xcodegen
cd ios
xcodegen                      # writes CourseSmash.xcodeproj from project.yml
open CourseSmash.xcodeproj    # then Run, or build from the command line:
xcodebuild -project CourseSmash.xcodeproj -scheme CourseSmash \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build build
```

The project file is generated, so it is not in git. Change `project.yml` and run `xcodegen` again. `CourseSmash/Info.plist` is also written by XcodeGen from the `info:` section of `project.yml`.

To run against a local Worker, start `npm run dev` in the repo root and set `CS_API_BASE_URL=http://localhost:8787` in the scheme's environment. Only debug builds read it.

## How it is put together

| Folder | What is in it |
|---|---|
| `CourseSmash/App` | The app entry and `AppModel`: the session, the current section and the navigation path |
| `CourseSmash/Auth` | `Credential`, `AuthService`, `SessionStorage` and `SessionStore` |
| `CourseSmash/API` | `APIClient` and the response types for `/api/` |
| `CourseSmash/Art` | `CityEngine` runs the web app's `public/city.js`; `SVG.swift` and `SVGView.swift` draw what it returns |
| `CourseSmash/Design` | The design kit from `DESIGN.md`: colours, type, buttons, cards |
| `CourseSmash/Text` | Formulas and markdown markers in model text, and question diagrams |
| `CourseSmash/Screens` | Login, home, library, course and questions, building picker, stats |
| `CourseSmashUITests` | A walkthrough of every flow, which also takes the screenshots |

**The city art is shared with the web app.** `public/city.js` is bundled into the app as it is and run in JavaScriptCore. The SVG it returns is drawn natively, with the same looping motion as `public/styles.css`. A new building on the web shows up in the app on the next build. If `city.js` starts using an SVG element, attribute or animation class that `Art/SVG.swift` does not read, add it there.

**Question diagrams** are SVG that a model drew and the Worker sanitised. The app shows them as an image inside a web view with JavaScript turned off, as the web app does with `<img>`.

### Login

The app posts the username and password to `POST /api/login` and gets back a signed session token, which it keeps in the keychain and sends as `Authorization: Bearer <token>`. The token is the same signed value as the web app's session cookie, and lasts 14 days. The password is never stored.

Sign in with Apple or Google is not built yet. To add a provider:

1. Add a case to `Credential` in `Auth/Auth.swift`, such as `.apple(identityToken:)`.
2. Handle it in `WorkerAuthService.signIn`, posting to a new Worker endpoint that checks the provider's token and returns the same `{ token, username, expires_at }`.
3. Add the button to `LoginView`, and the capability to `CourseSmash.entitlements`.

Nothing else changes, since the rest of the app only sees a `Session`.

## Signing

`DEVELOPMENT_TEAM` is a placeholder. Simulator builds work without it. Device builds, archives and uploads need your 10-character Apple Developer Team ID, from [developer.apple.com/account](https://developer.apple.com/account) under Membership details.

Put it in `Config/Signing.local.xcconfig`, which git ignores:

```
DEVELOPMENT_TEAM = ABCDE12345
```

Signing is automatic, so Xcode creates the App ID and provisioning profile the first time you archive while signed in to that team. If `app.coursesmash.ios` is taken, change `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml` and `app_identifier` in `fastlane/Appfile`.

## Before the first submission

These need you, once:

1. **Apple Developer Program** membership, and your Team ID set as above.
2. **An app record** in [App Store Connect](https://appstoreconnect.apple.com): New App, iOS, bundle ID `app.coursesmash.ios`, name "Course Smash", SKU of your choice.
3. **A demo account for App Review.** The app has no sign-up, so reviewers need a login. Create one with `scripts/add-user.mjs` (see the root README) and enter it under App Review Information. Do not commit it: `fastlane/metadata/review_information/demo_user.txt` and `demo_password.txt` are placeholders.
4. **App Privacy answers** in App Store Connect, matching `CourseSmash/Resources/PrivacyInfo.xcprivacy`: User ID and Other User Content, both linked to the user, used for app functionality, not used for tracking.
5. **Age rating and pricing**, which only App Store Connect can set.
6. Read `public/privacy.html` (served at https://coursesmash.app/privacy) and `fastlane/metadata/copyright.txt`, and change anything that is not right for you.
7. Optional: an App Store Connect API key, so uploads do not ask for a two-factor code. Set `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH`.

## Submit with fastlane

```sh
brew install fastlane
cd ios
export DEVELOPMENT_TEAM=ABCDE12345
export FASTLANE_APPLE_ID=you@example.com     # not needed with an API key

fastlane ios beta        # archive and upload to TestFlight
fastlane ios metadata    # upload the text, URLs and screenshots only
fastlane ios release     # archive and upload the build with its metadata and screenshots
```

`release` does not submit for review. Check the version in App Store Connect and press Submit there.

## Submit with xcodebuild

```sh
cd ios && xcodegen
xcodebuild -project CourseSmash.xcodeproj -scheme CourseSmash -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/CourseSmash.xcarchive \
  DEVELOPMENT_TEAM=ABCDE12345 -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/CourseSmash.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
xcrun altool --upload-app -f build/export/CourseSmash.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

Or open the archive in Xcode's Organizer and choose Distribute App.

## Every release

- Raise `MARKETING_VERSION` for a new version and `CURRENT_PROJECT_VERSION` for every upload, in `project.yml`.
- Update `fastlane/metadata/en-US/release_notes.txt`, and the description and keywords if features changed.
- Retake the screenshots if a screen changed (below).
- Keep `PrivacyInfo.xcprivacy` and `public/privacy.html` true to what the app collects.
- Run `node ios/scripts/make-icons.mjs` if the logo mark in `public/city.js` changed.

## App Store metadata

`fastlane/metadata` holds what `fastlane ios metadata` uploads.

| File | Value |
|---|---|
| `en-US/name.txt` | Course Smash |
| `en-US/subtitle.txt` | Learn by building a city |
| `en-US/description.txt`, `keywords.txt`, `promotional_text.txt`, `release_notes.txt` | The store listing |
| `en-US/support_url.txt` | https://coursesmash.app/support |
| `en-US/privacy_url.txt` | https://coursesmash.app/privacy |
| `en-US/marketing_url.txt` | https://coursesmash.app |
| `primary_category.txt`, `secondary_category.txt` | Education, Productivity |
| `review_information/notes.txt` | What a reviewer should try |

## Screenshots and the walkthrough test

`CourseSmashUITests` logs in, walks every flow against a real Worker and saves a screenshot of each screen. It starts one library course and one planned course, and deletes both before it ends.

```sh
CS_USER=<username> CS_PW=<password> ios/scripts/walkthrough.sh ios/build/walkthrough
```

It uses the iPhone 16 Pro Max simulator by default. Its 1320 × 2868 screenshots are the 6.9-inch size the App Store requires, and App Store Connect scales them for smaller iPhones. The ones chosen for the listing are in `fastlane/screenshots/en-US`.

Set `CS_BASE_URL` to use another Worker, such as a local `wrangler dev`. The login is passed to the test runner only, and nothing writes it to disk.

## App icon and launch screen

`scripts/make-icons.mjs` draws both from the logo mark in `public/city.js`, so they match the web app. It writes the 1024-pixel App Store icon, every iPhone icon size and the launch mark into `CourseSmash/Resources/Assets.xcassets`. It needs ImageMagick.

## The Worker never builds this folder

Nothing in `src/` or `public/` refers to `ios/`. The app reads `public/city.js`, and that is the only link, in that one direction. From the repo root, `npm run check:isolation` bundles the Worker with a dry run and fails if any file from `ios/` ends up in the bundle or the static assets.

## Licences

Inter Tight is bundled under the SIL Open Font License (`CourseSmash/Resources/Fonts/OFL.txt`). SwiftMath is MIT licensed.
