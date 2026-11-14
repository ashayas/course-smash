# Agents.MD

- Read this before going anywhere else
- We are 
- Use the cloudflare API token as CLOUDFLARE_API_KEY in .env for inference
- Use wrangler to deploy the completed app to cloudflare and attach a domain maybe you can just make it the root name,
- use secrets to assign the username and password that are in the .env USER_NAME and PW on the cloudflare worker itself so thats the login gate. it should be a login page where the PW is hidden from the user
- the UI theme is the Course Smash city design kit in [DESIGN.md](DESIGN.md), so read that file before building any UI
- use the JEV style clef model from cloudflare to determine if questions are right or wrong for each user based on what they want to learn
- There is a native iOS app in `ios/` (SwiftUI, bundle id `app.coursesmash.ios`). It is a 1:1 port of the web app and uses the same `/api/` endpoints. Whenever you add or change a feature on web, port it to the iOS app in the same change:
  - Put the data and logic behind a JSON endpoint under `/api/`, not only in `public/app.js`, so both clients share it.
  - Keep the art in `public/city.js` as plain SVG built from data. The iOS app bundles that file and runs it, so the art needs no port. If you use an SVG element, attribute or animation class that `ios/CourseSmash/Art/SVG.swift` doesn't read yet, add it there.
  - Build the screen or change in `ios/CourseSmash/Screens`, following DESIGN.md, and add it to the walkthrough in `ios/CourseSmashUITests`.
  - Create or update everything the App Store needs, so the app can always be published:
    - the version: raise `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml`
    - the listing in `ios/fastlane/metadata`: description, keywords and release notes
    - the screenshots in `ios/fastlane/screenshots`, retaken with `ios/scripts/walkthrough.sh` when a screen changes
    - the privacy manifest `ios/CourseSmash/Resources/PrivacyInfo.xcprivacy` and the policy in `public/privacy.html`, when what the app collects changes
    - the icons, with `node ios/scripts/make-icons.mjs`, when the logo mark changes
    - `ios/README.md`, when building, signing or submitting changes
  - Check that it builds and that the walkthrough passes in the simulator (commands below).
  - Add a short "Mobile" note to the PR or commit that says how the feature works on a phone.
- Keep the Worker build apart from `ios/`. Nothing in `src/` or `public/` may import or link to files under `ios/`, and no build setting may watch it. The app reads `public/city.js`, and that is the only link. Run `npm run check:isolation` after changing `wrangler.jsonc`, the tsconfig files or the build scripts.

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
| Native login | `POST /api/login` returns a session token, sent back as `Authorization: Bearer <token>` |
| Public pages | `/privacy` and `/support`, which the App Store listing links to |

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
- Check that `ios/` stays out of the Worker build: `npm run check:isolation`

For the iOS app, from `ios/`:

- Generate the Xcode project: `xcodegen`
- Build: `xcodebuild -project CourseSmash.xcodeproj -scheme CourseSmash -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build build`
- Walk every flow and take screenshots: `CS_USER=... CS_PW=... scripts/walkthrough.sh`
- Upload to TestFlight or the App Store: `fastlane ios beta` or `fastlane ios release`. Signing and the one-time setup are in `ios/README.md`.

### Auth

- Wrangler uses the `wrangler login` session for D1, deploys and secrets.
- Do not set `CLOUDFLARE_API_TOKEN` to the `.env` token. It would override that login, and the token has no D1 access.
- The `.env` token (`CLOUDFLARE_API_KEY`) is for inference only and expires on 2026-11-10.

### Secrets

This repo is public. Never commit `.env`, swap files, or the password, including in its base64 form. The same goes for the iOS app: no login in `ios/`, including the App Review demo account, and no App Store Connect key. The opencode config holds the password and lives outside the repo, so keep it out.
