# API

All API paths are relative to `/api/v1`, except `/health`.

## Health

`GET /health` returns `200 { "status": "ok" }` when the HTTP process responds. It does not check GitHub, OpenAI, or storage availability.

## Authentication

`POST /auth/register` accepts `{ "email": "...", "password": "..." }`; passwords must contain 12–128 characters. `POST /auth/login` accepts the same shape. Both set an HTTP-only, SameSite=Strict session cookie. `GET /auth/me` returns the current user's email and ID. `POST /auth/logout` revokes the cookie session. State-changing browser requests must include `X-DevBrain-Request: 1`, and the CORS allowlist is configured through `CLIENT_ORIGIN`.

## Repositories

`GET /repositories` returns repository metadata with `fileCount`.

`POST /repositories` accepts JSON:

```json
{ "url": "https://github.com/owner/repository", "branch": "optional-branch" }
```

Import can take several seconds while bounded source files are fetched. A successful import returns `201` with the repository record and commit SHA. Unsupported URLs, inaccessible repositories, oversized repos, and GitHub API limits return an error response.

`GET /repositories/:id` returns repository metadata and indexed file paths/languages, without source content.

`GET /repositories/:id/files?path=src%2Fmain.ts` returns the requested file from the stored commit.

## Conversations

`GET /conversations?repositoryId=...` returns recent conversations for a repository the current user owns. `POST /conversations` accepts `{ "repositoryId": "...", "title": "optional title" }`. `GET /conversations/:id` returns saved messages and citations. `POST /conversations/:id/messages` accepts `{ "question": "..." }`, retrieves source, generates an answer, and persists both messages. Questions must be 3–2,000 characters. OpenAI errors are surfaced without returning upstream response bodies.

Repository routes require a signed-in session. IDs belonging to another user return `404` to avoid disclosing that the repository exists. The API remains intended only for local development because its JSON storage does not support safe multi-process writes.
