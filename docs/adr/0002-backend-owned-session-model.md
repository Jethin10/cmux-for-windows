# ADR 0002: Backend-owned session model

## Status

Accepted

## Decision

Core services in the Electron main process own workspace, agent session, terminal session, and runtime PTY state. Renderer state is a cache.

## Consequences

IPC boundaries are explicit and testable. React cannot accidentally own process handles or durable truth.
