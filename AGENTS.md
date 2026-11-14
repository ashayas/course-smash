# Agents.MD

- Read this before going anywhere else
- We are 
- Use the cloudflare API token as CLOUDFLARE_API_KEY in .env for inference
- Use wrangler to deploy the completed app to cloudflare and attach a domain maybe you can just make it the root name,
- use secrets to assign the username and password that are in the .env USER_NAME and PW on the cloudflare worker itself so thats the login gate. it should be a login page where the PW is hidden from the user
- the UI theme is the Course Smash city design kit in [DESIGN.md](DESIGN.md), so read that file before building any UI
- use the JEV style clef model from cloudflare to determine if questions are right or wrong for each user based on what they want to learn
- There are two native apps: iOS in `ios/` (SwiftUI, bundle id `app.coursesmash.ios`) and Android in `android/` (Kotlin and Jetpack Compose, application id `app.coursesmash.android`). Each is a 1:1 port of the web app and uses the same `/api/` endpoints. Whenever you add or change a feature on web, port it to both apps in the same change:
  - Put the data and logic behind a JSON endpoint under `/api/`, not only in `public/app.js`, so all three clients share it.
  - Keep the art in `public/city.js` as plain SVG built from data. Both apps bundle that file and run it, so the art needs no port. If you use an SVG element, attribute or animation class that the apps' SVG readers don't know yet, add it to both: `ios/CourseSmash/Art/SVG.swift` and `android/app/src/main/java/app/coursesmash/android/art/Svg.kt`.
  - Build the screen or change in `ios/CourseSmash/Screens` and in `android/app/src/main/java/app/coursesmash/android/screens`, following DESIGN.md, and add it to both walkthrough tests (`ios/CourseSmashUITests` and `android/app/src/androidTest`).
  - Create or update everything the stores need, so both apps can always be published:

    | | iOS (App Store) | Android (Google Play) |
    |---|---|---|
    | Version | `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml` | `versionName` and `versionCode` in `android/app/build.gradle.kts` |
    | Listing text | `ios/fastlane/metadata`: description, keywords, release notes | `android/fastlane/metadata/android`: descriptions and a `changelogs/<versionCode>.txt` |
    | Screenshots, when a screen changes | `ios/fastlane/screenshots`, with `ios/scripts/walkthrough.sh` | `android/fastlane/metadata/android/en-US/images/phoneScreenshots`, with `android/scripts/walkthrough.sh` |
    | Privacy, when what the app collects changes | `ios/CourseSmash/Resources/PrivacyInfo.xcprivacy` | `android/play/data-safety.md` and the Data safety form |
    | Icons, when the logo mark changes | `node ios/scripts/make-icons.mjs` | `node android/scripts/make-icons.mjs` |
    | Build, signing or submitting changes | `ios/README.md` | `android/README.md` |

    The policy in `public/privacy.html` covers both apps. Update it with either privacy file.
  - Check that each app builds and that its walkthrough passes, in the simulator and in the emulator (commands below).
  - Add a short "Mobile" note to the PR or commit that says how the feature works on a phone, and anything that differs between iOS and Android.
- Keep the Worker build apart from `ios/` and `android/`. Nothing in `src/` or `public/` may import or link to files under either folder, and no build setting may watch them. The apps read `public/city.js` (and Android reads `public/vendor/katex.min.js`), and those are the only links. Run `npm run check:isolation` after changing `wrangler.jsonc`, the tsconfig files or the build scripts.

## What's already set up

The infrastructure below already exists. Do not recreate it. `src/index.ts` is a placeholder MCP server, so replace it with the real one and run `npm run deploy`.

| Piece | Value |
|---|---|
| MCP URL | `https://coursesmash.app/mcp` |
| Worker | `coursesmash` (config in `wrangler.jsonc`) |
| D1 database | `coursesmash-db`, bound as `env.DB`; it has no tables yet |
| Worker secrets | `USER_NAME` and `PW`, copied from `.env` |
| GitHub | `ashayas/course-smash` (public, `origin` over SSH) |
| opencode | `coursesmash` and `tweet-stream` are in `~/.config/opencode/opencode.jsonc` |
| iOS app | `ios/`, generated with XcodeGen from `ios/project.yml`; see `ios/README.md` |
| Android app | `android/`, a Gradle project with its wrapper; see `android/README.md` |
| Native login | `POST /api/login` returns a session token, sent back as `Authorization: Bearer <token>` |
| Public pages | `/privacy` and `/support`, which the store listings link to |

### Keep these so opencode keeps working

opencode needs no config changes as long as the real server:

- serves MCP over Streamable HTTP at `/mcp`
- accepts `Authorization: Basic base64(USER_NAME:PW)`, checked against the Worker secrets, and returns 401 otherwise
- keeps the same Worker name and custom domain in `wrangler.jsonc`

If `USER_NAME` or `PW` changes, update `.env`, the Worker secrets, and the `Authorization` header in the opencode config.

### Commands

Run these with the project's Wrangler through `npx`:

- Deploy: `npm run deploy` (existing secrets are kept)
- Query D1: `npx wrangler d1 execute coursesmash-db --remote --command "SELECT 1"`, or `--local` for the local copy
- Update a secret: `npx wrangler secret put PW`, then enter the value at the prompt. This deploys immediately.
- Check the connection: `opencode mcp list`
- Check that `ios/` and `android/` stay out of the Worker build: `npm run check:isolation`

For the iOS app, from `ios/`:

- Generate the Xcode project: `xcodegen`
- Build: `xcodebuild -project CourseSmash.xcodeproj -scheme CourseSmash -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build build`
- Walk every flow and take screenshots: `CS_USER=... CS_PW=... scripts/walkthrough.sh`
- Upload to TestFlight or the App Store: `fastlane ios beta` or `fastlane ios release`. Signing and the one-time setup are in `ios/README.md`.

For the Android app, from `android/`:

- Build: `./gradlew :app:assembleDebug`
- Walk every flow and take screenshots, with an emulator running: `CS_USER=... CS_PW=... scripts/walkthrough.sh`
- Build the signed release bundle: `./gradlew :app:bundleRelease`. It needs `keystore.properties`, which is not in git.
- Upload to Google Play: `fastlane android internal` or `fastlane android release`. Signing and the one-time setup are in `android/README.md`.

### Auth

- Wrangler uses the `wrangler login` session for D1, deploys and secrets.
- Do not set `CLOUDFLARE_API_TOKEN` to the `.env` token. It would override that login, and the token has no D1 access.
- The `.env` token (`CLOUDFLARE_API_KEY`) is for inference only and expires on 2026-11-10.

### Secrets

This repo is public. Never commit `.env`, swap files, or the password, including in its base64 form. The same goes for the apps: no login in `ios/` or `android/`, including the store review demo account, no App Store Connect key, and no Android keystore, `keystore.properties` or Play service account key. Never type the login into a simulator or emulator with `simctl` or `adb`: the walkthrough tests enter it into the masked field. The opencode config holds the password and lives outside the repo, so keep it out.
