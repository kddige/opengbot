# Codex and Grok authentication/harness patterns

**Audit date:** 2026-08-28 (Europe/Copenhagen)
**Scope:** current `main` source and official documentation for T3 Code, NousResearch/hermes-agent, TanStack AI harness packages, OpenAI Codex, and xAI Grok Build.
**Evidence labels:** **Verified** means directly observed in the linked source/package/docs; **Inference** is a conclusion from that evidence; **Recommendation** is the proposed OpenGBot decision. Absence of a vendor statement is not evidence of permission.

## Executive conclusion

**Verified:** T3 Code (`pingdotgg/t3code`, `main` at `f94a0d646ed78a4788e4af6417f74202a628a5e9`) is a host harness. It asks the user to install and authenticate the provider CLI (`codex login`, `grok login`), then spawns `codex app-server`/`codex exec` or `grok agent` over stdio/ACP. T3 does not contain a Codex/xAI OAuth implementation or a token-extraction path. Its Codex shadow-home feature deliberately keeps each instance's `auth.json` private.

**Verified:** Hermes Agent (`NousResearch/hermes-agent`, `main` at `7d1c9aeab739842fa42112c95d086a9897f2d513`, version `0.20.6`) is mixed. It can spawn the official `codex app-server`, but its own `hermes auth` also performs direct OpenAI device OAuth, imports `~/.codex/auth.json`, refreshes those credentials itself, and stores them in `~/.hermes/auth.json`. Its xAI/SuperGrok path directly performs an OIDC device-code flow and stores a bearer/refresh-token grant in the Hermes auth store.

**Verified:** TanStack AI packages at the audit date are `@tanstack/ai-codex@0.5.3`, `@tanstack/ai-grok-build@0.5.3`, `@tanstack/ai@0.52.0`, and `@tanstack/ai-acp@0.3.8`. Both harness adapters require `SandboxCapability`. Codex defaults to `authMode: 'api-key'` with `CODEX_API_KEY`; `host` means an already logged-in `codex` process. Grok Build defaults to `authMode: 'api-key'` with `XAI_API_KEY`; `host` skips ACP authentication and uses `grok login`.

**Inference:** T3 and TanStack demonstrate the reusable boundary for OpenGBot: execute a vendor-supplied, user-installed CLI/app-server/ACP process and let that process own its credentials. Copying OAuth tokens or reimplementing provider consumer OAuth is materially riskier, even where an open-source project does it successfully.

**Recommendation:** Phase 0 should be API-key-first for direct OpenAI/xAI/OpenRouter/OpenAI-compatible adapters. If Codex/Grok subscriptions are exposed at all, make them an explicitly opt-in host-harness integration that launches the official local CLI/app-server and never reads, copies, refreshes, or transmits its credential files. Defer direct subscription OAuth and token import until the vendor documents a public third-party flow or OpenGBot obtains written permission.

## T3 Code: exact provider flows

Repository: [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Source snapshot audited at the commit above. T3 is MIT-licensed ([LICENSE](https://github.com/pingdotgg/t3code/blob/main/LICENSE)); that license covers T3 code, not provider accounts, endpoints, or subscription terms.

### Installation/auth contract

**Verified:** T3's [installation guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md) says “T3 Code drives provider CLIs; it does not ship them.” Its provider table requires:

| Provider   | Binary/process | User-auth command |
| ---------- | -------------- | ----------------- |
| Codex      | `codex`        | `codex login`     |
| Grok Build | `grok`         | `grok login`      |

Login must happen on the machine running the T3 server. The guide says provider auth is needed before a session, and an unauthenticated provider reports the CLI login command rather than attempting an in-app OAuth exchange.

### Codex

**Verified source flow:**

1. [`CodexDriver.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Drivers/CodexDriver.ts) binds a provider instance to a binary, environment, `CODEX_HOME`/shadow-home layout, app-server adapter, and `codex exec` text-generation adapter. It contains no OAuth/token parser.
2. [`CodexSessionRuntime.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/CodexSessionRuntime.ts) resolves the configured binary, sets `CODEX_HOME` when configured, and spawns the configured binary with `app-server` arguments via a child-process spawner. It connects JSON-RPC over the child process; account/auth events and approvals are projected from app-server messages.
3. [`CodexAdapter.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/CodexAdapter.ts) creates one runtime per provider instance and passes binary/home/environment settings through. It does not read `auth.json`.
4. [`CodexTextGeneration.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/textGeneration/CodexTextGeneration.ts) invokes `codex exec` with structured JSON output and passes the environment/optional `CODEX_HOME` to the child process.
5. [`CodexHomeLayout.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Drivers/CodexHomeLayout.ts) supports a shared home plus an optional shadow home. It treats `auth.json` and `models_cache.json` as private entries, and explicitly rejects a shadow `auth.json` symlink. Shared non-private directories may be linked. This prevents refresh-token/account collisions between provider instances.
6. T3's [Codex multi-account guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-codex.md) tells the user to run `CODEX_HOME=~/.codex_p codex login` for the second account. Any copying of `auth.json` is user-directed setup, not an application token extraction routine.

**Verified conclusion:** T3 uses the official Codex executable and its app-server/exec protocols. It relies on Codex's own local login state; it does not perform device OAuth, import tokens, or call the ChatGPT backend itself.

### Grok Build

**Verified source flow:**

1. [`GrokProvider.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/GrokProvider.ts) probes the configured/default `grok --version`, then starts an ACP runtime to discover models. There is no token-file parser.
2. [`GrokAcpSupport.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/acp/GrokAcpSupport.ts) builds `grok agent ... stdio` arguments, or the equivalent ACP serve/WebSocket path through the shared runtime. If `XAI_API_KEY` is present it chooses ACP method `xai.api_key`; otherwise it chooses `cached_token`, allowing the official CLI's prior `grok login` state to handle authentication. It sets `GROK_OAUTH2_REFERRER=t3code` for the child process; this is a provider/CLI hint, not token handling.
3. [`AcpSessionRuntime.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/acp/AcpSessionRuntime.ts) spawns the requested command, sends ACP `initialize`, then `authenticate` with the selected method ID, then creates/resumes the session. T3 does not see the credential payload.
4. [`GrokAdapter.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/GrokAdapter.ts) binds sessions to that ACP runtime; [`GrokTextGeneration.ts`](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/textGeneration/GrokTextGeneration.ts) uses the same runtime for structured text-generation calls.

**Verified conclusion:** T3 delegates Grok authentication and token storage to the official Grok CLI/ACP process. Its `cached_token` selection means “use the CLI's cached login,” not “read and reuse the token in T3.”

## Hermes Agent: exact auth and harness flows

Repository: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent). The audited `pyproject.toml` reports version `0.20.6`, Python `>=3.11,<3.14`; the repository is [MIT-licensed](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE). MIT permits reuse of Hermes source, but it does not grant rights to use OpenAI/xAI consumer credentials or undocumented service endpoints.

### Codex

**Verified in [`hermes_cli/auth.py`](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py):**

- `DEFAULT_CODEX_BASE_URL` is `https://chatgpt.com/backend-api/codex`; the source hard-codes OpenAI OAuth client ID `app_EMoamEEZ73f0CkXaXp7hrann` and token URL `https://auth.openai.com/oauth/token` ([lines 121–153](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L121-L153)).
- `_read_codex_tokens` and `_save_codex_tokens` read/write `providers.openai-codex.tokens` in Hermes' `~/.hermes/auth.json` ([lines 3803–3810](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L3803-L3810), [3953–3978](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L3953-L3978)). Hermes intentionally keeps a separate grant to avoid refresh-token rotation conflicts.
- `_import_codex_cli_tokens` reads `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`), requires both access and refresh tokens, rejects an expired access token, and returns the token object without writing to the Codex file ([lines 4175–4218](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L4175-L4218)). `_recover_codex_tokens_from_cli` then adopts that pair into Hermes' store ([lines 3981–3994](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L3981-L3994)).
- `_codex_device_code_login` directly POSTs OpenAI device-auth user-code/token endpoints, prints `https://auth.openai.com/codex/device`, polls, then exchanges the authorization code and verifier at the OAuth token endpoint ([lines 8355–8548](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L8355-L8548)). It does not spawn `codex login` and no Codex installation is required for this path.
- `_login_openai_codex` first offers an existing Hermes grant, then offers import of the Codex CLI grant, otherwise runs the direct device-code flow and saves the result to Hermes' auth store ([lines 8028–8094](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L8028-L8094)). Refresh uses the same hard-coded OAuth client ID and token endpoint ([lines 3997–4028](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L3997-L4028)).

**Separate, safer Hermes runtime path:** [`agent/transports/codex_app_server.py`](https://github.com/NousResearch/hermes-agent/blob/main/agent/transports/codex_app_server.py) describes a JSON-RPC client for `codex app-server` over stdio. [`agent/transports/codex_app_server_session.py`](https://github.com/NousResearch/hermes-agent/blob/main/agent/transports/codex_app_server_session.py) starts/interrupts threads and forwards approvals/events. The provider profile [`plugins/model-providers/openai-codex/__init__.py`](https://github.com/NousResearch/hermes-agent/blob/main/plugins/model-providers/openai-codex/__init__.py) identifies this as `oauth_external`, not an API-key provider.

**Inference/risk:** Hermes proves that direct device OAuth and CLI-token import can work, but it is not evidence that an arbitrary third-party app is authorized to use the same consumer grant/client ID. The direct flow is coupled to undocumented implementation details and can trigger rate limits, account controls, refresh-token rotation conflicts, or endpoint/client revocation. The app-server subprocess route is the reusable part; Hermes' auth implementation is not.

### xAI/Grok

**Verified in [`hermes_cli/auth.py`](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py):**

- Hermes registers `xai-oauth` as “xAI Grok OAuth (SuperGrok / Premium+)” with base `https://api.x.ai/v1`; its separate `xai` provider uses `XAI_API_KEY` ([lines 260–278](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L260-L278), [444–449](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L444-L449)).
- It hard-codes an xAI OIDC issuer/discovery URL, client ID, scope (`openid profile email offline_access grok-cli:access api:access`), and device-code endpoint ([lines 150–155](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L150-L155)). `_xai_oauth_device_code_login` requests a device code, opens/prints a browser verification URL, polls the discovered token endpoint, and returns access/refresh/id-token data.
- `_save_xai_oauth_tokens` persists the grant, discovery metadata, redirect URI, refresh state, and `auth_mode=oauth_device_code` in Hermes' auth store ([lines 4807–4860](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L4807-L4860)). `refresh_xai_oauth_pure` refreshes with the same client ID and rejects non-xAI inference origins; a 403 directs the user to the API-key fallback ([lines 5068–5120](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py#L5068-L5120)).
- The [Hermes Grok OAuth guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/xai-grok-oauth.md) describes SuperGrok/X Premium+ browser login and warns that xAI may return 403 for some subscription tiers.

**Verified conclusion:** Hermes' xAI subscription route is direct OAuth/token storage, not an official xAI SDK-only API-key flow. The official xAI [API quickstart](https://docs.x.ai/developers/quickstart) documents creating an API-console key, exporting `XAI_API_KEY`, and sending `Authorization: Bearer $XAI_API_KEY` to `https://api.x.ai/v1`; it does not establish permission for OpenGBot to copy consumer subscription tokens. The official [Grok Build page](https://x.ai/build) documents the vendor CLI installer and CLI product, so the CLI/ACP subprocess is the defensible integration boundary.

## TanStack AI harness packages

Package evidence was obtained from npm tarballs on 2026-08-28. Both packages are MIT-licensed and publish source alongside `dist`:

- [`@tanstack/ai-codex@0.5.3` package.json](https://unpkg.com/@tanstack/ai-codex@0.5.3/package.json): peer `@tanstack/ai ^0.52.0`, `@tanstack/ai-sandbox ^0.5.4`; README links its adapter docs.
- [`@tanstack/ai-grok-build@0.5.3` package.json](https://unpkg.com/@tanstack/ai-grok-build@0.5.3/package.json): peer `@tanstack/ai ^0.52.0`, `@tanstack/ai-sandbox ^0.5.4`, dependency `@tanstack/ai-acp ^0.3.8`.

### `@tanstack/ai-codex`

**Verified:** [`src/adapters/text.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-codex/src/adapters/text.ts) declares `CodexAuthMode = 'host' | 'api-key'`, defaults to API-key semantics, expects `CODEX_API_KEY`, and documents host mode as “uses `codex login`.” It requires `SandboxCapability` and spawns `codex exec --experimental-json` inside the sandbox. [`src/byok.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-codex/src/byok.ts) maps the BYOK environment variable to `CODEX_API_KEY`.

The published adapter's `authMode` is an explicit contract for deployment/configuration; the CLI remains the credential owner. The adapter does not parse or persist OAuth tokens. In the 0.5.3 source, `authMode` is primarily descriptive/configuration input—the caller/sandbox must actually provide the key or a logged-in CLI home.

### `@tanstack/ai-grok-build`

**Verified:** The [official Grok Build adapter docs](https://tanstack.com/ai/latest/docs/adapters/grok-build) state that the adapter spawns the `grok` CLI in a sandbox. Default `authMode` is `api-key`: inject `XAI_API_KEY` and authenticate with ACP method `xai.api_key`. `host` skips ACP `authenticate` and uses `grok login`; it does not inject `XAI_API_KEY`. The package source agrees:

- [`src/auth.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-grok-build/src/auth.ts) resolves `xai.api_key` or no method for host mode.
- [`src/process/acp.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-grok-build/src/process/acp.ts) launches `grok agent ... stdio`, or `grok agent ... serve` with a random in-sandbox WebSocket secret.
- [`src/adapters/text.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-grok-build/src/adapters/text.ts) requires a sandbox and passes configured environment variables to the child process.

The docs distinguish `grok-build` (browser-login listing) from `grok-build-0.1` (API-key listing), with model alias normalization. This is a CLI behavior detail, not a license to implement Grok subscription OAuth ourselves.

## License, terms, and account-risk analysis

**Verified:** T3 Code and Hermes Agent are MIT; TanStack packages are MIT. Those licenses allow code reuse subject to notices/warranty terms. They do not transfer OpenAI or xAI account grants, consumer subscription entitlements, OAuth client registrations, or permission to call private endpoints.

**Verified:** OpenAI's current [Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli) presents Codex CLI as the supported local terminal product and documents `codex exec` workflows. OpenAI's [Codex CLI/Sign in with ChatGPT guidance](https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt) tells users to install the CLI and run `codex --login`; it says the flow stores credentials locally and that the sign-in grants the CLI a refresh token. OpenAI's [Service Terms](https://openai.com/policies/service-terms/) and [Terms of Use](https://openai.com/policies/terms-of-use/) govern use; exact account eligibility/terms can vary by plan and workspace.

**Verified:** xAI's current API documentation presents API-console keys and bearer authentication as the public API path. The Grok Build vendor page presents the official CLI. I found no xAI official documentation authorizing arbitrary third-party applications to collect/reuse the Grok consumer OAuth grant used by Hermes.

**Inference:** “It works” is insufficient for a safe product decision. The main risks are:

| Risk                             | Why it matters                                                                                                                                   | Mitigation                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Consumer grant reuse             | OAuth access may be tied to the named CLI/client, subscription tier, device, workspace, or anti-abuse controls.                                  | Delegate to the vendor CLI/app-server; do not copy or mint grants.                                                              |
| Refresh-token rotation           | Two apps refreshing one grant can invalidate each other; importing `~/.codex/auth.json` creates this coupling unless a separate grant is minted. | Keep one credential owner and one home; use isolated official CLI logins for separate accounts.                                 |
| Private endpoint/client coupling | Hard-coded IDs/URLs/scopes can change or be blocked without notice.                                                                              | Use documented API or official process; feature-detect/version-check.                                                           |
| Secret exposure                  | Desktop/server logs, environment dumps, crash reports, or remote sandboxes can leak bearer/API tokens.                                           | OS keychain/secret store, redaction, least-privilege env, no token logging, explicit consent.                                   |
| Subscription/account policy      | API-key billing, ChatGPT plans, SuperGrok/Premium+ plans, and enterprise seats have different entitlements and terms.                            | Show provider/account mode clearly; require user confirmation; do not promise subscription support without vendor confirmation. |
| Process supply chain             | A configured binary path or install script can run arbitrary code with project access.                                                           | Verify executable path/version, preserve approvals/sandboxing, never silently install or elevate.                               |

## Concrete Phase 0 recommendation

1. **Ship direct API-key adapters first.** OpenAI API key, xAI `XAI_API_KEY`, OpenRouter key, and user-configured OpenAI-compatible base URL/key are auditable and compatible with normal server-secret handling. Do not store provider bearer tokens in renderer state or application logs.
2. **Define a generic host-harness interface, but keep it opt-in.** A provider instance should contain executable path, working directory, environment-secret references, version probe, protocol (`stdio`/JSONL/ACP/app-server), and explicit auth mode (`api-key` or `host`). The host mode should only launch the user's already-installed official CLI; it should not inspect or copy credential files.
3. **Codex host mode:** launch the official `codex app-server` (rich interactive sessions) or `codex exec --experimental-json` (one-shot/headless), pass the configured project cwd and optional isolated `CODEX_HOME`, and surface `codex login` when unauthenticated. Preserve the T3 shadow-home idea only when the user explicitly creates/authenticates that home through `codex login`.
4. **Grok host mode:** launch the official `grok agent` ACP/stdio process and use `grok login` on the host. For sandboxed/API mode, pass only `XAI_API_KEY` and use ACP `xai.api_key`. Do not implement Hermes' `xai-oauth` subscription flow in Phase 0.
5. **Do not import or refresh OAuth files.** Specifically, do not read `~/.codex/auth.json`, `~/.hermes/auth.json`, browser cookies, keychain entries, or Grok cached-token files. Do not hard-code OpenAI/xAI consumer OAuth IDs, scopes, or private backend URLs.
6. **Make the account boundary visible.** UI should distinguish “API key (metered API)” from “host CLI login (provider-managed account/subscription)” and show the executable/version. Log only provider name, mode, process status, and redacted errors.
7. **Phase 0 gate:** ship host harnesses only after an end-to-end local test proves process isolation, cancellation, stdout/stderr redaction, approval/sandbox policy, missing-login diagnostics, and no credential-file reads. Treat vendor documentation/permission as a release prerequisite for any future first-party OAuth integration.

## Primary source index

- [T3 Code repository](https://github.com/pingdotgg/t3code), [install/provider guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md), [Codex multi-account guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-codex.md)
- [Hermes Agent repository](https://github.com/NousResearch/hermes-agent), [`hermes_cli/auth.py`](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth.py), [Codex app-server transport](https://github.com/NousResearch/hermes-agent/blob/main/agent/transports/codex_app_server.py), [xAI OAuth guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/xai-grok-oauth.md)
- [TanStack Grok Build adapter docs](https://tanstack.com/ai/latest/docs/adapters/grok-build), [TanStack AI repository](https://github.com/TanStack/ai), [`@tanstack/ai-codex@0.5.3`](https://www.npmjs.com/package/@tanstack/ai-codex), [`@tanstack/ai-grok-build@0.5.3`](https://www.npmjs.com/package/@tanstack/ai-grok-build)
- [OpenAI Codex CLI docs](https://learn.chatgpt.com/docs/codex/cli), [Codex CLI sign-in guidance](https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt), [OpenAI service terms](https://openai.com/policies/service-terms/)
- [xAI API quickstart](https://docs.x.ai/developers/quickstart), [official Grok Build CLI page](https://x.ai/build), [xAI terms/policies](https://x.ai/legal)
