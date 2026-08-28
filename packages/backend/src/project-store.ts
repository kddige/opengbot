import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  chatSessionSummarySchema,
  projectSummarySchema,
  type ChatSessionSummary,
  type ProjectSummary,
} from "@opengbot/protocol";
import { z } from "zod";

export interface PersistedBackendState {
  activeProject: ProjectSummary | null;
  activeSession: ChatSessionSummary | null;
}

const emptyState: PersistedBackendState = {
  activeProject: null,
  activeSession: null,
};

const storedBackendStateSchema = z.object({
  schemaVersion: z.literal(1),
  activeProject: projectSummarySchema.nullable(),
  activeSession: chatSessionSummarySchema.nullable(),
});

export function projectIdForRoot(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 20);
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
      const parsed = storedBackendStateSchema.safeParse(
        JSON.parse(await readFile(this.#file, "utf8")),
      );
      if (!parsed.success) return structuredClone(emptyState);
      const { activeProject, activeSession } = parsed.data;
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
      if (
        canonicalRoot !== activeProject.root ||
        activeProject.id !== expectedProjectId ||
        activeSession.projectId !== expectedProjectId ||
        activeSession.id !== `session:${expectedProjectId}:root` ||
        activeSession.threadId !== `thread:${expectedProjectId}:root`
      ) {
        return structuredClone(emptyState);
      }
      return { activeProject, activeSession };
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
