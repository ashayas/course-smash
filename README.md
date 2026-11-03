# Course Smash

Say what you want to learn. An agent builds a course of multiple-choice and short-answer questions, multiple-choice answers are checked against the answer key, a decision model rates short answers against your goal, and the agent reads your results to write what comes next.

The same app runs on Cloudflare or in Docker.

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

## MCP

`/mcp` serves MCP over Streamable HTTP, with `Authorization: Basic base64(USER_NAME:PW)`. Tools: `create_course`, `list_courses`, `get_course`, `answer_question`, `advance_course`.

## Check your work

`npm run typecheck`
