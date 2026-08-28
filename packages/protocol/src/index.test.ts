import { describe, expect, test } from "bun:test";

import { EventType } from "@tanstack/ai";

import {
  PROTOCOL_VERSION,
  backendSnapshotSchema,
  chatEventSchema,
  chatStartPayloadSchema,
  clientHelloSchema,
} from "./index";

describe("control protocol", () => {
  test("rejects incompatible clients", () => {
    const result = clientHelloSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION + 1,
      clientVersion: "0.0.0",
    });
    expect(result.success).toBe(false);
  });

  test("requires visible project, provider, session, and sandbox state", () => {
    const snapshot = backendSnapshotSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      backendId: "local",
      backendVersion: "0.0.0",
      mode: "embedded",
      status: "needs_setup",
      activeProject: null,
      integrations: [],
      activeIntegration: null,
      activeSession: null,
      sandbox: {
        kind: "local_process",
        isolation: "trusted_host",
        workspaceAccess: "workspace-write",
        toolNetworkAccess: false,
        providerNetworkAccess: true,
      },
      features: { remote: true, projects: true, chat: false, childSessions: false },
    });
    expect(snapshot.backendId).toBe("local");
  });
});

describe("chat protocol", () => {
  test("requires the full authorization and run identity", () => {
    const result = chatStartPayloadSchema.safeParse({
      projectId: "project-1",
      integrationId: "codex-host",
      sessionId: "session-1",
      threadId: "thread-1",
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects unsupported message parts and malformed native events", () => {
    const message = chatStartPayloadSchema.safeParse({
      projectId: "project-1",
      integrationId: "codex-host",
      sessionId: "session-1",
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "message-1", role: "user", parts: [{ type: "made-up", content: "hello" }] }],
    });
    expect(message.success).toBe(false);

    const event = chatEventSchema.safeParse({
      channel: "chat",
      requestId: "request-1",
      runId: "run-1",
      sequence: 0,
      event: "chunk",
      chunk: { type: "TEXT_MESSAGE_CONTENT", messageId: "message-1" },
    });
    expect(event.success).toBe(false);
  });

  test("preserves native TanStack stream chunks in a sequenced envelope", () => {
    const event = chatEventSchema.parse({
      channel: "chat",
      requestId: "request-1",
      runId: "run-1",
      sequence: 3,
      event: "chunk",
      chunk: { type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "hello" },
    });
    expect(event.event === "chunk" && event.chunk.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
  });
});
