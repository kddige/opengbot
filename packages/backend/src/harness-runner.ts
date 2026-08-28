import { spawn, type ChildProcess } from "node:child_process";

import type {
  ChatStartPayload,
  CredentialMode,
  IntegrationAvailability,
  ProjectSummary,
} from "@opengbot/protocol";
import type { StreamChunk } from "@tanstack/ai";

export type LoginMode = "browser" | "device";

export interface HarnessAvailability {
  availability: IntegrationAvailability;
  statusMessage: string;
  models: string[];
  executableVersion: string | null;
  lastCheckedAt: string;
}

export interface HarnessRunInput {
  request: ChatStartPayload;
  project: ProjectSummary;
  model: string;
  abortController: AbortController;
}

export interface HarnessRunner {
  readonly integrationId: string;
  readonly provider: "openai" | "xai";
  readonly providerId: "codex" | "grok";
  readonly displayName: string;
  readonly credentialMode: CredentialMode;
  readonly credentialOwner: "provider_cli" | "opengbot_keychain";
  readonly defaultModel: string;
  readonly loginModes: readonly LoginMode[];
  availability(): Promise<HarnessAvailability>;
  login(mode: LoginMode): Promise<void>;
  stream(input: HarnessRunInput): AsyncIterable<StreamChunk>;
  close(): Promise<void>;
}

const LOGIN_ENVIRONMENT_ALLOWLIST = new Set([
  "CODEX_HOME",
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "GROK_HOME",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
  "WAYLAND_DISPLAY",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
]);

export function providerProcessEnvironment(additions: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      [...LOGIN_ENVIRONMENT_ALLOWLIST].flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      }),
    ),
    ...additions,
  };
}

export function inheritedEnvironmentScrubList(): string[] {
  return Object.keys(process.env).filter((name) => !LOGIN_ENVIRONMENT_ALLOWLIST.has(name));
}

export class ProviderLoginProcess {
  #child: ChildProcess | undefined;

  get active(): boolean {
    return this.#child !== undefined;
  }

  async start(executable: string, args: string[]): Promise<void> {
    if (this.#child) return;

    const child = spawn(executable, args, {
      env: providerProcessEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    this.#child = child;
    child.once("exit", () => {
      if (this.#child === child) this.#child = undefined;
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        if (this.#child === child) this.#child = undefined;
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    this.#child = undefined;
    await new Promise<void>((resolve) => {
      const onExit = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        child.removeListener("exit", onExit);
        resolve();
      }, 2_000);
      child.once("exit", onExit);
      if (!child.kill("SIGTERM")) {
        child.removeListener("exit", onExit);
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}
