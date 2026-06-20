# Project Status and Session Handoff

Last updated: 2026-06-19

## One-line goal

Build a Windows-first Electron/React desktop app for supervising multiple coding-agent terminal sessions, with reliable PTY lifecycle, statuses, notifications, logs, search, and recovery.

## Repository

- GitHub: `https://github.com/Jethin10/cmux-for-windows`
- Local path: `C:/cmux/cmux-for-windows`
- Upstream reference: `C:/cmux/reference/cmux.git`

## Completed work

### Phase 0 — Repository and architecture foundation

Status: **complete enough for Phase 1 work**

Implemented:

- pnpm monorepo skeleton
- strict TypeScript config
- ESLint/Prettier/Vitest
- GitHub Actions CI on Windows
- Electron app shell with secure preload baseline
- packages:
  - `@cmux/shared`
  - `@cmux/core`
  - `@cmux/pty`
  - `@cmux/storage`
  - `@cmux/ipc`
  - `@cmux/ui`
  - `@cmux/cli`
- architecture/security/roadmap docs
- ADRs 0001–0007
- SQLite migration framework abstraction and tests
- terminal/agent state-machine tests
- default agent/shell launcher templates and tests

### Phase 1 — Windows PTY spike foundation

Status: **started; validation gates still open**

Implemented:

- optional `node-pty` dependency in `@cmux/pty`
- `NodePtyBroker` runtime boundary
- PTY create/write/resize/close/restart operations
- output subscriptions with monotonically increasing sequence numbers
- zero-size resize guard before ConPTY
- interrupt/terminate/detach/process-tree-kill close modes
- signal-aware exit/crash classification
- restart termination before runtime disposal
- xterm.js renderer spike surface
- main-process `TerminalService` wiring for backend-owned local shells
- secure terminal IPC for create/write/resize/close and detachable output/exit subscriptions
- preload bridge methods for terminal IPC without exposing PTY/process handles
- PTY spike docs and manual validation checklist

### Phase 2 — Agent Session Supervisor MVP Core

Status: **started with in-memory desktop supervisor**

Implemented:

- backend-owned `SupervisorService` for workspaces and agent session state
- secure workspace and agent IPC handlers/validators
- workspace open/list dashboard
- launch named sessions from default templates
- stop/restart/archive session controls
- status updates from PTY output heuristics and terminal exit events

Still required before Phase 2 can be considered complete:

- attach session-specific transcript/terminal views instead of only the standalone PTY spike surface
- improve restart semantics for long-running shells and missing CLIs
- add richer session filtering/attention routing

### Phase 3 — Persistent Logs, Search, and Recovery

Status: **started with file-backed desktop persistence**

Implemented:

- file-backed workspace/session snapshot under Electron `userData`
- workspace/session metadata restore on supervisor startup
- per-terminal JSONL transcript append from PTY output
- byte-capped transcript retention per terminal
- typed transcript search IPC and dashboard search UI
- session history IPC/UI that includes archived sessions

Still required before Phase 3 can be considered complete:

- migrate file-backed persistence to the planned SQLite repository layer
- add transcript reads attached to a selected session terminal view
- add robust transcript write serialization/backpressure and crash-safe atomic persistence
- add search indexing instead of linear JSONL scans

### Phase 4 — Notifications and Attention Routing

Status: **started with heuristic notifications**

Implemented:

- notification creation from waiting/failed agent attention heuristics
- unread workspace counts
- notification list/mark-read/next-unread IPC and preload methods
- dashboard notification panel and jump-to-next-unread action
- Electron desktop toast adapter for attention/error notifications

Still required before Phase 4 can be considered complete:

- persist notification records in the future SQLite repository
- add push updates instead of manual dashboard refresh
- tune notification throttling/deduplication for noisy output
- add Windows notification activation/deep-link routing back into a session

### Phase 5+ — Panes/surfaces and release hardening foundation

Status: **started with panes/surfaces and CLI/API foundations**

Implemented:

- core pane layout model/helpers with tests
- persisted backend-owned pane layout state with typed IPC/preload methods
- focus-neutral pane surface reordering/closing controls in the dashboard
- attachable live xterm.js agent terminal surface
- two-pane dashboard area with local shell spike and selected agent session pane
- Vite manual chunks for React and xterm renderer bundle splitting
- typed CLI command envelopes for workspace open, agent list/launch/stop
- multi-agent batch launch IPC/service flow and dashboard control
- file-backed CLI command inbox bridge for desktop command execution
- approval request model/risk inference foundation
- Git porcelain v2 status parsing and summary formatting foundation
- browser URL safety helpers for future browser surfaces
- native PTY smoke verification script and release hardening checklist

Still required:

- pane split/move model beyond the current ordered surface list
- richer batch launch presets and per-agent prompt editing
- named-pipe transport and response streaming for CLI envelopes
- UI and IPC surfaces for Git workflow/approval/browser features
- packaged installer configuration and signed release pipeline

Still required before Phase 1 can be considered passed:

- approve/build native `node-pty` locally
- manually verify real PTY output in the renderer through secure IPC
- spawn `pwsh.exe`, `powershell.exe`, `cmd.exe`, `wsl.exe`, Git Bash, and `ssh.exe` where available
- validate Ctrl+C, paste, bracketed paste, Unicode, CJK, emoji, IME, and AltGr/non-US layouts
- stress high-output commands and rapid resize
- close many PTYs and check for orphaned process trees
- package clean Windows build and verify `node-pty` loads without dev tooling

## Merged PRs

| PR  | Title                                    | Notes                                               |
| --- | ---------------------------------------- | --------------------------------------------------- |
| #1  | `docs: complete foundation ADRs`         | ADR completion and repo hygiene                     |
| #2  | `feat: add default launcher templates`   | default MVP templates and safe renderer             |
| #3  | `feat: add Windows PTY spike foundation` | `NodePtyBroker`, tests, xterm spike, upstream notes |

## Upstream cmux translation context

The upstream macOS cmux repo is available for research only at `C:/cmux/reference/cmux.git`.

Useful upstream files inspected:

- `docs/cli-contract.md`
- `docs/events.md`
- `docs/notifications.md`
- `docs/remote-daemon-spec.md`
- `skills/cmux/references/panes-surfaces.md`
- `daemon/remote/cmd/cmuxd-remote/ws_pty.go`
- `webviews/src/agent-session/shared/sessionModel.ts`

Translation principles:

- preserve useful product concepts, not macOS implementation details
- keep stable workspace/session/surface identity ideas
- keep event streams replayable/cursor-friendly later
- keep transcript/log output bounded
- defer full pane/surface parity until the local Windows PTY/session supervisor is reliable

## Recommended next PR

Wire a real local terminal through secure Electron IPC:

1. Add main-process `TerminalService` that owns `NodePtyBroker`.
2. Add IPC contracts for terminal create/write/resize/close and output events.
3. Expose only typed preload bridge methods.
4. Attach renderer `TerminalSpike` to backend output.
5. Add tests for IPC payload validation and service lifecycle where practical.
6. Keep transcript persistence out of this PR unless needed for bounded scrollback.

## Known caveats

- `node-pty` is optional and may not build/load until pnpm build scripts are approved.
- The app currently renders an xterm.js spike surface but does not yet attach it to a real PTY.
- Phase 1 is not done until manual Windows PTY and packaging gates pass.
