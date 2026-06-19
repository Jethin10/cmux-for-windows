# CMux for Windows

CMux for Windows is a Windows-first command center for supervising multiple coding-agent terminal sessions. The MVP focuses on agent supervision reliability: launch agents in a repo, see session status, jump to sessions needing attention, persist searchable transcripts, and recover history after restart.

## Status

Phase 0 foundation is in progress. The repository currently contains the monorepo skeleton, security/architecture docs, typed domain packages, a minimal secure Electron shell, and migration/state-machine tests.

## Product principles

- Backend/core owns durable truth; React state is a cache.
- Terminal/process handles never live in the renderer.
- Domain events are persisted separately from high-volume terminal output.
- Agents are first-class; terminals are execution surfaces.
- Windows PTY behavior is validated before broad UI expansion.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm dev:desktop
```

If `pnpm` is not installed, install it with Node's package manager or Corepack before running the commands.

## Workspace layout

```text
apps/desktop      Electron app shell
packages/core     Domain state machines and services
packages/pty      PTY broker interface and future node-pty implementation
packages/storage  SQLite migration framework abstractions
packages/ipc      Typed IPC channel contracts
packages/ui       Shared React UI primitives
packages/cli      Future local CLI entry point
packages/shared   Shared domain types and utilities
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md).
