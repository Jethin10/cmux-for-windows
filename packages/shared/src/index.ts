export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type AgentSessionId = Brand<string, "AgentSessionId">;
export type TerminalSessionId = Brand<string, "TerminalSessionId">;
export type TemplateId = Brand<string, "TemplateId">;
export type NotificationId = Brand<string, "NotificationId">;
export type DomainEventId = Brand<string, "DomainEventId">;

export type PaneSurfaceKind = "local-terminal" | "agent-terminal" | "transcript" | "browser";

export interface PaneSurface {
  id: string;
  kind: PaneSurfaceKind;
  title: string;
  agentSessionId?: AgentSessionId;
  terminalSessionId?: TerminalSessionId;
  url?: string;
}

export type PaneSplitDirection = "horizontal" | "vertical";

export interface PaneLeafNode {
  id: string;
  type: "leaf";
  surfaceIds: readonly string[];
  activeSurfaceId?: string;
}

export interface PaneSplitNode {
  id: string;
  type: "split";
  direction: PaneSplitDirection;
  children: readonly PaneNode[];
}

export type PaneNode = PaneLeafNode | PaneSplitNode;

export interface PaneLayoutState {
  surfaces: readonly PaneSurface[];
  activeSurfaceId?: string;
  rootPane?: PaneNode;
}

export type AgentProvider =
  | "pi"
  | "claude-code"
  | "codex"
  | "gemini"
  | "opencode"
  | "shell"
  | "custom";

export type AgentSessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "needs-attention"
  | "failed"
  | "completed"
  | "stopped"
  | "archived";

export type TerminalSessionStatus =
  | "starting"
  | "running"
  | "closing"
  | "exited"
  | "crashed"
  | "disposed";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  rootPath: string;
  trusted: boolean;
  createdAt: string;
  updatedAt: string;
  activeSessionId?: AgentSessionId;
  gitSummary?: string;
  unreadCount: number;
}

export interface AgentSession {
  id: AgentSessionId;
  workspaceId: WorkspaceId;
  title: string;
  prompt?: string;
  provider: AgentProvider;
  templateId?: TemplateId;
  terminalSessionId?: TerminalSessionId;
  cwd: string;
  status: AgentSessionStatus;
  statusReason?: string;
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  lastNotificationId?: NotificationId;
  resumeCommand?: string;
  metadataJson: string;
}

export interface TerminalSession {
  id: TerminalSessionId;
  workspaceId: WorkspaceId;
  agentSessionId?: AgentSessionId;
  profileId: string;
  command: string;
  argsJson: string;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  pid?: number;
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
}

export type TemplateKind = "agent" | "shell";
export type TemplateCwdMode = "workspace-root" | "selected-folder" | "custom";
export type TemplatePromptMode = "none" | "argument" | "stdin" | "clipboard" | "custom";

export interface Template {
  id: TemplateId;
  kind: TemplateKind;
  name: string;
  provider?: AgentProvider;
  command: string;
  argsTemplate: readonly string[];
  envTemplate: Readonly<Record<string, string>>;
  cwdMode: TemplateCwdMode;
  promptMode: TemplatePromptMode;
  icon?: string;
  color?: string;
}

export type NotificationSeverity = "info" | "success" | "warning" | "error" | "attention";
export type NotificationSource = "heuristic" | "hook" | "cli" | "process" | "internal";

export interface Notification {
  id: NotificationId;
  workspaceId: WorkspaceId;
  agentSessionId?: AgentSessionId;
  terminalSessionId?: TerminalSessionId;
  severity: NotificationSeverity;
  title: string;
  body: string;
  read: boolean;
  source: NotificationSource;
  createdAt: string;
}

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  sequence: number;
  id: DomainEventId;
  type: string;
  workspaceId?: WorkspaceId;
  agentSessionId?: AgentSessionId;
  terminalSessionId?: TerminalSessionId;
  createdAt: string;
  payload: TPayload;
}

export interface TranscriptChunk {
  id: string;
  terminalSessionId: TerminalSessionId;
  sequenceStart: number;
  sequenceEnd: number;
  createdAt: string;
  byteLength: number;
  storagePath?: string;
  searchIndexStatus: "pending" | "indexed" | "failed";
}

export function nowIso(): string {
  return new Date().toISOString();
}
