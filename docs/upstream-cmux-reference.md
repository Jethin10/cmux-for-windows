# Upstream cmux Reference Notes

Reference clone location used for Windows translation research:

```text
C:/cmux/reference/cmux.git
```

This is a bare, blob-filtered clone so we can inspect source paths without vendoring upstream code into this repository.

Upstream repository:

```text
https://github.com/manaflow-ai/cmux
```

The upstream app is macOS-first, so this project should translate product behavior and contracts rather than copy platform-specific implementation details.

## Useful upstream areas inspected

- `docs/cli-contract.md` — command naming, handle/reference conventions, no-socket help behavior, and scripting stability expectations.
- `docs/events.md` — reconnectable event stream shape with monotonically increasing sequence numbers and replay/cursor semantics.
- `docs/notifications.md` — agent notification panel, jump-to-unread behavior, notification hooks, and native notification policy.
- `docs/remote-daemon-spec.md` — durable remote PTY/session concepts, reconnect semantics, daemon handshakes, and actionable error surfacing.
- `skills/cmux/references/panes-surfaces.md` — stable pane/surface identity and focus-neutral move/reorder/split commands.
- `daemon/remote/cmd/cmuxd-remote/ws_pty.go` — PTY hub concepts: auth frame, session ID, attachment ID, resize control frames, scrollback limit, and idle TTL.
- `webviews/src/agent-session/shared/sessionModel.ts` — agent transcript/log model and bounded transcript constants.

## Translation guidance for CMux for Windows

1. Keep the Windows MVP backend-owned. Upstream cmux has rich pane/surface behavior, but the Windows MVP should preserve our current priority: agent supervision and PTY reliability before layout parity.
2. Adopt stable identity ideas early: workspace/session/terminal IDs should survive UI movement and future split-pane work.
3. Model events with replay in mind. Upstream's event stream reinforces the existing plan for monotonic domain events and later cursor-based local API streaming.
4. Keep terminal output bounded. Upstream agent session webview code caps assistant, activity, and log output; the Windows transcript service should use similar explicit caps.
5. Treat remote/daemon behavior as future input, not MVP scope. The remote daemon spec is valuable for later SSH/daemon work, but local Windows ConPTY validation remains the immediate Phase 1 gate.
6. Translate macOS notification UX to Windows toast + in-app notification center, preserving jump-to-unread semantics where possible.

## Immediate implications

- Continue `@cmux/pty` as a backend runtime boundary with attach/detach-ready IDs.
- Add bounded scrollback/transcript caps before exposing high-volume output widely.
- Keep the CLI/API contract versioned and script-stable once Phase 7 begins.
- Avoid implementing full pane/surface mechanics until terminal sessions, transcripts, and attention routing are solid.
