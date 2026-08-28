# Ecosystem and provider landscape

> **Controller status note (2026-08-28):** This is non-binding research. Its
> recommendation to hide TanStack packages behind an OpenGBot adapter has been
> superseded by [ADR 001](../decisions/001-adopt-tanstack-ai-natively.md). The
> package/version facts and provider findings remain useful evidence.

**Research date:** 2026-08-28
**Scope:** TanStack AI, Electron/Bun, shadcn/ui, model-provider access, coding-agent harnesses, and open-source patterns relevant to OpenGBot's Phase 0 vertical slice.
**Evidence convention:** **Verified** means stated by a primary vendor/project source or observed in the package registry on the research date. **Inference** is a conclusion drawn from those facts. **Recommendation** is a proposed OpenGBot choice, not a provider guarantee.

## Executive summary

1. **Verified:** TanStack AI is now in release-candidate phase and has first-party text adapters for OpenAI, Anthropic, OpenRouter, and xAI, a generic OpenAI-compatible adapter, AG-UI streaming, approvals, tools, persistence, and coding-harness adapters (Codex, Claude Code, OpenCode, Grok Build, and generic ACP). The current npm registry snapshot is `@tanstack/ai@0.52.0` (with separate, independently versioned packages).
2. **Verified:** The normal provider path is API-key (or cloud IAM/federation), not a browser subscription session. OpenAI's ChatGPT sign-in is documented for the Codex CLI/app-server; Anthropic documents Claude Pro/Max login for Claude Code, while OpenCode's official integration documentation says Anthropic explicitly prohibits subscription plugins. OpenGBot must not scrape, proxy, or reuse undocumented consumer tokens.
3. **Verified:** Electron packages Chromium + Node.js. Bun is viable as the package manager, workspace tool, test/script runner, and (with care) build tool, but Electron's shipped main/preload runtime is Node, not Bun. Electron Forge's maintained Vite plugin provides the conventional main/preload/renderer packaging path.
4. **Verified:** shadcn/ui distributes source code through its CLI/registry (not an opaque runtime dependency). Its current chat guidance composes `MessageScroller`, `Message`, `Bubble`, `Attachment`, and `Marker`; these can be copied and adapted inside OpenGBot.
5. **Recommendation:** Build MVP around one server-owned provider boundary with (a) OpenRouter API key as the first multi-model option, (b) direct OpenAI API key as the canonical direct-provider adapter, and (c) one local harness path (Codex app-server or OpenCode server) only after the streaming/persistence contract works. Add direct Anthropic and xAI API keys next. Defer all subscription OAuth except documented Codex login through the installed Codex process, and label host-CLI integrations as separate from direct API providers.

## Package/version snapshot

The following versions were queried from npm on 2026-08-28. They are evidence of what is published today, not a promise that OpenGBot should float to `latest` in production. Pin a coherent TanStack release set in the lockfile and upgrade deliberately.

| Package                                                                                          | Published version | Role                                                             | Primary evidence                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------: | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@tanstack/ai`](https://www.npmjs.com/package/@tanstack/ai)                                     |          `0.52.0` | Core `chat()`, stream/events, tools, agent loops                 | [TanStack overview](https://tanstack.com/ai/latest/docs/getting-started/overview)                                                                            |
| [`@tanstack/ai-client`](https://www.npmjs.com/package/@tanstack/ai-client)                       |          `0.29.2` | Framework-agnostic client, SSE/HTTP stream transports            | [Client API](https://tanstack.com/ai/latest/docs/api/ai-client)                                                                                              |
| [`@tanstack/ai-react`](https://www.npmjs.com/package/@tanstack/ai-react)                         |          `0.22.4` | React `useChat` and related hooks                                | [Frameworks](https://tanstack.com/ai/latest/docs/framework)                                                                                                  |
| [`@tanstack/ai-openai`](https://www.npmjs.com/package/@tanstack/ai-openai)                       |          `0.22.3` | OpenAI Responses/Chat Completions and generic compatible adapter | [OpenAI adapter](https://tanstack.com/ai/latest/docs/adapters/openai), [compatible](https://tanstack.com/ai/latest/docs/adapters/openai-compatible)          |
| [`@tanstack/ai-anthropic`](https://www.npmjs.com/package/@tanstack/ai-anthropic)                 |          `0.18.3` | Anthropic Messages API                                           | [Anthropic adapter](https://tanstack.com/ai/latest/docs/adapters/anthropic)                                                                                  |
| [`@tanstack/ai-grok`](https://www.npmjs.com/package/@tanstack/ai-grok)                           |          `0.18.3` | xAI Responses API                                                | [Grok adapter](https://tanstack.com/ai/latest/docs/adapters/grok)                                                                                            |
| [`@tanstack/ai-openrouter`](https://www.npmjs.com/package/@tanstack/ai-openrouter)               |          `0.19.5` | OpenRouter catalog/routing                                       | [OpenRouter adapter](https://tanstack.com/ai/latest/docs/adapters/openrouter)                                                                                |
| [`@tanstack/ai-persistence`](https://www.npmjs.com/package/@tanstack/ai-persistence)             |           `0.5.4` | Server transcript/run/interrupt persistence                      | [Persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals)                                                                           |
| [`@tanstack/ai-sandbox`](https://www.npmjs.com/package/@tanstack/ai-sandbox)                     |           `0.5.4` | Sandbox/workspace lifecycle middleware                           | [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview)                                                                                     |
| [`@tanstack/ai-acp`](https://www.npmjs.com/package/@tanstack/ai-acp)                             |           `0.3.8` | Generic Agent Client Protocol harness                            | [ACP adapter](https://tanstack.com/ai/latest/docs/adapters/acp-compatible)                                                                                   |
| [`@tanstack/ai-codex`](https://www.npmjs.com/package/@tanstack/ai-codex)                         |           `0.5.3` | Codex CLI harness                                                | [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses)                                                                                           |
| [`@tanstack/ai-claude-code`](https://www.npmjs.com/package/@tanstack/ai-claude-code)             |           `0.6.3` | Claude Code CLI harness                                          | [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses)                                                                                           |
| [`@tanstack/ai-opencode`](https://www.npmjs.com/package/@tanstack/ai-opencode)                   |           `0.4.3` | OpenCode harness                                                 | [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses)                                                                                           |
| [`@tanstack/ai-grok-build`](https://www.npmjs.com/package/@tanstack/ai-grok-build)               |           `0.5.3` | Grok Build harness                                               | [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses)                                                                                           |
| [`electron`](https://www.npmjs.com/package/electron)                                             |          `44.0.0` | Desktop shell (npm latest at query time)                         | [Electron docs](https://www.electronjs.org/docs/latest)                                                                                                      |
| [`@electron-forge/cli`](https://www.npmjs.com/package/@electron-forge/cli)                       |          `7.11.2` | Packaging/makers/publish lifecycle                               | [Forge packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution), [Vite plugin](https://www.electronforge.io/config/plugins/vite) |
| [`bun`](https://www.npmjs.com/package/bun)                                                       |           `1.4.0` | Workspace/package manager/runtime tool                           | [Bun workspaces](https://bun.sh/docs/pm/workspaces)                                                                                                          |
| [`shadcn`](https://www.npmjs.com/package/shadcn)                                                 |          `4.19.0` | Source-code registry CLI/API                                     | [Registry API](https://ui.shadcn.com/docs/registry/api-reference)                                                                                            |
| [`@openai/codex-sdk`](https://www.npmjs.com/package/@openai/codex-sdk)                           |         `0.150.1` | TypeScript wrapper around Codex CLI JSONL                        | [SDK README](https://github.com/openai/codex/tree/main/sdk/typescript)                                                                                       |
| [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |         `0.3.251` | Programmatic Claude Code agent                                   | [SDK repository](https://github.com/anthropics/claude-agent-sdk-typescript)                                                                                  |
| [`@opencode-ai/sdk`](https://www.npmjs.com/package/@opencode-ai/sdk)                             |         `1.18.25` | Generated OpenCode HTTP SDK                                      | [OpenCode SDK docs](https://opencode.ai/v2/docs/build/sdk)                                                                                                   |

TanStack's [RC announcement](https://tanstack.com/blog/tanstack-ai-rc) says the architecture is locked around 24 providers, AG-UI, media generation, MCP, sandboxing, and persistence. This is a strong fit for the brief, but the package family remains pre-1.0: pin versions, add adapter contract tests, and expect API changes between upgrades.

## TanStack AI capability and compatibility findings

### Verified

- `chat()` is the core streaming API. The core has type-safe Zod/schema inference, tool calling, agent-loop strategies, automatic tool execution, and approvals; `@tanstack/ai-client` provides SSE/HTTP stream connection adapters and `@tanstack/ai-react` provides `useChat` ([overview](https://tanstack.com/ai/latest/docs/getting-started/overview), [client API](https://tanstack.com/ai/latest/docs/api/ai-client)).
- The official protocol is AG-UI. The client-server request carries `threadId`, `runId`, messages, tools, context, and forwarded properties; use TanStack's response helpers rather than inventing an SSE envelope ([changelog/protocol notes](https://github.com/TanStack/ai/blob/main/packages/ai/CHANGELOG.md)).
- `@tanstack/ai-openai` has separate Responses (`openaiText`) and older Chat Completions (`openaiChatCompletions`) adapters. The generic `openaiCompatible` factory is under the `@tanstack/ai-openai/compatible` subpath and requires an explicit model list/base URL ([OpenAI](https://tanstack.com/ai/latest/docs/adapters/openai), [compatible](https://tanstack.com/ai/latest/docs/adapters/openai-compatible)).
- Direct adapters exist for OpenAI, Anthropic, OpenRouter, and xAI; OpenRouter is the convenient one-key route to a large model catalog, while direct adapters retain provider-specific metadata/tools ([adapter list](https://tanstack.com/ai/latest/docs/getting-started/overview)).
- TanStack AI exposes persistence as separate durable conversation state and resumable stream delivery. `withPersistence` can persist messages, runs, interrupts/approvals, and metadata; this maps well to OpenGBot's reopen/retry requirement ([persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals), [controls](https://tanstack.com/ai/latest/docs/persistence/controls)).
- Coding agents are deliberately a second axis from sandbox providers. The harness chooses the process (Codex/Claude Code/OpenCode/Grok Build/ACP); the sandbox chooses where it runs, injects workspace/secrets, and controls lifecycle. Harness adapters declare that a sandbox is required ([sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview), [harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses)).
- `acpCompatible` can launch an arbitrary ACP-speaking CLI over stdio and gives session resume, approvals, cancellation, MCP bridging, and AG-UI translation. This is useful for future adapters, but ACP command/auth behavior is still supplied by each CLI ([ACP-compatible adapter](https://tanstack.com/ai/latest/docs/adapters/acp-compatible)).

### Inference and implications

- **Inference:** TanStack AI can be the internal normalized stream/event contract, but OpenGBot should preserve an escape hatch for provider/harness-native metadata. OpenAI Responses, Anthropic blocks, Codex items, and ACP events are not semantically identical; flattening them to text will lose approvals, reasoning, citations, usage, and files.
- **Inference:** Keep `@tanstack/ai-*` packages behind an OpenGBot adapter interface. This prevents a pre-1.0 package rename or event-shape change from leaking through the desktop UI and makes direct API and external harness modes visibly distinct.
- **Superseded recommendation:** The inference above was rejected by product
  direction. See ADR 001; OpenGBot adopts native TanStack contracts directly.
- **Recommendation:** For the first vertical slice, use text streaming + stop/retry + usage/error metadata + explicit approval events. Defer media, MCP Apps, Code Mode, and portable snapshots until the basic durable transcript is proven.

## Electron + Bun viability

### Verified

- Electron is a Chromium + Node.js desktop framework ([official introduction](https://www.electronjs.org/docs/latest)). It does not ship a Bun runtime.
- Bun supports npm `workspaces`, workspace protocol dependencies, hoisting/deduplication, filters, and shared catalogs ([Bun workspaces](https://bun.sh/docs/pm/workspaces)). This is directly suitable for `apps/desktop`, `packages/core`, `packages/backend`, and adapter packages.
- Bun's bundler supports TypeScript/JSX and `browser`, `bun`, and `node` targets, but Bun itself says the bundler is not a typechecker ([Bun bundler](https://bun.sh/docs/bundler)). Keep `tsc --noEmit`/equivalent typechecking and run tests separately.
- Electron Forge recommends Forge for packaging and provides a Vite plugin with separate main, preload, and renderer builds ([distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution), [Forge Vite](https://www.electronforge.io/config/plugins/vite)). Forge's Vite plugin is marked experimental in its docs, so pin Forge/Vite and validate native modules.
- Electron's ESM docs recommend bundling npm packages for renderer consumption and note that sandboxed preload scripts cannot use ESM imports directly ([Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm)).

### Recommendation

Use **Bun as package manager/workspace runner**, **Electron Forge + Vite as packaging/build orchestration**, and **Node-compatible TypeScript in Electron main/preload**. Treat Bun runtime execution as optional and isolated (for example, a separately launched local backend only if it has a bundled Bun executable or an explicit Bun installation requirement). Do not import `bun:*` APIs into code that must run in Electron's Node runtime.

Suggested boundary:

```text
Electron renderer (React/shadcn; no keys)
        │ typed preload IPC
Electron main (Node; owns keychain, project/session DB, provider boundary)
        ├─ direct HTTPS provider adapters (TanStack AI)
        └─ optional child-process harnesses (codex/claude/opencode)
```

This preserves the brief's embedded all-in-one default and leaves room for a separately hosted TypeScript backend using the same core protocol. Keep provider credentials out of renderer bundles and project transcripts. Follow Electron's security checklist (context isolation, sandboxing where feasible, narrow `contextBridge` APIs, no remote code) ([security checklist](https://www.electronjs.org/docs/latest/tutorial/security)).

## shadcn/ui and chat primitives

### Verified

- shadcn/ui's registry is a source distribution system: the CLI can install components, hooks, pages, rules, and other files into a project; it works with any framework ([registry introduction](https://ui.shadcn.com/docs/registry), [registry item schema](https://ui.shadcn.com/docs/registry/registry-item-json)).
- The current upstream chat guidance composes `MessageScroller`, `Message`, `Bubble`, `Attachment`, and `Marker`; it specifically provides built-in streaming follow/anchoring and a jump-to-latest button ([upstream chat rule](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/chat.md)).
- The upstream `shadcn` repository is MIT licensed and its latest GitHub release shown in the repository snapshot is `shadcn@4.11.0`; the npm registry query on 2026-08-28 reports `shadcn@4.19.0`. Use the npm package version for CLI pinning and check release notes before updates ([repository](https://github.com/shadcn-ui/ui), [npm](https://www.npmjs.com/package/shadcn)).

### Recommendation

Install/copy only the chat primitives needed for the first UI, then own the source in OpenGBot. Compose provider/status badges, project/session navigation, approval cards, and transcript parts around those primitives. Do not make the application depend on a remote registry at runtime. Because the user asked for a restrained shadcn-based interface, avoid a full chat template until the product's project/session hierarchy is settled.

## Provider access matrix

| Provider                           | Documented direct access                                                                            | TanStack adapter                                         | Auth boundary                                                                                                                                                                                                                                        | MVP implications                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI**                         | REST Responses API; official JS SDK                                                                 | `@tanstack/ai-openai` (`openaiText` or Chat Completions) | API key as Bearer; OpenAI warns not to expose it in client-side code ([auth](https://platform.openai.com/docs/api-reference/authentication), [quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request))                  | Good canonical direct adapter. Keep Responses-native metadata and tools.                                                                                                      |
| **Anthropic/Claude API**           | Messages API at `api.anthropic.com`                                                                 | `@tanstack/ai-anthropic`                                 | `x-api-key` or documented workload identity federation; API key/workspace expiration and rotation supported ([auth](https://platform.claude.com/docs/en/manage-claude/authentication), [overview](https://platform.claude.com/docs/en/api/overview)) | Add after OpenAI. Preserve content blocks, thinking, tool results, and server-tool events.                                                                                    |
| **xAI/Grok**                       | Responses and Chat Completions-compatible APIs at `api.x.ai/v1`; OpenAI SDK can target the base URL | `@tanstack/ai-grok`                                      | `XAI_API_KEY` / Bearer; account is created and funded in xAI Console ([quickstart](https://docs.x.ai/developers/quickstart), [streaming](https://docs.x.ai/developers/model-capabilities/text/streaming))                                            | Add direct API key path; model IDs/aliases and pricing change, so discover/list models rather than hard-code a stale catalog ([models](https://docs.x.ai/developers/models)). |
| **OpenRouter**                     | `/api/v1/chat/completions`; OpenAI SDK drop-in with `baseURL=https://openrouter.ai/api/v1`          | `@tanstack/ai-openrouter`                                | `OPENROUTER_API_KEY` / Bearer; one key accesses its catalog ([quickstart](https://openrouter.ai/docs/quickstart))                                                                                                                                    | Best first “many models” option; expose model slug and routing/fallback details. Costs, context, tools, and output shapes remain model-dependent.                             |
| **Any OpenAI-compatible endpoint** | Provider's `/chat/completions` (DeepSeek, Together, Fireworks, local LM Studio/Ollama/vLLM, etc.)   | `openaiCompatible` from `@tanstack/ai-openai/compatible` | User-supplied base URL + key/custom headers                                                                                                                                                                                                          | High leverage later. Require explicit model capabilities and mark unsupported Responses-only features.                                                                        |

### Provider feature caveat

TanStack's [provider-tools matrix](https://tanstack.com/ai/latest/docs/tools/provider-tools) shows why a least-common-denominator contract is unsafe: Anthropic and OpenAI expose provider-managed tools, OpenRouter exposes gateway search/fetch, and Grok's documented path is function tools. Model support is not uniform even within a provider. OpenGBot should show capabilities per selected model and report unsupported options rather than silently dropping them.

## Harness and external-agent integration

### Codex

- **Verified:** `@openai/codex-sdk` wraps the `codex` CLI and exchanges JSONL events over stdin/stdout; it requires Node 18+ ([SDK README](https://github.com/openai/codex/tree/main/sdk/typescript)).
- **Verified:** `codex app-server` is the machine interface used by rich clients such as the VS Code extension. It speaks bidirectional JSON-RPC over stdio JSONL; WebSocket is explicitly experimental/unsupported, while local Unix-socket control is documented ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)). Threads, turns, streamed item notifications, interrupts, and approval requests are first-class.
- **Verified:** The app-server documents `account/login/start` with a ChatGPT device-code flow and `account/logout`; the user-facing frontend owns the verification URL/code ([auth section in app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)). OpenAI's help article says `codex --login` stores credentials locally and that disconnecting OAuth does not revoke auto-generated API keys ([Codex sign-in help](https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt)).
- **Recommendation:** Integrate Codex by spawning the installed, version-matched `codex app-server` and speaking its documented protocol, or use the SDK for a smaller first experiment. Do not implement ChatGPT OAuth independently or copy refresh tokens into OpenGBot storage. Display Codex as a harness/account mode, not as an interchangeable OpenAI API-key provider.

### Claude Code / Claude Agent SDK

- **Verified:** Claude Code supports `claude -p` (print mode), `--output-format json|stream-json`, `--input-format stream-json`, `--resume`, and permission-related flags, giving a documented headless process interface ([CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)).
- **Verified:** `@anthropic-ai/claude-agent-sdk` is an official TypeScript package that programmatically builds agents with Claude Code capabilities; the official repository states it is governed by Anthropic Commercial Terms even when used in products for end users ([SDK repository](https://github.com/anthropics/claude-agent-sdk-typescript)).
- **Verified:** Claude Code login supports Anthropic Console OAuth, Claude App Pro/Max, and enterprise Bedrock/Vertex; Anthropic says Console OAuth requires active billing ([getting started](https://docs.anthropic.com/en/docs/claude-code/getting-started)).
- **Risk fact:** OpenCode's official provider docs explicitly state that plugins using Claude Pro/Max models are prohibited by Anthropic and that such plugins were removed from OpenCode as of 1.3.0 ([OpenCode providers](https://opencode.ai/docs/providers/)). This is a direct warning against treating consumer subscription login as a general third-party API.
- **Recommendation:** Support direct Anthropic API keys (or documented cloud IAM) as the first Claude path. A host-CLI Claude Code adapter may be offered as an explicitly user-installed local harness, with a prominent account/terms warning and no token extraction; do not advertise or automate Claude Pro/Max subscription reuse until Anthropic grants an explicit integration path.

### OpenCode

- **Verified:** OpenCode is MIT-licensed open source ([repository/license](https://github.com/anomalyco/opencode)), supports model providers via API keys and custom OpenAI-compatible config, and documents provider-specific model limits/capabilities ([providers](https://opencode.ai/docs/providers/)).
- **Verified:** `opencode serve` starts a headless HTTP server (default `127.0.0.1:4096`) with an OpenAPI 3.1 endpoint and optional HTTP Basic Auth via `OPENCODE_SERVER_PASSWORD`; the generated SDK is the intended programmatic path ([server docs](https://dev.opencode.ai/docs/server/)).
- **Verified:** `opencode acp` starts an ACP server over stdin/stdout nd-JSON, making it suitable for ACP-compatible clients ([ACP docs](https://opencode.ai/docs/acp/), [CLI docs](https://dev.opencode.ai/docs/cli/)).
- **Recommendation:** OpenCode is a low-friction later harness because its HTTP server/ACP interfaces are explicit and its license is permissive. Start with localhost process ownership and an authenticated loopback connection; do not expose its unauthenticated default port beyond loopback.

### T3 Code pattern

- **Verified:** T3 Code is an open-source GUI/control surface that drives installed provider CLIs rather than shipping them. Its install docs require Node 22.16+/23.11+/24.10+ and list Codex, Claude Code, Cursor, Grok Build, and OpenCode providers; its README describes web, mobile, and Electron clients controlling local agents ([install/providers](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md), [README](https://github.com/pingdotgg/t3code)).
- **Inference:** T3 Code validates the product pattern “desktop UI + local server/process wrappers + user-owned provider subscriptions,” but it also demonstrates the operational cost: provider CLI installation/version detection, per-agent parsing, account UX, and remote pairing are product features in their own right.
- **Recommendation:** Borrow the separation of control surface from CLI/harness and the idea of a server process boundary; do not copy its subscription assumptions into OpenGBot's direct API provider contract.

## OAuth, subscriptions, API keys, and account risk

### Verified constraints

- OpenAI API documentation says API requests use API keys as Bearer credentials and warns not to expose them in browser/app client code ([API authentication](https://platform.openai.com/docs/api-reference/authentication)).
- OpenAI's Codex ChatGPT flow is a documented exception tied to Codex clients/app-server. It can create an API key and consume API organization credits; revoking the OAuth grant alone leaves created keys active ([Codex sign-in help](https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt)).
- Anthropic's Claude API documents API keys, workload identity federation, and App Attest for genuine registered iOS/macOS apps—not a general-purpose consumer subscription token for arbitrary third-party desktop apps ([authentication](https://platform.claude.com/docs/en/manage-claude/authentication)).
- Anthropic's Claude Code docs document first-party Console/Claude App login, but OpenCode's provider docs warn explicitly that Anthropic prohibits Pro/Max subscription plugins ([Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/getting-started), [OpenCode provider warning](https://opencode.ai/docs/providers/)).
- OpenRouter and xAI document API-key/Bearer flows. Their docs do not provide a subscription OAuth flow that OpenGBot should invent ([OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [xAI quickstart](https://docs.x.ai/developers/quickstart)).

### Recommendation / policy for OpenGBot

1. Store API keys and OAuth material only in the OS keychain/credential store or a backend secret store; never in renderer state, logs, project files, or durable transcript rows.
2. Classify credentials as `api_key`, `cloud_identity`, `host_cli_login`, or `provider_oauth`; never present a subscription as if it were API billing.
3. For `host_cli_login`, invoke the vendor CLI/app-server as a separate process and let it own its credential store. Do not read token databases, intercept browser callbacks not documented for the integration, or mint keys on the user's behalf.
4. Show provider, account mode, model, endpoint, and billing mode in the UI before a run. Include a disconnect/revoke instruction because provider disconnect may not revoke generated keys (OpenAI's Codex help explicitly documents this).
5. If a provider's terms prohibit third-party subscription reuse, disable that auth mode by default and link the warning. Prefer API-key access or a provider-approved SDK/harness.

## Prioritized MVP recommendation

### P0 — prove the product contract

- Electron Forge + Vite desktop shell; Bun workspaces/package manager; Node-compatible main/preload.
- One embedded backend/provider boundary owned by Electron main (or a child Node process), with narrow IPC to the renderer.
- TanStack `chat()` + `@tanstack/ai-client`/React stream; persist `threadId`, project, provider/account mode, model, messages, run status, usage, errors, and cancellation state.
- OpenRouter API key adapter as the broadest one-key path, with OpenAI direct API key as the reference direct adapter.
- shadcn source primitives for message scrolling, message/bubble rendering, attachments, and system markers.
- Explicit stop, retry, reopen, and “active project/backend/provider/model” display; tests for stream interruption and process restart.

### P1 — provider and harness breadth

- Direct Anthropic API key adapter, then xAI API key adapter.
- Generic OpenAI-compatible endpoint with explicit base URL, model list, capability flags, timeout, and custom headers.
- Codex app-server harness over stdio JSONL (or the TanStack Codex harness adapter), with approval events and account mode shown as `host_cli_login`/Codex-managed.
- OpenCode localhost server or ACP harness; process supervision, loopback-only binding, and auth checks.

### P2 — isolation and richer agent UX

- TanStack sandbox middleware for coding harnesses; start with local process sandbox only after threat-model review, then Docker/microVM provider.
- Claude Code direct API-key harness; provider-approved enterprise/cloud auth where useful.
- Durable approvals/interrupts, reasoning/citation parts, MCP, structured output, and native provider tools.

### Explicitly defer

- Scraping or replaying ChatGPT/Claude consumer tokens.
- Undocumented subscription proxies, patched provider CLIs, or browser automation to obtain credentials.
- Cloud relay/multi-tenancy and remote desktop pairing.
- Treating every provider as feature-equivalent or silently downgrading tool/structured-output semantics.

## Open questions to carry into an ADR

- Is the initial durable store SQLite in Electron main, or a separately hosted backend store with the same persistence contract?
- Do we ship a local Node child backend for crash isolation, or keep direct adapters in main for the first slice?
- Which exact Codex app-server version/protocol is pinned, and how do we detect incompatible installed CLIs?
- Should host CLI integrations be opt-in “advanced harnesses” until legal review confirms account terms per provider?
- What minimum capability schema (stream, tools, approvals, usage, reasoning, files, cancellation) is retained without forcing all adapters into the least common denominator?

## Source index (primary)

- [TanStack AI overview](https://tanstack.com/ai/latest/docs/getting-started/overview), [RC announcement](https://tanstack.com/blog/tanstack-ai-rc), [OpenAI adapter](https://tanstack.com/ai/latest/docs/adapters/openai), [OpenAI-compatible](https://tanstack.com/ai/latest/docs/adapters/openai-compatible), [persistence](https://tanstack.com/ai/latest/docs/persistence/internals), [sandbox/harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses), [ACP](https://tanstack.com/ai/latest/docs/adapters/acp-compatible).
- [Electron introduction](https://www.electronjs.org/docs/latest), [Forge Vite plugin](https://www.electronforge.io/config/plugins/vite), [Electron distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm).
- [Bun workspaces](https://bun.sh/docs/pm/workspaces), [Bun bundler](https://bun.sh/docs/bundler).
- [shadcn registry](https://ui.shadcn.com/docs/registry), [registry schema](https://ui.shadcn.com/docs/registry/registry-item-json), [chat guidance](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/chat.md).
- [OpenAI API auth](https://platform.openai.com/docs/api-reference/authentication), [OpenAI quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request), [Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript), [Codex sign-in help](https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt).
- [Anthropic API auth](https://platform.claude.com/docs/en/manage-claude/authentication), [Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/getting-started), [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript).
- [xAI quickstart](https://docs.x.ai/developers/quickstart), [xAI models](https://docs.x.ai/developers/models), [xAI streaming](https://docs.x.ai/developers/model-capabilities/text/streaming).
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [OpenRouter TanStack integration](https://openrouter.ai/docs/guides/community/tanstack-ai).
- [OpenCode repository](https://github.com/anomalyco/opencode), [providers](https://opencode.ai/docs/providers/), [server](https://dev.opencode.ai/docs/server/), [ACP](https://opencode.ai/docs/acp/).
- [T3 Code install/providers](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md), [T3 Code README](https://github.com/pingdotgg/t3code).
