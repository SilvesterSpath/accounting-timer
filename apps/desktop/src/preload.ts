import { contextBridge } from "electron";

/** Narrow Phase 0 bridge — expand only behind platform adapters later. */
contextBridge.exposeInMainWorld("desktop", {
  appMode: "desktop" as const,
  getVersion: () => "0.0.0-phase0",
});
