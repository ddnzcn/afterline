import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { WorkerReply, WorkerTask } from "./worker";

export class AnalysisCancelledError extends Error {
  override name = "AnalysisCancelledError";
  constructor() {
    super("Analysis cancelled.");
  }
}

interface Pending {
  task: WorkerTask;
  resolve: (reply: Extract<WorkerReply, { ok: true }>["analyses"]) => void;
  reject: (error: Error) => void;
  cleanup?: () => void;
}

/** Fixed-size pool of analysis workers; tasks queue when all workers are busy. */
export class AnalysisPool {
  readonly #idle: Worker[] = [];
  readonly #busy = new Map<Worker, Pending>();
  readonly #queue: Pending[] = [];
  readonly size: number;
  #nextId = 0;

  constructor(size = Math.max(1, availableParallelism() - 1)) {
    this.size = size;
    for (let i = 0; i < size; i++) this.#idle.push(this.#spawn());
  }

  run(task: Omit<WorkerTask, "id">, signal?: AbortSignal): Promise<Extract<WorkerReply, { ok: true }>["analyses"]> {
    if (signal?.aborted) return Promise.reject(new AnalysisCancelledError());
    return new Promise((resolve, reject) => {
      const pending: Pending = { task: { ...task, id: this.#nextId++ }, resolve, reject };
      if (signal) {
        const onAbort = (): void => {
          const idx = this.#queue.indexOf(pending);
          if (idx === -1) return;
          this.#queue.splice(idx, 1);
          pending.cleanup?.();
          reject(new AnalysisCancelledError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pending.cleanup = () => signal.removeEventListener("abort", onAbort);
      }
      this.#queue.push(pending);
      this.#drain();
    });
  }

  async close(): Promise<void> {
    while (this.#queue.length > 0) {
      const pending = this.#queue.shift()!;
      pending.cleanup?.();
      pending.reject(new AnalysisCancelledError());
    }
    await Promise.all([...this.#idle, ...this.#busy.keys()].map((w) => w.terminate()));
  }

  #spawn(): Worker {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
    worker.on("message", (reply: WorkerReply) => {
      const pending = this.#busy.get(worker);
      this.#busy.delete(worker);
      this.#idle.push(worker);
      if (pending) {
        pending.cleanup?.();
        if (reply.ok) pending.resolve(reply.analyses);
        else pending.reject(new Error(reply.error));
      }
      this.#drain();
    });
    worker.on("error", (error: unknown) => {
      const pending = this.#busy.get(worker);
      this.#busy.delete(worker);
      pending?.cleanup?.();
      pending?.reject(error instanceof Error ? error : new Error(String(error)));
      this.#idle.push(this.#spawn());
      this.#drain();
    });
    return worker;
  }

  #drain(): void {
    while (this.#idle.length > 0 && this.#queue.length > 0) {
      const worker = this.#idle.pop()!;
      const next = this.#queue.shift()!;
      next.cleanup?.();
      this.#busy.set(worker, next);
      worker.postMessage(next.task);
    }
  }
}
