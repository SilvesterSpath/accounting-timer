import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type WebContents,
} from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { loadDesktopConfig } from "./config";
import {
  appIndexUrl,
  attachAppProtocolHandler,
  registerAppScheme,
} from "./protocol";

registerAppScheme();

const DEV_WEB_URL = process.env.ELECTRON_START_URL;
const isDevLoad = Boolean(DEV_WEB_URL);

function webDistPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web");
  }
  return path.join(__dirname, "..", "..", "web", "dist");
}

function isTrustedSender(contents: WebContents): boolean {
  try {
    const url = new URL(contents.getURL());
    if (url.protocol === "app:") {
      return true;
    }
    if (
      isDevLoad &&
      (url.origin === "http://127.0.0.1:5173" ||
        url.origin === "http://localhost:5173")
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function createWindow() {
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("app://") ||
      (isDevLoad &&
        (url.startsWith("http://127.0.0.1:5173") ||
          url.startsWith("http://localhost:5173")));
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (DEV_WEB_URL) {
    void win.loadURL(DEV_WEB_URL);
  } else {
    void win.loadURL(appIndexUrl());
  }
}

app.whenReady().then(() => {
  const config = loadDesktopConfig();

  if (!isDevLoad) {
    attachAppProtocolHandler(webDistPath(), config);
  }

  ipcMain.handle("desktop:get-config", (event) => {
    if (!isTrustedSender(event.sender)) {
      throw new Error("IPC sender not trusted");
    }
    return loadDesktopConfig();
  });

  ipcMain.handle(
    "desktop:save-fixture",
    async (event, payload: { fileName: string; contents: string }) => {
      if (!isTrustedSender(event.sender)) {
        throw new Error("IPC sender not trusted");
      }
      if (
        !payload ||
        typeof payload.fileName !== "string" ||
        typeof payload.contents !== "string"
      ) {
        throw new Error("Invalid fixture payload");
      }
      const safeName = path.basename(payload.fileName);
      const result = await dialog.showSaveDialog({
        title: "Save fixture file",
        defaultPath: safeName,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false as const, canceled: true as const };
      }
      await writeFile(result.filePath, payload.contents, "utf8");
      return { ok: true as const, path: result.filePath };
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
