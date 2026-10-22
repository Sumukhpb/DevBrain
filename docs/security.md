# Security notes for the current prototype

- GitHub URLs are parsed and restricted to HTTPS `github.com`; outbound requests are constructed only against the fixed GitHub API host. No repository code is executed.
- Source content is treated as untrusted data in the model prompt. The configured AI receives retrieved code, so users should only import repositories they are allowed to disclose to that provider.
- Vector records include user, repository, and commit filters, so retrieval stays inside the authenticated repository and indexed revision. Keep Qdrant private; this prototype's local Compose configuration binds its REST port only to localhost and does not enable Qdrant API-key auth.
- API JSON bodies are capped at 100 KB. Repository size, file size, number of source files, file extensions, and common generated directories have limits/filters.
- Passwords are stored as salted scrypt hashes. Session cookies are random, HTTP-only, SameSite=Strict, and stored server-side by hash. Mutating browser requests require a custom intent header and pass the configured CORS allowlist. Per-process rate limits cover API and auth operations.
- OpenAI credentials are read from environment variables and should never be committed. Logging does not include request bodies or the API key.
- There is no email verification, password reset, user quota, private GitHub support, or production-grade concurrent storage. Keep it bound to a trusted development environment.
- Root and nested `.gitignore` patterns are applied, but this lightweight parser is not a complete Git implementation. The local JSON file can contain source secrets that escaped filename/content filtering. Treat `data/` as sensitive and do not share it.

Before any shared or public deployment, add account recovery and verification, robust secret scanning, MongoDB persistence, queue isolation, and operational controls.
