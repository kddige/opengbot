# Initial Product Brief

## Problem

Existing coding/bot clients often treat all work as one undifferentiated project
and tightly couple the experience to a single model provider or proprietary
backend. Users cannot deliberately combine providers with different behavior,
cost, context, and tool-use characteristics.

## Product direction

Build a desktop-only Electron client with:

- explicit, isolated projects and project-scoped context;
- durable bot sessions that can contain ongoing specialist sub-sessions;
- interchangeable provider and harness adapters;
- embedded all-in-one operation by default;
- an optional separately hosted TypeScript backend;
- auditable tool approvals and sandbox boundaries;
- a simple, restrained shadcn-based interface;
- Bun workspaces, current TanStack AI packages, oxlint, and oxfmt.

## Initial success criterion

A user can create a project, configure one provider, start a streaming bot
conversation, stop/retry it, close and reopen the application without losing the
session, and see exactly which project, backend, provider, and model are active.

## Non-goals for the first slice

- Reimplementing a complete coding harness.
- Circumventing provider terms, undocumented protections, or account controls.
- Pretending subscription OAuth and API-key access are equivalent.
- Supporting every provider before the adapter contract has proven itself.
- Cloud multi-tenancy or a public relay service.
