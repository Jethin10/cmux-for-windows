import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import {
  defaultTemplates,
  detectAgentAttention,
  findDefaultTemplate,
  renderTemplate,
} from "@cmux/core";
import type {
  AgentSession,
  AgentSessionId,
  Template,
  TemplateId,
  TerminalSessionId,
  Workspace,
  WorkspaceId,
} from "@cmux/shared";
import { nowIso } from "@cmux/shared";
import type {
  AgentLaunchRequest,
  AgentStopRequest,
  TerminalCloseMode,
  WorkspaceOpenRequest,
} from "@cmux/ipc";
import type { TerminalExitEvent, TerminalOutputEvent, TerminalSubscription } from "@cmux/pty";
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
  private readonly runtimes = new Map<AgentSessionId, AgentRuntime>();
  private readonly templates: readonly Template[];

  constructor(
    private readonly terminalService: SupervisorTerminalService,
    templates: readonly Template[] = defaultTemplates,
  ) {
    this.templates = templates;
  }

  static async create(
    getTerminalService: () => Promise<TerminalService>,
  ): Promise<SupervisorService> {
    return new SupervisorService(await getTerminalService());
  }

  listWorkspaces(): Workspace[] {
    return [...this.workspaces.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  openWorkspace(request: WorkspaceOpenRequest): Workspace {
    const rootPath = normalizeRootPath(request.rootPath);
    const existingId = this.workspacesByRoot.get(rootPath);
    if (existingId) {
      const existing = this.requireWorkspace(existingId);
      const updated = { ...existing, trusted: request.trusted, updatedAt: nowIso() };
      this.workspaces.set(existing.id, updated);
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
    return workspace;
  }

  listAgents(workspaceId: WorkspaceId): AgentSession[] {
    this.requireWorkspace(workspaceId);
    return [...this.agents.values()]
      .filter((agent) => agent.workspaceId === workspaceId && agent.status !== "archived")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
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
        const detection = detectAgentAttention(event.data);
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
        this.updateAgent(agentId, {
          status: event.exitCode === 0 || event.exitCode === undefined ? "completed" : "failed",
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

  private updateWorkspace(workspaceId: WorkspaceId, patch: Partial<Workspace>): Workspace {
    const updated = { ...this.requireWorkspace(workspaceId), ...patch };
    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  private updateAgent(agentId: AgentSessionId, patch: AgentPatch): AgentSession {
    const current = this.requireAgent(agentId);
    const updated = omitUndefined({ ...current, ...patch } as Record<
      string,
      unknown
    >) as unknown as AgentSession;
    this.agents.set(agentId, updated);
    return updated;
  }
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
