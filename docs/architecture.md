# Current architecture

## Running components

- **Client:** React 19 + Vite. The browser uses relative `/api/v1` routes; Vite forwards them to the local Express process.
- **API:** Express 5. It accepts bounded JSON requests, applies Helmet and a configurable CORS allowlist, authenticates with scrypt password hashes and HTTP-only session cookies, applies per-process rate limits, queues repository import work in Redis, persists application records in MongoDB, and enforces ownership on repository and job routes.
- **Worker:** A separate Node process consumes repository import jobs from BullMQ. It reports progress, retries transient failures with exponential backoff, and stores the imported revision after fetching from the fixed GitHub API host.
- **AI:** The repository and vector services call a provider boundary in `server/src/ai/provider.ts`. Ollama is the default provider, so local answers and embeddings do not require a paid API key. OpenAI remains an optional provider selected with `AI_PROVIDER=openai`. With Qdrant configured, imports batch embeddings and store vectors plus source metadata; vector retrieval filters by user, repository, and commit before submitting the best eight excerpts to the selected chat model. Each provider uses a separate Qdrant collection by default because vector dimensions differ. Without Qdrant, the service uses text-based term matching. The system prompt treats source excerpts as untrusted and asks for numbered evidence references. The API maps those references to commit-pinned GitHub URLs.
- **Storage:** MongoDB stores users and password hashes, hashed session tokens with a TTL index, repository snapshots, conversation metadata, and individual messages. Compound/query indexes support repository ownership and conversation history. The API imports old JSON records once at startup and leaves the original files intact. Redis is reserved for BullMQ job state; Qdrant holds optional embeddings rather than application records.

## Import flow

1. The API accepts only HTTPS URLs on the exact `github.com` host with owner and repository path segments, then adds a BullMQ job to Redis and immediately returns its ID.
2. The worker calls GitHub's API at the fixed `api.github.com` host for metadata, the selected branch, and its recursive tree. No user-supplied host is fetched.
3. It rejects repositories above the current 100 MB metadata size limit or trees GitHub marks as truncated.
4. It applies `.gitignore` patterns, selects known text extensions, skips common generated/dependency directories, likely secret files, binary content, and files above 80 KB. It imports at most 160 files in batches of eight while updating job progress.
5. It stores the captured branch commit and source files in MongoDB. When configured, it batches embeddings into Qdrant. Re-importing the same repository/branch replaces that user's record.
6. The client polls the authenticated job endpoint and opens the repository when the worker completes.

## Question flow

1. Split imported files into overlapping chunks of at most 70 lines.
2. Rank chunks by query-term frequency and matching file paths; take at most eight.
3. Return a clear no-match response when none score.
4. Submit repository commit metadata and selected excerpts to the configured model provider, then return the model response and validated excerpt-number citations. Ollama runs locally by default; OpenAI requires `AI_PROVIDER=openai` and `OPENAI_API_KEY`.

## Next architecture steps

Improve job cancellation and re-indexing controls, then harden vector search and add a complete automated end-to-end test. Keep the API, worker, and client as separate processes in one modular monolith.
