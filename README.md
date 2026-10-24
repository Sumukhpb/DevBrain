# DevBrain

DevBrain is an AI-assisted codebase intelligence platform. The current development slice supports account registration/login, importing a public GitHub repository, browsing its indexed source files, and asking questions answered from retrieved code excerpts.

## Run locally

Requirements: Node.js 22+, npm 10+, and Docker Desktop (MongoDB and Redis run in Docker).

```powershell
npm install
if (-not (Test-Path server/.env)) { Copy-Item .env.example server/.env }
docker compose up -d mongo redis
```

Start these commands in separate terminals from the project root:

```powershell
npm run dev:api
npm run dev:worker
npm run dev:client
```

The API listens on `http://localhost:3000`; the Vite development server proxies `/api` requests to it. Make sure `server/.env` has `MONGODB_URI=mongodb://127.0.0.1:27018/devbrain` (the Compose MongoDB port avoids the standard local MongoDB port). MongoDB stores accounts, sessions, repository snapshots, conversations, and messages. Redis stores indexing jobs; the separate worker fetches and indexes repositories. On first startup, the API imports any old JSON data under `data/` into MongoDB and preserves those files. `GET /health` reports whether MongoDB is connected; `GET /api/v1/health/ai` checks the configured AI provider and Ollama chat model.

AI provider selection is controlled by `AI_PROVIDER`, which defaults to `ollama` so local development does not require paid API calls. Install and start Ollama, then pull the configured models with `ollama pull qwen2.5-coder:3b` and `ollama pull embeddinggemma`. DevBrain can then generate repository-grounded answers locally. Set `AI_PROVIDER=openai` and configure `OPENAI_API_KEY` only if you want to use OpenAI instead. By default, retrieval uses text matching. To enable semantic vector retrieval with either provider, start local Qdrant using `docker compose up -d`; set `QDRANT_URL=http://localhost:6333` in `server/.env`, then re-import repositories to generate embeddings and store them in Qdrant, scoped by user, repository, and commit. Ollama's default embedding size is configured as 768; change `OLLAMA_EMBEDDING_DIMENSIONS` to match a different embedding model. Returned citations link to exact files and line ranges in the imported commit.

**Local model setup on Windows:** install Ollama, open PowerShell and run `ollama pull qwen2.5-coder:3b` and `ollama pull embeddinggemma`. Keep Ollama running, set `AI_PROVIDER=ollama` in `server/.env`, then restart `npm run dev:api`. You can ask questions without an OpenAI API key. `QDRANT_URL` is optional; without it, Q&A still works using text-based retrieval, while Qdrant adds semantic search.

If Ollama is unavailable or its chat model is missing, the repository chat shows a diagnostic and lets you retry the failed question after fixing the service. The chat provider check runs when a repository is opened and refreshes every 30 seconds.

## Current scope and limitations

- Imports public GitHub repositories only. The scanner records a commit SHA, excludes common generated/dependency directories and likely secret files, skips binary or oversized files, and caps imports at 160 source files and 100 MB repository size.
- MongoDB stores account, session, repository, conversation, and message records. Repository imports run asynchronously in a BullMQ worker with Redis job states, progress updates, and three attempts with exponential backoff. Worker concurrency is currently capped at one, so imports run serially.
- Without Qdrant configured, retrieval is text-based. Email verification and password reset remain future work.
- Passwords use scrypt hashes and sessions use random HTTP-only SameSite=Strict cookies. Do not expose this development server to untrusted users or the public internet.
- GitHub API's unauthenticated rate limit applies. Smaller repositories are recommended.

## Commands

- `npm run dev:api` — start the API.
- `npm run dev:worker` — start the Redis-backed repository indexing worker.
- `npm run dev:client` — start the client.
- `docker compose up -d mongo redis` — start MongoDB and Redis for the API and background indexing.
- `docker compose up -d` — start MongoDB, Redis, and Qdrant for indexing plus vector retrieval.
- `npm run build` — build the client and compile the API.
- `npm run lint` — lint the client.
- `npm --workspace server run start` — start the compiled API.

To run MongoDB-backed persistence and migration tests, use a separate test database. The tests clear collections in that database, so keep `MONGODB_TEST_URI` pointed at a database name containing `test`:

```powershell
$env:MONGODB_TEST_URI = "mongodb://127.0.0.1:27018/devbrain_test"
npm test
Remove-Item Env:MONGODB_TEST_URI
```

## API routes

- `GET /health` — process health.
- `GET /api/v1/health/ai` — check AI provider configuration and local Ollama chat-model availability.
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
- `GET /api/v1/jobs/:jobId` — retrieve the authenticated user's indexing job state and progress.
- `GET /api/v1/repositories/:id` — repository metadata and indexed file paths.
- `GET /api/v1/repositories/:id/files?path=...` — retrieve an indexed source file.

## Architecture

The client is a React/Vite application. The Express API validates requests, authenticates users, enforces repository ownership, and queues repository import jobs in Redis. A separate worker talks to the fixed GitHub API host and stores imported revisions in MongoDB. Repository code is treated as untrusted context, never executed, and the answer prompt tells the configured model to ignore instructions found in source excerpts.

See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), and [docs/decisions/0001-foundation.md](docs/decisions/0001-foundation.md). This is an incremental implementation; the production architecture in the original project brief remains future work.
