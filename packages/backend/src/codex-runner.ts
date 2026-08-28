import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { EventType, chat, type StreamChunk } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { defineSandbox, withSandbox } from "@tanstack/ai-sandbox";
import { localProcessSandbox } from "@tanstack/ai-sandbox-local-process";

import {
  inheritedEnvironmentScrubList,
  ProviderLoginProcess,
  providerProcessEnvironment,
  type HarnessAvailability,
  type HarnessRunInput,
  type HarnessRunner,
  type LoginMode,
} from "./harness-runner";

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

function reportsHostLogin(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized.includes("logged in using chatgpt");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export type CodexRunner = HarnessRunner;

export interface TanStackCodexRunnerOptions {
  model?: string;
  models?: string[];
  executable?: string;
}

export class TanStackCodexRunner implements CodexRunner {
  readonly integrationId = "codex-host";
  readonly provider = "openai";
  readonly providerId = "codex";
  readonly displayName = "Codex";
  readonly credentialMode = "host_cli_login";
  readonly credentialOwner = "provider_cli";
  readonly loginModes = ["browser", "device"] as const;
  readonly defaultModel: string;
  readonly #executable: string;
  readonly #models: string[];
  readonly #sessions = new Map<string, string>();
  readonly #login = new ProviderLoginProcess();

  constructor(options: TanStackCodexRunnerOptions = {}) {
    this.defaultModel = options.model ?? "gpt-5.6-sol";
    this.#models = [...new Set(options.models ?? [this.defaultModel, ...DEFAULT_CODEX_MODELS])];
    this.#executable = options.executable ?? "codex";
  }

  async availability(): Promise<HarnessAvailability> {
    const lastCheckedAt = new Date().toISOString();
    if (this.#login.active) {
      return {
        availability: "authenticating",
        statusMessage: "Waiting for Codex sign-in to finish in your browser.",
        models: this.#models,
        executableVersion: await this.#version(),
        lastCheckedAt,
      };
    }

    try {
      const [{ stdout, stderr }, executableVersion] = await Promise.all([
        execFileAsync(this.#executable, ["login", "status"], {
          timeout: 5_000,
          env: providerProcessEnvironment(),
        }),
        this.#version(),
      ]);
      const status = `${stdout}\n${stderr}`.toLowerCase();
      if (!reportsHostLogin(status)) {
        return {
          availability: "login_required",
          statusMessage: "Sign in with your ChatGPT account.",
          models: this.#models,
          executableVersion,
          lastCheckedAt,
        };
      }
      return {
        availability: "ready",
        statusMessage: "Connected with the Codex CLI host login.",
        models: this.#models,
        executableVersion,
        lastCheckedAt,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          availability: "missing_cli",
          statusMessage: "Codex CLI was not found on this host.",
          models: this.#models,
          executableVersion: null,
          lastCheckedAt,
        };
      }
      const failure = error as { stdout?: unknown; stderr?: unknown };
      const status = `${typeof failure.stdout === "string" ? failure.stdout : ""}\n${
        typeof failure.stderr === "string" ? failure.stderr : ""
      }`;
      if (
        status.toLowerCase().includes("not logged in") ||
        status.toLowerCase().includes("logged out")
      ) {
        return {
          availability: "login_required",
          statusMessage: "Sign in with your ChatGPT account.",
          models: this.#models,
          executableVersion: await this.#version(),
          lastCheckedAt,
        };
      }
      return {
        availability: "unavailable",
        statusMessage: "Codex CLI login status could not be verified.",
        models: this.#models,
        executableVersion: await this.#version(),
        lastCheckedAt,
      };
    }
  }

  async login(mode: LoginMode): Promise<void> {
    await this.#login.start(this.#executable, [
      "login",
      ...(mode === "device" ? ["--device-auth"] : []),
    ]);
  }

  async *stream({
    request,
    project,
    model,
    abortController,
  }: HarnessRunInput): AsyncIterable<StreamChunk> {
    const sandbox = defineSandbox({
      id: `codex:${project.id}`,
      provider: localProcessSandbox({
        dir: project.root,
        scrubEnv: inheritedEnvironmentScrubList(),
      }),
      workspace: { source: { type: "none" } },
      lifecycle: { reuse: "none", destroyOnComplete: true },
      fileEvents: false,
    });

    const sessionId = this.#sessions.get(request.threadId);
    const stream = chat({
      adapter: codexText(model, {
        authMode: "host",
        codexExecutable: shellQuote(this.#executable),
        cwd: "/workspace",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        additionalDirectories: [],
      }),
      messages: request.messages,
      threadId: request.threadId,
      runId: request.runId,
      parentRunId: request.parentRunId,
      ...(sessionId ? { modelOptions: { sessionId } } : {}),
      middleware: [withSandbox(sandbox)],
      abortController,
    });

    for await (const chunk of stream) {
      if (chunk.type === EventType.CUSTOM && chunk.name === "codex.session-id") {
        const newSessionId = (chunk.value as { sessionId?: unknown }).sessionId;
        if (typeof newSessionId === "string") this.#sessions.set(request.threadId, newSessionId);
      }
      yield chunk;
    }
  }

  async close(): Promise<void> {
    await this.#login.close();
  }

  async #version(): Promise<string | null> {
    try {
      const { stdout, stderr } = await execFileAsync(this.#executable, ["--version"], {
        timeout: 3_000,
        env: providerProcessEnvironment(),
      });
      return `${stdout}\n${stderr}`.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }
}

interface FakeHarnessRunnerOptions {
  integrationId: string;
  provider: "openai" | "xai";
  providerId: "codex" | "grok";
  displayName: string;
  model: string;
}

export class FakeHarnessRunner implements CodexRunner {
  readonly integrationId: string;
  readonly provider: "openai" | "xai";
  readonly providerId: "codex" | "grok";
  readonly displayName: string;
  readonly credentialMode = "host_cli_login";
  readonly credentialOwner = "provider_cli";
  readonly defaultModel: string;
  readonly loginModes = ["browser", "device"] as const;

  constructor(options: FakeHarnessRunnerOptions) {
    this.integrationId = options.integrationId;
    this.provider = options.provider;
    this.providerId = options.providerId;
    this.displayName = options.displayName;
    this.defaultModel = options.model;
  }

  async availability(): Promise<HarnessAvailability> {
    return {
      availability: "ready",
      statusMessage: "Deterministic development driver.",
      models: [this.defaultModel],
      executableVersion: "fake",
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async login(_mode: LoginMode): Promise<void> {}

  async *stream({ request, abortController }: HarnessRunInput): AsyncIterable<StreamChunk> {
    const messageId = `assistant:${request.runId}`;
    yield {
      type: EventType.RUN_STARTED,
      threadId: request.threadId,
      runId: request.runId,
    };
    yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" };
    if (abortController.signal.aborted) return;
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: "OpenGBot smoke response",
    };
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: request.threadId,
      runId: request.runId,
    };
  }

  async close(): Promise<void> {}
}

export class FakeCodexRunner extends FakeHarnessRunner {
  constructor() {
    super({
      integrationId: "codex-host",
      provider: "openai",
      providerId: "codex",
      displayName: "Codex",
      model: "fake-codex",
    });
  }
}

export class FakeGrokRunner extends FakeHarnessRunner {
  constructor() {
    super({
      integrationId: "grok-host",
      provider: "xai",
      providerId: "grok",
      displayName: "Grok",
      model: "fake-grok",
    });
  }
}
