import { describe, expect, test } from "bun:test";

import { PROTOCOL_VERSION } from "@opengbot/protocol";

import { BackendService } from "./index";

describe("BackendService", () => {
  test("reports its deployment identity", async () => {
    const backend = new BackendService({
      backendId: "embedded:test",
      backendVersion: "0.0.0",
      mode: "embedded",
    });

    const snapshot = await backend.handshake({
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: "0.0.0",
    });

    expect(snapshot).toMatchObject({
      backendId: "embedded:test",
      mode: "embedded",
      status: "needs_setup",
    });
  });
});
