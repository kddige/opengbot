# OpenGBot Agent Workspace

This directory is the project team's durable collaboration surface. It stores
research, decisions, reviews, and handoffs that should survive individual agent
sessions. Application source belongs outside this directory.

## Authority order

1. Current user direction
2. Accepted decision records
3. Current product brief
4. Idea/backlog inputs
5. Research and reviews

Research and reviews are non-binding evidence. They may recommend, warn, or
disagree, but they do not become requirements until accepted in a decision or
brief. Later user direction can supersede any document.

## Working agreement

- The controller owns synthesis, priorities, and final integration.
- Researchers separate verified facts from non-binding recommendations and link
  primary sources wherever possible.
- Engineers record consequential architecture choices as decision records.
- Reviewers report evidence, severity, and a reproducible check for each issue.
- Agents do not silently overwrite another agent's document. Amend it with a
  clearly attributed section or create a review/handoff instead.
- Secrets, tokens, OAuth refresh tokens, and user content never belong here.

## Directory index

- `briefs/`: product briefs and scoped assignments
- `research/`: provider, framework, protocol, and ecosystem findings
- `decisions/`: accepted architecture decision records (ADRs)
- `reviews/`: QA, security, accessibility, and code-review reports
- `handoffs/`: concise continuity notes between sessions
- `INDEX.md`: current state, document map, and open questions
- `TEAM.md`: roles, model allocation, and collaboration protocol
