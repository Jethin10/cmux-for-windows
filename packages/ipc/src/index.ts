import type { AgentSession, AgentSessionId, Workspace, WorkspaceId } from "@cmux/shared";

export const IPC_NAMESPACE = "cmux" as const;

export const ipcChannels = {
  appInfo: `${IPC_NAMESPACE}:app-info`,
  workspaceList: `${IPC_NAMESPACE}:workspace:list`,
  workspaceOpen: `${IPC_NAMESPACE}:workspace:open`,
  agentList: `${IPC_NAMESPACE}:agent:list`,
  agentLaunch: `${IPC_NAMESPACE}:agent:launch`,
  agentStop: `${IPC_NAMESPACE}:agent:stop`,
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

export interface IpcContracts {
  [ipcChannels.appInfo]: { request: void; response: AppInfoResponse };
  [ipcChannels.workspaceList]: { request: void; response: Workspace[] };
  [ipcChannels.workspaceOpen]: { request: WorkspaceOpenRequest; response: Workspace };
  [ipcChannels.agentList]: { request: AgentListRequest; response: AgentSession[] };
  [ipcChannels.agentLaunch]: { request: AgentLaunchRequest; response: AgentSession };
  [ipcChannels.agentStop]: { request: AgentStopRequest; response: AgentSession };
}

export function assertWorkspaceOpenRequest(value: unknown): asserts value is WorkspaceOpenRequest {
  if (!value || typeof value !== "object")
    throw new Error("workspace.open request must be an object");
  const candidate = value as Partial<WorkspaceOpenRequest>;
  if (typeof candidate.rootPath !== "string" || candidate.rootPath.trim().length === 0) {
    throw new Error("workspace.open rootPath is required");
  }
  if (typeof candidate.trusted !== "boolean")
    throw new Error("workspace.open trusted must be boolean");
}
