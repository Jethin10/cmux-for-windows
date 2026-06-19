# ADR 0006: Renderer IPC security model

## Status

Accepted

## Decision

Renderer code uses a narrow preload bridge. Node integration is disabled and all privileged operations pass through typed IPC contracts.

## Consequences

The main/core side can validate every request and enforce trust boundaries. Renderer compromise should not directly grant process, filesystem, or approval authority.
