import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { EventType, chat, type StreamChunk } from "@tanstack/ai";
import { grokBuildText } from "@tanstack/ai-grok-build";
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function parseModels(output: string): { defaultModel: string | null; models: string[] } {
  const defaultModel = /Default model:\s*([^\s]+)/i.exec(output)?.[1] ?? null;
  const models = [...output.matchAll(/^\s*(?:\*|-)\s+([^\s]+)(?:\s+\(default\))?\s*$/gim)].flatMap(
    (match) => (match[1] ? [match[1]] : []),
  );
  return {
    defaultModel,
    models: [...new Set([...(defaultModel ? [defaultModel] : []), ...models])],
  };
}

export interface TanStackGrokRunnerOptions {
  model?: string;
  executable?: string;
}

export class TanStackGrokRunner implements HarnessRunner {
  readonly integrationId = "grok-host";
  readonly provider = "xai";
  readonly providerId = "grok";
  readonly displayName = "Grok";
  readonly credentialMode = "host_cli_login";
  readonly credentialOwner = "provider_cli";
  readonly loginModes = ["browser", "device"] as const;
  readonly defaultModel: string;
  readonly #configuredExecutable: string | undefined;
  readonly #sessions = new Map<string, string>();
  readonly #login = new ProviderLoginProcess();

  constructor(options: TanStackGrokRunnerOptions = {}) {
    this.defaultModel = options.model ?? "grok-4.6";
    this.#configuredExecutable = options.executable;
  }

  async availability(): Promise<HarnessAvailability> {
    const lastCheckedAt = new Date().toISOString();
    const executable = await this.#executable();
    if (this.#login.active) {
      return {
        availability: "authenticating",
        statusMessage: "Waiting for Grok sign-in to finish in your browser.",
        models: [this.defaultModel],
        executableVersion: await this.#version(executable),
        lastCheckedAt,
      };
    }

    try {
      const [{ stdout, stderr }, executableVersion] = await Promise.all([
        execFileAsync(executable, ["models"], {
          timeout: 8_000,
          env: providerProcessEnvironment({ GROK_AUTH_EXPIRED: "1" }),
        }),
        this.#version(executable),
      ]);
      const output = `${stdout}\n${stderr}`;
      const catalog = parseModels(output);
      const models = catalog.models.length > 0 ? catalog.models : [this.defaultModel];
      if (/not authenticated|not logged in|logged out/i.test(output)) {
        return {
          availability: "login_required",
          statusMessage: "Sign in with your Grok account.",
          models,
          executableVersion,
          lastCheckedAt,
        };
      }
      if (!/logged in with grok\.com/i.test(output)) {
        return {
          availability: "unavailable",
          statusMessage: "Grok CLI login status could not be verified.",
          models,
          executableVersion,
          lastCheckedAt,
        };
      }
      return {
        availability: "ready",
        statusMessage: "Connected with the Grok CLI host login.",
        models,
        executableVersion,
        lastCheckedAt,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          availability: "missing_cli",
          statusMessage: "Grok CLI was not found on this host.",
          models: [this.defaultModel],
          executableVersion: null,
          lastCheckedAt,
        };
      }
      return {
        availability: "unavailable",
        statusMessage: "Grok CLI login status could not be verified.",
        models: [this.defaultModel],
        executableVersion: await this.#version(executable),
        lastCheckedAt,
      };
    }
  }

  async login(mode: LoginMode): Promise<void> {
    const executable = await this.#executable();
    await this.#login.start(executable, ["login", mode === "device" ? "--device-auth" : "--oauth"]);
  }

  async *stream({
    request,
    project,
    model,
    abortController,
  }: HarnessRunInput): AsyncIterable<StreamChunk> {
    const executable = await this.#executable();
    const sandbox = defineSandbox({
      id: `grok:${project.id}`,
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
      adapter: grokBuildText(model, {
        authMode: "host",
        grokExecutable: shellQuote(executable),
        cwd: "/workspace",
        permissionMode: "bypassPermissions",
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
      if (chunk.type === EventType.CUSTOM && chunk.name === "grok-build.session-id") {
        const newSessionId = (chunk.value as { sessionId?: unknown }).sessionId;
        if (typeof newSessionId === "string") this.#sessions.set(request.threadId, newSessionId);
      }
      yield chunk;
    }
  }

  async close(): Promise<void> {
    await this.#login.close();
  }

  async #executable(): Promise<string> {
    if (this.#configuredExecutable) return this.#configuredExecutable;
    const installed = join(homedir(), ".grok", "bin", "grok");
    try {
      await access(installed);
      return installed;
    } catch {
      return "grok";
    }
  }

  async #version(executable: string): Promise<string | null> {
    try {
      const { stdout, stderr } = await execFileAsync(executable, ["--version"], {
        timeout: 3_000,
        env: providerProcessEnvironment(),
      });
      return `${stdout}\n${stderr}`.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }
}
