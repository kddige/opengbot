# Team Charter

## Roles

### Controller / integrator

Owns product synthesis, task routing, architecture acceptance, integration, and
the user-facing handoff. Uses the strongest available reasoning model for
cross-cutting decisions and final review.

### Product and ecosystem researcher

Maps comparable products, current framework capabilities, provider access
methods, authentication constraints, and applicable licenses. A faster model is
appropriate for broad collection; disputed or consequential conclusions are
escalated to the controller.

### Systems engineer

Designs and implements the desktop/backend split, protocol, persistence,
provider adapters, tool runtime, and vertical slices. Uses a frontier coding
model because errors here compound across the system.

### QA and security reviewer

Builds the test strategy, threat model, trust-boundary review, failure matrix,
and release gates. Uses a strong reasoning model and remains independent from
the implementation path it reviews.

## Collaboration protocol

1. Each assignment has a bounded output file and explicit questions.
2. Facts include primary sources; inference is labeled as inference.
3. Architecture proposals identify tradeoffs, rejected alternatives, and
   migration paths.
4. Reviews prioritize security, data loss, provider-account risk, process
   isolation, protocol compatibility, and accessibility.
5. The controller resolves conflicts and records accepted choices in `decisions/`.
6. Long-running agents may be reused for continuity, but documents remain the
   source of truth.

## Model allocation principle

Use cheaper/faster models for search-space expansion, inventory, repetitive
classification, and summarization. Use frontier models for protocol design,
security judgments, integration, ambiguous debugging, and final acceptance.
