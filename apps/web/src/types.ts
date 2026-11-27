import type { GameSummary, Line, LineStep, MissCategory, PlayerGame, SimStats, Snapshot, SnapshotAnalysis } from "@tta/core";

export type { GameSummary, Line, LineStep, MissCategory, Snapshot, SnapshotAnalysis };

export interface UploadedReplay {
  replayId: string;
  kind: "versus" | "solo";
  gamemode: string | null;
  ts: string;
  players: { id: string; username: string }[];
  games: {
    roundIndex: number;
    playerId: string;
    username: string;
    supported: boolean;
    reason?: string;
    outcome: "won" | "lost" | null;
    pieces: number | null;
    durationMs: number | null;
  }[];
}

export interface RoundResult {
  roundIndex: number;
  username: string;
  snapshots: Snapshot[];
  analyses: SnapshotAnalysis[];
  summary: GameSummary;
  stats: SimStats;
  game: PlayerGame;
}

export interface AnalysisResult {
  meta: { replayId: string; kind: string; gamemode: string | null; ts: string; player: string };
  rounds: RoundResult[];
}

export interface JobState {
  status: "running" | "done" | "error";
  progress: { done: number; total: number; rounds: { roundIndex: number; done: number; total: number }[] };
  result?: AnalysisResult;
  error?: string;
}
