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
- TerminalService state machine.
- Spawn/write/resize/close lifecycle. Started in `@cmux/pty` with tests.
- Bounded in-memory scrollback.
- Secure IPC wiring from main-process PTY broker to renderer terminal surface.
- Packaged dev build proving native PTY loading.

## Phase 2: Agent Session Supervisor MVP Core

- Workspace creation/open folder.
- AgentSession model.
- TemplateService with initial agent templates.
- Launch named agent sessions in workspace.
- Session list/dashboard.
- Stop/restart/archive controls.

## Phase 3: Persistent Logs, Search, and Recovery

- Bounded persisted transcript chunks.
- Search current/all session logs.
- Session history view.
- Restore metadata after restart.

## Phase 4: Notifications and Attention Routing

- Notification service.
- Unread badges and attention highlighting.
- Jump-to-next-waiting/unread.
- Windows toast notifications.

## Phase 5+: Multi-agent task launch, panes, CLI/API, Git workflow, approvals, browser surfaces, release hardening.
