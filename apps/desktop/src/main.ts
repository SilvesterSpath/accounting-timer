import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { loadDesktopConfig, type DesktopRuntimeConfig } from "./config";
import {
  appIndexUrl,
  attachAppProtocolHandler,
  registerAppScheme,
} from "./protocol";
import {
  assertFixturePayload,
  isNavigationAllowed,
  resolveRendererLoadUrl,
  shouldAttachAppProtocol,
} from "./security";

registerAppScheme();

let mainWindow: BrowserWindow | null = null;
let allowDevOrigins = false;
let desktopConfig: DesktopRuntimeConfig;

function webDistPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web");
  }
  return path.join(__dirname, "..", "..", "web", "dist");
}

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("IPC rejected: unexpected window");
  }
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) {
    throw new Error("IPC rejected: unexpected frame");
  }
  if (
    !isNavigationAllowed(frame.url, {
      allowDevOrigins,
    })
  ) {
    throw new Error(`IPC rejected: untrusted origin (${frame.url})`);
  }
}

function createWindow(loadUrl: string) {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = win;

  // PoC: deny all external popups/windows. No system-browser handoff.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.webContents.on("will-navigate", (event, url) => {
    if (!isNavigationAllowed(url, { allowDevOrigins })) {
      event.preventDefault();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  void win.loadURL(loadUrl);
}

app.whenReady().then(() => {
  try {
    desktopConfig = loadDesktopConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
    return;
  }

  let load: { mode: "app" | "dev"; url: string };
  try {
    load = resolveRendererLoadUrl({
      isPackaged: app.isPackaged,
      electronStartUrl: process.env.ELECTRON_START_URL,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
    return;
  }

  allowDevOrigins = !app.isPackaged && load.mode === "dev";

  if (
    shouldAttachAppProtocol({
      isPackaged: app.isPackaged,
      loadMode: load.mode,
    })
  ) {
    attachAppProtocolHandler(webDistPath(), desktopConfig);
  }

  ipcMain.handle("desktop:get-config", (event) => {
    assertTrustedIpc(event);
    return desktopConfig;
  });

  ipcMain.handle("desktop:save-fixture", async (event, payload: unknown) => {
    assertTrustedIpc(event);
    const safe = assertFixturePayload(payload);
    const safeName = path.basename(safe.fileName);
    const result = await dialog.showSaveDialog({
      title: "Save fixture file",
      defaultPath: safeName,
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false as const, canceled: true as const };
    }
    await writeFile(result.filePath, safe.contents, "utf8");
    return { ok: true as const, path: result.filePath };
  });

  createWindow(load.url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const url = app.isPackaged ? appIndexUrl() : load.url;
      createWindow(url);
    }
  });
});

app.on("web-contents-created", (_event, contents) => {
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
