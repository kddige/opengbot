import { BackendService } from "@opengbot/backend";
import { controlRequestSchema, type ControlResponse } from "@opengbot/protocol";

const embeddedBackend = new BackendService({
  backendId: "embedded:local",
  backendVersion: "0.0.0",
  mode: "embedded",
});

process.parentPort.on("message", (event) => {
  const [port] = event.ports;

  if (!port) return;

  port.on("message", async (messageEvent) => {
    try {
      const request = controlRequestSchema.parse(messageEvent.data);
      const payload = await embeddedBackend.handshake(request.payload);
      const response: ControlResponse = {
        channel: "control",
        requestId: request.requestId,
        ok: true,
        payload,
      };
      port.postMessage(response);
    } catch (error) {
      const data = messageEvent.data as { requestId?: unknown };
      const response: ControlResponse = {
        channel: "control",
        requestId: typeof data.requestId === "string" ? data.requestId : "invalid",
        ok: false,
        error: {
          code: "invalid_request",
          message: error instanceof Error ? error.message : "Invalid request",
        },
      };
      port.postMessage(response);
    }
  });
  port.start();
});
