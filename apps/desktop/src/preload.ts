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

let backendPort: MessagePort | undefined;
const pending = new Map<string, PendingRequest>();

ipcRenderer.once("opengbot.connect", (event) => {
  const [port] = event.ports;

  if (!port) return;

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
});

const api = Object.freeze({
  handshake(): Promise<BackendSnapshot> {
    if (!backendPort) {
      return Promise.reject(new Error("Embedded backend connection is not ready"));
    }

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
      pending.set(requestId, { resolve, reject });
      // MessagePort.postMessage has no targetOrigin parameter.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      backendPort?.postMessage(request);
    });
  },
});

contextBridge.exposeInMainWorld("opengbot", api);

export type OpenGBotDesktopApi = typeof api;
