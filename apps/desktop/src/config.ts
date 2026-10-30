import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { validateApiBaseUrl } from "./security";

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

function readFileConfig(): { apiBaseUrl?: string; environment?: string } {
  const file = configPath();
  if (!existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as {
      apiBaseUrl?: string;
      environment?: string;
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse desktop config at ${file}: ${message}`,
    );
  }
}

/**
 * Load and validate runtime API configuration.
 * Invalid values throw actionable errors (no silent fallback to unsafe defaults).
 */
export function loadDesktopConfig(): DesktopRuntimeConfig {
  const fileConfig = readFileConfig();
  const raw =
    process.env.ACCOUNTING_TIMER_API_BASE_URL?.trim() ||
    fileConfig.apiBaseUrl?.trim() ||
    DEFAULT_API;

  let apiBaseUrl: string;
  try {
    apiBaseUrl = validateApiBaseUrl(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid desktop API configuration (${raw}): ${message}`,
    );
  }

  return {
    apiBaseUrl,
    appMode: "desktop",
    environment: fileConfig.environment ?? "local",
  };
}

export function apiOriginFromConfig(config: DesktopRuntimeConfig): string {
  return new URL(config.apiBaseUrl).origin;
}
