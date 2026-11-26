import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { WorkerReply, WorkerTask } from "./worker";

interface Pending {
  task: WorkerTask;
  resolve: (reply: Extract<WorkerReply, { ok: true }>["analyses"]) => void;
  reject: (error: Error) => void;
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

  run(task: Omit<WorkerTask, "id">): Promise<Extract<WorkerReply, { ok: true }>["analyses"]> {
    return new Promise((resolve, reject) => {
      this.#queue.push({ task: { ...task, id: this.#nextId++ }, resolve, reject });
      this.#drain();
    });
  }

  async close(): Promise<void> {
    await Promise.all([...this.#idle, ...this.#busy.keys()].map((w) => w.terminate()));
  }

  #spawn(): Worker {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
    worker.on("message", (reply: WorkerReply) => {
      const pending = this.#busy.get(worker);
      this.#busy.delete(worker);
      this.#idle.push(worker);
      if (pending) {
        if (reply.ok) pending.resolve(reply.analyses);
        else pending.reject(new Error(reply.error));
      }
      this.#drain();
    });
    worker.on("error", (error: unknown) => {
      const pending = this.#busy.get(worker);
      this.#busy.delete(worker);
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
      this.#busy.set(worker, next);
      worker.postMessage(next.task);
    }
  }
}
