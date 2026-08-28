import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  chatSessionSummarySchema,
  modelSelectionSchema,
  projectSummarySchema,
  type ChatSessionSummary,
  type ModelSelection,
  type ProjectSummary,
} from "@opengbot/protocol";
import { z } from "zod";

export interface PersistedBackendState {
  activeProject: ProjectSummary | null;
  activeSession: ChatSessionSummary | null;
  selections: Record<string, ModelSelection>;
}

const emptyState: PersistedBackendState = {
  activeProject: null,
  activeSession: null,
  selections: {},
};

const storedBackendStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  activeProject: projectSummarySchema.nullable(),
  activeSession: chatSessionSummarySchema.nullable(),
});

const storedBackendStateSchema = z.object({
  schemaVersion: z.literal(1),
  activeProject: projectSummarySchema.nullable(),
  activeSession: chatSessionSummarySchema.nullable(),
  selections: z.record(z.string(), modelSelectionSchema),
});

export function projectIdForRoot(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 20);
}

export function chatSessionForSelection(selection: ModelSelection): ChatSessionSummary {
  const selectionId = createHash("sha256")
    .update(`${selection.integrationId}\0${selection.modelId}`)
    .digest("hex")
    .slice(0, 12);
  return {
    id: `session:${selection.projectId}:root:${selectionId}`,
    projectId: selection.projectId,
    threadId: `thread:${selection.projectId}:root:${selectionId}`,
    displayName: "Root bot",
  };
}

export interface ProjectStore {
  load(): Promise<PersistedBackendState>;
  save(state: PersistedBackendState): Promise<void>;
}

export class MemoryProjectStore implements ProjectStore {
  #state: PersistedBackendState = structuredClone(emptyState);

  async load(): Promise<PersistedBackendState> {
    return structuredClone(this.#state);
  }

  async save(state: PersistedBackendState): Promise<void> {
    this.#state = structuredClone(state);
  }
}

export class FileProjectStore implements ProjectStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async load(): Promise<PersistedBackendState> {
    try {
      const stored: unknown = JSON.parse(await readFile(this.#file, "utf8"));
      const current = storedBackendStateSchema.safeParse(stored);
      const legacy = storedBackendStateV1Schema.safeParse(stored);
      if (!current.success && !legacy.success) return structuredClone(emptyState);
      const activeProject = current.success
        ? current.data.activeProject
        : legacy.success
          ? legacy.data.activeProject
          : null;
      const activeSession = current.success
        ? current.data.activeSession
        : legacy.success
          ? legacy.data.activeSession
          : null;
      const selections = current.success ? current.data.selections : {};
      if (activeProject === null && activeSession === null) return structuredClone(emptyState);
      if (activeProject === null || activeSession === null) return structuredClone(emptyState);

      let canonicalRoot: string;
      try {
        canonicalRoot = await realpath(activeProject.root);
        if (!(await stat(canonicalRoot)).isDirectory()) return structuredClone(emptyState);
      } catch {
        return structuredClone(emptyState);
      }

      const expectedProjectId = projectIdForRoot(canonicalRoot);
      const selection = selections[expectedProjectId];
      const expectedSession = selection
        ? chatSessionForSelection(selection)
        : {
            id: `session:${expectedProjectId}:root`,
            projectId: expectedProjectId,
            threadId: `thread:${expectedProjectId}:root`,
            displayName: "Root bot",
          };
      if (
        canonicalRoot !== activeProject.root ||
        activeProject.id !== expectedProjectId ||
        activeSession.projectId !== expectedProjectId ||
        activeSession.id !== expectedSession.id ||
        activeSession.threadId !== expectedSession.threadId
      ) {
        return structuredClone(emptyState);
      }
      const validatedSelections = Object.fromEntries(
        Object.entries(selections).filter(([projectId, candidate]) => {
          return candidate.projectId === projectId;
        }),
      );
      return { activeProject, activeSession, selections: validatedSelections };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) {
        return structuredClone(emptyState);
      }
      throw error;
    }
  }

  async save(state: PersistedBackendState): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true });
    const temporaryFile = `${this.#file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify({ schemaVersion: 1, ...state }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryFile, this.#file);
  }
}
