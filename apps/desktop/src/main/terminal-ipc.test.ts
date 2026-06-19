import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { ipcChannels } from "@cmux/ipc";
import type { TerminalOutputEvent } from "@cmux/pty";
import type { TerminalSessionId } from "@cmux/shared";
import { registerTerminalIpc } from "./terminal-ipc.js";
import type { TerminalService } from "./terminal-service.js";

class FakeIpcMain {
  readonly handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => unknown>();

  handle(channel: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => unknown): void {
    this.handlers.set(channel, handler);
  }
}

function createSender() {
  const destroyedHandlers: Array<() => void> = [];
  return {
    sender: {
      id: 1,
      send: vi.fn(),
      isDestroyed: () => false,
      once: (_event: "destroyed", handler: () => void) => {
        destroyedHandlers.push(handler);
        return undefined as unknown as WebContents;
      },
    } as unknown as WebContents,
    destroy: () => destroyedHandlers.forEach((handler) => handler()),
  };
}

describe("terminal IPC registration", () => {
  it("forwards subscribed output to the requesting webContents and detaches", async () => {
    const ipcMain = new FakeIpcMain();
    const dispose = vi.fn();
    let outputHandler: ((event: TerminalOutputEvent) => void) | undefined;
    const terminalSessionId = "terminal-1" as TerminalSessionId;
    const terminalService = {
      subscribeOutput: (requestedTerminalId: TerminalSessionId, handler: typeof outputHandler) => {
        expect(requestedTerminalId).toBe(terminalSessionId);
        outputHandler = handler;
        return { dispose };
      },
    } as unknown as TerminalService;
    const { sender } = createSender();

    registerTerminalIpc(ipcMain as unknown as IpcMain, async () => terminalService);
    await ipcMain.handlers.get(ipcChannels.terminalOutputSubscribe)!(
      { sender } as IpcMainInvokeEvent,
      { terminalSessionId },
    );

    outputHandler!({ terminalSessionId, sequence: 1, data: "hello" });
    expect(sender.send).toHaveBeenCalledWith(ipcChannels.terminalOutput, {
      terminalSessionId,
      sequence: 1,
      data: "hello",
    });

    await ipcMain.handlers.get(ipcChannels.terminalOutputUnsubscribe)!(
      { sender } as IpcMainInvokeEvent,
      { terminalSessionId },
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes subscriptions when the webContents is destroyed", async () => {
    const ipcMain = new FakeIpcMain();
    const dispose = vi.fn();
    const terminalSessionId = "terminal-1" as TerminalSessionId;
    const terminalService = {
      subscribeOutput: () => ({ dispose }),
    } as unknown as TerminalService;
    const { sender, destroy } = createSender();

    registerTerminalIpc(ipcMain as unknown as IpcMain, async () => terminalService);
    await ipcMain.handlers.get(ipcChannels.terminalOutputSubscribe)!(
      { sender } as IpcMainInvokeEvent,
      { terminalSessionId },
    );

    destroy();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
