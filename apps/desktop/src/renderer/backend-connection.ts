import type { BackendSnapshot, ChatStartPayload } from "@opengbot/protocol";
import type { StreamChunk, UIMessage } from "@tanstack/ai";
import type { ConnectConnectionAdapter } from "@tanstack/ai-react";

type QueueWaiter = {
  resolve: (result: IteratorResult<StreamChunk>) => void;
  reject: (error: Error) => void;
};

class StreamQueue implements AsyncIterable<StreamChunk> {
  readonly #chunks: StreamChunk[] = [];
  readonly #waiters: QueueWaiter[] = [];
  #ended = false;
  #error: Error | undefined;

  push(chunk: StreamChunk): void {
    if (this.#ended) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve({ value: chunk, done: false });
    else this.#chunks.push(chunk);
  }

  end(): void {
    if (this.#ended) return;
    this.#ended = true;
    for (const waiter of this.#waiters.splice(0)) waiter.resolve({ value: undefined, done: true });
  }

  fail(error: Error): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#error = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
    return {
      next: () => {
        const chunk = this.#chunks.shift();
        if (chunk) return Promise.resolve({ value: chunk, done: false });
        if (this.#error) return Promise.reject(this.#error);
        if (this.#ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => this.#waiters.push({ resolve, reject }));
      },
    };
  }
}

export function createBackendConnection(snapshot: BackendSnapshot): ConnectConnectionAdapter {
  const project = snapshot.activeProject;
  const integration = snapshot.activeIntegration;
  const session = snapshot.activeSession;
  if (!project || !integration || !session) throw new Error("The active chat is incomplete.");

  return {
    connect(messages, _data, abortSignal, runContext) {
      if (!runContext) throw new Error("TanStack AI did not supply a run context.");
      const queue = new StreamQueue();
      const payload: ChatStartPayload = {
        projectId: project.id,
        integrationId: integration.id,
        sessionId: session.id,
        threadId: runContext.threadId,
        runId: runContext.runId,
        ...(runContext.parentRunId ? { parentRunId: runContext.parentRunId } : {}),
        messages: messages as UIMessage[],
      };

      const abort = () => {
        void window.opengbot.cancelChat(payload.runId);
        queue.end();
      };
      if (abortSignal?.aborted) {
        queue.end();
        return queue;
      }
      abortSignal?.addEventListener("abort", abort, { once: true });

      if (window.opengbot.isDevSmoke()) console.info("opengbot:connect-run");
      void window.opengbot
        .chat(payload, (chunk) => {
          if (window.opengbot.isDevSmoke()) console.info(`opengbot:transport-chunk:${chunk.type}`);
          queue.push(chunk);
        })
        .then(() => {
          if (window.opengbot.isDevSmoke()) console.info("opengbot:transport-end");
          queue.end();
        })
        .catch((error: unknown) => {
          if (abortSignal?.aborted) queue.end();
          else queue.fail(error instanceof Error ? error : new Error("The chat stream failed."));
        });

      return queue;
    },
  };
}
