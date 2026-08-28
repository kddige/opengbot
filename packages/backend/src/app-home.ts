import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface OpenGBotHome {
  root: string;
  state: string;
  logs: string;
  cache: string;
  run: string;
  registryFile: string;
}

export interface OpenGBotHomeLease {
  close(): Promise<void>;
}

export function resolveOpenGBotHome(explicitHome = process.env.OPENGBOT_HOME): OpenGBotHome {
  const requested = explicitHome?.trim() || join(homedir(), ".opengbot");
  const root = isAbsolute(requested) ? requested : resolve(requested);
  const state = join(root, "state");
  return {
    root,
    state,
    logs: join(root, "logs"),
    cache: join(root, "cache"),
    run: join(root, "run"),
    registryFile: join(state, "registry.v1.json"),
  };
}

export async function ensureOpenGBotHome(home: OpenGBotHome): Promise<void> {
  await mkdir(home.root, { recursive: true, mode: 0o700 });
  const directories = [home.root, home.state, home.logs, home.cache, home.run];
  await Promise.all(
    directories.slice(1).map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })),
  );
  if (process.platform !== "win32") {
    await Promise.all(directories.map((directory) => chmod(directory, 0o700)));
  }
}

export async function acquireOpenGBotHome(home: OpenGBotHome): Promise<OpenGBotHomeLease> {
  await ensureOpenGBotHome(home);
  const lockFile = join(home.run, "backend.lock");
  const nonce = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, nonce, startedAt: new Date().toISOString() });
  return createHomeLease(lockFile, nonce, contents, true);
}

async function createHomeLease(
  lockFile: string,
  nonce: string,
  contents: string,
  mayRecoverStaleLock: boolean,
): Promise<OpenGBotHomeLease> {
  try {
    const handle = await open(lockFile, "wx", 0o600);
    try {
      await handle.writeFile(`${contents}\n`, "utf8");
    } catch (error) {
      await handle.close();
      await unlink(lockFile).catch(() => undefined);
      throw error;
    }
    await handle.close();
    let closed = false;
    return {
      async close() {
        if (closed) return;
        closed = true;
        try {
          const lock = JSON.parse(await readFile(lockFile, "utf8")) as { nonce?: unknown };
          if (lock.nonce === nonce) await unlink(lockFile);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = await readLockOwner(lockFile);
    if (owner === null) {
      throw new Error(
        "OpenGBot home has an unreadable backend lock; remove it only if no backend is running.",
        { cause: error },
      );
    }
    if (processIsAlive(owner)) {
      throw new Error(`OpenGBot home is already in use by backend process ${owner}.`, {
        cause: error,
      });
    }
    if (!mayRecoverStaleLock) {
      throw new Error("OpenGBot could not acquire its backend home lock.", { cause: error });
    }
    await unlink(lockFile).catch((unlinkError: unknown) => {
      if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
    });
    return createHomeLease(lockFile, nonce, contents, false);
  }
}

async function readLockOwner(lockFile: string): Promise<number | null> {
  try {
    const parsed = JSON.parse(await readFile(lockFile, "utf8")) as { pid?: unknown };
    return typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
