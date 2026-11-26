import { parentPort } from "node:worker_threads";

import { analyzeSnapshot, rulesFromConfig, type AnalyzerSettings, type FastRules, type Snapshot, type SnapshotAnalysis, type toEngineConfig } from "@tta/core";

type EngineInitializeParams = ReturnType<typeof toEngineConfig>;

export interface WorkerTask {
  id: number;
  configKey: string;
  config: EngineInitializeParams;
  settings: AnalyzerSettings;
  snapshots: Snapshot[];
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
    const analyses = task.snapshots.map((s) => analyzeSnapshot(s, rules!, task.settings));
    parentPort!.postMessage({ id: task.id, ok: true, analyses } satisfies WorkerReply);
  } catch (error: unknown) {
    parentPort!.postMessage({ id: task.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerReply);
  }
});
