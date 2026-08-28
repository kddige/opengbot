# ADR 001: Adopt TanStack AI Natively

Status: accepted
Date: 2026-08-28

## Decision

OpenGBot adopts TanStack AI as a foundational architecture dependency. Internal
packages use TanStack's native chat, AG-UI, provider, persistence, harness,
sandbox, memory, approval, interrupt, and tool contracts wherever they fit.

We will not create a generic OpenGBot AI adapter solely to protect against
possible pre-1.0 API changes.

OpenGBot-owned contracts cover orthogonal product concerns:

- project and backend identity;
- client/backend compatibility;
- agent and child-session lineage;
- credential/account mode;
- permissions, approvals, audit, and product policy;
- UI-specific projections that are not alternate AI protocols.

## Rationale

TanStack AI is a deliberate product choice and already covers much of the hard
runtime surface OpenGBot needs. A parallel abstraction would add translation
code, hide useful capabilities, and create two protocols to evolve. Upstream
changes are ordinary upgrade work and should be handled directly with tests and
committed lockfile updates.

## Consequences

- TanStack types may cross OpenGBot package boundaries.
- Upgrades can require coordinated source changes.
- Contract tests focus on OpenGBot policy and deployment seams, not reproducing
  TanStack's event model.
- Provider- or harness-native extensions remain visible through TanStack rather
  than being flattened to a least-common-denominator interface.
