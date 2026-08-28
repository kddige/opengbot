# ADR 003: Provider-owned CLI authentication

**Status:** Accepted
**Date:** 2026-08-28

## Decision

Codex and Grok are the first subscription-backed harness targets. OpenGBot uses
TanStack AI's native Codex and Grok Build integrations and delegates login to the
official provider CLI running on the backend machine:

- Codex host mode uses the login owned by the official `codex` process.
- Grok host mode uses the login owned by the official `grok` process.

OpenGBot does not read, copy, refresh, or transmit provider CLI token files. API
keys that OpenGBot owns are referenced from the operating-system keychain and
are never exposed to the renderer.

## Why

This supports the user's existing provider login while retaining one credential
owner. It avoids coupling the product to copied grants, hard-coded OAuth client
identifiers, private endpoints, and refresh-token rotation behavior.

## Consequences

- The UI distinguishes provider-managed CLI login from metered API-key mode.
- Login diagnostics direct users to the provider's official CLI flow.
- Direct first-party OAuth may be added later when a provider exposes a suitable
  documented third-party flow; it is not required for the initial harness.
- Credential-file reads are forbidden and covered by security review and tests.
