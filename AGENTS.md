# Agents.MD

- Read this before going anywhere else
- We are 
- Use the cloudflare API token as CLOUDFLARE_API_KEY in .env for inference
- Use wrangler to deploy the completed app to cloudflare and attach a domain maybe you can just make it the root name,
- use secrets to assign the username and password that are in the .env USER_NAME and PW on the cloudflare worker itself so thats the login gate. it should be a login page where the PW is hidden from the user
- the UI theme is the Course Smash city design kit in [DESIGN.md](DESIGN.md), so read that file before building any UI
- use the JEV style clef model from cloudflare to determine if questions are right or wrong for each user based on what they want to learn
- A mobile app is coming. It doesn't exist yet. When you add a feature, work out the best way to bring it to the mobile app too:
  - Put the data and logic behind a JSON endpoint under `/api/`, not only in `public/app.js`, so a native client can reuse it.
  - Keep the art in `public/city.js` as plain SVG built from data, so it can render on mobile.
  - Add a short "Mobile" note to the PR or commit that says how the feature should work on a phone.

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

### Auth

- Wrangler uses the `wrangler login` session for D1, deploys and secrets.
- Do not set `CLOUDFLARE_API_TOKEN` to the `.env` token. It would override that login, and the token has no D1 access.
- The `.env` token (`CLOUDFLARE_API_KEY`) is for inference only and expires on 2026-11-10.

### Secrets

This repo is public. Never commit `.env`, swap files, or the password, including in its base64 form. The opencode config holds the password and lives outside the repo, so keep it out.
