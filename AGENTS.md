# Agent Handoff Context

This repository is building **CMux for Windows**: a Windows-first desktop command center for supervising multiple coding-agent terminal sessions. The MVP prioritizes agent supervision reliability before full terminal multiplexer parity.

## Current state

- GitHub repo: `https://github.com/Jethin10/cmux-for-windows`
- Main working path: `C:/cmux/cmux-for-windows`
- Upstream cmux reference clone: `C:/cmux/reference/cmux.git`
  - It is a bare, blob-filtered clone for research only.
  - Use `git --git-dir=C:/cmux/reference/cmux.git show HEAD:<path>` to inspect upstream files.
- Phase 0 foundation is complete.
- Phase 1 Windows PTY spike foundation has started, but the spike is **not passed** until native `node-pty` packaging and manual Windows PTY gates pass.

## What has been implemented

Merged PRs:

1. `#1 docs: complete foundation ADRs`
   - Completed ADRs for stack, backend ownership, SQLite, transcripts, AgentSession vs TerminalSession, IPC security, and MVP scope.
2. `#2 feat: add default launcher templates`
   - Added default templates for Pi, Claude Code, Codex, Gemini, OpenCode, PowerShell, and npm test watcher.
   - Added safe template rendering that keeps command and argv separate.
3. `#3 feat: add Windows PTY spike foundation`
   - Added optional `node-pty`-backed `NodePtyBroker` in `@cmux/pty`.
   - Added PTY lifecycle tests for create, output sequencing, resize validation, close modes, restart cleanup, and exit/crash status.
   - Added xterm.js spike surface in the Electron renderer.
   - Added upstream cmux translation notes in `docs/upstream-cmux-reference.md`.

## Project architecture reminders

- Backend/core owns truth; React state is only a cache.
- Terminal/process handles must never live in renderer state.
- Domain events are low-volume persisted facts.
- Terminal output is high-volume stream data and must be stored as bounded transcript chunks, not domain events.
- AgentSession is the logical task. TerminalSession is the PTY/process execution surface.
- Renderer IPC must remain narrow, typed, and validated.

## Development commands

`pnpm` may not be globally installed in the environment. Prefer:

```bash
npx pnpm@10.13.1 install --frozen-lockfile
npx pnpm@10.13.1 format:check
npx pnpm@10.13.1 lint
npx pnpm@10.13.1 typecheck
npx pnpm@10.13.1 test
npx pnpm@10.13.1 build
```

For native `node-pty`, pnpm may require:

```bash
npx pnpm@10.13.1 approve-builds
```

Do not mark Phase 1 as complete until the native module loads in a packaged Windows build on a clean machine.

## PR workflow requested by the user

For each implementation slice after initial setup:

1. Create a focused branch.
2. Implement the slice with tests/docs.
3. Run local validation.
4. Open a PR.
5. Do an immediate adversarial self-review before waiting on Copilot:
   - lifecycle/resource leaks
   - Windows-specific failure modes
   - security boundary breaks
   - renderer/main process ownership mistakes
   - unbounded output/memory risks
   - test gaps and docs mismatch
6. Fix issues found by self-review.
7. Check Copilot comments opportunistically, but do not block for a long time waiting for Copilot.
8. Merge after local validation and CI are clean.

## Immediate next work

Recommended next PR: wire the xterm.js spike surface to a main-process `TerminalService`/IPC flow so a user can spawn a real local shell from the UI and stream output into xterm.js.

Keep scope narrow:

- main-process owns `NodePtyBroker`
- preload exposes typed terminal IPC only
- renderer can request create/write/resize/close, but never receives process handles
- output subscription must be detachable
- keep transcript persistence for a later PR unless needed for bounded in-memory scrollback
