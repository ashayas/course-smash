# Course Smash for iOS

The native iPhone app. It is a SwiftUI port of the web app in `public/`, screen for screen, and it talks to the same Worker endpoints under `/api/`.

| | |
|---|---|
| Bundle ID | `app.coursesmash.ios` |
| Version | `1.3.0`, build `5` (`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `project.yml`) |
| Runs on | iPhone, iOS 17 or later, portrait |
| Server | `https://coursesmash.app` (`CSAPIBaseURL` in `project.yml`) |
| Dependencies | [SwiftMath](https://github.com/mgriebling/SwiftMath) 1.7.3, for formulas |

## Build and run

You need Xcode with an iOS simulator runtime, and [XcodeGen](https://github.com/yonaskolb/XcodeGen). Xcode 16 or later builds and runs the app. **Submitting needs Xcode 26 or later**: App Store Connect rejects uploads that were not built with the iOS 26 SDK (the upload fails with a 409).

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

Debug builds sign automatically. Release archives, which are the ones you upload, sign **manually** for the App Store, with two things referenced by name in `project.yml` and `ExportOptions.plist`:

| What | Name | Lives in |
|---|---|---|
| Distribution certificate | `Apple Distribution` (any "Apple Distribution: <team>" identity) | The login keychain of the Mac that archives |
| App Store provisioning profile | `Course Smash App Store` | `~/Library/MobileDevice/Provisioning Profiles` and `~/Library/Developer/Xcode/UserData/Provisioning Profiles` |

Manual signing avoids two problems with automatic signing: an archive needs a development profile, which Apple won't make until the team has a registered device, and an App Store Connect API key with the App Manager role isn't allowed to use Xcode's cloud signing.

Make both once per Mac, at [developer.apple.com/account](https://developer.apple.com/account) → Certificates, IDs & Profiles:

1. **Identifier:** register `app.coursesmash.ios` if it isn't listed.
2. **Certificate:** + → Apple Distribution. Upload a certificate signing request (Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority, saved to disk), download the certificate and double-click it, so it lands in the login keychain with its private key. `security find-identity -v -p codesigning` should list `Apple Distribution: <team> (<TEAM-ID>)`.
3. **Profile:** + → App Store Connect → `app.coursesmash.ios` → that certificate → name it exactly `Course Smash App Store`. Download it and double-click it.

An App Store Connect API key with the App Manager role can do steps 1 to 3 through the API as well (`POST /v1/bundleIds`, `/v1/certificates` and `/v1/profiles`). A profile expires with its certificate, after a year; make a new one with the same name and nothing in the repo changes.

None of this goes in git: no certificate, private key, `.p12`, profile or API key.

If `app.coursesmash.ios` is taken, change `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml`, `app_identifier` in `fastlane/Appfile`, and the key in `ExportOptions.plist`.

## Before the first submission

These need you, once:

0. **Xcode 26 or later** on the Mac that archives and uploads. An archive made with an older Xcode builds and exports, and is then refused at upload.
1. **Apple Developer Program** membership, and your Team ID set as above.
2. **An app record** in [App Store Connect](https://appstoreconnect.apple.com): New App, iOS, bundle ID `app.coursesmash.ios`, name "Course Smash", SKU of your choice. Or run `fastlane produce --app_identifier app.coursesmash.ios --app_name "Course Smash" --team_id <TEAM-ID> --sku coursesmash --language en-US --platform ios --skip_devcenter` and sign in when asked. If either says creation "is not available due to your provider's contract state", the Account Holder has to accept the pending agreement at developer.apple.com and in App Store Connect → Business first.
3. **A demo account for App Review.** The app has no sign-up, so reviewers need a login. Create one with `scripts/add-user.mjs` (see the root README) and enter it under App Review Information. Do not commit it: `fastlane/metadata/review_information/demo_user.txt` and `demo_password.txt` are placeholders.
4. **App Privacy answers** in App Store Connect, matching `CourseSmash/Resources/PrivacyInfo.xcprivacy`. They are written out in [app-store/privacy-label.md](app-store/privacy-label.md): User ID, Other User Content, Product Interaction and Other Data Types, all linked to the user, used for app functionality, not used for tracking.
5. **Age rating and pricing**, which only App Store Connect can set. The answers are in [app-store/age-rating.md](app-store/age-rating.md).
6. Read `public/privacy.html` (served at https://coursesmash.app/privacy) and `fastlane/metadata/copyright.txt`, and change anything that is not right for you.
7. Optional: an App Store Connect API key, so uploads do not ask for a two-factor code. App Manager is enough. Keep the `.p8` in `~/.appstoreconnect/private_keys/` (where `altool` looks for it) and set `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH`.
8. **The distribution certificate and profile** from [Signing](#signing).
9. **The iOS platform** for Xcode 26, which doesn't ship with it: `xcodebuild -downloadPlatform iOS` (about 8 GB). Without it, archiving fails with "iOS 26.x is not installed".
10. **Testers.** In TestFlight, make an internal group with access to all builds and add team members. A team member who can't see every app must first be given access to Course Smash under Users and Access, or adding them fails with "Tester(s) cannot be assigned".

## Submit with fastlane

```sh
brew install fastlane
cd ios
export DEVELOPMENT_TEAM=ABCDE12345
export FASTLANE_APPLE_ID=you@example.com     # not needed with an API key
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8  # fastlane fails with an encoding error ("Cr" on UTF-16) without a UTF-8 locale

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
  DEVELOPMENT_TEAM=ABCDE12345 archive
# /usr/bin first: the export fails with "Copy failed" if Homebrew's rsync comes first on PATH.
PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH" xcodebuild -exportArchive -archivePath build/CourseSmash.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export
xcrun altool --upload-app -f build/export/CourseSmash.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

Don't pass signing settings such as `CODE_SIGN_STYLE` or `PROVISIONING_PROFILE_SPECIFIER` on the command line. They'd apply to the Swift package targets too, and those refuse a provisioning profile.

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

`CourseSmashUITests` logs in, walks every flow against a real Worker and saves a screenshot of each screen: Today and daily recall, the four tabs, a library course, the building picker, You, stats and logging out. It answers today's recall set when there is one, so that set is used up for the day. It puts the settings it changes back, starts one library course and one planned course, and deletes both before it ends.

```sh
CS_USER=<username> CS_PW=<password> ios/scripts/walkthrough.sh ios/build/walkthrough
```

It uses the iPhone 16 Pro Max simulator by default, whose screen is 1320 × 2868.

Set `CS_BASE_URL` to use another Worker, such as a local `wrangler dev`. The login is passed to the test runner only, and nothing writes it to disk.

An account with nothing to recall yet, which is how every account starts, only gets its Today cards walked. To walk recall, run against a local server with demo data (`node scripts/demo.mjs data/demo.db` from the repo root, then the Node server; see the root README, "Check your work"). The demo learner already has courses in progress, so start another one with `CS_LIBRARY_COURSE="LLM inference"`. Make the demo data again before each run, because the run answers the day's questions.

**The store screenshots** in `fastlane/screenshots/en-US` are made from a demo run, not from a real account, so they show a believable score and no real username:

```sh
# From the repo root, with the demo server running on :8787 and a throwaway USER_NAME, since the You screen shows it
node scripts/demo-keys.mjs data/demo.db &
CS_USER=<username> CS_PW=<password> CS_BASE_URL=http://localhost:8787 CS_KEY_URL=http://localhost:8790 ios/scripts/walkthrough.sh ios/build/walkthrough
node scripts/marketing/build.mjs --ios ios/build/walkthrough
```

With `CS_KEY_URL` set, the walkthrough asks the helper for the right answer to each question, and still gets one recall question and one course question wrong on purpose. The helper only reads the local demo database; the Worker has nothing like it. `scripts/marketing/build.mjs` puts each `store-…` capture under its headline, at 1320 × 2868 for 6.9-inch iPhones (`iphone69-…`) and 1284 × 2778 for 6.5-inch ones (`iphone65-…`). The app is iPhone-only, so there is no iPad set.

## App icon and launch screen

`scripts/make-icons.mjs` draws both from the logo mark in `public/city.js`, so they match the web app. It writes the 1024-pixel App Store icon, every iPhone icon size and the launch mark into `CourseSmash/Resources/Assets.xcassets`. It needs ImageMagick.

## The Worker never builds this folder

Nothing in `src/` or `public/` refers to `ios/`. The app reads `public/city.js`, and that is the only link, in that one direction. From the repo root, `npm run check:isolation` bundles the Worker with a dry run and fails if any file from `ios/` ends up in the bundle or the static assets.

If the Worker deploys on push through Workers Builds, also exclude `ios/*` under Build watch paths in the Cloudflare dashboard (Workers & Pages, `coursesmash`, Settings, Build). A push that only changes this folder then skips the build. Cloudflare bypasses watch paths for pushes with 20 or more commits or 3000 or more changed files.

## Licences

Inter Tight is bundled under the SIL Open Font License (`CourseSmash/Resources/Fonts/OFL.txt`). SwiftMath is MIT licensed.
