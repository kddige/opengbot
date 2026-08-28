import { join } from "node:path";

import {
  BackendService,
  FakeCodexRunner,
  FileProjectStore,
  TanStackCodexRunner,
} from "@opengbot/backend";
import {
  chatCommandSchema,
  controlRequestSchema,
  type ChatEvent,
  type ControlResponse,
} from "@opengbot/protocol";

const dataDirectory = process.env.OPENGBOT_DATA_DIR;
if (!dataDirectory) throw new Error("OPENGBOT_DATA_DIR is required for the embedded backend.");

const embeddedBackend = new BackendService({
  backendId: "embedded:local",
  backendVersion: "0.0.0",
  mode: "embedded",
  projectStore: new FileProjectStore(join(dataDirectory, "backend-state.json")),
  codexRunner:
    process.env.OPENGBOT_CHAT_DRIVER === "fake"
      ? new FakeCodexRunner()
      : new TanStackCodexRunner({
          ...(process.env.OPENGBOT_CODEX_EXECUTABLE
            ? { executable: process.env.OPENGBOT_CODEX_EXECUTABLE }
            : {}),
          ...(process.env.OPENGBOT_CODEX_MODEL ? { model: process.env.OPENGBOT_CODEX_MODEL } : {}),
        }),
});

type ChatStartCommand = Extract<
  ReturnType<typeof chatCommandSchema.parse>,
  { operation: "chat.start" }
>;

type ActiveRun = {
  command: ChatStartCommand;
  abortController: AbortController;
};

const activeRuns = new Map<string, ActiveRun>();
const activeRunTasks = new Set<Promise<void>>();
const closeBackendPorts = new Set<() => void>();
const shutdownTimeoutMs = 7_000;
let shutdownStarted = false;

function trackRun(task: Promise<void>): void {
  activeRunTasks.add(task);
  void task.then(
    () => activeRunTasks.delete(task),
    () => activeRunTasks.delete(task),
  );
}

async function shutDown(): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;

  for (const active of activeRuns.values()) {
    active.abortController.abort("Embedded backend is shutting down.");
  }
  for (const closePort of closeBackendPorts) closePort();
  closeBackendPorts.clear();

  const tasks = [...activeRunTasks];
  if (tasks.length > 0) {
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
    ]);
  }
  process.exit(0);
}

process.parentPort.on("message", (event) => {
  if ((event.data as { type?: unknown }).type === "opengbot.shutdown") {
    void shutDown();
    return;
  }
  const [port] = event.ports;
  if (shutdownStarted) {
    port?.close();
    return;
  }
  const role = (event.data as { role?: unknown }).role;
  if (!port || (role !== "renderer" && role !== "privileged")) return;
  const ownedRuns = new Set<string>();
  let portClosed = false;
  const closePort = (): void => {
    portClosed = true;
    port.close();
  };
  closeBackendPorts.add(closePort);

  port.on("message", (messageEvent) => {
    if (shutdownStarted) return;
    const control = controlRequestSchema.safeParse(messageEvent.data);
    if (control.success) {
      void handleControl(control.data, role, (response) => port.postMessage(response));
      return;
    }

    const chat = chatCommandSchema.safeParse(messageEvent.data);
    if (chat.success && role === "renderer") {
      if (chat.data.operation === "chat.cancel") {
        const target = activeRuns.get(chat.data.payload.targetRequestId);
        if (
          target &&
          ownedRuns.has(chat.data.payload.targetRequestId) &&
          target.command.payload.projectId === chat.data.payload.projectId &&
          target.command.payload.integrationId === chat.data.payload.integrationId &&
          target.command.payload.sessionId === chat.data.payload.sessionId &&
          target.command.payload.threadId === chat.data.payload.threadId &&
          target.command.payload.runId === chat.data.payload.runId
        ) {
          target.abortController.abort("Cancelled by the user.");
        }
      } else {
        trackRun(
          handleChat(
            chat.data,
            (chatEvent) => {
              if (!portClosed) port.postMessage(chatEvent);
            },
            ownedRuns,
          ),
        );
      }
      return;
    }

    const data = messageEvent.data as { requestId?: unknown };
    const response: ControlResponse = {
      channel: "control",
      requestId: typeof data.requestId === "string" ? data.requestId : "invalid",
      ok: false,
      error: { code: "invalid_request", message: "The backend request was rejected." },
    };
    port.postMessage(response);
  });
  port.on("close", () => {
    portClosed = true;
    closeBackendPorts.delete(closePort);
    for (const requestId of ownedRuns) {
      activeRuns.get(requestId)?.abortController.abort("Renderer connection closed.");
    }
  });
  port.start();
});

async function handleControl(
  request: ReturnType<typeof controlRequestSchema.parse>,
  role: "renderer" | "privileged",
  respond: (response: ControlResponse) => void,
): Promise<void> {
  try {
    const payload =
      request.operation === "backend.handshake"
        ? await embeddedBackend.handshake(request.payload)
        : role === "privileged"
          ? await embeddedBackend.openProject(request.payload)
          : (() => {
              throw new Error("Project roots can only be granted by the desktop host.");
            })();
    respond({ channel: "control", requestId: request.requestId, ok: true, payload });
  } catch (error) {
    respond({
      channel: "control",
      requestId: request.requestId,
      ok: false,
      error: {
        code: "request_failed",
        message: error instanceof Error ? error.message : "The backend request failed.",
      },
    });
  }
}

async function handleChat(
  command: ChatStartCommand,
  emit: (event: ChatEvent) => void,
  ownedRuns: Set<string>,
): Promise<void> {
  const { requestId, payload } = command;
  const duplicate =
    activeRuns.has(requestId) ||
    [...activeRuns.values()].some((active) => active.command.payload.runId === payload.runId);
  if (duplicate) {
    emit({
      channel: "chat",
      requestId,
      runId: payload.runId,
      sequence: 0,
      event: "error",
      error: { code: "duplicate_run", message: "A chat run with this identity is already active." },
    });
    return;
  }

  const abortController = new AbortController();
  activeRuns.set(requestId, { command, abortController });
  ownedRuns.add(requestId);
  let sequence = 0;

  try {
    for await (const chunk of embeddedBackend.streamChat(payload, abortController)) {
      if (abortController.signal.aborted) break;
      emit({
        channel: "chat",
        requestId,
        runId: payload.runId,
        sequence: sequence++,
        event: "chunk",
        chunk,
      });
    }
    emit({ channel: "chat", requestId, runId: payload.runId, sequence, event: "end" });
  } catch (error) {
    if (abortController.signal.aborted) {
      emit({ channel: "chat", requestId, runId: payload.runId, sequence, event: "end" });
    } else {
      emit({
        channel: "chat",
        requestId,
        runId: payload.runId,
        sequence,
        event: "error",
        error: {
          code: "chat_failed",
          message: error instanceof Error ? error.message : "The Codex run failed.",
        },
      });
    }
  } finally {
    activeRuns.delete(requestId);
    ownedRuns.delete(requestId);
  }
}
