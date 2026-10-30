import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_CHANNELS = new Set([
  "desktop:get-config",
  "desktop:save-fixture",
]);

function invoke(channel: string, ...args: unknown[]) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Blocked IPC channel: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("desktop", {
  appMode: "desktop" as const,
  getVersion: () => "0.0.5-electron-poc",
  getConfig: () => invoke("desktop:get-config"),
  saveFixtureFile: (payload: { fileName: string; contents: string }) =>
    invoke("desktop:save-fixture", payload),
});
