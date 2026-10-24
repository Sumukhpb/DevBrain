# API

All API paths are relative to `/api/v1`, except `/health`.

## Health

`GET /health` returns `200 { "status": "ok", "services": { "mongodb": "connected" } }` when MongoDB is connected. It returns `503` while MongoDB is unavailable. It does not check GitHub, the selected model provider, Redis, or Qdrant.

`GET /api/v1/health/ai` checks whether the selected AI provider is configured. For Ollama, it checks service reachability and whether `OLLAMA_CHAT_MODEL` is installed; the check uses Ollama's model-list endpoint and does not generate text. The response includes a short diagnostic message and does not expose API keys.

## Authentication

`POST /auth/register` accepts `{ "email": "...", "password": "..." }`; passwords must contain 12–128 characters. `POST /auth/login` accepts the same shape. Both set an HTTP-only, SameSite=Strict session cookie. `GET /auth/me` returns the current user's email and ID. `POST /auth/logout` revokes the cookie session. State-changing browser requests must include `X-DevBrain-Request: 1`, and the CORS allowlist is configured through `CLIENT_ORIGIN`.

## Repositories

`GET /repositories` returns repository metadata with `fileCount`.

`POST /repositories` accepts JSON:

```json
{ "url": "https://github.com/owner/repository", "branch": "optional-branch" }
```

The API validates the URL and enqueues work without waiting for repository files. It returns `202 { "jobId": "...", "status": "queued" }`. A separate worker fetches and indexes the source. Unsupported URL syntax fails immediately; inaccessible repositories, oversized repos, and GitHub API limits appear as a failed job after automatic retries.

`GET /jobs/:jobId` returns the authenticated user's job, including its `state` and numeric `progress`. On success, the response includes a `repository`; after retry exhaustion it includes an `error`. Jobs are scoped to their owner, and another user's job ID returns `404`.

`GET /repositories/:id` returns repository metadata and indexed file paths/languages, without source content.

`GET /repositories/:id/files?path=src%2Fmain.ts` returns the requested file from the stored commit.

## Conversations

`GET /conversations?repositoryId=...` returns recent conversations for a repository the current user owns. `POST /conversations` accepts `{ "repositoryId": "...", "title": "optional title" }`. `GET /conversations/:id` returns saved messages and citations. `POST /conversations/:id/messages` accepts `{ "question": "..." }`, retrieves source, generates an answer, and persists both messages. Questions must be 3–2,000 characters. Provider errors are surfaced without returning upstream response bodies.

Repository and job routes require a signed-in session. IDs belonging to another user return `404` to avoid disclosing that the resource exists. The API remains intended for local development; production deployment still needs secured database access, shared rate limiting, operational monitoring, and deployment hardening.
