# ADR 005: Adopt a normative product design contract

- Status: Accepted
- Date: 2026-08-28

## Context

The first desktop slice established technical behavior but not a coherent visual
or interaction language. shadcn supplies accessible components; it does not
define OpenGBot's product hierarchy, native window behavior, focus, selection,
pointer semantics, or quality bar.

## Decision

Root [`DESIGN.md`](../../DESIGN.md) is the normative contract for all UI/UX work.
It defines the native shell, product hierarchy, visual system, interaction
patterns, chat/run experience, accessibility requirements, and visual QA gate.

Agents and contributors must read it before user-facing changes. Reference
products and design research remain inputs only. Intentional deviations must be
explained and may not weaken accessibility or platform behavior.

We retain the standard Radix Nova shadcn foundation. OpenGBot's product identity
comes from composition, semantic tokens, behavior, and detail rather than a fork
of the component API.

## Consequences

- UI reviews have a stable, testable standard beyond subjective preference.
- Native behavior, selection, focus, and failure states are designed alongside
  visuals instead of patched later.
- Existing first-slice UI is explicitly treated as design debt, not precedent.
- Every user-facing change now includes running Electron visual and interaction
  QA at the documented sizes and themes.
