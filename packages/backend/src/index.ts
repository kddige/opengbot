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
  type Integration,
} from "@opengbot/protocol";
import type { StreamChunk } from "@tanstack/ai";

import { TanStackCodexRunner, type CodexRunner } from "./codex-runner";
import { TanStackGrokRunner } from "./grok-runner";
import type { HarnessAvailability, HarnessRunner, LoginMode } from "./harness-runner";
import {
  chatSessionForSelection,
  MemoryProjectStore,
  projectIdForRoot,
  type PersistedBackendState,
  type ProjectStore,
} from "./project-store";

export {
  FakeCodexRunner,
  FakeGrokRunner,
  FakeHarnessRunner,
  TanStackCodexRunner,
} from "./codex-runner";
export { acquireOpenGBotHome, ensureOpenGBotHome, resolveOpenGBotHome } from "./app-home";
export type { OpenGBotHome, OpenGBotHomeLease } from "./app-home";
export { TanStackGrokRunner } from "./grok-runner";
export { FileProjectStore, MemoryProjectStore } from "./project-store";
export type { CodexRunner } from "./codex-runner";
export type { HarnessAvailability, HarnessRunner, LoginMode } from "./harness-runner";
export type { PersistedBackendState, ProjectStore } from "./project-store";

export interface BackendServiceOptions {
  backendId: string;
  backendVersion: string;
  mode: BackendMode;
  projectStore?: ProjectStore;
  runners?: HarnessRunner[];
  /** @deprecated Use runners. Retained for focused test-driver compatibility. */
  codexRunner?: CodexRunner;
}

export interface OpenProjectInput {
  commandId: string;
  root: string;
}

export interface SelectIntegrationInput {
  commandId: string;
  integrationId: string;
  model: string;
}

export interface LoginIntegrationInput {
  commandId: string;
  integrationId: string;
  mode: LoginMode;
}

export class BackendService implements BackendControl {
  readonly #options: BackendServiceOptions;
  readonly #store: ProjectStore;
  readonly #runners: Map<string, HarnessRunner>;
  readonly #commands = new Map<string, BackendSnapshot>();
  #statePromise: Promise<PersistedBackendState>;

  constructor(options: BackendServiceOptions) {
    this.#options = options;
    this.#store = options.projectStore ?? new MemoryProjectStore();
    const runners =
      options.runners ??
      (options.codexRunner
        ? [options.codexRunner]
        : [new TanStackCodexRunner(), new TanStackGrokRunner()]);
    if (runners.length === 0) throw new Error("At least one harness runner is required.");
    this.#runners = new Map(runners.map((runner) => [runner.integrationId, runner]));
    if (this.#runners.size !== runners.length)
      throw new Error("Harness integration IDs must be unique.");
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
    const previousState = await this.#statePromise;
    const defaultRunner = this.#runners.values().next().value as HarnessRunner;
    const existingSelection = previousState.selections[projectId];
    const selection =
      existingSelection && this.#runners.has(existingSelection.integrationId)
        ? existingSelection
        : {
            projectId,
            integrationId: defaultRunner.integrationId,
            modelId: defaultRunner.defaultModel,
          };
    const session = chatSessionForSelection(selection);
    const state = {
      activeProject: project,
      activeSession: session,
      selections: { ...previousState.selections, [projectId]: selection },
    };
    await this.#store.save(state);
    this.#statePromise = Promise.resolve(state);

    const snapshot = await this.#snapshot();
    this.#commands.set(input.commandId, snapshot);
    return snapshot;
  }

  async selectIntegration(input: SelectIntegrationInput): Promise<BackendSnapshot> {
    const previous = this.#commands.get(input.commandId);
    if (previous) return previous;

    const runner = this.#runners.get(input.integrationId);
    if (!runner) throw new Error("The requested integration is not available on this backend.");
    const state = await this.#statePromise;
    const project = state.activeProject;
    if (!project) throw new Error("Select a project before choosing a provider.");
    const availability = await runner.availability();
    if (!availability.models.includes(input.model)) {
      throw new Error("The requested model is not advertised by this provider installation.");
    }

    const nextState: PersistedBackendState = {
      ...state,
      activeSession: chatSessionForSelection({
        projectId: project.id,
        integrationId: runner.integrationId,
        modelId: input.model,
      }),
      selections: {
        ...state.selections,
        [project.id]: {
          projectId: project.id,
          integrationId: runner.integrationId,
          modelId: input.model,
        },
      },
    };
    await this.#store.save(nextState);
    this.#statePromise = Promise.resolve(nextState);
    const snapshot = await this.#snapshot();
    this.#commands.set(input.commandId, snapshot);
    return snapshot;
  }

  async loginIntegration(input: LoginIntegrationInput): Promise<BackendSnapshot> {
    const previous = this.#commands.get(input.commandId);
    if (previous) return previous;
    const runner = this.#runners.get(input.integrationId);
    if (!runner) throw new Error("The requested integration is not available on this backend.");
    if (!runner.loginModes.includes(input.mode)) {
      throw new Error("That sign-in mode is not supported by this integration.");
    }
    await runner.login(input.mode);
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
    const selection = state.selections[project.id];
    if (!selection || request.integrationId !== selection.integrationId) {
      throw new Error("The requested integration is not active for this project.");
    }
    const runner = this.#runners.get(selection.integrationId);
    if (!runner) throw new Error("The selected integration is unavailable.");
    const availability = await runner.availability();
    if (availability.availability !== "ready") throw new Error(availability.statusMessage);
    if (!availability.models.includes(selection.modelId)) {
      throw new Error("The selected model is no longer available from this provider.");
    }

    yield* runner.stream({ request, project, model: selection.modelId, abortController });
  }

  async close(): Promise<void> {
    await Promise.all([...this.#runners.values()].map((runner) => runner.close()));
  }

  async #snapshot(): Promise<BackendSnapshot> {
    const state = await this.#statePromise;
    const runnerEntries = [...this.#runners.values()];
    const integrations = await Promise.all(
      runnerEntries.map(async (runner) => this.#integration(runner, await runner.availability())),
    );
    const selection = state.activeProject ? state.selections[state.activeProject.id] : undefined;
    const activeIntegration = selection
      ? (integrations.find((integration) => integration.id === selection.integrationId) ?? null)
      : (integrations[0] ?? null);
    if (activeIntegration && selection) {
      activeIntegration.model = selection.modelId;
      if (!activeIntegration.models.includes(selection.modelId)) {
        activeIntegration.availability = "unavailable";
        activeIntegration.statusMessage =
          "The selected model is no longer advertised by this provider installation.";
      }
    }
    const configured = state.activeProject !== null && state.activeSession !== null;
    const chatReady =
      configured && selection !== undefined && activeIntegration?.availability === "ready";

    return {
      protocolVersion: PROTOCOL_VERSION,
      backendId: this.#options.backendId,
      backendVersion: this.#options.backendVersion,
      mode: this.#options.mode,
      status: chatReady ? "ready" : "needs_setup",
      activeProject: state.activeProject,
      integrations,
      activeIntegration,
      activeSession: state.activeSession,
      sandbox: {
        kind: "local_process",
        isolation: "trusted_host",
        workspaceAccess: "workspace-write",
        toolNetworkAccess: false,
        providerNetworkAccess: true,
      },
      features: {
        remote: false,
        projects: true,
        chat: chatReady,
        childSessions: false,
      },
    };
  }

  #integration(runner: HarnessRunner, availability: HarnessAvailability): Integration {
    return {
      id: runner.integrationId,
      backendId: this.#options.backendId,
      kind: "harness",
      provider: runner.provider,
      providerId: runner.providerId,
      displayName: runner.displayName,
      credentialMode: runner.credentialMode,
      credentialOwner: runner.credentialOwner,
      model: runner.defaultModel,
      models: availability.models,
      loginModes: [...runner.loginModes],
      availability: availability.availability,
      statusMessage: availability.statusMessage,
      executableVersion: availability.executableVersion,
      lastCheckedAt: availability.lastCheckedAt,
    };
  }
}
