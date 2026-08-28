import { EventSchemas } from "@ag-ui/core/schemas";
import type { StreamChunk, UIMessage } from "@tanstack/ai";
import { z } from "zod";

export const PROTOCOL_VERSION = 2 as const;

export const backendModeSchema = z.enum(["embedded", "remote"]);
export type BackendMode = z.infer<typeof backendModeSchema>;

export const credentialModeSchema = z.enum(["api_key", "provider_oauth", "host_cli_login"]);
export type CredentialMode = z.infer<typeof credentialModeSchema>;

export const integrationAvailabilitySchema = z.enum([
  "ready",
  "missing_cli",
  "login_required",
  "unavailable",
]);
export type IntegrationAvailability = z.infer<typeof integrationAvailabilitySchema>;

export const integrationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["provider", "harness"]),
  provider: z.enum(["openai", "xai"]),
  displayName: z.string().min(1),
  credentialMode: credentialModeSchema,
  model: z.string().min(1).nullable(),
  availability: integrationAvailabilitySchema,
  statusMessage: z.string().min(1).nullable(),
});
export type Integration = z.infer<typeof integrationSchema>;

export const projectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  root: z.string().min(1),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const chatSessionSummarySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  threadId: z.string().min(1),
  displayName: z.string().min(1),
});
export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>;

export const clientHelloSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  clientVersion: z.string().min(1),
});
export type ClientHello = z.infer<typeof clientHelloSchema>;

export const backendSnapshotSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  backendId: z.string().min(1),
  backendVersion: z.string().min(1),
  mode: backendModeSchema,
  status: z.enum(["ready", "needs_setup", "incompatible"]),
  activeProject: projectSummarySchema.nullable(),
  activeIntegration: integrationSchema.nullable(),
  activeSession: chatSessionSummarySchema.nullable(),
  sandbox: z.object({
    kind: z.literal("local_process"),
    isolation: z.literal("trusted_host"),
    codexMode: z.literal("workspace-write"),
    networkAccess: z.literal(false),
  }),
  features: z.object({
    remote: z.boolean(),
    projects: z.boolean(),
    chat: z.boolean(),
    childSessions: z.boolean(),
  }),
});
export type BackendSnapshot = z.infer<typeof backendSnapshotSchema>;

export interface BackendControl {
  handshake(hello: ClientHello): Promise<BackendSnapshot>;
}

const requestBaseSchema = z.object({ requestId: z.string().min(1) });

export const controlRequestSchema = z.discriminatedUnion("operation", [
  requestBaseSchema.extend({
    channel: z.literal("control"),
    operation: z.literal("backend.handshake"),
    payload: clientHelloSchema,
  }),
  requestBaseSchema.extend({
    channel: z.literal("control"),
    operation: z.literal("project.open"),
    payload: z.object({
      commandId: z.string().min(1),
      root: z.string().min(1),
    }),
  }),
]);
export type ControlRequest = z.infer<typeof controlRequestSchema>;

export const controlResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    channel: z.literal("control"),
    requestId: z.string().min(1),
    ok: z.literal(true),
    payload: backendSnapshotSchema,
  }),
  z.object({
    channel: z.literal("control"),
    requestId: z.string().min(1),
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);
export type ControlResponse = z.infer<typeof controlResponseSchema>;

const uiMessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }).passthrough(),
  z.object({ type: z.literal("thinking"), content: z.string() }).passthrough(),
  z
    .object({
      type: z.literal("tool-call"),
      id: z.string().min(1),
      name: z.string().min(1),
      arguments: z.string(),
      state: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("tool-result"),
      toolCallId: z.string().min(1),
      content: z.union([z.string(), z.array(z.unknown())]),
      state: z.string().min(1),
    })
    .passthrough(),
]);

const uiMessageShapeSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(uiMessagePartSchema),
  })
  .passthrough();

export const uiMessageSchema = z.custom<UIMessage>(
  (value) => uiMessageShapeSchema.safeParse(value).success,
  "Invalid TanStack AI UI message",
);

export const chatStartPayloadSchema = z.object({
  projectId: z.string().min(1),
  integrationId: z.string().min(1),
  sessionId: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  parentRunId: z.string().min(1).optional(),
  messages: z.array(uiMessageSchema),
});
export type ChatStartPayload = z.infer<typeof chatStartPayloadSchema>;

export const chatCommandSchema = z.discriminatedUnion("operation", [
  requestBaseSchema.extend({
    channel: z.literal("chat"),
    operation: z.literal("chat.start"),
    payload: chatStartPayloadSchema,
  }),
  requestBaseSchema.extend({
    channel: z.literal("chat"),
    operation: z.literal("chat.cancel"),
    payload: z.object({
      targetRequestId: z.string().min(1),
      projectId: z.string().min(1),
      integrationId: z.string().min(1),
      sessionId: z.string().min(1),
      threadId: z.string().min(1),
      runId: z.string().min(1),
    }),
  }),
]);
export type ChatCommand = z.infer<typeof chatCommandSchema>;

export const streamChunkSchema = z.custom<StreamChunk>(
  (value) => EventSchemas.safeParse(value).success,
  "Invalid TanStack AI stream chunk",
);

export const chatEventSchema = z.discriminatedUnion("event", [
  z.object({
    channel: z.literal("chat"),
    requestId: z.string().min(1),
    runId: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    event: z.literal("chunk"),
    chunk: streamChunkSchema,
  }),
  z.object({
    channel: z.literal("chat"),
    requestId: z.string().min(1),
    runId: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    event: z.literal("end"),
  }),
  z.object({
    channel: z.literal("chat"),
    requestId: z.string().min(1),
    runId: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    event: z.literal("error"),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
