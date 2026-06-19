import type {
  AgentSession,
  AgentSessionId,
  Notification,
  NotificationId,
  TerminalSession,
  TerminalSessionId,
  Workspace,
  WorkspaceId,
} from "@cmux/shared";

export const IPC_NAMESPACE = "cmux" as const;

export const ipcChannels = {
  appInfo: `${IPC_NAMESPACE}:app-info`,
  workspaceList: `${IPC_NAMESPACE}:workspace:list`,
  workspaceOpen: `${IPC_NAMESPACE}:workspace:open`,
  agentList: `${IPC_NAMESPACE}:agent:list`,
  agentHistory: `${IPC_NAMESPACE}:agent:history`,
  agentLaunch: `${IPC_NAMESPACE}:agent:launch`,
  agentStop: `${IPC_NAMESPACE}:agent:stop`,
  agentRestart: `${IPC_NAMESPACE}:agent:restart`,
  agentArchive: `${IPC_NAMESPACE}:agent:archive`,
  transcriptSearch: `${IPC_NAMESPACE}:transcript:search`,
  notificationList: `${IPC_NAMESPACE}:notification:list`,
  notificationMarkRead: `${IPC_NAMESPACE}:notification:mark-read`,
  notificationNextUnread: `${IPC_NAMESPACE}:notification:next-unread`,
  terminalCreate: `${IPC_NAMESPACE}:terminal:create`,
  terminalWrite: `${IPC_NAMESPACE}:terminal:write`,
  terminalResize: `${IPC_NAMESPACE}:terminal:resize`,
  terminalClose: `${IPC_NAMESPACE}:terminal:close`,
  terminalOutputSubscribe: `${IPC_NAMESPACE}:terminal:output:subscribe`,
  terminalOutputUnsubscribe: `${IPC_NAMESPACE}:terminal:output:unsubscribe`,
  terminalExitSubscribe: `${IPC_NAMESPACE}:terminal:exit:subscribe`,
  terminalExitUnsubscribe: `${IPC_NAMESPACE}:terminal:exit:unsubscribe`,
  terminalOutput: `${IPC_NAMESPACE}:terminal:output`,
  terminalExit: `${IPC_NAMESPACE}:terminal:exit`,
} as const;

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels];

export interface AppInfoResponse {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

export interface WorkspaceOpenRequest {
  rootPath: string;
  trusted: boolean;
}

export interface AgentListRequest {
  workspaceId: WorkspaceId;
}

export interface AgentHistoryRequest {
  workspaceId: WorkspaceId;
}

export interface AgentLaunchRequest {
  workspaceId: WorkspaceId;
  templateId: string;
  title: string;
  prompt?: string;
}

export interface AgentStopRequest {
  agentSessionId: AgentSessionId;
  mode: "interrupt" | "terminate" | "kill-process-tree";
}

export interface AgentRestartRequest {
  agentSessionId: AgentSessionId;
}

export interface AgentArchiveRequest {
  agentSessionId: AgentSessionId;
}

export interface TranscriptSearchRequest {
  workspaceId?: WorkspaceId;
  query: string;
  limit?: number;
}

export interface TranscriptSearchResult {
  terminalSessionId: TerminalSessionId;
  agentSessionId?: AgentSessionId;
  sequence: number;
  createdAt: string;
  excerpt: string;
}

export interface NotificationListRequest {
  workspaceId: WorkspaceId;
}

export interface NotificationMarkReadRequest {
  notificationId: NotificationId;
}

export interface NotificationNextUnreadRequest {
  workspaceId: WorkspaceId;
}

export type TerminalCloseMode = "interrupt" | "terminate" | "kill-process-tree" | "detach";

export interface TerminalCreateRequest {
  profileId?: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export interface TerminalWriteRequest {
  terminalSessionId: TerminalSessionId;
  data: string;
}

export interface TerminalResizeRequest {
  terminalSessionId: TerminalSessionId;
  cols: number;
  rows: number;
}

export interface TerminalCloseRequest {
  terminalSessionId: TerminalSessionId;
  mode: TerminalCloseMode;
}

export interface TerminalSubscriptionRequest {
  terminalSessionId: TerminalSessionId;
}

export interface TerminalOutputEvent {
  terminalSessionId: TerminalSessionId;
  sequence: number;
  data: string;
}

export interface TerminalExitEvent {
  terminalSessionId: TerminalSessionId;
  exitCode?: number;
  signal?: number;
}

export interface IpcContracts {
  [ipcChannels.appInfo]: { request: void; response: AppInfoResponse };
  [ipcChannels.workspaceList]: { request: void; response: Workspace[] };
  [ipcChannels.workspaceOpen]: { request: WorkspaceOpenRequest; response: Workspace };
  [ipcChannels.agentList]: { request: AgentListRequest; response: AgentSession[] };
  [ipcChannels.agentHistory]: { request: AgentHistoryRequest; response: AgentSession[] };
  [ipcChannels.agentLaunch]: { request: AgentLaunchRequest; response: AgentSession };
  [ipcChannels.agentStop]: { request: AgentStopRequest; response: AgentSession };
  [ipcChannels.agentRestart]: { request: AgentRestartRequest; response: AgentSession };
  [ipcChannels.agentArchive]: { request: AgentArchiveRequest; response: AgentSession };
  [ipcChannels.transcriptSearch]: {
    request: TranscriptSearchRequest;
    response: TranscriptSearchResult[];
  };
  [ipcChannels.notificationList]: { request: NotificationListRequest; response: Notification[] };
  [ipcChannels.notificationMarkRead]: {
    request: NotificationMarkReadRequest;
    response: Notification;
  };
  [ipcChannels.notificationNextUnread]: {
    request: NotificationNextUnreadRequest;
    response: AgentSession | undefined;
  };
  [ipcChannels.terminalCreate]: { request: TerminalCreateRequest; response: TerminalSession };
  [ipcChannels.terminalWrite]: { request: TerminalWriteRequest; response: void };
  [ipcChannels.terminalResize]: { request: TerminalResizeRequest; response: void };
  [ipcChannels.terminalClose]: { request: TerminalCloseRequest; response: void };
  [ipcChannels.terminalOutputSubscribe]: { request: TerminalSubscriptionRequest; response: void };
  [ipcChannels.terminalOutputUnsubscribe]: { request: TerminalSubscriptionRequest; response: void };
  [ipcChannels.terminalExitSubscribe]: { request: TerminalSubscriptionRequest; response: void };
  [ipcChannels.terminalExitUnsubscribe]: { request: TerminalSubscriptionRequest; response: void };
  [ipcChannels.terminalOutput]: { request: void; response: TerminalOutputEvent };
  [ipcChannels.terminalExit]: { request: void; response: TerminalExitEvent };
}

const MAX_TERMINAL_WRITE_LENGTH = 1024 * 1024;
const terminalCloseModes = new Set<TerminalCloseMode>([
  "interrupt",
  "terminate",
  "kill-process-tree",
  "detach",
]);

export function assertWorkspaceOpenRequest(value: unknown): asserts value is WorkspaceOpenRequest {
  if (!isRecord(value)) throw new Error("workspace.open request must be an object");
  const candidate = value as Partial<WorkspaceOpenRequest>;
  if (typeof candidate.rootPath !== "string" || candidate.rootPath.trim().length === 0) {
    throw new Error("workspace.open rootPath is required");
  }
  if (typeof candidate.trusted !== "boolean")
    throw new Error("workspace.open trusted must be boolean");
}

export function assertAgentListRequest(value: unknown): asserts value is AgentListRequest {
  if (!isRecord(value)) throw new Error("agent.list request must be an object");
  const candidate = value as Partial<AgentListRequest>;
  assertWorkspaceId(candidate.workspaceId, "agent.list workspaceId");
}

export function assertAgentHistoryRequest(value: unknown): asserts value is AgentHistoryRequest {
  if (!isRecord(value)) throw new Error("agent.history request must be an object");
  const candidate = value as Partial<AgentHistoryRequest>;
  assertWorkspaceId(candidate.workspaceId, "agent.history workspaceId");
}

export function assertAgentLaunchRequest(value: unknown): asserts value is AgentLaunchRequest {
  if (!isRecord(value)) throw new Error("agent.launch request must be an object");
  const candidate = value as Partial<AgentLaunchRequest>;
  assertWorkspaceId(candidate.workspaceId, "agent.launch workspaceId");
  assertNonEmptyString(candidate.templateId, "agent.launch templateId");
  assertNonEmptyString(candidate.title, "agent.launch title");
  if (candidate.prompt !== undefined && typeof candidate.prompt !== "string") {
    throw new Error("agent.launch prompt must be a string");
  }
}

export function assertAgentStopRequest(value: unknown): asserts value is AgentStopRequest {
  if (!isRecord(value)) throw new Error("agent.stop request must be an object");
  const candidate = value as Partial<AgentStopRequest>;
  assertAgentSessionId(candidate.agentSessionId, "agent.stop agentSessionId");
  if (
    candidate.mode !== "interrupt" &&
    candidate.mode !== "terminate" &&
    candidate.mode !== "kill-process-tree"
  ) {
    throw new Error("agent.stop mode is invalid");
  }
}

export function assertAgentRestartRequest(value: unknown): asserts value is AgentRestartRequest {
  if (!isRecord(value)) throw new Error("agent.restart request must be an object");
  const candidate = value as Partial<AgentRestartRequest>;
  assertAgentSessionId(candidate.agentSessionId, "agent.restart agentSessionId");
}

export function assertAgentArchiveRequest(value: unknown): asserts value is AgentArchiveRequest {
  if (!isRecord(value)) throw new Error("agent.archive request must be an object");
  const candidate = value as Partial<AgentArchiveRequest>;
  assertAgentSessionId(candidate.agentSessionId, "agent.archive agentSessionId");
}

export function assertTranscriptSearchRequest(
  value: unknown,
): asserts value is TranscriptSearchRequest {
  if (!isRecord(value)) throw new Error("transcript.search request must be an object");
  const candidate = value as Partial<TranscriptSearchRequest>;
  if (candidate.workspaceId !== undefined) {
    assertWorkspaceId(candidate.workspaceId, "transcript.search workspaceId");
  }
  assertNonEmptyString(candidate.query, "transcript.search query");
  if (
    candidate.limit !== undefined &&
    (!Number.isInteger(candidate.limit) || candidate.limit < 1 || candidate.limit > 200)
  ) {
    throw new Error("transcript.search limit must be an integer between 1 and 200");
  }
}

export function assertNotificationListRequest(
  value: unknown,
): asserts value is NotificationListRequest {
  if (!isRecord(value)) throw new Error("notification.list request must be an object");
  const candidate = value as Partial<NotificationListRequest>;
  assertWorkspaceId(candidate.workspaceId, "notification.list workspaceId");
}

export function assertNotificationMarkReadRequest(
  value: unknown,
): asserts value is NotificationMarkReadRequest {
  if (!isRecord(value)) throw new Error("notification.markRead request must be an object");
  const candidate = value as Partial<NotificationMarkReadRequest>;
  assertNotificationId(candidate.notificationId, "notification.markRead notificationId");
}

export function assertNotificationNextUnreadRequest(
  value: unknown,
): asserts value is NotificationNextUnreadRequest {
  if (!isRecord(value)) throw new Error("notification.nextUnread request must be an object");
  const candidate = value as Partial<NotificationNextUnreadRequest>;
  assertWorkspaceId(candidate.workspaceId, "notification.nextUnread workspaceId");
}

export function assertTerminalCreateRequest(
  value: unknown,
): asserts value is TerminalCreateRequest {
  if (!isRecord(value)) throw new Error("terminal.create request must be an object");
  const candidate = value as Partial<TerminalCreateRequest>;

  if (candidate.profileId !== undefined) {
    assertNonEmptyString(candidate.profileId, "terminal.create profileId");
  }
  if (candidate.cwd !== undefined) {
    assertNonEmptyString(candidate.cwd, "terminal.create cwd");
  }
  assertValidTerminalSize(candidate.cols, candidate.rows, "terminal.create");
}

export function assertTerminalWriteRequest(value: unknown): asserts value is TerminalWriteRequest {
  if (!isRecord(value)) throw new Error("terminal.write request must be an object");
  const candidate = value as Partial<TerminalWriteRequest>;
  assertTerminalSessionId(candidate.terminalSessionId, "terminal.write terminalSessionId");
  if (typeof candidate.data !== "string" || candidate.data.length === 0) {
    throw new Error("terminal.write data is required");
  }
  if (candidate.data.length > MAX_TERMINAL_WRITE_LENGTH) {
    throw new Error("terminal.write data exceeds maximum payload length");
  }
}

export function assertTerminalResizeRequest(
  value: unknown,
): asserts value is TerminalResizeRequest {
  if (!isRecord(value)) throw new Error("terminal.resize request must be an object");
  const candidate = value as Partial<TerminalResizeRequest>;
  assertTerminalSessionId(candidate.terminalSessionId, "terminal.resize terminalSessionId");
  assertValidTerminalSize(candidate.cols, candidate.rows, "terminal.resize");
}

export function assertTerminalCloseRequest(value: unknown): asserts value is TerminalCloseRequest {
  if (!isRecord(value)) throw new Error("terminal.close request must be an object");
  const candidate = value as Partial<TerminalCloseRequest>;
  assertTerminalSessionId(candidate.terminalSessionId, "terminal.close terminalSessionId");
  if (
    typeof candidate.mode !== "string" ||
    !terminalCloseModes.has(candidate.mode as TerminalCloseMode)
  ) {
    throw new Error("terminal.close mode is invalid");
  }
}

export function assertTerminalSubscriptionRequest(
  value: unknown,
): asserts value is TerminalSubscriptionRequest {
  if (!isRecord(value)) throw new Error("terminal subscription request must be an object");
  const candidate = value as Partial<TerminalSubscriptionRequest>;
  assertTerminalSessionId(candidate.terminalSessionId, "terminal subscription terminalSessionId");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertWorkspaceId(value: unknown, label: string): asserts value is WorkspaceId {
  assertNonEmptyString(value, label);
}

function assertAgentSessionId(value: unknown, label: string): asserts value is AgentSessionId {
  assertNonEmptyString(value, label);
}

function assertTerminalSessionId(
  value: unknown,
  label: string,
): asserts value is TerminalSessionId {
  assertNonEmptyString(value, label);
}

function assertNotificationId(value: unknown, label: string): asserts value is NotificationId {
  assertNonEmptyString(value, label);
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function assertValidTerminalSize(cols: unknown, rows: unknown, label: string): void {
  if (
    typeof cols !== "number" ||
    typeof rows !== "number" ||
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 ||
    rows < 1
  ) {
    throw new Error(`${label} size must be positive integer cols and rows`);
  }
}
