import {
  PROTOCOL_VERSION,
  clientHelloSchema,
  type BackendControl,
  type BackendMode,
  type BackendSnapshot,
  type ClientHello,
} from "@opengbot/protocol";

export interface BackendServiceOptions {
  backendId: string;
  backendVersion: string;
  mode: BackendMode;
}

export class BackendService implements BackendControl {
  readonly #options: BackendServiceOptions;

  constructor(options: BackendServiceOptions) {
    this.#options = options;
  }

  async handshake(input: ClientHello): Promise<BackendSnapshot> {
    clientHelloSchema.parse(input);

    return {
      protocolVersion: PROTOCOL_VERSION,
      backendId: this.#options.backendId,
      backendVersion: this.#options.backendVersion,
      mode: this.#options.mode,
      status: "needs_setup",
      activeProject: null,
      activeIntegration: null,
      features: {
        remote: true,
        projects: false,
        chat: false,
        childSessions: false,
      },
    };
  }
}
