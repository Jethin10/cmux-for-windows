import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionId } from "@cmux/shared";
import type { TerminalCloseMode } from "@cmux/ipc";
import type { TerminalExitEvent, TerminalOutputEvent, TerminalSubscription } from "@cmux/pty";
import type { CreateProcessTerminalRequest } from "./terminal-service.js";
import { processCliCommandInbox } from "./cli-command-bridge.js";
import { SupervisorService, type SupervisorTerminalService } from "./supervisor-service.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmux-cli-bridge-"));
  tempDirs.push(dir);
  return dir;
}

class FakeTerminalService implements SupervisorTerminalService {
  async createProcessTerminal(
    _request: CreateProcessTerminalRequest,
  ): Promise<{ id: TerminalSessionId }> {
    return { id: "terminal-1" as TerminalSessionId };
  }

  async closeTerminal(_terminalId: TerminalSessionId, _mode: TerminalCloseMode): Promise<void> {}

  subscribeOutput(
    _terminalId: TerminalSessionId,
    _handler: (event: TerminalOutputEvent) => void,
  ): TerminalSubscription {
    return { dispose: vi.fn() };
  }

  subscribeExit(
    _terminalId: TerminalSessionId,
    _handler: (event: TerminalExitEvent) => void,
  ): TerminalSubscription {
    return { dispose: vi.fn() };
  }
}

describe("CLI command file bridge", () => {
  it("executes queued workspace commands and writes result files", async () => {
    const inbox = await createTempDir();
    const service = new SupervisorService(new FakeTerminalService());
    await writeFile(
      join(inbox, "command.json"),
      `${JSON.stringify({
        id: "command-1",
        envelope: { command: "workspace.open", payload: { rootPath: "C:/repo", trusted: true } },
      })}\n`,
      "utf8",
    );

    await processCliCommandInbox(inbox, service);

    expect(service.listWorkspaces()).toHaveLength(1);
    const resultFile = (await readdir(inbox)).find((file) => file.endsWith(".result.json"));
    expect(resultFile).toBeDefined();
    await expect(readFile(join(inbox, resultFile!), "utf8")).resolves.toContain('"ok": true');
  });
});
