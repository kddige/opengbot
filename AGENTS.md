<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `bunx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# OpenGBot Engineering Guide

- Preserve Electron context isolation. Renderer code must not import Node or
  Electron main-process modules.
- Keep domain code transport-independent; embedded and remote backends must use
  the same versioned protocol contract.
- Provider-specific behavior belongs behind capability-oriented adapters.
- Secrets never enter renderer state, logs, fixtures, or `.agents-workspace`.
- Project paths and tool grants are explicit capabilities, not ambient access.
- The active project, backend target, provider, and model must remain visible.
- Read `.agents-workspace/INDEX.md` before architecture work.
- Record accepted cross-cutting choices under `.agents-workspace/decisions/`.
