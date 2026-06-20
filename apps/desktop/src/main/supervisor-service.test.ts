import { describe, expect, it, vi } from "vitest";
import type { PaneLayoutState, TerminalSessionId } from "@cmux/shared";
import type { TerminalCloseMode, TranscriptSearchResult } from "@cmux/ipc";
import type { TerminalExitEvent, TerminalOutputEvent, TerminalSubscription } from "@cmux/pty";
import type { CreateProcessTerminalRequest } from "./terminal-service.js";
import type { SupervisorSnapshot, SupervisorStore, TranscriptRecord } from "./persistent-store.js";
import { SupervisorService, type SupervisorTerminalService } from "./supervisor-service.js";

class MemoryStore implements SupervisorStore {
  snapshot: SupervisorSnapshot = { workspaces: [], agents: [], notifications: [], paneLayouts: [] };

  async loadSnapshot(): Promise<SupervisorSnapshot> {
    return this.snapshot;
  }

  async saveSnapshot(snapshot: SupervisorSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }

  async appendTranscript(_record: TranscriptRecord): Promise<void> {}

  async searchTranscripts(): Promise<TranscriptSearchResult[]> {
    return [];
  }
}

class FakeTerminalService implements SupervisorTerminalService {
  readonly createRequests: CreateProcessTerminalRequest[] = [];
  failCreate = false;
  readonly closes: Array<{ terminalId: TerminalSessionId; mode: TerminalCloseMode }> = [];
  readonly outputHandlers = new Map<TerminalSessionId, (event: TerminalOutputEvent) => void>();
  readonly exitHandlers = new Map<TerminalSessionId, (event: TerminalExitEvent) => void>();

  async createProcessTerminal(
    request: CreateProcessTerminalRequest,
  ): Promise<{ id: TerminalSessionId }> {
    this.createRequests.push(request);
    if (this.failCreate) throw new Error("spawn failed");
    return { id: `terminal-${this.createRequests.length}` as TerminalSessionId };
  }

  async closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void> {
    this.closes.push({ terminalId, mode });
  }

  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: (event: TerminalOutputEvent) => void,
  ): TerminalSubscription {
    this.outputHandlers.set(terminalId, handler);
    return { dispose: vi.fn(() => this.outputHandlers.delete(terminalId)) };
  }

  subscribeExit(
    terminalId: TerminalSessionId,
    handler: (event: TerminalExitEvent) => void,
  ): TerminalSubscription {
    this.exitHandlers.set(terminalId, handler);
    return { dispose: vi.fn(() => this.exitHandlers.delete(terminalId)) };
  }
}

describe("SupervisorService", () => {
  it("opens workspaces idempotently", () => {
    const service = new SupervisorService(new FakeTerminalService());

    const first = service.openWorkspace({ rootPath: "C:/repo", trusted: true });
    const second = service.openWorkspace({ rootPath: "C:/repo", trusted: false });

    expect(second.id).toBe(first.id);
    expect(second.trusted).toBe(false);
    expect(service.listWorkspaces()).toHaveLength(1);
  });

  it("launches an agent from a template and attaches runtime subscriptions", async () => {
    const terminalService = new FakeTerminalService();
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });

    const agent = await service.launchAgent({
      workspaceId: workspace.id,
      templateId: "template-pi",
      title: "Pi in repo",
      prompt: "fix tests",
    });

    expect(agent).toMatchObject({
      workspaceId: workspace.id,
      title: "Pi in repo",
      provider: "pi",
      status: "running",
      terminalSessionId: "terminal-1",
    });
    expect(terminalService.createRequests).toEqual([
      expect.objectContaining({
        profileId: "template-pi",
        command: "pi",
        args: ["fix tests"],
        cwd: expect.stringContaining("repo"),
        agentSessionId: agent.id,
      }),
    ]);
    expect(terminalService.outputHandlers.has("terminal-1" as TerminalSessionId)).toBe(true);
    expect(terminalService.exitHandlers.has("terminal-1" as TerminalSessionId)).toBe(true);
  });

  it("launches agent batches and reports per-item failures without stopping the batch", async () => {
    const terminalService = new FakeTerminalService();
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });

    const result = await service.launchAgentBatch({
      workspaceId: workspace.id,
      launches: [
        { templateId: "template-pi", title: "Pi one", prompt: "fix tests" },
        { templateId: "template-codex", title: "Codex one" },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.agents.map((agent) => agent.title)).toEqual(["Pi one", "Codex one"]);
    expect(terminalService.createRequests).toHaveLength(2);
  });

  it("continues agent batches after a bad launch item", async () => {
    const terminalService = new FakeTerminalService();
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });

    const result = await service.launchAgentBatch({
      workspaceId: workspace.id,
      launches: [
        { templateId: "missing-template", title: "Missing" },
        { templateId: "template-pi", title: "Pi one" },
      ],
    });

    expect(result.failures).toEqual([
      { index: 0, title: "Missing", error: "Unknown template: missing-template" },
    ]);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({ title: "Pi one", status: "running" });
  });

  it("marks launch failures as failed instead of leaving starting sessions", async () => {
    const terminalService = new FakeTerminalService();
    terminalService.failCreate = true;
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });

    await expect(
      service.launchAgent({
        workspaceId: workspace.id,
        templateId: "template-pi",
        title: "Pi in repo",
        prompt: "fix tests",
      }),
    ).rejects.toThrow(/spawn failed/);

    expect(service.listAgents(workspace.id)[0]).toMatchObject({
      status: "failed",
      statusReason: "spawn failed",
    });
  });

  it("updates agent status from output and terminal exit", async () => {
    const terminalService = new FakeTerminalService();
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });
    const agent = await service.launchAgent({
      workspaceId: workspace.id,
      templateId: "template-pi",
      title: "Pi in repo",
      prompt: "fix tests",
    });

    terminalService.outputHandlers.get(agent.terminalSessionId!)!({
      terminalSessionId: agent.terminalSessionId!,
      sequence: 1,
      data: "Approve? yes/no",
    });
    expect(service.listAgents(workspace.id)[0]).toMatchObject({ status: "waiting" });
    const waitingNotification = service.listNotifications(workspace.id)[0]!;
    expect(waitingNotification).toMatchObject({ title: "Pi in repo waiting", read: false });
    expect(service.nextUnreadAgent(workspace.id)).toMatchObject({ id: agent.id });
    expect(service.markNotificationRead(waitingNotification.id)).toMatchObject({ read: true });

    terminalService.outputHandlers.get(agent.terminalSessionId!)!({
      terminalSessionId: agent.terminalSessionId!,
      sequence: 2,
      data: "Tests failed",
    });
    terminalService.outputHandlers.get(agent.terminalSessionId!)!({
      terminalSessionId: agent.terminalSessionId!,
      sequence: 3,
      data: "plain progress output",
    });
    expect(service.listAgents(workspace.id)[0]).toMatchObject({ status: "failed" });

    terminalService.exitHandlers.get(agent.terminalSessionId!)!({
      terminalSessionId: agent.terminalSessionId!,
      exitCode: 1,
    });
    expect(service.listAgents(workspace.id)[0]).toMatchObject({ status: "failed" });
  });

  it("opens, focuses, closes, and restores persisted pane layouts", async () => {
    const store = new MemoryStore();
    const service = new SupervisorService(new FakeTerminalService(), undefined, store);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });

    expect(service.getPaneLayout(workspace.id)).toEqual({ surfaces: [] });
    expect(
      service.openPaneSurface(workspace.id, {
        id: "surface-agent-1",
        kind: "agent-terminal",
        title: "Pi",
        terminalSessionId: "terminal-1" as TerminalSessionId,
      }),
    ).toMatchObject({ activeSurfaceId: "surface-agent-1" });
    service.openPaneSurface(workspace.id, {
      id: "surface-log-1",
      kind: "transcript",
      title: "Log",
    });
    expect(service.focusPaneSurface(workspace.id, "surface-agent-1")).toMatchObject({
      activeSurfaceId: "surface-agent-1",
    });
    const afterReorder = service.reorderPaneSurface(workspace.id, "surface-log-1", {
      beforeSurfaceId: "surface-agent-1",
    });
    expect(afterReorder.surfaces.map((surface) => surface.id)).toEqual([
      "surface-log-1",
      "surface-agent-1",
    ]);

    const afterClose = service.closePaneSurface(workspace.id, "surface-agent-1");
    expect(afterClose).toMatchObject({ activeSurfaceId: "surface-log-1" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const restored = new SupervisorService(new FakeTerminalService(), undefined, store);
    await restored.restore();
    expect(restored.getPaneLayout(workspace.id)).toEqual(afterClose as PaneLayoutState);
  });

  it("stops, restarts, and archives agent sessions", async () => {
    const terminalService = new FakeTerminalService();
    const service = new SupervisorService(terminalService);
    const workspace = service.openWorkspace({ rootPath: "C:/repo", trusted: true });
    const agent = await service.launchAgent({
      workspaceId: workspace.id,
      templateId: "template-pi",
      title: "Pi in repo",
      prompt: "fix tests",
    });

    const stopped = await service.stopAgent({ agentSessionId: agent.id, mode: "terminate" });
    expect(stopped.status).toBe("stopped");
    expect(terminalService.closes).toEqual([
      { terminalId: agent.terminalSessionId, mode: "terminate" },
    ]);

    const restarted = await service.restartAgent(agent.id);
    expect(restarted).toMatchObject({ status: "running", terminalSessionId: "terminal-2" });

    const stoppedAgain = await service.stopAgent({ agentSessionId: agent.id, mode: "terminate" });
    expect(stoppedAgain.status).toBe("stopped");
    const archived = service.archiveAgent(agent.id);
    expect(archived.status).toBe("archived");
    expect(service.listAgents(workspace.id)).toEqual([]);
  });
});
