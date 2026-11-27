import { randomUUID } from "node:crypto";

import {
  assertSupported,
  mergeSettings,
  simulateGame,
  summarizeGame,
  toEngineConfig,
  type AnalyzerSettings,
  type GameSummary,
  type ParsedReplay,
  type PlayerGame,
  type RecordedStats,
  type SimStats,
  type Snapshot,
  type SnapshotAnalysis
} from "@tta/core";

import type { WorkerTask } from "./worker";

/** Anything that can analyze a chunk of snapshots (the worker pool, or an in-process runner in tests). */
export interface AnalysisRunner {
  run(task: Omit<WorkerTask, "id">): Promise<SnapshotAnalysis[]>;
}

export interface RoundResult {
  roundIndex: number;
  username: string;
  snapshots: Snapshot[];
  analyses: SnapshotAnalysis[];
  summary: GameSummary;
  stats: SimStats;
  recordedStats: RecordedStats | null;
  /** The player's recorded inputs and options, so the UI can replay the game frame by frame. */
  game: PlayerGame;
}

export interface AnalysisResult {
  meta: { replayId: string; kind: string; gamemode: string | null; ts: string; player: string; settings: AnalyzerSettings };
  rounds: RoundResult[];
}

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  done: number;
  total: number;
  /** Per-round progress, in the order the rounds were requested. */
  rounds: { roundIndex: number; done: number; total: number }[];
  result?: AnalysisResult;
  error?: string;
  createdAt: number;
}

const CHUNK = 6;
const MAX_JOBS = 50;
const MAX_REPLAYS = 50;

export class JobStore {
  readonly #replays = new Map<string, ParsedReplay>();
  readonly #jobs = new Map<string, Job>();

  constructor(private readonly pool: AnalysisRunner) {}

  addReplay(replay: ParsedReplay): string {
    const id = randomUUID();
    this.#replays.set(id, replay);
    evictOldest(this.#replays, MAX_REPLAYS);
    return id;
  }

  getReplay(id: string): ParsedReplay | undefined {
    return this.#replays.get(id);
  }

  getJob(id: string): Job | undefined {
    return this.#jobs.get(id);
  }

  start(replayId: string, replay: ParsedReplay, games: PlayerGame[]): Job {
    const settings = mergeSettings();
    const job: Job = { id: randomUUID(), status: "running", done: 0, total: 0, rounds: [], createdAt: Date.now() };
    this.#jobs.set(job.id, job);
    evictOldest(this.#jobs, MAX_JOBS);

    void this.#run(job, replayId, replay, games, settings).catch((error: unknown) => {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
    });
    return job;
  }

  async #run(job: Job, replayId: string, replay: ParsedReplay, games: PlayerGame[], settings: AnalyzerSettings): Promise<void> {
    for (const g of games) assertSupported(g);
    const sims = games.map((g) => ({ game: g, sim: simulateGame(g, replay.ts), config: toEngineConfig(g, replay.ts) }));
    job.total = sims.reduce((n, s) => n + s.sim.snapshots.length, 0);
    job.rounds = sims.map((s) => ({ roundIndex: s.game.roundIndex, done: 0, total: s.sim.snapshots.length }));

    const rounds = await Promise.all(
      sims.map(async ({ game, sim, config }, roundPos) => {
        const configKey = `${replayId}:${game.roundIndex}:${game.playerId}`;
        const lookahead = settings.search.depth - 1;
        const starts: number[] = [];
        for (let i = 0; i < sim.snapshots.length; i += CHUNK) starts.push(i);
        const parts = await Promise.all(
          starts.map(async (start) => {
            const count = Math.min(CHUNK, sim.snapshots.length - start);
            const snapshots = sim.snapshots.slice(start, start + count + lookahead);
            const analyses = await this.pool.run({ configKey, config, settings, snapshots, count });
            job.done += count;
            job.rounds[roundPos]!.done += count;
            return analyses;
          })
        );
        const analyses = parts.flat();
        return {
          roundIndex: game.roundIndex,
          username: game.username,
          snapshots: sim.snapshots,
          analyses,
          summary: summarizeGame(sim.snapshots, analyses, settings),
          stats: sim.stats,
          recordedStats: game.recordedStats,
          game
        } satisfies RoundResult;
      })
    );

    job.result = {
      meta: { replayId, kind: replay.kind, gamemode: replay.gamemode, ts: replay.ts, player: games[0]?.username ?? "", settings },
      rounds
    };
    job.status = "done";
  }
}

function evictOldest<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}
