import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export const backendModeSchema = z.enum(["embedded", "remote"]);
export type BackendMode = z.infer<typeof backendModeSchema>;

export const credentialModeSchema = z.enum(["api_key", "provider_oauth", "host_cli_login"]);
export type CredentialMode = z.infer<typeof credentialModeSchema>;

export const integrationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["provider", "harness"]),
  provider: z.enum(["openai", "xai"]),
  displayName: z.string().min(1),
  credentialMode: credentialModeSchema,
  model: z.string().min(1).nullable(),
});
export type Integration = z.infer<typeof integrationSchema>;

export const projectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  root: z.string().min(1),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

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

export const controlRequestSchema = z.object({
  channel: z.literal("control"),
  requestId: z.string().min(1),
  operation: z.literal("backend.handshake"),
  payload: clientHelloSchema,
});
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
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
    }),
  }),
]);
export type ControlResponse = z.infer<typeof controlResponseSchema>;
