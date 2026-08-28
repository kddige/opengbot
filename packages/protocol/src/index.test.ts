import { describe, expect, test } from "bun:test";

import { PROTOCOL_VERSION, backendSnapshotSchema, clientHelloSchema } from "./index";

describe("control protocol", () => {
  test("rejects incompatible clients", () => {
    const result = clientHelloSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION + 1,
      clientVersion: "0.0.0",
    });

    expect(result.success).toBe(false);
  });

  test("requires visible backend and capability state", () => {
    const snapshot = backendSnapshotSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      backendId: "local",
      backendVersion: "0.0.0",
      mode: "embedded",
      status: "needs_setup",
      activeProject: null,
      activeIntegration: null,
      features: {
        remote: true,
        projects: false,
        chat: false,
        childSessions: false,
      },
    });

    expect(snapshot.backendId).toBe("local");
  });
});
