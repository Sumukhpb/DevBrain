# ADR 0001: Start with a modular monolith foundation

- Status: Accepted
- Date: 2026-10-19

## Context

The repository contains a Vite React client and a small Express API, but no workspace-level commands, documented runtime configuration, or operational health endpoint. The feature routes are mostly placeholders.

## Decision

Keep the API and client in one npm workspace while maintaining separate runtime processes. Add a lightweight health endpoint, cap JSON request bodies, and configure CORS from an environment variable. Use the existing Express stack and avoid introducing databases or AI integrations before their settings and interfaces are designed.

## Consequences

Root commands provide a consistent entry point while the API and client remain independently runnable. The health endpoint reports only that the HTTP process responds; it does not claim dependencies are healthy. CORS defaults to the local Vite origin and can be set to a comma-separated allowlist.

## Alternatives considered

- Replacing the current app with a new scaffold would discard existing route and client work.
- Adding MongoDB, Redis, Qdrant, and AI dependencies in the same change would create configuration and failure modes before any feature uses them.
