import { fileURLToPath } from "node:url";

import { DEV_SMOKE_READY_MARKER } from "../apps/desktop/src/dev-smoke";

const timeoutMs = 30_000;
let timedOut = false;

const child = Bun.spawn(["bun", "run", "--filter", "@opengbot/desktop", "dev"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    OPENGBOT_DEV_SMOKE: "1",
  },
  stdin: "inherit",
  stdout: "pipe",
  stderr: "pipe",
});

async function forwardOutput(
  stream: ReadableStream<Uint8Array>,
  write: (chunk: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";

  for await (const bytes of stream) {
    const chunk = decoder.decode(bytes, { stream: true });
    output += chunk;
    write(chunk);
  }

  output += decoder.decode();
  return output;
}

const stdout = forwardOutput(child.stdout, (chunk) => process.stdout.write(chunk));
const stderr = forwardOutput(child.stderr, (chunk) => process.stderr.write(chunk));

function terminateProcessTree(): void {
  if (child.exitCode !== null) return;

  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/pid", String(child.pid), "/t", "/f"], {
      stderr: "ignore",
      stdout: "ignore",
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

const timeout = setTimeout(() => {
  timedOut = true;
  console.error(`OpenGBot development smoke check timed out after ${timeoutMs}ms`);
  terminateProcessTree();
}, timeoutMs);

const exitCode = await child.exited;
clearTimeout(timeout);
const output = (await Promise.all([stdout, stderr])).join("\n");

if (timedOut) process.exit(1);
if (exitCode !== 0) process.exit(exitCode);
if (!output.includes(DEV_SMOKE_READY_MARKER)) {
  console.error("OpenGBot development process exited before the backend handshake completed");
  process.exit(1);
}
