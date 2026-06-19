# Release Hardening Checklist

This checklist tracks gates that must pass before CMux for Windows is treated as installable software rather than a development spike.

## Native PTY gate

1. Approve native pnpm build scripts where required:

   ```bash
   npx pnpm@10.13.1 approve-builds
   npx pnpm@10.13.1 install --frozen-lockfile
   ```

2. Build the workspace:

   ```bash
   npx pnpm@10.13.1 build
   ```

3. Verify the packaged/native PTY boundary loads:

   ```bash
   npx pnpm@10.13.1 verify:native-pty
   ```

4. Run the manual PTY matrix in `docs/windows-pty-spike.md` on a clean Windows machine.

## Browser surface safety gate

- Only `http:` and `https:` URLs are allowed for browser surfaces.
- Credentials are stripped from URLs before they become surface metadata.
- Local file URLs must not be opened through browser surfaces.

## Release readiness reminders

- Keep renderer IPC narrow and validated.
- Do not persist terminal/process handles.
- Keep transcript retention bounded.
- Validate high-output and rapid-resize PTY behavior before publishing installers.
