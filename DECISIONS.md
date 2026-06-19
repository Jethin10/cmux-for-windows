# Decisions

Accepted architecture decisions live in `docs/adr`.

## Initial decisions

1. Electron + React + xterm.js + node-pty is the MVP stack.
2. Core services own durable and runtime truth.
3. SQLite persists metadata, events, and transcript indexes.
4. Terminal output is stored as bounded transcript chunks, not domain events.
5. AgentSession and TerminalSession are separate domain concepts.
6. Renderer IPC is narrow, typed, and validated.
7. MVP prioritizes agent supervision before full multiplexer layouts.
