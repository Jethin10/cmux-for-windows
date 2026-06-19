import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ipcChannels, type AppInfoResponse } from "@cmux/ipc";
import { registerSupervisorIpc } from "./supervisor-ipc.js";
import { SupervisorService } from "./supervisor-service.js";
import { registerTerminalIpc } from "./terminal-ipc.js";
import { TerminalService } from "./terminal-service.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
let terminalServicePromise: Promise<TerminalService> | undefined;
let terminalService: TerminalService | undefined;
let supervisorServicePromise: Promise<SupervisorService> | undefined;

function getTerminalService(): Promise<TerminalService> {
  terminalServicePromise ??= TerminalService.create().then((service) => {
    terminalService = service;
    return service;
  });
  return terminalServicePromise;
}

function getSupervisorService(): Promise<SupervisorService> {
  supervisorServicePromise ??= SupervisorService.create(getTerminalService);
  return supervisorServicePromise;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "CMux for Windows",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(currentDir, "../preload/index.js"),
    },
  });

  const devServerUrl = process.env.CMUX_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(currentDir, "../renderer/index.html"));
  }

  return window;
}

ipcMain.handle(ipcChannels.appInfo, (): AppInfoResponse => {
  return { name: app.getName(), version: app.getVersion(), platform: process.platform };
});

registerTerminalIpc(ipcMain, getTerminalService);
registerSupervisorIpc(ipcMain, getSupervisorService);

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  void terminalService?.closeAll("terminate");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
