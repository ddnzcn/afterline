import { parentPort } from "node:worker_threads";

import { analyzeSnapshot, rulesFromConfig, type AnalyzerSettings, type FastRules, type Snapshot, type SnapshotAnalysis, type toEngineConfig } from "@tta/core";

type EngineInitializeParams = ReturnType<typeof toEngineConfig>;

export interface WorkerTask {
  id: number;
  configKey: string;
  config: EngineInitializeParams;
  settings: AnalyzerSettings;
  /** The snapshots to analyze followed by up to depth-1 more, so each can see what was played next. */
  snapshots: Snapshot[];
  /** How many of `snapshots` to analyze (the rest are lookahead only). */
  count: number;
}

export type WorkerReply = { id: number; ok: true; analyses: SnapshotAnalysis[] } | { id: number; ok: false; error: string };

const rulesCache = new Map<string, FastRules>();

parentPort?.on("message", (task: WorkerTask) => {
  try {
    let rules = rulesCache.get(task.configKey);
    if (!rules) {
      rules = rulesFromConfig(task.config);
      rulesCache.set(task.configKey, rules);
    }
    const depth = task.settings.search.depth;
    const analyses = task.snapshots
      .slice(0, task.count)
      .map((s, i) => analyzeSnapshot(s, rules!, task.settings, task.snapshots.slice(i + 1, i + depth)));
    parentPort!.postMessage({ id: task.id, ok: true, analyses } satisfies WorkerReply);
  } catch (error: unknown) {
    parentPort!.postMessage({ id: task.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerReply);
  }
});
