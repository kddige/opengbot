import { join } from "node:path";

import {
  controlResponseSchema,
  type BackendSnapshot,
  type ControlRequest,
} from "@opengbot/protocol";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MessageChannelMain,
  nativeTheme,
  session,
  shell,
  utilityProcess,
  type MenuItemConstructorOptions,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";

import { DEV_SMOKE_READY_MARKER } from "./dev-smoke";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let utility: UtilityProcess | undefined;
let utilityControlPort: MessagePortMain | undefined;
let gracefulQuitStarted = false;
const privilegedRequests = new Map<
  string,
  { resolve: (snapshot: BackendSnapshot) => void; reject: (error: Error) => void }
>();
const privilegedRequestTimeoutMs = 10_000;
const utilityShutdownFallbackMs = 8_000;
const isDevSmoke = process.env.OPENGBOT_DEV_SMOKE === "1";

type DesktopCommand = "open-project" | "toggle-sidebar" | "focus-composer" | "stop-run";

function sendDesktopCommand(command: DesktopCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  window?.webContents.send("opengbot.command", command);
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendDesktopCommand("open-project"),
        },
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => sendDesktopCommand("toggle-sidebar"),
        },
        {
          label: "Focus Composer",
          accelerator: "CmdOrCtrl+L",
          click: () => sendDesktopCommand("focus-composer"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Run",
      submenu: [
        {
          label: "Stop Run",
          accelerator: "CmdOrCtrl+.",
          click: () => sendDesktopCommand("stop-run"),
        },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
if (isDevSmoke && process.env.OPENGBOT_SMOKE_DATA_DIR) {
  app.setPath("userData", process.env.OPENGBOT_SMOKE_DATA_DIR);
}

function rejectPrivilegedRequests(error: Error): void {
  for (const pending of privilegedRequests.values()) pending.reject(error);
  privilegedRequests.clear();
}

function createBackendUtility(): UtilityProcess {
  const child = utilityProcess.fork(join(__dirname, "utility.cjs"), [], {
    serviceName: "OpenGBot Backend",
    stdio: "pipe",
    env: {
      ...process.env,
      OPENGBOT_DATA_DIR: app.getPath("userData"),
      ...(isDevSmoke ? { OPENGBOT_CHAT_DRIVER: "fake" } : {}),
    },
  });

  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.once("exit", (code) => {
    utility = undefined;
    utilityControlPort = undefined;
    rejectPrivilegedRequests(new Error("The embedded backend stopped before responding."));
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("opengbot.backend-disconnected");
    }
    console.error("OpenGBot embedded backend stopped", { code });
  });

  const { port1, port2 } = new MessageChannelMain();
  utilityControlPort = port2;
  port2.on("message", (event) => {
    const parsed = controlResponseSchema.safeParse(event.data);
    if (!parsed.success) {
      const requestId = (event.data as { requestId?: unknown }).requestId;
      if (typeof requestId === "string") {
        privilegedRequests
          .get(requestId)
          ?.reject(new Error("The embedded backend response was invalid."));
        privilegedRequests.delete(requestId);
      }
      return;
    }
    const pending = privilegedRequests.get(parsed.data.requestId);
    if (!pending) return;
    privilegedRequests.delete(parsed.data.requestId);
    if (parsed.data.ok) pending.resolve(parsed.data.payload);
    else pending.reject(new Error(parsed.data.error.message));
  });
  port2.on("close", () => {
    if (utilityControlPort === port2) utilityControlPort = undefined;
    rejectPrivilegedRequests(new Error("The embedded backend control channel closed."));
  });
  port2.start();
  child.postMessage({ type: "opengbot.connect", role: "privileged" }, [port1]);

  return child;
}

function attachBackend(window: BrowserWindow, child: UtilityProcess): void {
  const { port1, port2 } = new MessageChannelMain();

  child.postMessage({ type: "opengbot.connect", role: "renderer" }, [port1]);
  window.webContents.postMessage("opengbot.connect", { devSmoke: isDevSmoke }, [port2]);
}

function sendPrivilegedRequest(request: ControlRequest): Promise<BackendSnapshot> {
  const port = utilityControlPort;
  if (!port) return Promise.reject(new Error("Embedded backend is not ready."));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      privilegedRequests.delete(request.requestId);
      reject(new Error(`Embedded backend request timed out after ${privilegedRequestTimeoutMs}ms`));
    }, privilegedRequestTimeoutMs);
    privilegedRequests.set(request.requestId, {
      resolve: (snapshot) => {
        clearTimeout(timeout);
        resolve(snapshot);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    try {
      port.postMessage(request);
    } catch (error) {
      privilegedRequests.delete(request.requestId);
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error("The backend request could not be sent."));
    }
  });
}

async function createWindow(): Promise<void> {
  const dark = nativeTheme.shouldUseDarkColors;
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: dark ? "#242528" : "#fbfbfc",
    show: false,
    title: "OpenGBot",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform === "darwin"
      ? {}
      : {
          titleBarOverlay: {
            color: dark ? "#242528" : "#fbfbfc",
            symbolColor: dark ? "#f4f4f5" : "#18181b",
            height: 52,
          },
        }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      // Invalid URLs remain blocked.
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("console-message", (details) => {
    if (isDevSmoke && details.message === DEV_SMOKE_READY_MARKER) {
      console.info(`OpenGBot development smoke check passed [${DEV_SMOKE_READY_MARKER}]`);
      app.quit();
    } else if (isDevSmoke && details.message.startsWith("opengbot:")) {
      console.info(`OpenGBot renderer: ${details.message}`);
    } else if (isDevSmoke && details.level !== "info") {
      console.error(`OpenGBot renderer ${details.level}: ${details.message}`);
    }
  });
  if (!isDevSmoke) window.once("ready-to-show", () => window.show());
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
  installApplicationMenu();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  ipcMain.handle("opengbot.choose-project", async () => {
    utility ??= createBackendUtility();
    const root = isDevSmoke
      ? process.env.OPENGBOT_SMOKE_PROJECT_ROOT
      : (
          await dialog.showOpenDialog({
            title: "Open an OpenGBot project",
            buttonLabel: "Open project",
            properties: ["openDirectory", "createDirectory"],
          })
        ).filePaths[0];

    if (!root) return null;
    return sendPrivilegedRequest({
      channel: "control",
      requestId: crypto.randomUUID(),
      operation: "project.open",
      payload: { commandId: crypto.randomUUID(), root },
    });
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

app.on("before-quit", (event) => {
  const child = utility;
  if (!child) return;
  if (gracefulQuitStarted) {
    child.kill();
    return;
  }

  event.preventDefault();
  gracefulQuitStarted = true;
  // UtilityProcess.postMessage has no targetOrigin parameter.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  child.postMessage({ type: "opengbot.shutdown" });
  const fallback = setTimeout(() => child.kill(), utilityShutdownFallbackMs);
  child.once("exit", () => {
    clearTimeout(fallback);
    utility = undefined;
    app.quit();
  });
});
