# Workspace Index

## Product thesis

OpenGBot is a desktop-first, open-source multi-provider bot environment. It
combines project-scoped workspaces, durable bot sessions, and interchangeable AI
subscriptions, APIs, and external harnesses. The same desktop client can use an
embedded local backend or connect securely to a separately hosted backend.

## Current phase

Phase 0: foundation and first vertical slice.

## Active documents

- [Initial product brief](briefs/000-initial-product-brief.md)
- [Team charter](TEAM.md)
- [Product idea inbox](IDEAS.md)

## Decision status

- [ADR 001: Adopt TanStack AI natively](decisions/001-adopt-tanstack-ai-natively.md)
- [ADR 002: Embedded utility process and remote daemon](decisions/002-embedded-utility-and-remote-daemon.md)
- [ADR 003: Provider-owned CLI authentication](decisions/003-provider-owned-cli-auth.md)
- [ADR 004: Project-scoped Codex desktop slice](decisions/004-project-scoped-codex-slice.md)

Research and reviews are inputs only. Use accepted ADRs and the current product
brief for normative architecture guidance.

## Open questions

- Should remote clients connect directly to a daemon over TLS, or through a
  rendezvous/relay service in the first release?
- What is the initial sandbox boundary for tools: subprocess, container,
  operating-system sandbox, or a pluggable combination?
