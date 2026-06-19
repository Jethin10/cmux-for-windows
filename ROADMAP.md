# Roadmap

## Phase 0: Repository and Architecture Foundation

Status: **complete enough for Phase 1 work**

- Monorepo skeleton.
- Architecture, security, roadmap, and decision docs.
- TypeScript strict mode.
- Lint/format/test tooling.
- Basic Electron app boot.
- SQLite migration framework abstraction.
- Typed IPC contract package.

## Phase 1: Windows PTY Spike / Terminal Foundation

Status: **in progress; manual Windows/native packaging gates not passed yet**

- xterm.js terminal view. Started with secure renderer spike surface.
- node-pty ConPTY backend. Started with optional `NodePtyBroker` runtime boundary.
- TerminalService state machine. Started with main-process `TerminalService` ownership of `NodePtyBroker`.
- Spawn/write/resize/close lifecycle. Started in `@cmux/pty` with tests and wired through Electron IPC.
- Bounded in-memory scrollback.
- Secure IPC wiring from main-process PTY broker to renderer terminal surface. Started with typed preload methods and detachable output/exit subscriptions.
- Packaged dev build proving native PTY loading.

## Phase 2: Agent Session Supervisor MVP Core

Status: **started with in-memory desktop supervisor**

- Workspace creation/open folder. Started via typed IPC and dashboard controls.
- AgentSession model. Started in backend-owned `SupervisorService` state.
- TemplateService with initial agent templates. Implemented with default templates from `@cmux/core`.
- Launch named agent sessions in workspace. Started by rendering templates into backend-owned terminal launches.
- Session list/dashboard. Started in the Electron renderer.
- Stop/restart/archive controls. Started through secure IPC and backend state transitions.

## Phase 3: Persistent Logs, Search, and Recovery

Status: **started with file-backed desktop persistence**

- Bounded persisted transcript chunks. Started with per-terminal JSONL transcript files capped by byte retention.
- Search current/all session logs. Started with typed transcript search IPC and dashboard search UI.
- Session history view. Started with active-session list plus history IPC/UI including archived sessions.
- Restore metadata after restart. Started with file-backed workspace/session snapshot restore at service startup.

## Phase 4: Notifications and Attention Routing

Status: **started with heuristic notifications**

- Notification service. Started in `SupervisorService` with desktop toast adapter.
- Unread badges and attention highlighting. Started with workspace unread counts and notification list UI.
- Jump-to-next-waiting/unread. Started with next unread IPC/UI action.
- Windows toast notifications. Started through Electron desktop notifications for attention/error events.

## Phase 5+: Multi-agent task launch, panes, CLI/API, Git workflow, approvals, browser surfaces, release hardening.

Status: **started with panes/surfaces foundation**

- Pane/surface model. Started with core pane layout helpers and tests.
- Agent terminal surfaces. Started with an attachable live xterm.js surface for selected agent sessions.
- Multi-pane dashboard. Started with a local shell pane beside an agent session pane.
- Renderer bundle hardening. Started with Vite manual chunks for React and xterm.
