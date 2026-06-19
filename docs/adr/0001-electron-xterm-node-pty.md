# ADR 0001: Electron, xterm.js, and node-pty

## Status

Accepted

## Decision

Use Electron for the desktop shell, React for renderer UI, xterm.js for terminal rendering, and node-pty/ConPTY for Windows terminal processes.

## Consequences

This maximizes delivery speed and ecosystem maturity, but requires early native module packaging validation and Windows PTY lifecycle testing.
