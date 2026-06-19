import { describe, expect, it } from "vitest";
import { NodePtyBroker } from "./broker.js";

class FakePtyProcess {
  readonly pid = 4242;
  readonly writes: string[] = [];
  readonly resizes: Array<{ cols: number; rows: number }> = [];
  readonly kills: Array<string | undefined> = [];
  private dataHandlers = new Set<(data: string) => void>();
  private exitHandlers = new Set<(event: { exitCode?: number; signal?: number }) => void>();

  onData(handler: (data: string) => void) {
    this.dataHandlers.add(handler);
    return { dispose: () => this.dataHandlers.delete(handler) };
  }

  onExit(handler: (event: { exitCode?: number; signal?: number }) => void) {
    this.exitHandlers.add(handler);
    return { dispose: () => this.exitHandlers.delete(handler) };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  kill(signal?: string): void {
    this.kills.push(signal);
  }

  emitData(data: string): void {
    for (const handler of this.dataHandlers) handler(data);
  }

  emitExit(exitCode: number | undefined = 0, signal?: number): void {
    for (const handler of this.exitHandlers)
      handler({
        ...(exitCode !== undefined ? { exitCode } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
  }
}

function createBroker() {
  const processes: FakePtyProcess[] = [];
  const killedTrees: number[] = [];
  const ptyModule = {
    spawn: () => {
      const process = new FakePtyProcess();
      processes.push(process);
      return process;
    },
  };
  return {
    broker: new NodePtyBroker(ptyModule, {
      killProcessTree: async (pid) => void killedTrees.push(pid),
    }),
    killedTrees,
    processes,
  };
}

const request = {
  profileId: "pwsh",
  command: "pwsh.exe",
  args: ["-NoLogo"],
  cwd: "C:/repo",
  cols: 80,
  rows: 24,
  workspaceId: "workspace-1",
};

describe("NodePtyBroker", () => {
  it("creates a running terminal session and records runtime metadata", async () => {
    const { broker } = createBroker();

    const session = await broker.createTerminal(request);

    expect(session).toMatchObject({
      command: "pwsh.exe",
      argsJson: JSON.stringify(["-NoLogo"]),
      cols: 80,
      rows: 24,
      status: "running",
      pid: 4242,
    });
  });

  it("streams output with monotonically increasing sequence numbers", async () => {
    const { broker, processes } = createBroker();
    const session = await broker.createTerminal(request);
    const events: Array<{ sequence: number; data: string }> = [];

    broker.subscribeOutput(session.id, (event) => events.push(event));
    processes[0]!.emitData("hello");
    processes[0]!.emitData("world");

    expect(events).toEqual([
      expect.objectContaining({ sequence: 1, data: "hello" }),
      expect.objectContaining({ sequence: 2, data: "world" }),
    ]);
  });

  it("validates resize and forwards non-zero sizes", async () => {
    const { broker, processes } = createBroker();
    const session = await broker.createTerminal(request);

    await broker.resizeTerminal(session.id, 120, 40);

    await expect(broker.resizeTerminal(session.id, 0, 40)).rejects.toThrow(/0x0/);
    expect(processes[0]!.resizes).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("uses interrupt signal for graceful close", async () => {
    const { broker, processes } = createBroker();
    const session = await broker.createTerminal(request);

    await broker.closeTerminal(session.id, "interrupt");

    expect(processes[0]!.kills).toEqual(["SIGINT"]);
    expect(broker.getTerminal(session.id)?.status).toBe("closing");
  });

  it("uses process-tree termination for kill-process-tree mode", async () => {
    const { broker, killedTrees, processes } = createBroker();
    const session = await broker.createTerminal(request);

    await broker.closeTerminal(session.id, "kill-process-tree");

    expect(killedTrees).toEqual([4242]);
    expect(processes[0]!.kills).toEqual([undefined]);
  });

  it("terminates the existing PTY before restart", async () => {
    const { broker, processes } = createBroker();
    const session = await broker.createTerminal(request);

    const restarted = await broker.restartTerminal(session.id);

    expect(processes[0]!.kills).toEqual([undefined]);
    expect(restarted.id).not.toBe(session.id);
    expect(processes).toHaveLength(2);
  });

  it("marks zero exits as exited and non-zero or signalled exits as crashed", async () => {
    const first = createBroker();
    const firstSession = await first.broker.createTerminal(request);
    first.processes[0]!.emitExit(0);
    expect(first.broker.getTerminal(firstSession.id)?.status).toBe("exited");

    const second = createBroker();
    const secondSession = await second.broker.createTerminal(request);
    second.processes[0]!.emitExit(1);
    expect(second.broker.getTerminal(secondSession.id)?.status).toBe("crashed");

    const third = createBroker();
    const thirdSession = await third.broker.createTerminal(request);
    third.processes[0]!.emitExit(undefined, 15);
    expect(third.broker.getTerminal(thirdSession.id)?.status).toBe("crashed");
  });
});
