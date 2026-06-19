import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import {
  assertTerminalCloseRequest,
  assertTerminalCreateRequest,
  assertTerminalResizeRequest,
  assertTerminalSubscriptionRequest,
  assertTerminalWriteRequest,
  ipcChannels,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalResizeRequest,
  type TerminalSubscriptionRequest,
  type TerminalWriteRequest,
} from "@cmux/ipc";
import type { TerminalSessionId } from "@cmux/shared";
import type { TerminalSubscription } from "@cmux/pty";
import type { TerminalService } from "./terminal-service.js";

export type TerminalServiceProvider = () => Promise<TerminalService>;

type SubscriptionKind = "output" | "exit";

export function registerTerminalIpc(
  ipcMain: IpcMain,
  getTerminalService: TerminalServiceProvider,
): () => void {
  const subscriptions = new Map<string, TerminalSubscription>();
  const watchedWebContents = new Set<number>();

  ipcMain.handle(ipcChannels.terminalCreate, async (_event, payload: unknown) => {
    assertTerminalCreateRequest(payload);
    return (await getTerminalService()).createTerminal(payload as TerminalCreateRequest);
  });

  ipcMain.handle(ipcChannels.terminalWrite, async (_event, payload: unknown) => {
    assertTerminalWriteRequest(payload);
    await (await getTerminalService()).writeTerminal(payload as TerminalWriteRequest);
  });

  ipcMain.handle(ipcChannels.terminalResize, async (_event, payload: unknown) => {
    assertTerminalResizeRequest(payload);
    await (await getTerminalService()).resizeTerminal(payload as TerminalResizeRequest);
  });

  ipcMain.handle(ipcChannels.terminalClose, async (_event, payload: unknown) => {
    assertTerminalCloseRequest(payload);
    const request = payload as TerminalCloseRequest;
    await (await getTerminalService()).closeTerminal(request.terminalSessionId, request.mode);
  });

  ipcMain.handle(ipcChannels.terminalOutputSubscribe, async (event, payload: unknown) => {
    assertTerminalSubscriptionRequest(payload);
    await subscribe(event, payload as TerminalSubscriptionRequest, "output");
  });

  ipcMain.handle(ipcChannels.terminalOutputUnsubscribe, (_event, payload: unknown) => {
    assertTerminalSubscriptionRequest(payload);
    unsubscribe(
      _event.sender.id,
      (payload as TerminalSubscriptionRequest).terminalSessionId,
      "output",
    );
  });

  ipcMain.handle(ipcChannels.terminalExitSubscribe, async (event, payload: unknown) => {
    assertTerminalSubscriptionRequest(payload);
    await subscribe(event, payload as TerminalSubscriptionRequest, "exit");
  });

  ipcMain.handle(ipcChannels.terminalExitUnsubscribe, (_event, payload: unknown) => {
    assertTerminalSubscriptionRequest(payload);
    unsubscribe(
      _event.sender.id,
      (payload as TerminalSubscriptionRequest).terminalSessionId,
      "exit",
    );
  });

  return () => {
    for (const subscription of subscriptions.values()) subscription.dispose();
    subscriptions.clear();
    ipcMain.removeHandler(ipcChannels.terminalCreate);
    ipcMain.removeHandler(ipcChannels.terminalWrite);
    ipcMain.removeHandler(ipcChannels.terminalResize);
    ipcMain.removeHandler(ipcChannels.terminalClose);
    ipcMain.removeHandler(ipcChannels.terminalOutputSubscribe);
    ipcMain.removeHandler(ipcChannels.terminalOutputUnsubscribe);
    ipcMain.removeHandler(ipcChannels.terminalExitSubscribe);
    ipcMain.removeHandler(ipcChannels.terminalExitUnsubscribe);
  };

  async function subscribe(
    event: IpcMainInvokeEvent,
    request: TerminalSubscriptionRequest,
    kind: SubscriptionKind,
  ): Promise<void> {
    watchWebContents(event.sender);
    unsubscribe(event.sender.id, request.terminalSessionId, kind);

    const terminalService = await getTerminalService();
    const subscription =
      kind === "output"
        ? terminalService.subscribeOutput(request.terminalSessionId, (outputEvent) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send(ipcChannels.terminalOutput, outputEvent);
            }
          })
        : terminalService.subscribeExit(request.terminalSessionId, (exitEvent) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send(ipcChannels.terminalExit, exitEvent);
            }
          });

    subscriptions.set(
      subscriptionKey(event.sender.id, request.terminalSessionId, kind),
      subscription,
    );
  }

  function unsubscribe(
    webContentsId: number,
    terminalSessionId: TerminalSessionId,
    kind: SubscriptionKind,
  ): void {
    const key = subscriptionKey(webContentsId, terminalSessionId, kind);
    const subscription = subscriptions.get(key);
    if (!subscription) return;
    subscription.dispose();
    subscriptions.delete(key);
  }

  function watchWebContents(webContents: WebContents): void {
    if (watchedWebContents.has(webContents.id)) return;
    watchedWebContents.add(webContents.id);
    webContents.once("destroyed", () => {
      watchedWebContents.delete(webContents.id);
      for (const [key, subscription] of subscriptions) {
        if (!key.startsWith(`${webContents.id}:`)) continue;
        subscription.dispose();
        subscriptions.delete(key);
      }
    });
  }
}

function subscriptionKey(
  webContentsId: number,
  terminalSessionId: TerminalSessionId,
  kind: SubscriptionKind,
): string {
  return `${webContentsId}:${terminalSessionId}:${kind}`;
}
