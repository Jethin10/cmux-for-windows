import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  ipcChannels,
  type AppInfoResponse,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalExitEvent,
  type TerminalOutputEvent,
  type TerminalResizeRequest,
  type TerminalSubscriptionRequest,
  type TerminalWriteRequest,
} from "@cmux/ipc";
import type { TerminalSession, TerminalSessionId } from "@cmux/shared";

export interface CmuxBridge {
  appInfo(): Promise<AppInfoResponse>;
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
