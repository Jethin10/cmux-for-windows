import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  AgentSessionId,
  TerminalSession,
  TerminalSessionId,
  TerminalSessionStatus,
  WorkspaceId,
} from "@cmux/shared";
import { nowIso } from "@cmux/shared";
import type {
  CreateTerminalRequest,
  PtyBroker,
  TerminalCloseMode,
  TerminalExitEvent,
  TerminalExitHandler,
  TerminalOutputEvent,
  TerminalOutputHandler,
  TerminalSubscription,
} from "./index.js";
import { assertValidTerminalSize } from "./validation.js";

interface NodePtyProcess {
  pid: number;
  onData(handler: (data: string) => void): { dispose(): void };
  onExit(handler: (event: { exitCode?: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

interface NodePtyModule {
  spawn(
    command: string,
    args: readonly string[],
    options: {
      cols: number;
      rows: number;
      cwd: string;
      env: NodeJS.ProcessEnv;
      useConpty?: boolean;
    },
  ): NodePtyProcess;
}

interface RuntimeTerminal {
  process: NodePtyProcess;
  request: CreateTerminalRequest;
  session: TerminalSession;
  outputSequence: number;
  outputSubscriptions: Set<TerminalOutputHandler>;
  exitSubscriptions: Set<TerminalExitHandler>;
  disposables: Array<{ dispose(): void }>;
}

export interface NodePtyBrokerOptions {
  killProcessTree?: (pid: number) => Promise<void>;
}

export class NodePtyBroker implements PtyBroker {
  private readonly terminals = new Map<TerminalSessionId, RuntimeTerminal>();
  private readonly killProcessTree: (pid: number) => Promise<void>;

  constructor(
    private readonly pty: NodePtyModule,
    options: NodePtyBrokerOptions = {},
  ) {
    this.killProcessTree = options.killProcessTree ?? defaultKillProcessTree;
  }

  static async load(): Promise<NodePtyBroker> {
    try {
      const pty = (await import("node-pty")) as unknown as NodePtyModule;
      return new NodePtyBroker(pty);
    } catch (error) {
      throw new Error(
        "Unable to load optional dependency node-pty. Run `pnpm approve-builds` and reinstall dependencies, then verify the packaged Windows build loads node-pty without developer tooling.",
        { cause: error },
      );
    }
  }

  async createTerminal(request: CreateTerminalRequest): Promise<TerminalSession> {
    assertValidTerminalSize(request.cols, request.rows);

    const terminalId = randomUUID() as TerminalSessionId;
    const startedAt = nowIso();
    const ptyProcess = this.pty.spawn(request.command, request.args, {
      cols: request.cols,
      rows: request.rows,
      cwd: request.cwd,
      env: process.env,
      useConpty: process.platform === "win32",
    });

    const session: TerminalSession = {
      id: terminalId,
      workspaceId: request.workspaceId as WorkspaceId,
      ...(request.agentSessionId
        ? { agentSessionId: request.agentSessionId as AgentSessionId }
        : {}),
      profileId: request.profileId,
      command: request.command,
      argsJson: JSON.stringify(request.args),
      cwd: request.cwd,
      cols: request.cols,
      rows: request.rows,
      status: "running",
      pid: ptyProcess.pid,
      startedAt,
    };

    const runtime: RuntimeTerminal = {
      process: ptyProcess,
      request,
      session,
      outputSequence: 0,
      outputSubscriptions: new Set(),
      exitSubscriptions: new Set(),
      disposables: [],
    };

    runtime.disposables.push(
      ptyProcess.onData((data) => {
        runtime.outputSequence += 1;
        const event: TerminalOutputEvent = {
          terminalSessionId: terminalId,
          sequence: runtime.outputSequence,
          data,
        };
        for (const handler of runtime.outputSubscriptions) handler(event);
      }),
      ptyProcess.onExit((event) => {
        if (runtime.session.status === "disposed") return;
        const nextStatus = classifyExitStatus(event);
        assertExitTransition(runtime.session.status, nextStatus);
        runtime.session = {
          ...runtime.session,
          status: nextStatus,
          ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
          endedAt: nowIso(),
        };
        const exitEvent: TerminalExitEvent = {
          terminalSessionId: terminalId,
          ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
          ...(event.signal !== undefined ? { signal: event.signal } : {}),
        };
        for (const handler of runtime.exitSubscriptions) handler(exitEvent);
      }),
    );

    this.terminals.set(terminalId, runtime);
    return session;
  }

  async writeTerminal(terminalId: TerminalSessionId, data: string): Promise<void> {
    const runtime = this.requireRuntime(terminalId);
    if (runtime.session.status !== "running") {
      throw new Error(`Cannot write to terminal ${terminalId} while ${runtime.session.status}`);
    }
    runtime.process.write(data);
  }

  async resizeTerminal(terminalId: TerminalSessionId, cols: number, rows: number): Promise<void> {
    assertValidTerminalSize(cols, rows);
    const runtime = this.requireRuntime(terminalId);
    if (runtime.session.status !== "running") return;
    runtime.process.resize(cols, rows);
    runtime.session = { ...runtime.session, cols, rows };
  }

  async closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void> {
    const runtime = this.requireRuntime(terminalId);
    if (runtime.session.status === "disposed") return;
    if (mode === "detach") return;

    if (runtime.session.status === "running") {
      runtime.session = { ...runtime.session, status: "closing" };
    }

    if (mode === "interrupt") {
      runtime.process.kill("SIGINT");
      return;
    }

    if (mode === "kill-process-tree") {
      await this.killProcessTree(runtime.process.pid);
    }

    runtime.process.kill();
  }

  async restartTerminal(terminalId: TerminalSessionId): Promise<TerminalSession> {
    const runtime = this.requireRuntime(terminalId);
    const request = runtime.request;
    await this.closeTerminal(terminalId, "terminate");
    await this.disposeTerminal(terminalId);
    return this.createTerminal(request);
  }

  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: TerminalOutputHandler,
  ): TerminalSubscription {
    const runtime = this.requireRuntime(terminalId);
    runtime.outputSubscriptions.add(handler);
    return { dispose: () => runtime.outputSubscriptions.delete(handler) };
  }

  subscribeExit(terminalId: TerminalSessionId, handler: TerminalExitHandler): TerminalSubscription {
    const runtime = this.requireRuntime(terminalId);
    runtime.exitSubscriptions.add(handler);
    return { dispose: () => runtime.exitSubscriptions.delete(handler) };
  }

  getTerminal(terminalId: TerminalSessionId): TerminalSession | undefined {
    const runtime = this.terminals.get(terminalId);
    return runtime?.session;
  }

  async disposeTerminal(terminalId: TerminalSessionId): Promise<void> {
    const runtime = this.requireRuntime(terminalId);
    for (const disposable of runtime.disposables) disposable.dispose();
    runtime.outputSubscriptions.clear();
    runtime.exitSubscriptions.clear();
    runtime.session = {
      ...runtime.session,
      status: "disposed",
      endedAt: runtime.session.endedAt ?? nowIso(),
    };
    this.terminals.delete(terminalId);
  }

  private requireRuntime(terminalId: TerminalSessionId): RuntimeTerminal {
    const runtime = this.terminals.get(terminalId);
    if (!runtime) throw new Error(`Unknown terminal session: ${terminalId}`);
    return runtime;
  }
}

export class ChildProcessBroker implements PtyBroker {
  private readonly terminals = new Map<TerminalSessionId, RuntimeChildProcessTerminal>();

  async createTerminal(request: CreateTerminalRequest): Promise<TerminalSession> {
    assertValidTerminalSize(request.cols, request.rows);
    const terminalId = randomUUID() as TerminalSessionId;
    const startedAt = nowIso();
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      env: process.env,
      windowsHide: false,
      stdio: "pipe",
    });

    const session: TerminalSession = {
      id: terminalId,
      workspaceId: request.workspaceId as WorkspaceId,
      ...(request.agentSessionId
        ? { agentSessionId: request.agentSessionId as AgentSessionId }
        : {}),
      profileId: request.profileId,
      command: request.command,
      argsJson: JSON.stringify(request.args),
      cwd: request.cwd,
      cols: request.cols,
      rows: request.rows,
      status: "running",
      ...(child.pid ? { pid: child.pid } : {}),
      startedAt,
    };

    const runtime: RuntimeChildProcessTerminal = {
      process: child,
      request,
      session,
      outputSequence: 0,
      outputSubscriptions: new Set(),
      exitSubscriptions: new Set(),
    };
    this.terminals.set(terminalId, runtime);

    const emitOutput = (data: Buffer): void => {
      runtime.outputSequence += 1;
      const event: TerminalOutputEvent = {
        terminalSessionId: terminalId,
        sequence: runtime.outputSequence,
        data: data.toString("utf8"),
      };
      for (const handler of runtime.outputSubscriptions) handler(event);
    };

    child.stdout.on("data", emitOutput);
    child.stderr.on("data", emitOutput);
    child.once("error", (error) =>
      emitOutput(Buffer.from(`\r\n[process error] ${error.message}\r\n`)),
    );
    child.once("exit", (exitCode, signal) => {
      const nextStatus = exitCode === 0 || exitCode === null ? "exited" : "crashed";
      runtime.session = {
        ...runtime.session,
        status: nextStatus,
        ...(typeof exitCode === "number" ? { exitCode } : {}),
        endedAt: nowIso(),
      };
      const event: TerminalExitEvent = {
        terminalSessionId: terminalId,
        ...(typeof exitCode === "number" ? { exitCode } : {}),
        ...(signal ? { signal: signalToNumber(signal) } : {}),
      };
      for (const handler of runtime.exitSubscriptions) handler(event);
    });

    return session;
  }

  async writeTerminal(terminalId: TerminalSessionId, data: string): Promise<void> {
    const runtime = this.requireRuntime(terminalId);
    if (data === "\u0003") {
      runtime.process.kill("SIGINT");
      return;
    }
    runtime.process.stdin.write(data);
  }

  async resizeTerminal(_terminalId: TerminalSessionId, cols: number, rows: number): Promise<void> {
    assertValidTerminalSize(cols, rows);
  }

  async closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void> {
    const runtime = this.requireRuntime(terminalId);
    if (mode === "detach") return;
    runtime.session = { ...runtime.session, status: "closing" };
    runtime.process.kill(mode === "interrupt" ? "SIGINT" : undefined);
  }

  async restartTerminal(terminalId: TerminalSessionId): Promise<TerminalSession> {
    const runtime = this.requireRuntime(terminalId);
    const request = runtime.request;
    await this.closeTerminal(terminalId, "terminate");
    this.terminals.delete(terminalId);
    return this.createTerminal(request);
  }

  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: TerminalOutputHandler,
  ): TerminalSubscription {
    const runtime = this.requireRuntime(terminalId);
    runtime.outputSubscriptions.add(handler);
    return { dispose: () => runtime.outputSubscriptions.delete(handler) };
  }

  subscribeExit(terminalId: TerminalSessionId, handler: TerminalExitHandler): TerminalSubscription {
    const runtime = this.requireRuntime(terminalId);
    runtime.exitSubscriptions.add(handler);
    return { dispose: () => runtime.exitSubscriptions.delete(handler) };
  }

  private requireRuntime(terminalId: TerminalSessionId): RuntimeChildProcessTerminal {
    const runtime = this.terminals.get(terminalId);
    if (!runtime) throw new Error(`Unknown terminal session: ${terminalId}`);
    return runtime;
  }
}

interface RuntimeChildProcessTerminal {
  process: ChildProcessWithoutNullStreams;
  request: CreateTerminalRequest;
  session: TerminalSession;
  outputSequence: number;
  outputSubscriptions: Set<TerminalOutputHandler>;
  exitSubscriptions: Set<TerminalExitHandler>;
}

export async function createNodePtyBroker(): Promise<PtyBroker> {
  try {
    return await NodePtyBroker.load();
  } catch (error) {
    console.warn(
      `${error instanceof Error ? error.message : String(error)} Falling back to child_process shell mode; terminal emulation features will be limited until node-pty is rebuilt for Electron.`,
    );
    return new ChildProcessBroker();
  }
}

function signalToNumber(signal: NodeJS.Signals): number {
  return signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1;
}

function classifyExitStatus(event: { exitCode?: number; signal?: number }): "exited" | "crashed" {
  if (event.signal !== undefined && event.signal !== 0) return "crashed";
  if (event.exitCode !== undefined && event.exitCode !== 0) return "crashed";
  return "exited";
}

function assertExitTransition(
  from: TerminalSessionStatus,
  to: Extract<TerminalSessionStatus, "exited" | "crashed">,
): void {
  const valid = (from === "running" || from === "closing") && (to === "exited" || to === "crashed");
  if (!valid) throw new Error(`Invalid terminal exit transition: ${from} -> ${to}`);
}

async function defaultKillProcessTree(pid: number): Promise<void> {
  if (process.platform !== "win32") return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`taskkill.exe failed for pid ${pid} with exit code ${exitCode}`));
    });
  });
}
