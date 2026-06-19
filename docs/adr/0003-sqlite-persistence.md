# ADR 0003: SQLite persistence strategy

## Status

Accepted

## Decision

Use SQLite for local-first durable metadata, domain events, notification state, settings, and transcript chunk indexes.

## Consequences

The app has a simple local persistence story. Migrations, WAL mode, backup, and recovery must be treated as product features from day one.
