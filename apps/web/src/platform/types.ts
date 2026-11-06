export type AppMode = "web" | "desktop";

export interface RuntimeConfig {
  apiBaseUrl: string;
  appMode: AppMode;
  environment?: string;
}

export interface DesktopBridge {
  appMode: "desktop";
  getVersion: () => string;
  getConfig: () => Promise<RuntimeConfig>;
  saveFixtureFile: (payload: {
    fileName: string;
    contents: string;
  }) => Promise<{ ok: true; path: string } | { ok: false; canceled: true }>;
  isSecureStoreAvailable: () => Promise<boolean>;
  getRefreshToken: () => Promise<string | null>;
  setRefreshToken: (token: string) => Promise<{ ok: true }>;
  clearRefreshToken: () => Promise<{ ok: true }>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
