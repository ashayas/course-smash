# Course Smash

![Course Smash flow](docs/course-smash.gif)

Say what you want to learn. An agent builds a course of multiple-choice and short-answer questions, multiple-choice answers are checked against the answer key, a decision model rates short answers against your goal, and the agent reads your results to write what comes next.

The same app runs on Cloudflare or in Docker.

The design is an isometric city: every course is a building, one floor per module, and floors light up as you pass them. See [DESIGN.md](DESIGN.md).

## How it works

![Sketch: the user asks the agent for a course and answers questions into state. The agent builds courses, reads the state and changes the questions.](docs/architecture-sketch.png)

1. You describe what you want to learn, and the agent plans modules and writes the first questions.
2. You answer. Multiple-choice answers are checked against the answer key with no model involved. Short answers are rated by the decision model against your goal, and a writing model explains the result.
3. Your answers go into the learner state. When a round ends, the decision model reads that state and either adds follow-up questions on weak concepts or moves you on.

### How well you need to know a module

When a course starts, the decision model rates each module against your goal as core, supporting or background. That sets the module's bar and how many follow-up rounds it can get:

| Importance | Bar per subtopic | Follow-up rounds |
|---|---|---|
| Core | 80% | up to 3 |
| Supporting | 70% | up to 2 |
| Background | 55% | 1 |

After each round, a module with every subtopic at or above its bar passes straight away. Otherwise the decision model sees the bar, the subtopics below it and any not yet asked, and decides whether the gaps matter for your goal. Mastery is per subtopic, and recent answers count most.

### The library

Besides courses written on demand, there's a library of ready-made short courses on AI engineering, Kubernetes, inference engineering, identity and integrations (OAuth, OIDC, SCIM, connectors), cybersecurity, robotics and hardware for beginners, and AI policy. Each module comes with a bank of 16 to 30 reviewed questions. Starting a library course asks what you want out of it, so the bars fit you.

### Bank first, write when needed

Every course has a question bank. Library courses share theirs; a course you plan yourself gets a private one. Each round decides where its questions come from:

| Round | Source |
|---|---|
| First round | The bank's reviewed core set. |
| Follow-up, with enough unused bank questions on your weak subtopics | Clef compares your wrong answers with the bank questions on offer. If they'd expose and fix the confusion, they're used; if your answers show a misconception they don't touch, new ones are written. |
| Follow-up, after a round of bank follow-ups that still left you below the bar | New questions aimed at your answers, since more of the same isn't working. |
| Follow-up, with too few bank questions left | New questions. |

Every question the agent writes is saved to the bank as `generated`. Reviewed questions are always drawn before generated ones. Multiple choice is graded by the answer key stored with the question, never by a model, and a question can carry a `source_url` that's shown after you answer.

Questions can include diagrams and formulas. Diagrams are SVG, cleaned against an allowlist on the server and shown through `<img>`, where SVG can't run scripts. Formulas are LaTeX between `\(` and `\)`, rendered to MathML by a local copy of KaTeX. Dollar signs stay literal, because prices come up a lot.

The library is generated with Claude by `scripts/catalog/generate.mjs` and loaded with `scripts/catalog/import.mjs`. See [Build the library](#build-the-library).

## Screenshots

| | |
|---|---|
| ![Log in](docs/screenshots/01-login.png) | ![Describe what you want to learn](docs/screenshots/02-describe.png) |
| Log in | Describe what you want to learn |
| ![The agent plans the course](docs/screenshots/03-building.png) | ![A multiple-choice question](docs/screenshots/04-question.png) |
| The agent plans the course | Answer a multiple-choice question |
| ![Multiple-choice result](docs/screenshots/05-multiple-choice-result.png) | ![A short-answer question](docs/screenshots/06-short-answer.png) |
| Checked against the answer key | Write a short answer |
| ![Short-answer result](docs/screenshots/07-short-answer-result.png) | ![The agent reads your answers](docs/screenshots/08-agent-reading.png) |
| Rated by the decision model | The agent reads your answers |
| ![Follow-up questions](docs/screenshots/09-follow-up.png) | ![Course finished](docs/screenshots/10-finished.png) |
| Follow-ups aimed at your weak spots | Finish the course |

| | Cloudflare | Docker |
|---|---|---|
| Runtime | Workers | Node 22 (`src/server/node.ts`) |
| Database | D1 | SQLite file in a volume |
| Static files | Assets | Served from `public/` |
| Login rate limit | Rate Limiting binding | In memory |
| Decision model | Clef | Clef, or any OpenAI-compatible model |
| Writing model | gpt-oss on Workers AI | gpt-oss on Workers AI, or any OpenAI-compatible model |

## Run with Docker

```sh
cp .env.example .env   # set USER_NAME, PW and one inference option
docker compose up --build
```

Open http://localhost:8787. Set `PORT` in `.env` to use a different host port. Answers live in the `coursesmash-data` volume and migrations run at startup.

If you serve it over HTTPS, put it behind a reverse proxy that sets `X-Forwarded-Proto: https`, so the session cookie is marked `Secure`. Behind a proxy, every visitor shares one IP for the login rate limit.

Without Docker, on Node 22:

```sh
npm ci && npm run build:server
set -a; source .env; set +a; npm run start:server
```

## Develop on Cloudflare's runtime

```sh
npm ci
cp .env.example .dev.vars   # fill it in; delete the OpenAI lines unless you use them
npm run db:migrate:local
npm run dev
```

## Deploy to Cloudflare

1. In `wrangler.jsonc`, set `account_id`, `vars.CLOUDFLARE_ACCOUNT_ID`, the `routes` domain and the D1 `database_id` to your own. Create the database with `npx wrangler d1 create coursesmash-db`.
2. Set the secrets: `npx wrangler secret put USER_NAME`, then the same for `PW` and `CLOUDFLARE_API_KEY`.
3. Run `npm run deploy`, which applies D1 migrations and then deploys.

To deploy on every git push, connect the repo in Workers Builds and use `npm run deploy` as the deploy command. The build's API token needs D1 edit access, since the command runs migrations.

## Accounts

The admin login comes from the `USER_NAME` and `PW` secrets. Add more people with `scripts/add-user.mjs`, which stores a PBKDF2 hash of the password, never the password itself. Each account sees only its own courses, on the web and over MCP.

```sh
# Cloudflare
NEW_PASSWORD='their-password' node scripts/add-user.mjs <username> > user.sql
npx wrangler d1 execute coursesmash-db --remote --file user.sql && rm user.sql

# Docker
docker compose exec -e NEW_PASSWORD='their-password' coursesmash node scripts/add-user.mjs <username> --sqlite /data/coursesmash.db
```

Run the same command again to change a password. That also signs the person out everywhere.

## MCP

`/mcp` serves MCP over Streamable HTTP, with `Authorization: Basic base64(username:password)` for any account. Tools: `create_course`, `list_library`, `start_library_course`, `list_courses`, `get_course`, `answer_question`, `advance_course`.

## iOS app

There is a native iPhone app in [`ios/`](ios/README.md). It is a SwiftUI port of the web app that uses the same `/api/` endpoints, and it draws the city by running `public/city.js`, so both show the same buildings. It logs in with `POST /api/login`, which returns a session token for `Authorization: Bearer`.

```sh
brew install xcodegen
cd ios && xcodegen && open CourseSmash.xcodeproj
```

Signing, App Store metadata and how to submit are in [`ios/README.md`](ios/README.md). The Worker build never includes that folder, and `npm run check:isolation` checks it.

## Build the library

The topics live in `scripts/catalog/topics.json`. The generator sends Message Batches to Claude Opus 5.5, at half the normal price: an outline per course, a question bank per module, then a review of every bank that fixes or drops questions with a wrong key. Two more stages grow live modules: each expansion adds 8 follow-up questions that don't repeat the existing ones, and only those 8 are reviewed before they join the bank. Results go to `catalog/courses/`, and a rerun only does what's missing.

```sh
set -a; source .env; set +a      # needs ANTHROPIC_API_KEY
node --experimental-strip-types scripts/catalog/generate.mjs run --cap 150
node --experimental-strip-types scripts/catalog/generate.mjs status
node scripts/catalog/import.mjs --remote   # or --local, or --sqlite <path> for Docker
```

Courses can also be written by hand (or by agents) from primary sources. Put a `plan.json` and one `modules/m<position>.json` per module in a folder, check each module with `node scripts/catalog/check-draft.mjs <module.json>`, then run `node scripts/catalog/merge-drafts.mjs <folder> <track>` to write the course file and import it as usual. `scripts/catalog/briefs/canada-ai-policy.md` is the brief used for the AI policy course.

Every response's token usage is logged to `catalog/.state/ledger.jsonl`. Before a batch is sent, its worst case (every request using all of its `max_tokens`) is added to the spend so far, and requests are dropped until that fits under `--cap`. Only modules that passed review are imported.

## Check your work

```sh
npm run typecheck
node --experimental-strip-types evals/run_evals.mjs
```

## Evals

`evals/` holds 140 synthetic cases: 40 on course quality, 50 on question quality and 50 on grading decisions. The harness validates them and scores local heuristic graders, with no API calls. Its baseline numbers describe those heuristics, not Clef or any other model. See [evals/README.md](evals/README.md).

> [!CAUTION]
> This eval set is educational. It was generated with frontier-model subagents for a live demo. Don't use frontier models to create eval sets for your own work unless you've checked the provider's usage policy first.

### Development

Built during a 15-minute demo at the BIOS SPHERE conference, starting from a hand-drawn sketch (above) and this prompt:

```text
I'd like to build a course agent where a user can use a prompt to generate a multiple-choice questionnaire-based module course on a topic. There should be a database where we have some state that the course answers go to. The agent should then create some questions based on the feedback. The questions should be multiple-choice and also short answer.

Let's have a GPT-based decision model actually evaluate the course outputs, and let's use my common infrastructure substrate to deploy this. Let's use Ayush's. Ayush, I'm going to use your Hex UI that you just built. I'm going to use hex.ig/bio-world, I think, as the design system, and let's deploy it
```

The eval set came from this prompt:

```text
Spin up five subagents to create evals for this task. Use synthetic data. Use your own harness and
do not use any external API calls. Create data for both whether or not something is a good question
and whether or not something is a good course, and also for grading of the question that will be
done by the decision model. I want you to create an eval set.
```
