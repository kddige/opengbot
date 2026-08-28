import { join } from "node:path";

import {
  app,
  BrowserWindow,
  MessageChannelMain,
  session,
  utilityProcess,
  type UtilityProcess,
} from "electron";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let utility: UtilityProcess | undefined;

function createBackendUtility(): UtilityProcess {
  const child = utilityProcess.fork(join(__dirname, "utility.js"), [], {
    serviceName: "OpenGBot Backend",
    stdio: "pipe",
  });

  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.once("exit", (code) => {
    utility = undefined;
    console.error("OpenGBot embedded backend stopped", { code });
  });

  return child;
}

function attachBackend(window: BrowserWindow, child: UtilityProcess): void {
  const { port1, port2 } = new MessageChannelMain();

  child.postMessage({ type: "opengbot.connect" }, [port1]);
  window.webContents.postMessage("opengbot.connect", null, [port2]);
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    show: false,
    title: "OpenGBot",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.webContents.once("did-finish-load", () => {
    utility ??= createBackendUtility();
    attachBackend(window, utility);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.enableSandbox();

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  utility?.kill();
});
