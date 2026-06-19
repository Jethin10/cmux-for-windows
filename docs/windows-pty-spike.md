# Windows PTY Spike

Phase 1 validates the riskiest technical path: Electron + xterm.js + node-pty/ConPTY on Windows.

## Implemented foundation

- `@cmux/pty` exposes a `NodePtyBroker` that owns PTY process handles.
- Terminal creation stores only runtime-safe metadata in `TerminalSession`.
- Terminal output is emitted with monotonically increasing sequence numbers.
- Resize requests reject `0x0` before reaching ConPTY.
- Close requests support interrupt, terminate, detach, and Windows process-tree kill via `taskkill.exe`.
- The renderer mounts an xterm.js surface inside the secure Electron renderer process.
- The Electron main process now owns a `TerminalService` that lazily loads `NodePtyBroker`.
- Typed IPC supports terminal create/write/resize/close plus detachable output/exit subscriptions.
- The preload bridge exposes only terminal IPC methods; PTY/process handles stay in main.

## Local native module note

`node-pty` is optional while the spike is being built out. With pnpm 10, native build scripts may be ignored until explicitly approved:

```bash
pnpm approve-builds
```

Do not treat the spike as passed until a packaged Windows build proves `node-pty` loads without developer tooling.

## Manual validation gates still required

- Manually verify the xterm.js spike can spawn and interact with the default local shell through IPC.
- Spawn `pwsh.exe`, `powershell.exe`, `cmd.exe`, `wsl.exe`, Git Bash, and `ssh.exe` where available.
- Run high-output commands without renderer freezes.
- Rapidly resize while full-screen terminal apps are active.
- Validate Ctrl+C, paste, bracketed paste, Unicode, CJK, emoji, and IME input.
- Close many PTYs and verify obvious child processes are not orphaned.
- Package and run on a clean Windows VM.
