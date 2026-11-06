import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_CHANNELS = new Set([
  "desktop:get-config",
  "desktop:save-fixture",
  "desktop:secure-store-available",
  "desktop:get-refresh-token",
  "desktop:set-refresh-token",
  "desktop:clear-refresh-token",
]);

function invoke(channel: string, ...args: unknown[]) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Blocked IPC channel: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("desktop", {
  appMode: "desktop" as const,
  getVersion: () => "0.0.6-phase-2",
  getConfig: () => invoke("desktop:get-config"),
  saveFixtureFile: (payload: { fileName: string; contents: string }) =>
    invoke("desktop:save-fixture", payload),
  isSecureStoreAvailable: () =>
    invoke("desktop:secure-store-available") as Promise<boolean>,
  getRefreshToken: () =>
    invoke("desktop:get-refresh-token") as Promise<string | null>,
  setRefreshToken: (token: string) =>
    invoke("desktop:set-refresh-token", token) as Promise<{ ok: true }>,
  clearRefreshToken: () =>
    invoke("desktop:clear-refresh-token") as Promise<{ ok: true }>,
});
