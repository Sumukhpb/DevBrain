# Current architecture

## Running components

- **Client:** React 19 + Vite. The browser uses relative `/api/v1` routes; Vite forwards them to the local Express process.
- **API:** Express 5. It accepts bounded JSON requests, applies Helmet and a configurable CORS allowlist, authenticates with scrypt password hashes and HTTP-only session cookies, applies per-process rate limits, imports public GitHub source, persists accounts and repositories locally, and enforces ownership on repository routes.
- **AI:** With Qdrant configured, import creates bounded line/character chunks, batches embeddings through OpenAI, and stores vectors plus source metadata. Question retrieval filters by user, repository, and commit before submitting the best eight excerpts to OpenAI Chat Completions. Without Qdrant, the service uses text-based term matching. The system prompt treats source excerpts as untrusted and asks for numbered evidence references. The API maps those references to commit-pinned GitHub URLs.
- **Storage:** Accounts, source files, and conversations are stored as separate local JSON files. This is an intentional development shortcut; concurrent writers and multi-instance deployment are not supported.

## Import flow

1. Accept only HTTPS URLs on the exact `github.com` host with owner and repository path segments.
2. Call GitHub's API at the fixed `api.github.com` host for repository metadata, the selected branch, and its recursive tree. No user-supplied host is fetched.
3. Reject repositories above the current 100 MB metadata size limit or trees GitHub marks as truncated.
4. Apply root and nested `.gitignore` patterns, select known text extensions, skip common generated/dependency directories, likely secret files, binary content, and files above 80 KB. Import at most 160 files in batches of eight.
5. Store the captured branch commit and source files. Re-importing the same repository/branch replaces the local record.

## Question flow

1. Split imported files into overlapping chunks of at most 70 lines.
2. Rank chunks by query-term frequency and matching file paths; take at most eight.
3. Return a clear no-match response when none score.
4. Require `OPENAI_API_KEY`, submit repository commit metadata and selected excerpts, then return the model response and validated excerpt-number citations.

## Next architecture steps

Move account/repository metadata and conversations to MongoDB, queue repository processing with Redis/BullMQ, and store vectors in Qdrant. Replace lexical matching with embeddings once those services are configured. Keep the API, worker, and client as separate processes in one modular monolith.
