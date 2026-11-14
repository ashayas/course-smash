# Course Smash for Android

The native Android app. It is a Kotlin and Jetpack Compose port of the web app in `public/`, screen for screen, and it talks to the same Worker endpoints under `/api/`. It matches the iOS app in `ios/`.

| | |
|---|---|
| Application ID | `app.coursesmash.android` |
| Version | `1.0.0`, version code `1` (`versionName` and `versionCode` in `app/build.gradle.kts`) |
| Runs on | Phones, Android 8.0 (API 26) or later, portrait. Targets API 36. |
| Server | `https://coursesmash.app` (`API_BASE_URL` in `app/build.gradle.kts`) |
| Libraries | Jetpack Compose (UI and Foundation), Activity Compose, kotlinx.serialization and coroutines. No Material library and no third-party SDKs. |

## Build and run

You need JDK 17 and the Android SDK with platform 36 and build-tools 35. The Gradle wrapper is in the repository.

```sh
cd android
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # once; ignored by git
./gradlew :app:assembleDebug                                  # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:installDebug                                   # onto a running emulator or device
```

Or open the `android` folder in Android Studio and press Run.

To run against a local Worker, start `npm run dev` in the repo root and launch a debug build with the address the emulator uses for your computer:

```sh
adb shell am start -n app.coursesmash.android/.MainActivity --es cs_base_url http://10.0.2.2:8787
```

Only debug builds read `cs_base_url`, and only debug builds may use plain http.

## How it is put together

Sources are under `app/src/main/java/app/coursesmash/android`.

| File or folder | What is in it |
|---|---|
| `MainActivity.kt`, `AppModel.kt` | The entry point, and the session, current section and navigation path |
| `Auth.kt` | `Credential`, `AuthService`, `SessionStorage` and `SessionStore` |
| `Api.kt`, `Models.kt` | `ApiClient` and the response types for `/api/` |
| `art/` | `CityEngine` runs the web app's `public/city.js`; `Svg.kt` and `SvgView.kt` draw what it returns |
| `ui/` | The design kit from `DESIGN.md` (colours, type, buttons, cards), formulas and question diagrams |
| `screens/` | Login, home, library, course and questions, building picker, stats |
| `app/src/androidTest` | A walkthrough of every flow, which also takes the screenshots |

**The city art is shared with the web app.** A Gradle task copies `public/city.js` into the app's assets at build time. The app runs it in a web view that is never shown and can load nothing else, and draws the SVG it returns natively on a Compose canvas, with the same looping motion as `public/styles.css`. A new building on the web shows up in the app on the next build. If `city.js` starts using an SVG element, attribute or animation class that `art/Svg.kt` does not read, add it there.

**Formulas** use the web app's own renderer. `public/vendor/katex.min.js` is copied into the assets the same way, and text that contains a formula is laid out by KaTeX in a small web view. Text without one, which is nearly all of it, is ordinary Compose text.

**Question diagrams** are SVG that a model drew and the Worker sanitised. The app shows them as an image in a web view with JavaScript off and network loads blocked, as the web app does with `<img>`.

### Login

The app posts the username and password to `POST /api/login` and gets back a signed session token, which it sends as `Authorization: Bearer <token>`. The token is kept in the app's private storage, encrypted with a key in the Android Keystore, and is left out of backups. It lasts 14 days. The password is never stored.

Sign in with Google is not built yet. To add a provider:

1. Add a subclass to `Credential` in `Auth.kt`, such as `Google(idToken)`.
2. Handle it in `WorkerAuthService.signIn`, posting to a new Worker endpoint that checks the provider's token and returns the same `{ token, username, expires_at }`.
3. Add the button to `LoginScreen`.

Nothing else changes, since the rest of the app only sees a `Session`.

## Signing

Release builds are signed with an upload key that you create once and keep out of the repository.

```sh
cd android
keytool -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp keystore.properties.example keystore.properties     # then fill in the two passwords
```

`keystore.properties`, `*.jks` and `*.keystore` are ignored by git. `keystore.properties.example` is the placeholder that is committed. Back up the keystore and its passwords somewhere safe: with Play App Signing, a lost upload key can be reset by Google, but only after a support request.

Without `keystore.properties` the release bundle still builds, unsigned, so the project works on a fresh clone.

```sh
./gradlew :app:bundleRelease     # app/build/outputs/bundle/release/app-release.aab
jarsigner -verify app/build/outputs/bundle/release/app-release.aab
```

The release build is not shrunk with R8 yet. The walkthrough test runs against the debug build, and a shrunk build should not ship until the same test has passed against it. `app/proguard-rules.pro` holds the rules for when that is turned on.

## Before the first release

These need you, once:

1. **A Google Play developer account**, and an app in [Play Console](https://play.google.com/console) with the package name `app.coursesmash.android`. If the name is taken, change `applicationId` and `namespace` in `app/build.gradle.kts` and `package_name` in `fastlane/Appfile`.
2. **The upload keystore**, as above, and Play App Signing turned on when you upload the first bundle.
3. **A demo account for review.** The app has no sign-up, so reviewers need a login. Create one with `scripts/add-user.mjs` (see the root README) and enter it in Play Console under App content, App access. Do not commit it.
4. **The App content forms**: Data safety, from `play/data-safety.md`; the content rating questionnaire; target audience; ads (none).
5. **Testing before production.** New personal developer accounts must run a closed test before they can publish to production (12 testers for 14 days at the time of writing; Play Console shows the current rule).
6. Read `public/privacy.html` (served at https://coursesmash.app/privacy), and change anything that is not right for you.
7. Optional: a service account key for uploads from the command line. Set `PLAY_JSON_KEY` to its path.

The first bundle for a new app has to be uploaded by hand in Play Console. After that, fastlane can do it.

## Upload with fastlane

```sh
brew install fastlane
cd android
export PLAY_JSON_KEY=/path/outside/the/repo/play-service-account.json

fastlane android internal    # build the signed bundle and upload it to internal testing
fastlane android metadata    # upload the listing text, graphics and screenshots only
fastlane android release     # upload to production as a draft, with the listing
```

`release` leaves the release as a draft. Check it in Play Console and send it for review there.

## Upload by hand

Build the bundle with `./gradlew :app:bundleRelease`, then in Play Console choose a testing track or Production, Create new release, and upload `app/build/outputs/bundle/release/app-release.aab`.

## Every release

- Raise `versionCode` for every upload and `versionName` for every release, in `app/build.gradle.kts`.
- Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, and update the descriptions if features changed.
- Retake the screenshots if a screen changed (below).
- Keep `play/data-safety.md`, the Data safety form and `public/privacy.html` true to what the app collects.
- Run `node android/scripts/make-icons.mjs` if the logo mark in `public/city.js` changed.

## Store listing

`fastlane/metadata/android/en-US` holds what `fastlane android metadata` uploads.

| File | Value |
|---|---|
| `title.txt` | Course Smash |
| `short_description.txt` | Say what you want to learn, and build a city one course at a time. |
| `full_description.txt` | The store description |
| `changelogs/1.txt` | What's new in version code 1 |
| `images/icon.png` | 512 × 512 store icon |
| `images/featureGraphic.png` | 1024 × 500 feature graphic |
| `images/phoneScreenshots/` | Eight phone screenshots, 1080 × 1920 |

Category (Education), contact details and the privacy policy URL are set in Play Console.

## Screenshots and the walkthrough test

`WalkthroughTest` logs in, walks every flow against a real Worker and saves a screenshot of each screen. It starts one library course and one planned course, and deletes both before it ends.

```sh
CS_USER=<username> CS_PW=<password> android/scripts/walkthrough.sh android/build/walkthrough
```

It needs a running emulator or a connected device. Set `CS_BASE_URL=http://10.0.2.2:8787` to use a local `wrangler dev`. The login is passed to the test only, and nothing writes it to disk. The store screenshots are these, cropped to 9:16.

## Launcher icon and splash screen

`scripts/make-icons.mjs` draws them from the logo mark in `public/city.js`, so they match the web app and the iOS app: the adaptive icon's foreground, the legacy icons, the splash mark, and the Play store icon and feature graphic. It needs ImageMagick. The adaptive icon's background and the splash background are the ink colour in `res/values/colors.xml`.

## The Worker never builds this folder

Nothing in `src/` or `public/` refers to `android/`. The app reads `public/city.js` and `public/vendor/katex.min.js`, and those are the only links, in that one direction. From the repo root, `npm run check:isolation` bundles the Worker with a dry run and fails if any file from `ios/` or `android/` ends up in the bundle or the static assets.

## Licences

Inter Tight is bundled under the SIL Open Font License (`INTER-TIGHT-OFL.txt`). KaTeX is MIT licensed (`public/vendor/KATEX-LICENSE.txt`).
