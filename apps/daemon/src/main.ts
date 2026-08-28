import { createDaemon } from "./app";

const hostname = process.env.OPENGBOT_HOST ?? "127.0.0.1";
const port = Number(process.env.OPENGBOT_PORT ?? "47831");

const server = Bun.serve({
  fetch: createDaemon().fetch,
  hostname,
  port,
});

console.info(`OpenGBot daemon listening on ${server.url.origin}`);
