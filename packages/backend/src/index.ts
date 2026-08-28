import { realpath, stat } from "node:fs/promises";
import { basename } from "node:path";

import {
  PROTOCOL_VERSION,
  chatStartPayloadSchema,
  clientHelloSchema,
  type BackendControl,
  type BackendMode,
  type BackendSnapshot,
  type ChatStartPayload,
  type ClientHello,
} from "@opengbot/protocol";
import type { StreamChunk } from "@tanstack/ai";

import { TanStackCodexRunner, type CodexRunner } from "./codex-runner";
import {
  MemoryProjectStore,
  projectIdForRoot,
  type PersistedBackendState,
  type ProjectStore,
} from "./project-store";

export { FakeCodexRunner, TanStackCodexRunner } from "./codex-runner";
export { FileProjectStore, MemoryProjectStore } from "./project-store";
export type { CodexRunner } from "./codex-runner";
export type { PersistedBackendState, ProjectStore } from "./project-store";

export interface BackendServiceOptions {
  backendId: string;
  backendVersion: string;
  mode: BackendMode;
  projectStore?: ProjectStore;
  codexRunner?: CodexRunner;
}

export interface OpenProjectInput {
  commandId: string;
  root: string;
}

export class BackendService implements BackendControl {
  readonly #options: BackendServiceOptions;
  readonly #store: ProjectStore;
  readonly #codex: CodexRunner;
  readonly #commands = new Map<string, BackendSnapshot>();
  #statePromise: Promise<PersistedBackendState>;

  constructor(options: BackendServiceOptions) {
    this.#options = options;
    this.#store = options.projectStore ?? new MemoryProjectStore();
    this.#codex = options.codexRunner ?? new TanStackCodexRunner();
    this.#statePromise = this.#store.load();
  }

  async handshake(input: ClientHello): Promise<BackendSnapshot> {
    clientHelloSchema.parse(input);
    return this.#snapshot();
  }

  async openProject(input: OpenProjectInput): Promise<BackendSnapshot> {
    const previous = this.#commands.get(input.commandId);
    if (previous) return previous;

    const root = await realpath(input.root);
    const details = await stat(root);
    if (!details.isDirectory()) throw new Error("The selected project root is not a directory.");

    const projectId = projectIdForRoot(root);
    const project = { id: projectId, name: basename(root), root };
    const session = {
      id: `session:${projectId}:root`,
      projectId,
      threadId: `thread:${projectId}:root`,
      displayName: "Root bot",
    };
    const state = { activeProject: project, activeSession: session };
    await this.#store.save(state);
    this.#statePromise = Promise.resolve(state);

    const snapshot = await this.#snapshot();
    this.#commands.set(input.commandId, snapshot);
    return snapshot;
  }

  async *streamChat(
    input: ChatStartPayload,
    abortController: AbortController,
  ): AsyncIterable<StreamChunk> {
    const request = chatStartPayloadSchema.parse(input);
    const state = await this.#statePromise;
    const project = state.activeProject;
    const session = state.activeSession;

    if (!project || !session) throw new Error("Select a project before starting a chat.");
    let currentRoot: string;
    try {
      currentRoot = await realpath(project.root);
    } catch {
      throw new Error("The active project root is no longer available.");
    }
    if (currentRoot !== project.root || !(await stat(currentRoot)).isDirectory()) {
      throw new Error("The active project root is no longer the granted directory.");
    }
    if (request.projectId !== project.id) throw new Error("The requested project is not active.");
    if (request.sessionId !== session.id || request.threadId !== session.threadId) {
      throw new Error("The requested chat session is not authorized for this project.");
    }
    if (request.integrationId !== "codex-host")
      throw new Error("The requested integration is not active.");

    const availability = await this.#codex.availability();
    if (availability.availability !== "ready") throw new Error(availability.statusMessage);

    yield* this.#codex.stream({ request, project, abortController });
  }

  async #snapshot(): Promise<BackendSnapshot> {
    const state = await this.#statePromise;
    const codex = await this.#codex.availability();
    const configured = state.activeProject !== null && state.activeSession !== null;
    const chatReady = configured && codex.availability === "ready";

    return {
      protocolVersion: PROTOCOL_VERSION,
      backendId: this.#options.backendId,
      backendVersion: this.#options.backendVersion,
      mode: this.#options.mode,
      status: chatReady ? "ready" : "needs_setup",
      activeProject: state.activeProject,
      activeIntegration: {
        id: "codex-host",
        kind: "harness",
        provider: "openai",
        displayName: "Codex",
        credentialMode: "host_cli_login",
        model: this.#codex.model,
        availability: codex.availability,
        statusMessage: codex.statusMessage,
      },
      activeSession: state.activeSession,
      sandbox: {
        kind: "local_process",
        isolation: "trusted_host",
        codexMode: "workspace-write",
        networkAccess: false,
      },
      features: {
        remote: true,
        projects: true,
        chat: chatReady,
        childSessions: false,
      },
    };
  }
}
