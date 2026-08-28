import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROTOCOL_VERSION } from "@opengbot/protocol";
import { EventType } from "@tanstack/ai";

import {
  acquireOpenGBotHome,
  BackendService,
  ensureOpenGBotHome,
  FakeCodexRunner,
  FileProjectStore,
  resolveOpenGBotHome,
  TanStackCodexRunner,
  TanStackGrokRunner,
} from "./index";

const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opengbot-project-"));
  temporaryRoots.push(root);
  return root;
}

function createBackend(stateFile?: string): BackendService {
  return new BackendService({
    backendId: "embedded:test",
    backendVersion: "0.0.0",
    mode: "embedded",
    codexRunner: new FakeCodexRunner(),
    ...(stateFile ? { projectStore: new FileProjectStore(stateFile) } : {}),
  });
}

describe("BackendService", () => {
  test("reports its deployment and Codex host-login identity", async () => {
    const snapshot = await createBackend().handshake({
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: "0.0.0",
    });

    expect(snapshot).toMatchObject({
      backendId: "embedded:test",
      mode: "embedded",
      status: "needs_setup",
      activeIntegration: {
        id: "codex-host",
        credentialMode: "host_cli_login",
        availability: "ready",
      },
      features: { projects: true, chat: false },
    });
  });

  test("creates an owner-only application home and enforces one backend writer", async () => {
    const root = await temporaryProject();
    const home = resolveOpenGBotHome(join(root, ".opengbot"));
    await ensureOpenGBotHome(home);
    expect(home.registryFile).toBe(join(root, ".opengbot", "state", "registry.v1.json"));
    if (process.platform !== "win32") {
      expect((await stat(home.root)).mode & 0o777).toBe(0o700);
      expect((await stat(home.state)).mode & 0o777).toBe(0o700);
    }

    const lease = await acquireOpenGBotHome(home);
    await expect(acquireOpenGBotHome(home)).rejects.toThrow("already in use");
    await lease.close();
    const nextLease = await acquireOpenGBotHome(home);
    await nextLease.close();
  });

  test("canonicalizes and restores the active project", async () => {
    const root = await temporaryProject();
    const stateFile = join(root, ".test-state", "backend.json");
    const opened = await createBackend(stateFile).openProject({ commandId: "open-1", root });
    const restored = await createBackend(stateFile).handshake({
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: "0.0.0",
    });

    expect(opened.activeProject?.root).toBe(await realpath(root));
    expect(restored.activeProject).toEqual(opened.activeProject);
    expect(restored.activeSession).toEqual(opened.activeSession);
    expect(restored.features.chat).toBe(true);

    await writeFile(
      stateFile,
      JSON.stringify({
        schemaVersion: 1,
        activeProject: { ...opened.activeProject, id: "tampered-project" },
        activeSession: opened.activeSession,
      }),
    );
    const rejected = await createBackend(stateFile).handshake({
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: "0.0.0",
    });
    expect(rejected.activeProject).toBeNull();
    expect(rejected.features.chat).toBe(false);
  });

  test("streams native TanStack chunks only for the active project session", async () => {
    const backend = createBackend();
    const snapshot = await backend.openProject({
      commandId: "open-2",
      root: await temporaryProject(),
    });
    const project = snapshot.activeProject!;
    const session = snapshot.activeSession!;
    const request = {
      projectId: project.id,
      integrationId: "codex-host",
      sessionId: session.id,
      threadId: session.threadId,
      runId: "run-1",
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          parts: [{ type: "text" as const, content: "Hello" }],
        },
      ],
    };

    const chunks = [];
    for await (const chunk of backend.streamChat(request, new AbortController()))
      chunks.push(chunk);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);

    await expect(async () => {
      for await (const chunk of backend.streamChat(
        { ...request, projectId: "another-project", runId: "run-2" },
        new AbortController(),
      )) {
        // The authorization error is raised before any chunks are emitted.
        void chunk;
      }
    }).toThrow("not active");
  });

  test("persists project-scoped provider and model selection", async () => {
    const root = await temporaryProject();
    const stateFile = join(root, ".test-state", "registry.json");
    const fakeGrok = new FakeCodexRunner();
    Object.defineProperties(fakeGrok, {
      integrationId: { value: "grok-host" },
      provider: { value: "xai" },
      providerId: { value: "grok" },
      displayName: { value: "Grok" },
      defaultModel: { value: "grok-test" },
    });
    const create = () =>
      new BackendService({
        backendId: "embedded:test",
        backendVersion: "0.0.0",
        mode: "embedded",
        projectStore: new FileProjectStore(stateFile),
        runners: [new FakeCodexRunner(), fakeGrok],
      });
    const backend = create();
    const opened = await backend.openProject({ commandId: "provider-open", root });
    const selected = await backend.selectIntegration({
      commandId: "provider-select",
      integrationId: "grok-host",
      model: "grok-test",
    });

    expect(selected.integrations.map((integration) => integration.id)).toEqual([
      "codex-host",
      "grok-host",
    ]);
    expect(selected.activeIntegration).toMatchObject({ id: "grok-host", model: "grok-test" });
    expect(selected.activeSession?.id).not.toBe(opened.activeSession?.id);

    const restored = await create().handshake({
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: "0.0.0",
    });
    expect(restored.activeIntegration).toMatchObject({ id: "grok-host", model: "grok-test" });
    expect(restored.activeSession).toEqual(selected.activeSession);
  });

  test("runs the TanStack Codex adapter through an explicit local workspace", async () => {
    if (process.platform === "win32") return;
    const root = await temporaryProject();
    const executable = join(root, "fake-codex");
    await writeFile(
      executable,
      `#!/bin/sh
if [ "$1" = "login" ]; then
  if [ -n "$OPENAI_API_KEY$CODEX_API_KEY$GITHUB_TOKEN" ]; then
    echo "Sensitive environment leaked" >&2
    exit 9
  fi
  echo "Logged in using ChatGPT"
  exit 0
fi
cat >/dev/null
echo '{"type":"thread.started","thread_id":"fake-thread"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"id":"item-1","type":"agent_message","text":"adapter-ready"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}'
`,
      { mode: 0o700 },
    );
    const runner = new TanStackCodexRunner({ executable, model: "fake-model" });
    const request = {
      projectId: "project-live",
      integrationId: "codex-host",
      sessionId: "session-live",
      threadId: "thread-live",
      runId: "run-live",
      messages: [
        {
          id: "message-live",
          role: "user" as const,
          parts: [{ type: "text" as const, content: "Hello" }],
        },
      ],
    };

    const previousSecrets = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    };
    process.env.OPENAI_API_KEY = "seed-openai-secret";
    process.env.CODEX_API_KEY = "seed-codex-secret";
    process.env.GITHUB_TOKEN = "seed-github-secret";
    try {
      expect((await runner.availability()).availability).toBe("ready");
    } finally {
      for (const [name, value] of Object.entries(previousSecrets)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    const deltas: string[] = [];
    for await (const chunk of runner.stream({
      request,
      project: { id: "project-live", name: "live", root },
      model: "fake-model",
      abortController: new AbortController(),
    })) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) deltas.push(chunk.delta);
    }
    expect(deltas.join("")).toBe("adapter-ready");

    await writeFile(executable, '#!/bin/sh\necho "Not logged in"\n', { mode: 0o700 });
    expect((await new TanStackCodexRunner({ executable }).availability()).availability).toBe(
      "login_required",
    );
    await writeFile(executable, '#!/bin/sh\necho "Logged in using an API key"\n', { mode: 0o700 });
    expect((await new TanStackCodexRunner({ executable }).availability()).availability).toBe(
      "login_required",
    );
  });

  test("probes the installed Grok CLI without reading provider credentials", async () => {
    if (process.platform === "win32") return;
    const root = await temporaryProject();
    const executable = join(root, "fake-grok");
    await writeFile(
      executable,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "grok 1.2.3"
elif [ "$1" = "models" ]; then
  echo "You are logged in with grok.com."
  echo "Default model: grok-current"
  echo "Available models:"
  echo "  * grok-current (default)"
  echo "  - grok-fast"
elif [ "$1" = "login" ] && [ "$2" = "--oauth" ]; then
  sleep 5
fi
`,
      { mode: 0o700 },
    );
    const runner = new TanStackGrokRunner({ executable, model: "grok-current" });
    expect(await runner.availability()).toMatchObject({
      availability: "ready",
      models: ["grok-current", "grok-fast"],
      executableVersion: "grok 1.2.3",
    });
    await runner.login("browser");
    expect((await runner.availability()).availability).toBe("authenticating");
    await runner.close();

    await writeFile(
      executable,
      '#!/bin/sh\nif [ "$1" = "models" ]; then echo "You are not authenticated."; fi\n',
      { mode: 0o700 },
    );
    expect((await runner.availability()).availability).toBe("login_required");
  });
});
