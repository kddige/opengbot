import { BackendService, type ProjectStore } from "@opengbot/backend";
import { backendSnapshotSchema, clientHelloSchema } from "@opengbot/protocol";
import { Hono } from "hono";

export interface CreateDaemonOptions {
  backendId?: string;
  backendVersion?: string;
  projectStore?: ProjectStore;
}

export function createDaemon(options: CreateDaemonOptions = {}) {
  const backend = new BackendService({
    backendId: options.backendId ?? "remote:opengbot",
    backendVersion: options.backendVersion ?? "0.0.0",
    mode: "remote",
    ...(options.projectStore ? { projectStore: options.projectStore } : {}),
  });
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.post("/v1/handshake", async (context) => {
    const hello = clientHelloSchema.parse(await context.req.json());
    const snapshot = backendSnapshotSchema.parse(await backend.handshake(hello));

    return context.json(snapshot);
  });

  return app;
}
