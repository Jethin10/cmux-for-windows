import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  ipcChannels,
  type AgentArchiveRequest,
  type AgentHistoryRequest,
  type AgentLaunchRequest,
  type AgentListRequest,
  type AgentRestartRequest,
  type AgentStopRequest,
  type AppInfoResponse,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalExitEvent,
  type TerminalOutputEvent,
  type TerminalResizeRequest,
  type TerminalSubscriptionRequest,
  type TerminalWriteRequest,
  type TranscriptSearchRequest,
  type TranscriptSearchResult,
  type WorkspaceOpenRequest,
} from "@cmux/ipc";
import type { AgentSession, TerminalSession, TerminalSessionId, Workspace } from "@cmux/shared";

export interface CmuxBridge {
  appInfo(): Promise<AppInfoResponse>;
  workspace: {
    list(): Promise<Workspace[]>;
    open(request: WorkspaceOpenRequest): Promise<Workspace>;
  };
  agent: {
    list(request: AgentListRequest): Promise<AgentSession[]>;
    history(request: AgentHistoryRequest): Promise<AgentSession[]>;
    launch(request: AgentLaunchRequest): Promise<AgentSession>;
    stop(request: AgentStopRequest): Promise<AgentSession>;
    restart(request: AgentRestartRequest): Promise<AgentSession>;
    archive(request: AgentArchiveRequest): Promise<AgentSession>;
  };
  transcript: {
    search(request: TranscriptSearchRequest): Promise<TranscriptSearchResult[]>;
  };
  terminal: {
    create(request: TerminalCreateRequest): Promise<TerminalSession>;
    write(request: TerminalWriteRequest): Promise<void>;
    resize(request: TerminalResizeRequest): Promise<void>;
    close(request: TerminalCloseRequest): Promise<void>;
    subscribeOutput(
      terminalSessionId: TerminalSessionId,
      handler: (event: TerminalOutputEvent) => void,
    ): Promise<() => void>;
    subscribeExit(
      terminalSessionId: TerminalSessionId,
      handler: (event: TerminalExitEvent) => void,
    ): Promise<() => void>;
  };
}

const bridge: CmuxBridge = {
  appInfo: () => ipcRenderer.invoke(ipcChannels.appInfo) as Promise<AppInfoResponse>,
  workspace: {
    list: () => ipcRenderer.invoke(ipcChannels.workspaceList) as Promise<Workspace[]>,
    open: (request) => ipcRenderer.invoke(ipcChannels.workspaceOpen, request) as Promise<Workspace>,
  },
  agent: {
    list: (request) =>
      ipcRenderer.invoke(ipcChannels.agentList, request) as Promise<AgentSession[]>,
    history: (request) =>
      ipcRenderer.invoke(ipcChannels.agentHistory, request) as Promise<AgentSession[]>,
    launch: (request) =>
      ipcRenderer.invoke(ipcChannels.agentLaunch, request) as Promise<AgentSession>,
    stop: (request) => ipcRenderer.invoke(ipcChannels.agentStop, request) as Promise<AgentSession>,
    restart: (request) =>
      ipcRenderer.invoke(ipcChannels.agentRestart, request) as Promise<AgentSession>,
    archive: (request) =>
      ipcRenderer.invoke(ipcChannels.agentArchive, request) as Promise<AgentSession>,
  },
  transcript: {
    search: (request) =>
      ipcRenderer.invoke(ipcChannels.transcriptSearch, request) as Promise<
        TranscriptSearchResult[]
      >,
  },
  terminal: {
    create: (request) =>
      ipcRenderer.invoke(ipcChannels.terminalCreate, request) as Promise<TerminalSession>,
    write: (request) => ipcRenderer.invoke(ipcChannels.terminalWrite, request) as Promise<void>,
    resize: (request) => ipcRenderer.invoke(ipcChannels.terminalResize, request) as Promise<void>,
    close: (request) => ipcRenderer.invoke(ipcChannels.terminalClose, request) as Promise<void>,
    subscribeOutput: async (terminalSessionId, handler) => {
      return subscribeTerminalEvent(
        terminalSessionId,
        ipcChannels.terminalOutput,
        ipcChannels.terminalOutputSubscribe,
        ipcChannels.terminalOutputUnsubscribe,
        isTerminalOutputEvent,
        handler,
      );
    },
    subscribeExit: async (terminalSessionId, handler) => {
      return subscribeTerminalEvent(
        terminalSessionId,
        ipcChannels.terminalExit,
        ipcChannels.terminalExitSubscribe,
        ipcChannels.terminalExitUnsubscribe,
        isTerminalExitEvent,
        handler,
      );
    },
  },
};

contextBridge.exposeInMainWorld("cmux", bridge);

async function subscribeTerminalEvent<TEvent extends { terminalSessionId: TerminalSessionId }>(
  terminalSessionId: TerminalSessionId,
  eventChannel: string,
  subscribeChannel: string,
  unsubscribeChannel: string,
  isExpectedEvent: (value: unknown) => value is TEvent,
  handler: (event: TEvent) => void,
): Promise<() => void> {
  const listener = (_event: IpcRendererEvent, payload: unknown) => {
    if (!isExpectedEvent(payload) || payload.terminalSessionId !== terminalSessionId) return;
    handler(payload);
  };
  const request: TerminalSubscriptionRequest = { terminalSessionId };

  ipcRenderer.on(eventChannel, listener);
  try {
    await ipcRenderer.invoke(subscribeChannel, request);
  } catch (error) {
    ipcRenderer.off(eventChannel, listener);
    throw error;
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    ipcRenderer.off(eventChannel, listener);
    void ipcRenderer.invoke(unsubscribeChannel, request);
  };
}

function isTerminalOutputEvent(value: unknown): value is TerminalOutputEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.terminalSessionId === "string" &&
    Number.isInteger(value.sequence) &&
    typeof value.data === "string"
  );
}

function isTerminalExitEvent(value: unknown): value is TerminalExitEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.terminalSessionId === "string" &&
    (value.exitCode === undefined || typeof value.exitCode === "number") &&
    (value.signal === undefined || typeof value.signal === "number")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
