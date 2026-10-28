import { app, BrowserWindow } from "electron";
import path from "node:path";

/**
 * Phase 0 empty shell only.
 * Phase 2 will switch to a constrained app:// protocol loading the web dist.
 */
const DEV_WEB_URL = process.env.ELECTRON_START_URL ?? "http://127.0.0.1:5173";

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

  void win.loadURL(DEV_WEB_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
