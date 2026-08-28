# Foundation Threat Model and Quality Gates

Status: independent QA/security review
Reviewer: QA and security reviewer
Scope: Phase 0 foundation and first vertical slice
Reviewed sources:

- `.agents-workspace/README.md`
- `.agents-workspace/TEAM.md`
- `.agents-workspace/INDEX.md`
- `.agents-workspace/briefs/000-initial-product-brief.md`

## Executive Summary

OpenGBot's highest-risk design area is not model streaming itself; it is the
composition of desktop privileges, project filesystem access, provider
credentials, tool execution, durable multi-session state, and optional remote
backend connectivity. The first vertical slice should ship only after explicit
boundaries are implemented and automatically verified.

For Phase 0, the release should treat the Electron renderer as untrusted, the
preload API as a narrow capability facade, the backend as the only authority for
project/session/provider state, and all provider adapters as untrusted network
edges. Tool execution must require scoped approvals and must never receive
ambient access to all projects, all credentials, or the user's home directory.

The product brief already names important non-goals: no circumvention of
provider terms, no undocumented protection bypasses, and no assumption that
subscription OAuth and API-key access are equivalent. Those should become hard
P0 release gates.

## Assets to Protect

- Provider credentials: API keys, OAuth access tokens, refresh tokens, session
  cookies, device codes, account identifiers, billing metadata, and model usage
  records.
- User data: project files, conversation history, prompts, completions,
  tool-call arguments/results, uploaded attachments, logs, and workspace
  metadata.
- Execution authority: shell, package managers, filesystem writes, network
  access, browser automation, MCP/plugin connectors, and any future harness
  adapters.
- Integrity state: active project, active backend, active provider/model,
  session lineage, approval records, and cancellation/retry state.
- Update/plugin supply chain: signed releases, dependency graph, adapter
  packages, plugin manifests, and extension permissions.

## Trust Boundaries

1. Renderer to preload
   - Renderer content, including markdown/model output, should be considered
     attacker-controlled.
   - The preload surface is the only allowed bridge from UI code to privileged
     capabilities.

2. Preload to Electron main
   - IPC messages cross from an untrusted display surface into a privileged
     process.
   - Every IPC method needs schema validation, authorization against the active
     project/session, and an auditable call path.

3. Main to embedded backend
   - Embedded backend is still a separate authority boundary. It owns durable
     application state and provider/tool orchestration.
   - The main process should not bypass backend policy checks to mutate
     projects, sessions, credentials, or approvals.

4. Client to remote backend
   - Remote mode crosses machine and network boundaries.
   - Client/backend version skew and authentication/session revocation are
     first-class failure modes, not edge cases.

5. Backend to provider adapters
   - Provider adapters cross into external services with distinct contracts,
     error models, streaming formats, token accounting, rate limits, and legal
     constraints.
   - Adapter output and metadata should be normalized through a typed internal
     contract before reaching UI or tools.

6. Backend to tool runtime
   - Tool execution crosses from model-suggested intent into local side effects.
   - Approval, sandboxing, cwd/project scope, environment variables, network
     policy, and output redaction are mandatory controls.

7. Backend to filesystem/persistence
   - Project-scoped context and durable session data must not become global
     ambient state.
   - A project boundary should be enforceable even when sessions, specialists,
     or retries span app restarts.

8. Update/plugin boundary
   - Updates and plugins can introduce executable code or new connectors.
   - Installation, enabling, permission grants, and version migrations need
     explicit user-visible provenance and policy checks.

9. Logs/telemetry boundary
   - Logs are a separate data sink and often outlive user-visible sessions.
   - Secrets and user content must be redacted or excluded by default.

## Threats and Mitigations

### Electron Renderer, Preload, and Main

Threats:

- XSS through rendered model output, markdown, code blocks, HTML, images, or
  links invoking privileged actions.
- Prototype pollution or malformed IPC payloads reaching main/backend
  capabilities.
- Confused-deputy actions where the renderer triggers operations against a
  different project/session than the visible UI indicates.
- Navigation to remote content that gains access to preload APIs.
- Clipboard, file picker, drag/drop, and external link handling leaking project
  or credential data.

Mitigations:

- Enable `contextIsolation`, disable `nodeIntegration`, use a strict CSP, and
  expose only typed preload methods.
- Forbid arbitrary preload pass-through methods such as generic
  `ipcRenderer.invoke(channel, payload)`.
- Validate every IPC input with runtime schemas and authorize against explicit
  project/session IDs supplied by backend state, not renderer-local state.
- Render model markdown with HTML disabled or a hardened sanitizer; block inline
  scripts, event handlers, `javascript:` URLs, and untrusted remote resource
  loading.
- Use `shell.openExternal` only through an allowlisted, validated URL handler.
- Make the visible active project/backend/provider/model derive from trusted
  backend state and assert it before send/stop/retry/tool actions.

### Embedded and Remote Backend

Threats:

- Embedded mode silently depending on desktop main-process state that remote
  mode cannot reproduce.
- Remote backend accepting requests from stale clients, wrong users, wrong
  projects, or revoked sessions.
- API drift causing cancellation, retry, usage, reasoning metadata, or tool
  approvals to be misinterpreted.
- Backend URL spoofing or downgrade from remote TLS to insecure local/HTTP
  endpoints.
- Cross-origin and cross-client leakage in future remote deployments.

Mitigations:

- Define a versioned client/backend protocol before implementation grows beyond
  the first slice.
- Require a compatibility handshake with protocol version, feature flags,
  backend identity, auth state, and migration requirements.
- Use TLS for non-loopback remote backends; reject invalid certificates by
  default.
- Treat embedded backend and remote backend as two deployments of the same
  service contract with shared contract tests.
- Persist backend identity and show it in the UI exactly as required by the
  initial success criterion.

### OAuth, API Keys, and Provider Accounts

Threats:

- Storing provider credentials in plaintext app databases, logs, crash reports,
  or exported sessions.
- Treating subscription OAuth as a stable API product when the provider only
  supports browser/session use or private internal endpoints.
- Reverse-engineering web clients, cookies, refresh flows, GraphQL/private
  endpoints, anti-abuse protections, or subscription entitlements.
- Cross-provider credential confusion, such as sending an OpenAI key to another
  adapter due to shared config shape.
- Credentials leaking into tool subprocess environments.

Mitigations:

- Store secrets in OS keychain/credential storage, not in project files or
  session transcripts.
- Keep provider credential records typed by provider, credential kind,
  workspace/account scope, and allowed adapter.
- Redact secrets from logs, UI diagnostics, errors, snapshots, and test
  fixtures.
- Implement provider adapters only through documented, authorized APIs or
  officially supported SDK/protocol surfaces.
- Require explicit legal/product review before any subscription-backed provider
  integration. The default Phase 0 path should be API-key based unless a
  provider documents an approved OAuth/API flow for third-party clients.

Unsafe patterns that must be blocked:

- Using browser cookies, local browser profiles, or copied session storage to
  impersonate a subscription web client.
- Scraping first-party web app network calls or private GraphQL endpoints.
- Automating human web sessions to extract model responses behind subscription
  UI controls.
- Bypassing provider rate limits, model gates, device checks, account controls,
  or anti-bot protections.
- Packaging undocumented entitlement headers, user-agent spoofing, or reverse
  engineered OAuth refresh flows.

### Provider Adapters

Threats:

- Adapter-specific streaming events injecting malformed state into shared
  session storage.
- Tool-call deltas, reasoning metadata, usage accounting, or cancellation
  semantics being flattened incorrectly.
- Provider error bodies leaking keys, prompts, or account metadata.
- Prompt/tool injection from provider output into local tools or settings.
- Inconsistent retry behavior causing duplicate tool execution or accidental
  billing spikes.

Mitigations:

- Define a small but typed provider contract covering messages, stream deltas,
  tool-call lifecycle, cancellation, usage, reasoning metadata, retryability,
  and provider-native extensions.
- Put adapters behind contract tests with recorded sanitized fixtures and
  synthetic malformed streams.
- Require idempotency identifiers for tool calls and retries.
- Separate provider output rendering from tool authorization. Model text should
  never be able to directly approve its own tool calls.
- Normalize provider errors through a redacting error type before logs/UI.

### Tool Execution

Threats:

- Model-suggested commands reading/writing outside the active project.
- Shell injection through generated arguments, paths, env vars, or command
  composition.
- Long-running or runaway processes, fork bombs, excessive output, or excessive
  token/log growth.
- Network exfiltration from tools.
- Tool output containing secrets that are then sent back to providers.
- Cancellation only stopping the UI stream while subprocesses continue running.

Mitigations:

- Make tool approvals explicit, durable, scoped, and replayable in audit logs.
- Represent tools as structured invocations rather than arbitrary shell strings
  whenever possible.
- Default cwd to the active project root and enforce path allowlists/denylists
  with canonical path checks.
- Strip provider credentials and unrelated project secrets from tool
  environments.
- Enforce process limits: timeout, output cap, resource cap, cancellation,
  child-process cleanup, and deterministic terminal state.
- Add network policy controls before supporting tools that can reach arbitrary
  hosts.

### Filesystem and Project Isolation

Threats:

- Session context from one project becoming visible or usable in another.
- Symlink/path traversal escaping project boundaries.
- File watchers indexing secrets, dependency caches, `.git`, OS keychains, or
  unrelated directories.
- Durable sessions retaining deleted project files or sensitive tool output
  without user awareness.
- Remote backend gaining broad filesystem assumptions from embedded mode.

Mitigations:

- Use canonical path resolution for all project-relative operations and reject
  paths outside the project root unless explicitly approved.
- Store project metadata separately from provider credentials and global app
  settings.
- Treat session transcripts as sensitive data; provide deletion/export controls
  before broad usage.
- Make indexing explicit and exclude common secret/cache/build paths by default.
- In remote mode, do not assume local filesystem access. Model file operations
  as explicit client-mediated capabilities or remote project mounts.

### Streaming Protocols

Threats:

- Partial events leaving session state inconsistent after stop/retry/crash.
- Cancellation races producing late tokens or late tool calls after the user
  stops a run.
- Malformed provider events breaking parser state or crashing the renderer.
- Backpressure failures causing memory growth.
- Cross-session event routing bugs in multi-session/multi-agent flows.

Mitigations:

- Use a typed stream event envelope with run ID, session ID, monotonic sequence,
  event kind, payload schema version, and terminal state.
- Persist stream state transactionally enough to recover or mark runs as
  interrupted after app restart.
- Make cancellation idempotent and test late-event handling.
- Enforce event size limits and parser failure isolation.
- Never route stream events by "currently selected session"; route by trusted
  backend IDs.

### Updates and Plugins

Threats:

- Unsigned or compromised updates replacing desktop or backend code.
- Plugins gaining unchecked access to credentials, filesystem, network, or IPC.
- Dependency confusion and install-time scripts in adapter/plugin packages.
- Plugin migrations corrupting durable session data.
- A plugin changing provider behavior without visible provenance.

Mitigations:

- Require signed application updates and verify signatures before install.
- Define plugin permissions before supporting third-party plugins: filesystem,
  network, provider credentials, tools, UI surfaces, and persistence.
- Use manifest validation, explicit user approval, and least privilege defaults.
- Disable install-time code execution wherever practical for plugins/adapters.
- Add migration tests and rollback behavior for persisted data version changes.

### Multi-Session Agents

Threats:

- Specialist sub-sessions inheriting broader project, tool, or credential
  privileges than intended.
- Parent/child sessions confusing approval ownership or hiding side effects.
- Concurrent agents racing on files, session state, provider budgets, or tool
  approvals.
- Logs and UI failing to show which agent/session performed an action.

Mitigations:

- Model session hierarchy explicitly with parent run IDs, child session IDs,
  actor labels, and scoped permissions.
- Make approvals bind to actor, project, tool, arguments, and expiry.
- Lock or conflict-detect shared mutable resources such as files and session
  records.
- Surface active actor/session/project/provider/model at the point of action,
  not only in global chrome.

### Logs, Diagnostics, and Telemetry

Threats:

- Secrets, prompts, completions, tool output, file contents, or account metadata
  written to local logs.
- Crash reports including database snapshots, environment variables, or stream
  payloads.
- Debug logging staying enabled in release builds.
- Logs from embedded and remote backends having different redaction behavior.

Mitigations:

- Define a redaction layer used by renderer, main, backend, adapters, and tests.
- Use structured logs with explicit sensitivity fields instead of interpolated
  arbitrary objects.
- Disable verbose provider/tool logs by default in packaged builds.
- Add log-retention and user deletion behavior before collecting substantial
  diagnostics.
- Verify redaction with seeded fake secrets across error paths.

## Automated Verification Matrix

| Area                         | Unit                                                              | Contract                                                        | Integration                                                           | E2E/package                                                                             | Failure injection                                                             |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Renderer/preload/main        | IPC schema tests, URL sanitizer tests, markdown sanitizer tests   | Preload API shape snapshot                                      | Renderer invokes only allowed IPC and receives authorization failures | Packaged app with `nodeIntegration=false`, CSP present, external link handling verified | Malformed IPC payloads, malicious markdown, stale visible project             |
| Embedded/remote backend      | Protocol version parser, auth/session state machine               | Shared client/backend protocol fixtures                         | Same first-slice flow against embedded and remote backend             | Packaged app connects to embedded by default and remote by explicit config              | Backend unavailable, stale client version, TLS failure, interrupted migration |
| OAuth/API keys               | Secret redaction tests, provider credential type tests            | Credential storage contract per provider/kind                   | Keychain read/write/delete and adapter credential scoping             | Packaged build stores no secrets in app DB/logs                                         | Provider 401/403, revoked key, fake secret in thrown error                    |
| Provider adapters            | Stream parser, cancellation, retry classification                 | Adapter conformance fixtures for deltas/tool calls/usage/errors | Live or mocked streaming conversation with stop/retry                 | One configured provider completes success criterion                                     | Malformed stream event, late event after cancel, duplicate retry              |
| Tool execution               | Path canonicalization, env filtering, command argument validation | Tool invocation schema and approval record fixtures             | Approved tool runs inside active project and denial is enforced       | Packaged app records approval and cleans process on cancel                              | Timeout, large output, child process survives parent, symlink escape          |
| Filesystem/project isolation | Project ID/path mapping, ignore rules, transcript sensitivity     | Persistence schema migration fixtures                           | Two projects with separate sessions/providers/files                   | Restart app and verify no cross-project leakage                                         | Symlink traversal, deleted project path, permission denied                    |
| Streaming/session durability | Event envelope validation, sequence handling                      | Stream transcript format fixtures                               | Stop/retry/reopen preserves terminal/interrupted state                | App restart during streaming shows recoverable state                                    | Out-of-order events, duplicate terminal events, crash mid-stream              |
| Updates/plugins              | Manifest validation, permission parser                            | Plugin/update manifest schema fixtures                          | Plugin disabled by default and cannot access ungranted capability     | Packaged update signature check path exercised                                          | Invalid signature, plugin migration failure, missing permission               |
| Multi-session agents         | Parent/child permission and actor tests                           | Session lineage schema fixtures                                 | Concurrent child sessions cannot cross approvals/projects             | UI shows actor/project/provider for each running action                                 | Race on same file/session, child cancel, parent restart                       |
| Logs/diagnostics             | Redaction property tests with seeded tokens                       | Structured log schema fixtures                                  | Errors from adapter/tool/backend are redacted consistently            | Release package has debug logs off by default                                           | Crash report with env vars, provider error with fake key                      |
| Accessibility                | Component semantics, focus-trap tests                             | Design-system accessibility contract                            | Keyboard-only first-slice flow                                        | Packaged app passes automated axe checks on key screens                                 | Streaming updates, modal approvals, error toasts, reconnect states            |
| Version skew                 | Feature flag negotiation tests                                    | Client/backend compatibility matrix fixtures                    | N-1/N/N+1 client-backend handshake                                    | Remote backend mismatch gives clear blocked state                                       | Unknown event kind, unsupported tool feature, migration required              |

Minimum automation expectations for Phase 0:

- Unit tests run on every PR.
- Contract tests run for every provider adapter and protocol change.
- Integration tests run for embedded and remote backend modes.
- E2E/package tests run before release candidates on macOS at minimum.
- Failure injection is part of CI for stream cancellation, backend disconnects,
  malformed provider events, and secret redaction.

## P0 Release Gates

P0 gates block any public or dogfood release of the first vertical slice:

1. Renderer is not privileged: `contextIsolation` on, `nodeIntegration` off,
   strict preload API, and no generic IPC bridge.
2. Every IPC/backend mutation validates schema and authorization against
   trusted project/session/backend state.
3. Provider credentials are stored in OS credential storage or an equivalent
   encrypted secret store, never plaintext session/project files.
4. Logs, errors, crash output, and test artifacts redact seeded fake secrets
   across renderer, main, backend, adapter, and tool paths.
5. Active project, backend, provider, and model are sourced from backend state
   and visible before sending, stopping, retrying, or approving tools.
6. Tool execution requires explicit user approval, scoped project cwd, env
   filtering, timeout, output cap, and cancellation cleanup.
7. Filesystem access rejects symlink/path traversal outside the active project
   unless a distinct explicit approval model exists.
8. Streaming events carry stable run/session IDs and cancellation is idempotent;
   late events after cancel cannot create tool calls or mutate completed state.
9. Embedded and remote backend modes pass the same first-slice contract and
   integration tests, including version handshake failure.
10. No subscription-backed provider integration uses cookies, reverse-engineered
    private endpoints, browser-session scraping, entitlement spoofing, or
    undocumented OAuth flows.
11. Packaged app tests verify security-sensitive Electron settings and the
    first success criterion after restart.
12. Accessibility smoke tests cover keyboard navigation and screen-reader
    semantics for project creation, provider setup, chat streaming, stop/retry,
    and tool approval dialogs.

## P1 Release Gates

P1 gates can follow initial private dogfood only if there is no exposure to
untrusted users or third-party plugins, but they should block a broader beta:

1. Signed update verification and rollback behavior are implemented and tested.
2. Plugin permission model, manifest validation, and install/enable audit trail
   exist before third-party plugins are supported.
3. Remote backend supports explicit session revocation, TLS-only non-loopback
   connections, and clear client/backend version compatibility policy.
4. Provider adapter contract includes usage accounting, retry classification,
   cancellation semantics, tool-call lifecycle, and reasoning metadata handling.
5. Session deletion/export controls exist for sensitive transcripts and tool
   outputs.
6. Project indexing has default ignore rules for secrets, caches, build output,
   `.git`, dependency folders, and OS credential locations.
7. Multi-session agent lineage and approval ownership are visible in UI and
   persisted in audit records.
8. Failure injection covers provider rate limits, backend disconnect, database
   migration failure, corrupt session records, and partial stream replay.
9. Accessibility coverage expands to persisted sessions, reconnect/error states,
   settings, provider management, and nested agent views.
10. Remote-backend tests cover N-1/N/N+1 client/backend compatibility for at
    least handshake, streaming, cancellation, and tool approval denial.

## Review Findings for Phase 0 Planning

Severity: High

The product direction combines high-privilege desktop automation with external
provider credentials and durable project state. Without early enforcement of
project-scoped authorization and tool approval semantics, later refactors will
likely preserve unsafe assumptions. The first vertical slice should implement
the approval and project-boundary model before expanding provider support.

Severity: High

Subscription-backed provider access is explicitly risky. The product should not
ship any integration that depends on reverse-engineered browser behavior,
private endpoints, copied cookies, or entitlement spoofing. Keep Phase 0
provider support to documented API-key or documented OAuth flows.

Severity: Medium

Remote backend support is a product requirement but cloud multi-tenancy and a
public relay are non-goals. This is compatible if the first release treats
remote mode as a single-user, explicitly configured backend with TLS, identity
display, and version handshake. It is not compatible with an implicit hosted
service model.

Severity: Medium

The initial success criterion includes stop/retry and restart durability.
Streaming protocol tests must cover cancellation races and app restart during
active streams; otherwise the application can appear correct in happy-path demos
while corrupting sessions or duplicating tool side effects.

## Recommended First QA Milestones

1. Write executable tests for P0 gates before broad feature work: Electron
   security settings, preload API shape, IPC authorization, credential storage,
   path isolation, stream cancellation, and log redaction.
2. Define the provider adapter contract with fixtures before adding the second
   provider.
3. Run the same project/provider/chat/restart flow against embedded and remote
   backends from the start.
4. Add failure-injection fixtures while the architecture is still small:
   malformed stream events, revoked credential, backend disconnect, symlink
   escape, timeout, and seeded secret in every error channel.
5. Treat OAuth/subscription providers as a separate reviewed feature, not as an
   adapter variant hidden behind the same configuration UI as API keys.
