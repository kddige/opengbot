import {
  PROTOCOL_VERSION,
  controlResponseSchema,
  type BackendSnapshot,
  type ControlRequest,
} from "@opengbot/protocol";
import { contextBridge, ipcRenderer } from "electron";

type PendingRequest = {
  resolve: (snapshot: BackendSnapshot) => void;
  reject: (error: Error) => void;
};

const backendTimeoutMs = 10_000;
let backendPort: MessagePort | undefined;
const pending = new Map<string, PendingRequest>();

const backendPortReady = new Promise<MessagePort>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error(`Embedded backend connection timed out after ${backendTimeoutMs}ms`));
  }, backendTimeoutMs);

  ipcRenderer.once("opengbot.connect", (event) => {
    const [port] = event.ports;

    if (!port) {
      clearTimeout(timeout);
      reject(new Error("Embedded backend connection did not include a message port"));
      return;
    }

    backendPort = port;
    port.addEventListener("message", (messageEvent) => {
      const response = controlResponseSchema.parse(messageEvent.data);
      const request = pending.get(response.requestId);

      if (!request) return;
      pending.delete(response.requestId);

      if (response.ok) request.resolve(response.payload);
      else request.reject(new Error(response.error.message));
    });
    port.start();
    clearTimeout(timeout);
    resolve(port);
  });
});

const api = Object.freeze({
  async handshake(): Promise<BackendSnapshot> {
    const port = backendPort ?? (await backendPortReady);

    const requestId = crypto.randomUUID();
    const request: ControlRequest = {
      channel: "control",
      requestId,
      operation: "backend.handshake",
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        clientVersion: "0.0.0",
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Embedded backend handshake timed out after ${backendTimeoutMs}ms`));
      }, backendTimeoutMs);

      pending.set(requestId, {
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
  },
});

contextBridge.exposeInMainWorld("opengbot", api);

export type OpenGBotDesktopApi = typeof api;
