import { describe, expect, it, vi } from "vitest";
import type { TerminalSession, TerminalSessionId, WorkspaceId } from "@cmux/shared";
import type {
  CreateTerminalRequest,
  PtyBroker,
  TerminalCloseMode,
  TerminalExitHandler,
  TerminalOutputHandler,
  TerminalSubscription,
} from "@cmux/pty";
import { TerminalService } from "./terminal-service.js";

class FakeBroker implements PtyBroker {
  readonly createRequests: CreateTerminalRequest[] = [];
  readonly writes: Array<{ terminalId: TerminalSessionId; data: string }> = [];
  readonly resizes: Array<{ terminalId: TerminalSessionId; cols: number; rows: number }> = [];
  readonly closes: Array<{ terminalId: TerminalSessionId; mode: TerminalCloseMode }> = [];
  readonly outputSubscriptions: Array<{
    terminalId: TerminalSessionId;
    handler: TerminalOutputHandler;
  }> = [];
  readonly exitSubscriptions: Array<{
    terminalId: TerminalSessionId;
    handler: TerminalExitHandler;
  }> = [];

  async createTerminal(request: CreateTerminalRequest): Promise<TerminalSession> {
    this.createRequests.push(request);
    return {
      id: `terminal-${this.createRequests.length}` as TerminalSessionId,
      workspaceId: request.workspaceId as WorkspaceId,
      profileId: request.profileId,
      command: request.command,
      argsJson: JSON.stringify(request.args),
      cwd: request.cwd,
      cols: request.cols,
      rows: request.rows,
      status: "running",
      pid: 1234,
      startedAt: "2026-06-20T00:00:00.000Z",
    };
  }

  async writeTerminal(terminalId: TerminalSessionId, data: string): Promise<void> {
    this.writes.push({ terminalId, data });
  }

  async resizeTerminal(terminalId: TerminalSessionId, cols: number, rows: number): Promise<void> {
    this.resizes.push({ terminalId, cols, rows });
  }

  async closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void> {
    this.closes.push({ terminalId, mode });
  }

  async restartTerminal(_terminalId: TerminalSessionId): Promise<TerminalSession> {
    throw new Error("restart is not used by TerminalService");
  }

  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: TerminalOutputHandler,
  ): TerminalSubscription {
    this.outputSubscriptions.push({ terminalId, handler });
    return { dispose: vi.fn() };
  }

  subscribeExit(terminalId: TerminalSessionId, handler: TerminalExitHandler): TerminalSubscription {
    this.exitSubscriptions.push({ terminalId, handler });
    return { dispose: vi.fn() };
  }
}

describe("TerminalService", () => {
  it("resolves a renderer create request into a backend-owned PTY request", async () => {
    const broker = new FakeBroker();
    const service = new TerminalService(broker, {
      defaultCwd: "C:/repo",
      resolveProfile: () => ({ profileId: "default-shell", command: "cmd.exe", args: [] }),
    });

    const session = await service.createTerminal({ cols: 100, rows: 30 });

    expect(session).toMatchObject({ command: "cmd.exe", cwd: "C:/repo", status: "running" });
    expect(broker.createRequests).toEqual([
      expect.objectContaining({
        profileId: "default-shell",
        command: "cmd.exe",
        args: [],
        cwd: "C:/repo",
        cols: 100,
        rows: 30,
        workspaceId: "local-terminal-spike",
      }),
    ]);
  });

  it("delegates write, resize, close, and subscriptions without exposing process handles", async () => {
    const broker = new FakeBroker();
    const service = new TerminalService(broker, {
      resolveProfile: () => ({ profileId: "test", command: "shell", args: ["--login"] }),
    });
    const session = await service.createTerminal({ cols: 80, rows: 24, cwd: "C:/workspace" });

    await service.writeTerminal({ terminalSessionId: session.id, data: "hello" });
    await service.resizeTerminal({ terminalSessionId: session.id, cols: 120, rows: 40 });
    const outputSubscription = service.subscribeOutput(session.id, vi.fn());
    const exitSubscription = service.subscribeExit(session.id, vi.fn());
    await service.closeTerminal(session.id, "interrupt");

    expect(broker.writes).toEqual([{ terminalId: session.id, data: "hello" }]);
    expect(broker.resizes).toEqual([{ terminalId: session.id, cols: 120, rows: 40 }]);
    expect(broker.outputSubscriptions).toHaveLength(1);
    expect(broker.exitSubscriptions).toHaveLength(2);
    expect(broker.closes).toEqual([{ terminalId: session.id, mode: "interrupt" }]);
    expect(outputSubscription).toHaveProperty("dispose");
    expect(exitSubscription).toHaveProperty("dispose");
  });

  it("closes tracked terminals during shutdown", async () => {
    const broker = new FakeBroker();
    const service = new TerminalService(broker, {
      resolveProfile: () => ({ profileId: "test", command: "shell", args: [] }),
    });
    const first = await service.createTerminal({ cols: 80, rows: 24 });
    const second = await service.createTerminal({ cols: 100, rows: 30 });

    await service.closeAll("terminate");

    expect(broker.closes).toEqual([
      { terminalId: first.id, mode: "terminate" },
      { terminalId: second.id, mode: "terminate" },
    ]);
  });

  it("stops tracking terminals after their exit event", async () => {
    const broker = new FakeBroker();
    const service = new TerminalService(broker, {
      resolveProfile: () => ({ profileId: "test", command: "shell", args: [] }),
    });
    const session = await service.createTerminal({ cols: 80, rows: 24 });

    broker.exitSubscriptions[0]!.handler({ terminalSessionId: session.id, exitCode: 0 });
    await service.closeAll("terminate");

    expect(broker.closes).toEqual([]);
  });
});
