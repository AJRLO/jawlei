import { contextBridge, ipcRenderer } from "electron";

// What the admin page can ask the desktop app to do.
contextBridge.exposeInMainWorld("jawlei", {
  getProject: (): Promise<string> => ipcRenderer.invoke("project:get"),
  chooseProject: (): Promise<string> => ipcRenderer.invoke("project:choose"),
  preview: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("preview:open"),
  build: (): Promise<{ ok: boolean; log: string; dist: string }> => ipcRenderer.invoke("site:build"),
});
