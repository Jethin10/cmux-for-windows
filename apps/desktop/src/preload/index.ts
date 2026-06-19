import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels, type AppInfoResponse } from "@cmux/ipc";

export interface CmuxBridge {
  appInfo(): Promise<AppInfoResponse>;
}

const bridge: CmuxBridge = {
  appInfo: () => ipcRenderer.invoke(ipcChannels.appInfo) as Promise<AppInfoResponse>,
};

contextBridge.exposeInMainWorld("cmux", bridge);
