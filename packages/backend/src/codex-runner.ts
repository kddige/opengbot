import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ChatStartPayload, IntegrationAvailability, ProjectSummary } from "@opengbot/protocol";
import { EventType, chat, type StreamChunk } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { defineSandbox, withSandbox } from "@tanstack/ai-sandbox";
import { localProcessSandbox } from "@tanstack/ai-sandbox-local-process";

const execFileAsync = promisify(execFile);
const HOST_LOGIN_ENVIRONMENT_ALLOWLIST = new Set([
  "CODEX_HOME",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SHELL",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
]);

function inheritedEnvironmentScrubList(): string[] {
  return Object.keys(process.env).filter((name) => !HOST_LOGIN_ENVIRONMENT_ALLOWLIST.has(name));
}

function hostLoginEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    [...HOST_LOGIN_ENVIRONMENT_ALLOWLIST].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function reportsHostLogin(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized.includes("logged in using chatgpt");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export interface CodexAvailability {
  availability: IntegrationAvailability;
  statusMessage: string;
}

export interface CodexRunInput {
  request: ChatStartPayload;
  project: ProjectSummary;
  abortController: AbortController;
}

export interface CodexRunner {
  readonly model: string;
  availability(): Promise<CodexAvailability>;
  stream(input: CodexRunInput): AsyncIterable<StreamChunk>;
}

export interface TanStackCodexRunnerOptions {
  model?: string;
  executable?: string;
}

export class TanStackCodexRunner implements CodexRunner {
  readonly model: string;
  readonly #executable: string;
  readonly #sessions = new Map<string, string>();

  constructor(options: TanStackCodexRunnerOptions = {}) {
    this.model = options.model ?? "gpt-5.6-sol";
    this.#executable = options.executable ?? "codex";
  }

  async availability(): Promise<CodexAvailability> {
    try {
      const { stdout, stderr } = await execFileAsync(this.#executable, ["login", "status"], {
        timeout: 5_000,
        env: hostLoginEnvironment(),
      });
      const status = `${stdout}\n${stderr}`.toLowerCase();
      if (!reportsHostLogin(status)) {
        return { availability: "login_required", statusMessage: "Run `codex login` on this host." };
      }
      return { availability: "ready", statusMessage: "Using the Codex CLI host login." };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          availability: "missing_cli",
          statusMessage: "Codex CLI was not found on this host.",
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
        return { availability: "login_required", statusMessage: "Run `codex login` on this host." };
      }
      return {
        availability: "unavailable",
        statusMessage: "Codex CLI login status could not be verified.",
      };
    }
  }

  async *stream({ request, project, abortController }: CodexRunInput): AsyncIterable<StreamChunk> {
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
      adapter: codexText(this.model, {
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
}

export class FakeCodexRunner implements CodexRunner {
  readonly model = "fake-codex";

  async availability(): Promise<CodexAvailability> {
    return { availability: "ready", statusMessage: "Deterministic development driver." };
  }

  async *stream({ request, abortController }: CodexRunInput): AsyncIterable<StreamChunk> {
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
}
