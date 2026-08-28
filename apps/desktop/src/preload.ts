import {
  PROTOCOL_VERSION,
  chatEventSchema,
  controlResponseSchema,
  type BackendSnapshot,
  type ChatCommand,
  type ChatStartPayload,
  type ControlRequest,
} from "@opengbot/protocol";
import type { StreamChunk } from "@tanstack/ai";
import { contextBridge, ipcRenderer } from "electron";

type PendingControl = {
  resolve: (snapshot: BackendSnapshot) => void;
  reject: (error: Error) => void;
};

type PendingChat = {
  runId: string;
  projectId: string;
  integrationId: string;
  sessionId: string;
  threadId: string;
  nextSequence: number;
  onChunk: (chunk: StreamChunk) => void;
  resolve: () => void;
  reject: (error: Error) => void;
};

const backendTimeoutMs = 10_000;
let backendPort: MessagePort | undefined;
let devSmoke = false;
let rejectBackendPortReady: ((error: Error) => void) | undefined;
let backendConnectionError: Error | undefined;
const pendingControls = new Map<string, PendingControl>();
const pendingChats = new Map<string, PendingChat>();

function failBackendConnection(error: Error): void {
  if (backendConnectionError) return;
  backendConnectionError = error;
  backendPort = undefined;
  rejectBackendPortReady?.(error);
  rejectBackendPortReady = undefined;
  for (const pending of pendingControls.values()) pending.reject(error);
  pendingControls.clear();
  for (const pending of pendingChats.values()) pending.reject(error);
  pendingChats.clear();
}

const backendPortReady = new Promise<MessagePort>((resolve, reject) => {
  rejectBackendPortReady = reject;
  const timeout = setTimeout(() => {
    failBackendConnection(
      new Error(`Embedded backend connection timed out after ${backendTimeoutMs}ms`),
    );
  }, backendTimeoutMs);

  ipcRenderer.once("opengbot.connect", (event, connectionOptions: unknown) => {
    const [port] = event.ports;
    if (backendConnectionError) {
      clearTimeout(timeout);
      port?.close();
      return;
    }
    if (!port) {
      clearTimeout(timeout);
      failBackendConnection(
        new Error("Embedded backend connection did not include a message port"),
      );
      return;
    }

    backendPort = port;
    devSmoke =
      typeof connectionOptions === "object" &&
      connectionOptions !== null &&
      (connectionOptions as { devSmoke?: unknown }).devSmoke === true;
    port.addEventListener("message", (messageEvent) => {
      const control = controlResponseSchema.safeParse(messageEvent.data);
      if (control.success) {
        const pending = pendingControls.get(control.data.requestId);
        if (!pending) return;
        pendingControls.delete(control.data.requestId);
        if (control.data.ok) pending.resolve(control.data.payload);
        else pending.reject(new Error(control.data.error.message));
        return;
      }

      const chat = chatEventSchema.safeParse(messageEvent.data);
      if (!chat.success) return;
      const pending = pendingChats.get(chat.data.requestId);
      if (!pending || pending.runId !== chat.data.runId) return;
      if (chat.data.sequence !== pending.nextSequence) {
        pendingChats.delete(chat.data.requestId);
        pending.reject(new Error("The backend chat stream arrived out of order."));
        return;
      }
      pending.nextSequence += 1;

      if (chat.data.event === "chunk") pending.onChunk(chat.data.chunk);
      else {
        pendingChats.delete(chat.data.requestId);
        if (chat.data.event === "end") pending.resolve();
        else pending.reject(new Error(chat.data.error.message));
      }
    });
    port.addEventListener("messageerror", () => {
      failBackendConnection(new Error("The embedded backend connection received invalid data."));
    });
    port.addEventListener("close", () => {
      failBackendConnection(new Error("The embedded backend connection closed."));
    });
    port.start();
    clearTimeout(timeout);
    rejectBackendPortReady = undefined;
    resolve(port);
  });
});

ipcRenderer.on("opengbot.backend-disconnected", () => {
  failBackendConnection(new Error("The embedded backend stopped unexpectedly."));
});

async function getBackendPort(): Promise<MessagePort> {
  if (backendConnectionError) throw backendConnectionError;
  const port = backendPort ?? (await backendPortReady);
  if (backendConnectionError) throw backendConnectionError;
  return port;
}

async function requestControl(request: ControlRequest): Promise<BackendSnapshot> {
  const port = await getBackendPort();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingControls.delete(request.requestId);
      reject(new Error(`Embedded backend request timed out after ${backendTimeoutMs}ms`));
    }, backendTimeoutMs);

    pendingControls.set(request.requestId, {
      resolve: (snapshot) => {
        clearTimeout(timeout);
        resolve(snapshot);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    // MessagePort.postMessage has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    port.postMessage(request);
  });
}

const api = Object.freeze({
  isDevSmoke(): boolean {
    return devSmoke;
  },

  handshake(): Promise<BackendSnapshot> {
    return requestControl({
      channel: "control",
      requestId: crypto.randomUUID(),
      operation: "backend.handshake",
      payload: { protocolVersion: PROTOCOL_VERSION, clientVersion: "0.0.0" },
    });
  },

  async chooseProject(): Promise<BackendSnapshot | null> {
    if (backendConnectionError) throw backendConnectionError;
    return ipcRenderer.invoke("opengbot.choose-project") as Promise<BackendSnapshot | null>;
  },

  async chat(payload: ChatStartPayload, onChunk: (chunk: StreamChunk) => void): Promise<void> {
    const port = await getBackendPort();
    const requestId = crypto.randomUUID();
    const command: ChatCommand = {
      channel: "chat",
      requestId,
      operation: "chat.start",
      payload,
    };

    return new Promise((resolve, reject) => {
      pendingChats.set(requestId, {
        runId: payload.runId,
        projectId: payload.projectId,
        integrationId: payload.integrationId,
        sessionId: payload.sessionId,
        threadId: payload.threadId,
        nextSequence: 0,
        onChunk,
        resolve,
        reject,
      });
      // MessagePort.postMessage has no targetOrigin parameter.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      port.postMessage(command);
    });
  },

  async cancelChat(runId: string): Promise<void> {
    const port = await getBackendPort();
    const active = [...pendingChats].find(([, pending]) => pending.runId === runId);
    if (!active) return;
    const [targetRequestId, pending] = active;
    const command: ChatCommand = {
      channel: "chat",
      requestId: crypto.randomUUID(),
      operation: "chat.cancel",
      payload: {
        targetRequestId,
        projectId: pending.projectId,
        integrationId: pending.integrationId,
        sessionId: pending.sessionId,
        threadId: pending.threadId,
        runId,
      },
    };
    // MessagePort.postMessage has no targetOrigin parameter.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    port.postMessage(command);
  },
});

contextBridge.exposeInMainWorld("opengbot", api);

export type OpenGBotDesktopApi = typeof api;
