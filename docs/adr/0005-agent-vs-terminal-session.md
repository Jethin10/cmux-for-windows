# ADR 0005: AgentSession vs TerminalSession

## Status

Accepted

## Decision

Represent a coding-agent task as an AgentSession and its execution surface/process as a TerminalSession.

## Consequences

An agent can be restarted, archived, resumed, or later moved across execution surfaces without conflating logical task state with PTY process state.
