import type { Types } from "@haelp/teto";

export type ReplayFrame = Types.Game.Replay.Frame;

/** Replay options as stored by TETR.IO. Only the fields we read are typed; the rest pass through. */
export type ReplayOptions = Record<string, unknown> & {
  seed: number;
  gameid?: number;
  username?: string;
  boardwidth?: number;
  boardheight?: number;
};

export type ReplayKind = "versus" | "solo";

/** End-of-game stats as recorded by the TETR.IO client. Only the fields used for parity are typed. */
export interface RecordedStats {
  piecesplaced?: number;
  lines?: number;
  topbtb?: number;
  topcombo?: number;
  holds?: number;
  /** Game length in milliseconds. */
  finaltime?: number;
  clears?: Partial<Record<string, number>>;
  garbage?: Partial<{
    sent: number;
    sent_nomult: number;
    attack: number;
    received: number;
    cleared: number;
    maxspike: number;
  }>;
}

/** One player's game: a single round of a versus match, or the whole of a solo game. */
export interface PlayerGame {
  kind: ReplayKind;
  roundIndex: number;
  playerId: string;
  username: string;
  gameid: number | null;
  /** Game ids of the other active players in this round (versus only). */
  opponents: number[];
  options: ReplayOptions;
  events: ReplayFrame[];
  recordedStats: RecordedStats | null;
  /** Versus only: whether this player was still alive when the round ended (won). */
  alive?: boolean | null;
}

export interface ParsedReplay {
  kind: ReplayKind;
  id: string | null;
  gamemode: string | null;
  /** ISO timestamp of the game. Garbage queue behaviour depends on it. */
  ts: string;
  players: { id: string; username: string }[];
  games: PlayerGame[];
}
