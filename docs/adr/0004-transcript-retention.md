# ADR 0004: Terminal transcript retention

## Status

Accepted

## Decision

Persist terminal output as bounded transcript chunks with per-session retention limits. Do not persist every output chunk as a domain event.

## Consequences

Search and recovery are possible without turning high-volume streams into the domain event log. Retention caps and optional redaction settings must be visible product controls before beta.
