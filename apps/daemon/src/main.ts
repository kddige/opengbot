import { acquireOpenGBotHome, FileProjectStore, resolveOpenGBotHome } from "@opengbot/backend";

import { createDaemon } from "./app";

const hostname = process.env.OPENGBOT_HOST ?? "127.0.0.1";
const port = Number(process.env.OPENGBOT_PORT ?? "47831");
const appHome = resolveOpenGBotHome();
const appHomeLease = await acquireOpenGBotHome(appHome);

const server = Bun.serve({
  fetch: createDaemon({ projectStore: new FileProjectStore(appHome.registryFile) }).fetch,
  hostname,
  port,
});

console.info(`OpenGBot daemon listening on ${server.url.origin}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop(true);
  await appHomeLease.close();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
