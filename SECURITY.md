# Security

## Sensitive data note

Terminal transcripts may contain secrets. The app must not upload transcripts by default and crash reports must not include raw terminal output.

## Electron baseline

- Context isolation enabled.
- Node integration disabled in renderer.
- Preload exposes a narrow typed bridge only.
- Renderer is treated as less trusted than main/core.
- IPC payloads are validated before use.

## Terminal escape policy

- OSC 52 clipboard writes are disabled or prompt-gated by default.
- OSC 8 hyperlinks show the destination and require confirmation for untrusted workspaces.
- Title changes are sanitized for length and control characters.
- File links require explicit user action.
- Custom terminal notifications must use a documented safe schema.

## Local API policy

The future CLI/API must use a same-user Windows named pipe. No unauthenticated TCP listener is allowed for MVP.

## Process control

The PTY broker owns process handles. Renderer code cannot terminate or write to a terminal directly; it can only request validated backend actions.
