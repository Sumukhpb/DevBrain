# DevBrain

DevBrain is an AI-assisted codebase intelligence platform. The current development slice supports account registration/login, importing a public GitHub repository, browsing its indexed source files, and asking questions answered from retrieved code excerpts.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```sh
npm install
Copy-Item .env.example server/.env
npm run dev:api
npm run dev:client
```

The API listens on `http://localhost:3000`; the Vite development server proxies `/api` requests to it. `GET /health` reports API process health. Account and repository data is saved under `data/` by default. Set `DATA_DIR` to choose another local data folder.

To generate repository-grounded answers, set `OPENAI_API_KEY` in `server/.env`. `OPENAI_CHAT_MODEL` defaults to `gpt-4o-mini`. Importing and browsing repositories work without an OpenAI key; asking a question without it returns an explicit configuration error. By default, the question route retrieves up to eight source chunks using text matching. To enable embedding-based vector retrieval, start local Qdrant with `docker compose up -d` and set `OPENAI_API_KEY` and `QDRANT_URL` in `server/.env`. New imports will then generate batched OpenAI embeddings and store chunks in Qdrant, scoped by user, repository, and commit. Re-imports remove obsolete commit vectors. Returned citations link to exact files and line ranges in the imported commit.

## Current scope and limitations

- Imports public GitHub repositories only. The scanner records a commit SHA, excludes common generated/dependency directories and likely secret files, skips binary or oversized files, and caps imports at 160 source files and 100 MB repository size.
- Source files and account/session metadata are stored locally as JSON. This is suitable only for a local prototype; it is not a replacement for MongoDB, and concurrent writes/multiple API instances are not supported.
- Without Qdrant configured, retrieval is text-based. Imports and optional embedding calls still run synchronously in the API process; BullMQ/Redis background indexing, MongoDB persistence, email verification, and password reset remain future work.
- Passwords use scrypt hashes and sessions use random HTTP-only SameSite=Strict cookies. Do not expose this development server to untrusted users or the public internet.
- GitHub API's unauthenticated rate limit applies. Smaller repositories are recommended.

## Commands

- `npm run dev:api` — start the API.
- `npm run dev:client` — start the client.
- `docker compose up -d` — start local Qdrant for vector retrieval.
- `npm run build` — build the client and compile the API.
- `npm run lint` — lint the client.
- `npm --workspace server run start` — start the compiled API.

## API routes

- `GET /health` — process health.
- `POST /api/v1/auth/register` — create an account and start a session.
- `POST /api/v1/auth/login` — start a session.
- `GET /api/v1/auth/me` — current user.
- `POST /api/v1/auth/logout` — revoke the current session.
- `GET /api/v1/conversations?repositoryId=...` — list a repository's conversations.
- `POST /api/v1/conversations` — create a conversation for an owned repository.
- `GET /api/v1/conversations/:id` — load saved messages.
- `POST /api/v1/conversations/:id/messages` — ask a question and persist the response and citations.
- `GET /api/v1/repositories` — list imported repositories.
- `POST /api/v1/repositories` — import `{ "url": "https://github.com/owner/repo", "branch": "optional" }`.
- `GET /api/v1/repositories/:id` — repository metadata and indexed file paths.
- `GET /api/v1/repositories/:id/files?path=...` — retrieve an indexed source file.

## Architecture

The client is a React/Vite application. The Express API validates requests, authenticates users, enforces repository ownership, talks to the fixed GitHub API host, stores the imported revision locally, and performs text retrieval before calling OpenAI. Repository code is treated as untrusted context, never executed, and the answer prompt tells the model to ignore instructions found in source excerpts.

See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), and [docs/decisions/0001-foundation.md](docs/decisions/0001-foundation.md). This is an incremental implementation; the production architecture in the original project brief remains future work.
