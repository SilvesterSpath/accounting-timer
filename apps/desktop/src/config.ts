import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  appMode: "desktop";
  environment: string;
}

const DEFAULT_API = "http://127.0.0.1:3001";

function configPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "config.json");
  }
  return path.join(__dirname, "..", "resources", "config.json");
}

export function loadDesktopConfig(): DesktopRuntimeConfig {
  const fromEnv = process.env.ACCOUNTING_TIMER_API_BASE_URL;
  const file = configPath();
  let fileUrl: string | undefined;

  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        apiBaseUrl?: string;
        environment?: string;
      };
      fileUrl = parsed.apiBaseUrl;
      return {
        apiBaseUrl: fromEnv || fileUrl || DEFAULT_API,
        appMode: "desktop",
        environment: parsed.environment ?? "local",
      };
    } catch {
      // fall through to defaults
    }
  }

  return {
    apiBaseUrl: fromEnv || DEFAULT_API,
    appMode: "desktop",
    environment: "local",
  };
}

export function apiOriginFromConfig(config: DesktopRuntimeConfig): string {
  try {
    return new URL(config.apiBaseUrl).origin;
  } catch {
    return DEFAULT_API;
  }
}
