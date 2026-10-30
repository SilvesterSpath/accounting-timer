import type { AppMode, RuntimeConfig } from "./types";

const DEFAULT_WEB_CONFIG: RuntimeConfig = {
  apiBaseUrl: "",
  appMode: "web",
  environment: "development",
};

let cached: RuntimeConfig | null = null;

export function detectAppMode(): AppMode {
  return window.desktop?.appMode === "desktop" ? "desktop" : "web";
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) {
    return cached;
  }

  if (window.desktop) {
    cached = await window.desktop.getConfig();
    return cached;
  }

  cached = DEFAULT_WEB_CONFIG;
  return cached;
}

export function apiUrl(path: string, config: RuntimeConfig): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!config.apiBaseUrl) {
    return normalized;
  }
  return `${config.apiBaseUrl.replace(/\/$/, "")}${normalized}`;
}
