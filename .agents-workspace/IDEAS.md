# Product Idea Inbox

Ideas captured here are inputs, not automatically accepted scope. The controller
links them to research, decisions, or milestones during synthesis.

## 2026-08-28 — TanStack-first harness and multi-agent chats

- Use TanStack AI across the stack wherever its supported packages fit:
  providers, AG-UI streaming, persistence, approvals and interrupts, harnesses,
  sandboxes, memory, and related orchestration facilities.
- OpenGBot-specific abstractions should focus on product concepts TanStack does
  not own: projects, backend identity, agent lineage, scoped permissions,
  provider/account visibility, and policy.
- Explore multi-agent chats as one visible conversation containing explicitly
  attributed parent/child sessions or runs, rather than flattening multiple
  models into one anonymous assistant.
- Follow-up: define how actors, child runs, routing, budgets, approvals, context
  sharing, and concurrent file/tool work appear in persistence and UI.

## 2026-08-28 — Codex and Grok first

- Prioritize Codex and Grok as the first two harness/provider experiences.
- Prefer documented OAuth or host-CLI account flows inspired by auditable
  open-source implementations such as T3 Code or Hermes Agent.
- Keep `host_cli_login`, provider OAuth, and direct API keys visibly distinct.
- Let a host CLI own its token store when possible; do not copy its credentials
  into OpenGBot. Store OAuth material owned by OpenGBot in the OS keychain.
- Follow-up: audit T3 Code, Hermes Agent, TanStack Codex/Grok Build harnesses,
  official provider protocols, licenses, and account terms before accepting an
  implementation pattern.

## 2026-08-28 — Adopt TanStack AI directly

- Treat TanStack AI as a foundational architecture choice, including while its
  packages are pre-1.0.
- Do not add a generic OpenGBot AI adapter solely to insulate against possible
  TanStack API churn.
- Use native TanStack types and event flows across internal package boundaries
  where they fit. Accept normal dependency upgrade work if upstream evolves.
- Add OpenGBot contracts only for orthogonal product concerns such as project
  identity, backend compatibility, actor lineage, credentials, and policy.
