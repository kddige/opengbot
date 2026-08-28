import { describe, expect, test } from "bun:test";

import { PROTOCOL_VERSION } from "@opengbot/protocol";

import { createDaemon } from "./app";

describe("remote daemon", () => {
  test("uses the shared handshake contract", async () => {
    const app = createDaemon({ backendId: "remote:test" });
    const response = await app.request("/v1/handshake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        clientVersion: "0.0.0",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      backendId: "remote:test",
      mode: "remote",
    });
  });
});
