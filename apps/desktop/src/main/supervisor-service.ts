import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import {
  defaultTemplates,
  detectAgentAttention,
  closeSurface,
  createBrowserSurface,
  findDefaultTemplate,
  focusSurface,
  openSurface,
  reorderSurface,
  type ReorderSurfaceOptions,
  renderTemplate,
} from "@cmux/core";
import type {
  AgentSession,
  AgentSessionId,
  Notification as CmuxNotification,
  NotificationId,
  PaneLayoutState,
  PaneSurface,
  Template,
  TemplateId,
  TerminalSessionId,
  Workspace,
  WorkspaceId,
} from "@cmux/shared";
import { nowIso } from "@cmux/shared";
import type {
  AgentBatchLaunchRequest,
  AgentBatchLaunchResponse,
  AgentLaunchRequest,
  AgentStopRequest,
  TerminalCloseMode,
  TranscriptSearchRequest,
  TranscriptSearchResult,
  WorkspaceOpenRequest,
} from "@cmux/ipc";
import type { TerminalExitEvent, TerminalOutputEvent, TerminalSubscription } from "@cmux/pty";
import type { DesktopNotificationService } from "./desktop-notification-service.js";
import type { SupervisorStore } from "./persistent-store.js";
import type { CreateProcessTerminalRequest, TerminalService } from "./terminal-service.js";

const DEFAULT_TERMINAL_COLS = 100;
const DEFAULT_TERMINAL_ROWS = 30;

export interface SupervisorTerminalService {
  createProcessTerminal(request: CreateProcessTerminalRequest): Promise<{ id: TerminalSessionId }>;
  closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void>;
  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: (event: TerminalOutputEvent) => void,
  ): TerminalSubscription;
  subscribeExit(
    terminalId: TerminalSessionId,
    handler: (event: TerminalExitEvent) => void,
  ): TerminalSubscription;
}

interface AgentRuntime {
  outputSubscription?: TerminalSubscription;
  exitSubscription?: TerminalSubscription;
}

interface AgentLaunchMetadata {
  templateId: string;
  prompt?: string;
  command: string;
  args: readonly string[];
}

type AgentPatch = Partial<{ [K in keyof AgentSession]: AgentSession[K] | undefined }>;

export class SupervisorService {
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private readonly workspacesByRoot = new Map<string, WorkspaceId>();
  private readonly agents = new Map<AgentSessionId, AgentSession>();
  private readonly notifications = new Map<NotificationId, CmuxNotification>();
  private readonly paneLayouts = new Map<WorkspaceId, PaneLayoutState>();
  private readonly runtimes = new Map<AgentSessionId, AgentRuntime>();
  private readonly templates: readonly Template[];

  constructor(
    private readonly terminalService: SupervisorTerminalService,
    templates: readonly Template[] = defaultTemplates,
    private readonly store?: SupervisorStore,
    private readonly notifier?: DesktopNotificationService,
  ) {
    this.templates = templates;
  }

  static async create(
    getTerminalService: () => Promise<TerminalService>,
    store?: SupervisorStore,
    notifier?: DesktopNotificationService,
  ): Promise<SupervisorService> {
    const service = new SupervisorService(
      await getTerminalService(),
      defaultTemplates,
      store,
      notifier,
    );
    await service.restore();
    return service;
  }

  async restore(): Promise<void> {
    if (!this.store) return;
    const snapshot = await this.store.loadSnapshot();
    this.workspaces.clear();
    this.workspacesByRoot.clear();
    this.agents.clear();
    this.notifications.clear();
    this.paneLayouts.clear();
    for (const workspace of snapshot.workspaces) {
      this.workspaces.set(workspace.id, workspace);
      this.workspacesByRoot.set(normalizeRootPath(workspace.rootPath), workspace.id);
    }
    for (const agent of snapshot.agents) this.agents.set(agent.id, agent);
    for (const notification of snapshot.notifications ?? []) {
      this.notifications.set(notification.id, notification);
    }
    for (const entry of snapshot.paneLayouts ?? []) {
      if (this.workspaces.has(entry.workspaceId)) {
        this.paneLayouts.set(entry.workspaceId, copyPaneLayout(entry.layout));
      }
    }
  }

  listWorkspaces(): Workspace[] {
    return [...this.workspaces.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getWorkspace(workspaceId: WorkspaceId): Workspace {
    return this.requireWorkspace(workspaceId);
  }

  openWorkspace(request: WorkspaceOpenRequest): Workspace {
    const rootPath = normalizeRootPath(request.rootPath);
    const existingId = this.workspacesByRoot.get(rootPath);
    if (existingId) {
      const existing = this.requireWorkspace(existingId);
      const updated = { ...existing, trusted: request.trusted, updatedAt: nowIso() };
      this.workspaces.set(existing.id, updated);
      void this.persistSnapshot();
      return updated;
    }

    const now = nowIso();
    const workspace: Workspace = {
      id: randomUUID() as WorkspaceId,
      name: basename(rootPath) || rootPath,
      rootPath,
      trusted: request.trusted,
      createdAt: now,
      updatedAt: now,
      unreadCount: 0,
    };
    this.workspaces.set(workspace.id, workspace);
    this.workspacesByRoot.set(rootPath, workspace.id);
    void this.persistSnapshot();
    return workspace;
  }

  listAgents(workspaceId: WorkspaceId): AgentSession[] {
    this.requireWorkspace(workspaceId);
    return [...this.agents.values()]
      .filter((agent) => agent.workspaceId === workspaceId && agent.status !== "archived")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  listAgentHistory(workspaceId: WorkspaceId): AgentSession[] {
    this.requireWorkspace(workspaceId);
    return [...this.agents.values()]
      .filter((agent) => agent.workspaceId === workspaceId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async searchTranscripts(request: TranscriptSearchRequest): Promise<TranscriptSearchResult[]> {
    if (!this.store) return [];
    if (request.workspaceId) this.requireWorkspace(request.workspaceId);
    return this.store.searchTranscripts(request.query, {
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      ...(request.limit ? { limit: request.limit } : {}),
    });
  }

  listNotifications(workspaceId: WorkspaceId): CmuxNotification[] {
    this.requireWorkspace(workspaceId);
    return [...this.notifications.values()]
      .filter((notification) => notification.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markNotificationRead(notificationId: NotificationId): CmuxNotification {
    const notification = this.notifications.get(notificationId);
    if (!notification) throw new Error(`Unknown notification: ${notificationId}`);
    if (notification.read) return notification;
    const updated = { ...notification, read: true };
    this.notifications.set(notificationId, updated);
    const workspace = this.requireWorkspace(notification.workspaceId);
    this.updateWorkspace(workspace.id, {
      unreadCount: Math.max(0, workspace.unreadCount - 1),
      updatedAt: nowIso(),
    });
    return updated;
  }

  nextUnreadAgent(workspaceId: WorkspaceId): AgentSession | undefined {
    this.requireWorkspace(workspaceId);
    const notification = this.listNotifications(workspaceId).find((candidate) => !candidate.read);
    if (!notification?.agentSessionId) return undefined;
    return this.agents.get(notification.agentSessionId);
  }

  getPaneLayout(workspaceId: WorkspaceId): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    return copyPaneLayout(this.paneLayouts.get(workspaceId) ?? emptyPaneLayout());
  }

  openPaneSurface(workspaceId: WorkspaceId, surface: PaneSurface): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    const layout = openSurface(this.paneLayouts.get(workspaceId) ?? emptyPaneLayout(), surface);
    this.paneLayouts.set(workspaceId, layout);
    void this.persistSnapshot();
    return copyPaneLayout(layout);
  }

  focusPaneSurface(workspaceId: WorkspaceId, surfaceId: string): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    const layout = focusSurface(this.paneLayouts.get(workspaceId) ?? emptyPaneLayout(), surfaceId);
    this.paneLayouts.set(workspaceId, layout);
    void this.persistSnapshot();
    return copyPaneLayout(layout);
  }

  openBrowserSurface(
    workspaceId: WorkspaceId,
    request: { url: string; title?: string },
  ): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    const browserSurface = createBrowserSurface(`browser:${randomUUID()}`, request);
    return this.openPaneSurface(workspaceId, {
      id: browserSurface.id,
      kind: "browser",
      title: browserSurface.title,
      url: browserSurface.url,
    });
  }

  closePaneSurface(workspaceId: WorkspaceId, surfaceId: string): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    const layout = closeSurface(this.paneLayouts.get(workspaceId) ?? emptyPaneLayout(), surfaceId);
    this.paneLayouts.set(workspaceId, layout);
    void this.persistSnapshot();
    return copyPaneLayout(layout);
  }

  reorderPaneSurface(
    workspaceId: WorkspaceId,
    surfaceId: string,
    options: ReorderSurfaceOptions,
  ): PaneLayoutState {
    this.requireWorkspace(workspaceId);
    const layout = reorderSurface(
      this.paneLayouts.get(workspaceId) ?? emptyPaneLayout(),
      surfaceId,
      options,
    );
    this.paneLayouts.set(workspaceId, layout);
    void this.persistSnapshot();
    return copyPaneLayout(layout);
  }

  async launchAgentBatch(request: AgentBatchLaunchRequest): Promise<AgentBatchLaunchResponse> {
    this.requireWorkspace(request.workspaceId);
    const agents: AgentSession[] = [];
    const failures: AgentBatchLaunchResponse["failures"] = [];

    for (const [index, launch] of request.launches.entries()) {
      try {
        agents.push(
          await this.launchAgent({
            workspaceId: request.workspaceId,
            templateId: launch.templateId,
            title: launch.title,
            ...(launch.prompt ? { prompt: launch.prompt } : {}),
          }),
        );
      } catch (error) {
        failures.push({
          index,
          title: launch.title,
          error: formatError(error),
        });
      }
    }

    return { agents, failures };
  }

  async launchAgent(request: AgentLaunchRequest): Promise<AgentSession> {
    const workspace = this.requireWorkspace(request.workspaceId);
    const template = this.requireTemplate(request.templateId);
    const rendered = renderTemplate(template, {
      workspaceRoot: workspace.rootPath,
      ...(request.prompt ? { prompt: request.prompt } : {}),
    });
    const now = nowIso();
    const agent: AgentSession = {
      id: randomUUID() as AgentSessionId,
      workspaceId: workspace.id,
      title: request.title.trim(),
      ...(request.prompt ? { prompt: request.prompt } : {}),
      provider: rendered.provider ?? template.provider ?? "custom",
      templateId: template.id as TemplateId,
      cwd: rendered.cwd,
      status: "starting",
      startedAt: now,
      lastActivityAt: now,
      metadataJson: JSON.stringify({
        templateId: template.id,
        ...(request.prompt ? { prompt: request.prompt } : {}),
        command: rendered.command,
        args: rendered.args,
      } satisfies AgentLaunchMetadata),
    };
    this.agents.set(agent.id, agent);
    void this.persistSnapshot();

    let terminal: { id: TerminalSessionId };
    try {
      terminal = await this.terminalService.createProcessTerminal({
        profileId: String(template.id),
        command: rendered.command,
        args: rendered.args,
        cwd: rendered.cwd,
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
        workspaceId: workspace.id,
        agentSessionId: agent.id,
      });
    } catch (error) {
      this.updateAgent(agent.id, {
        status: "failed",
        statusReason: formatError(error),
        endedAt: nowIso(),
        lastActivityAt: nowIso(),
      });
      throw error;
    }

    const runningAgent = this.updateAgent(agent.id, {
      status: "running",
      terminalSessionId: terminal.id,
      lastActivityAt: nowIso(),
    });
    this.updateWorkspace(workspace.id, {
      activeSessionId: agent.id,
      updatedAt: runningAgent.lastActivityAt,
    });
    this.attachAgentRuntime(agent.id, terminal.id);
    return runningAgent;
  }

  async stopAgent(request: AgentStopRequest): Promise<AgentSession> {
    const agent = this.requireAgent(request.agentSessionId);
    if (agent.status === "archived") throw new Error(`Agent ${agent.id} is archived`);
    this.disposeAgentRuntime(agent.id);
    if (agent.terminalSessionId) {
      await this.terminalService.closeTerminal(agent.terminalSessionId, request.mode);
    }
    return this.updateAgent(agent.id, {
      status: "stopped",
      endedAt: nowIso(),
      lastActivityAt: nowIso(),
      statusReason: `Stopped via ${request.mode}`,
    });
  }

  async restartAgent(agentSessionId: AgentSessionId): Promise<AgentSession> {
    const agent = this.requireAgent(agentSessionId);
    if (agent.status === "archived") throw new Error(`Agent ${agent.id} is archived`);
    const metadata = parseAgentMetadata(agent.metadataJson);
    if (agent.terminalSessionId) {
      this.disposeAgentRuntime(agent.id);
      await this.terminalService.closeTerminal(agent.terminalSessionId, "terminate");
    }

    const now = nowIso();
    const terminal = await this.terminalService.createProcessTerminal({
      profileId: metadata.templateId,
      command: metadata.command,
      args: metadata.args,
      cwd: agent.cwd,
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      workspaceId: agent.workspaceId,
      agentSessionId: agent.id,
    });
    const restarted = this.updateAgent(agent.id, {
      status: "running",
      terminalSessionId: terminal.id,
      startedAt: now,
      endedAt: undefined,
      lastActivityAt: now,
      statusReason: undefined,
    });
    this.attachAgentRuntime(agent.id, terminal.id);
    return restarted;
  }

  archiveAgent(agentSessionId: AgentSessionId): AgentSession {
    const agent = this.requireAgent(agentSessionId);
    if (
      agent.status === "running" ||
      agent.status === "waiting" ||
      agent.status === "needs-attention"
    ) {
      throw new Error(`Stop agent ${agent.id} before archiving`);
    }
    this.disposeAgentRuntime(agent.id);
    return this.updateAgent(agent.id, {
      status: "archived",
      endedAt: agent.endedAt ?? nowIso(),
      lastActivityAt: nowIso(),
    });
  }

  listTemplates(): readonly Template[] {
    return this.templates;
  }

  private attachAgentRuntime(agentId: AgentSessionId, terminalId: TerminalSessionId): void {
    this.disposeAgentRuntime(agentId);
    const runtime: AgentRuntime = {
      outputSubscription: this.terminalService.subscribeOutput(terminalId, (event) => {
        const current = this.agents.get(agentId);
        if (
          !current ||
          current.status === "archived" ||
          current.status === "failed" ||
          current.status === "completed" ||
          current.status === "stopped" ||
          current.terminalSessionId !== event.terminalSessionId
        ) {
          return;
        }
        void this.store
          ?.appendTranscript({
            workspaceId: current.workspaceId,
            agentSessionId: current.id,
            terminalSessionId: event.terminalSessionId,
            sequence: event.sequence,
            createdAt: nowIso(),
            data: event.data,
          })
          .catch((error: unknown) => console.error("Failed to persist transcript output", error));
        const detection = detectAgentAttention(event.data);
        if (detection.status !== "running" && current.status !== detection.status) {
          this.createAttentionNotification(
            current,
            detection.status,
            detection.reason ?? event.data,
          );
        }
        this.updateAgent(agentId, {
          status: detection.status,
          ...(detection.reason ? { statusReason: detection.reason } : {}),
          lastActivityAt: nowIso(),
        });
      }),
      exitSubscription: this.terminalService.subscribeExit(terminalId, (event) => {
        const current = this.agents.get(agentId);
        if (
          !current ||
          current.status === "archived" ||
          current.terminalSessionId !== event.terminalSessionId
        ) {
          return;
        }
        const now = nowIso();
        this.disposeAgentRuntime(agentId);
        const status =
          event.exitCode === 0 || event.exitCode === undefined ? "completed" : "failed";
        if (status === "failed") {
          this.createAttentionNotification(current, "failed", `Exited with ${event.exitCode}`);
        }
        this.updateAgent(agentId, {
          status,
          ...(event.exitCode === undefined
            ? {}
            : { statusReason: `Exited with ${event.exitCode}` }),
          endedAt: now,
          lastActivityAt: now,
        });
      }),
    };
    this.runtimes.set(agentId, runtime);
  }

  private disposeAgentRuntime(agentId: AgentSessionId): void {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) return;
    runtime.outputSubscription?.dispose();
    runtime.exitSubscription?.dispose();
    this.runtimes.delete(agentId);
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    return workspace;
  }

  private requireAgent(agentId: AgentSessionId): AgentSession {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent session: ${agentId}`);
    return agent;
  }

  private requireTemplate(templateId: string): Template {
    const template =
      this.templates.find((candidate) => candidate.id === templateId) ??
      findDefaultTemplate(templateId);
    if (!template) throw new Error(`Unknown template: ${templateId}`);
    return template;
  }

  private createAttentionNotification(
    agent: AgentSession,
    status: Extract<AgentSession["status"], "waiting" | "needs-attention" | "failed">,
    reason: string,
  ): CmuxNotification {
    const notification: CmuxNotification = {
      id: randomUUID() as NotificationId,
      workspaceId: agent.workspaceId,
      agentSessionId: agent.id,
      ...(agent.terminalSessionId ? { terminalSessionId: agent.terminalSessionId } : {}),
      severity: status === "failed" ? "error" : "attention",
      title: `${agent.title} ${status}`,
      body: reason.slice(0, 240),
      read: false,
      source: "heuristic",
      createdAt: nowIso(),
    };
    this.notifications.set(notification.id, notification);
    const workspace = this.requireWorkspace(agent.workspaceId);
    this.updateWorkspace(workspace.id, {
      unreadCount: workspace.unreadCount + 1,
      updatedAt: notification.createdAt,
    });
    this.updateAgent(agent.id, { lastNotificationId: notification.id });
    this.notifier?.show(notification);
    return notification;
  }

  private updateWorkspace(workspaceId: WorkspaceId, patch: Partial<Workspace>): Workspace {
    const updated = { ...this.requireWorkspace(workspaceId), ...patch };
    this.workspaces.set(workspaceId, updated);
    void this.persistSnapshot();
    return updated;
  }

  private updateAgent(agentId: AgentSessionId, patch: AgentPatch): AgentSession {
    const current = this.requireAgent(agentId);
    const updated = omitUndefined({ ...current, ...patch } as Record<
      string,
      unknown
    >) as unknown as AgentSession;
    this.agents.set(agentId, updated);
    void this.persistSnapshot();
    return updated;
  }

  private async persistSnapshot(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.saveSnapshot({
        workspaces: [...this.workspaces.values()],
        agents: [...this.agents.values()],
        notifications: [...this.notifications.values()],
        paneLayouts: [...this.paneLayouts.entries()].map(([workspaceId, layout]) => ({
          workspaceId,
          layout: copyPaneLayout(layout),
        })),
      });
    } catch (error) {
      console.error("Failed to persist supervisor snapshot", error);
    }
  }
}

function emptyPaneLayout(): PaneLayoutState {
  return { surfaces: [] };
}

function copyPaneLayout(layout: PaneLayoutState): PaneLayoutState {
  return {
    surfaces: layout.surfaces.map((surface) => ({ ...surface })),
    ...(layout.activeSurfaceId ? { activeSurfaceId: layout.activeSurfaceId } : {}),
  };
}

function normalizeRootPath(rootPath: string): string {
  return resolve(rootPath.trim());
}

function parseAgentMetadata(metadataJson: string): AgentLaunchMetadata {
  const parsed = JSON.parse(metadataJson) as Partial<AgentLaunchMetadata>;
  if (
    typeof parsed.templateId !== "string" ||
    typeof parsed.command !== "string" ||
    !Array.isArray(parsed.args) ||
    !parsed.args.every((arg) => typeof arg === "string")
  ) {
    throw new Error("Agent session metadata is missing launch information");
  }
  return {
    templateId: parsed.templateId,
    ...(typeof parsed.prompt === "string" ? { prompt: parsed.prompt } : {}),
    command: parsed.command,
    args: parsed.args,
  };
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
