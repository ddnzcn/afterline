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

export const MAX_RULES_CACHE = 32;

const rulesCache = new Map<string, FastRules>();

/** Return cached FastRules for `key`, refreshing recency and evicting the oldest entry past `max`. */
export function getCachedRules(
  cache: Map<string, FastRules>,
  key: string,
  config: EngineInitializeParams,
  max = MAX_RULES_CACHE
): FastRules {
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const rules = rulesFromConfig(config);
  cache.set(key, rules);
  while (cache.size > max) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  return rules;
}

parentPort?.on("message", (task: WorkerTask) => {
  try {
    const rules = getCachedRules(rulesCache, task.configKey, task.config);
    const depth = task.settings.search.depth;
    const analyses = task.snapshots
      .slice(0, task.count)
      .map((s, i) => analyzeSnapshot(s, rules, task.settings, task.snapshots.slice(i + 1, i + depth)));
    parentPort!.postMessage({ id: task.id, ok: true, analyses } satisfies WorkerReply);
  } catch (error: unknown) {
    parentPort!.postMessage({ id: task.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerReply);
  }
});
