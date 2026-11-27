import { Engine, type EngineSnapshot } from "@haelp/teto/engine";

import { toEngineConfig } from "../replay/config";
import { splitFrames } from "../replay/frames";
import { applyNoSzo, assertSupported } from "../replay/support";
import type { PlayerGame, ReplayFrame } from "../replay/types";

import { boardToRows } from "./simulate";
import type { BoardRows, PieceType } from "./types";

/** Everything needed to draw one frame of the live game. */
export interface LiveFrame {
  frame: number;
  /** Pieces locked so far; the falling piece is snapshot number `pieces`. */
  pieces: number;
  board: BoardRows;
  falling: { piece: PieceType; cells: [number, number][] } | null;
  /** Where the falling piece would land (drop shadow). */
  shadow: [number, number][] | null;
  hold: PieceType | null;
  next: PieceType[];
  incoming: number;
  b2b: number;
  combo: number;
  over: boolean;
}

interface Keyframe {
  frame: number;
  pieces: number;
  state: EngineSnapshot;
}

/**
 * Frame-by-frame playback of a replay with Triangle.js, for watching the game as it was played.
 * A first pass records an engine snapshot at the first frame boundary after each piece spawns, so
 * seeking restores the nearest keyframe and ticks forward at most one piece's worth of frames.
 */
export class ReplayPlayer {
  readonly totalFrames: number;
  readonly #engine: Engine;
  readonly #frames: ReplayFrame[][];
  readonly #keyframes: Keyframe[] = [];
  readonly #preview: number;
  #over = false;

  constructor(game: PlayerGame, ts: string, preview = 5) {
    assertSupported(game);
    this.#engine = new Engine(toEngineConfig(game, ts));
    if (game.options.no_szo === true) applyNoSzo(this.#engine);
    this.#frames = splitFrames(game.events);
    this.#preview = typeof game.options.nextcount === "number" ? game.options.nextcount : preview;

    this.#engine.events.on("falling.lock", (res) => {
      if (res.topout) this.#over = true;
    });

    this.#keyframes.push({ frame: 0, pieces: 0, state: this.#engine.snapshot() });
    while (this.#engine.frame < this.#frames.length && !this.#over) {
      this.#engine.tick(this.#frames[this.#engine.frame]!);
      const last = this.#keyframes.at(-1)!;
      if (this.#engine.stats.pieces !== last.pieces) {
        this.#keyframes.push({ frame: this.#engine.frame, pieces: this.#engine.stats.pieces, state: this.#engine.snapshot() });
      }
    }
    this.totalFrames = this.#engine.frame;
    this.seek(0);
  }

  get frame(): number {
    return this.#engine.frame;
  }

  /** Frame at which piece `index` (0-based) is freshly spawned. */
  spawnFrame(index: number): number {
    const k = this.#keyframes[Math.max(0, Math.min(index, this.#keyframes.length - 1))]!;
    return k.frame;
  }

  seek(frame: number): void {
    const target = Math.max(0, Math.min(frame, this.totalFrames));
    let lo = 0;
    let hi = this.#keyframes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.#keyframes[mid]!.frame <= target) lo = mid;
      else hi = mid - 1;
    }
    this.#engine.fromSnapshot(this.#keyframes[lo]!.state);
    this.#over = false;
    while (this.#engine.frame < target) this.#tickOnce();
  }

  /** Advance up to `count` frames. Returns false once the game is over. */
  advance(count: number): boolean {
    for (let i = 0; i < count; i++) {
      if (this.#engine.frame >= this.totalFrames || this.#over) return false;
      this.#tickOnce();
    }
    return this.#engine.frame < this.totalFrames && !this.#over;
  }

  #tickOnce(): void {
    this.#engine.tick(this.#frames[this.#engine.frame] ?? []);
  }

  live(): LiveFrame {
    const e = this.#engine;
    const f = e.falling;
    const cells = f ? f.absoluteBlocks.map(([x, y]) => [x, Math.floor(y)] as [number, number]) : null;
    let shadow: [number, number][] | null = null;
    if (cells) {
      let drop = 0;
      const free = (d: number): boolean =>
        cells.every(([x, y]) => y - d >= 0 && !e.board.state[y - d]?.[x]);
      while (free(drop + 1)) drop++;
      shadow = cells.map(([x, y]) => [x, y - drop]);
    }
    return {
      frame: e.frame,
      pieces: e.stats.pieces,
      board: boardToRows(e.board.state),
      falling: f && cells ? { piece: f.symbol as PieceType, cells } : null,
      shadow,
      hold: (e.held as PieceType | null) ?? null,
      next: Array.from(e.queue).slice(0, this.#preview) as PieceType[],
      incoming: e.garbageQueue.queue.reduce((s, g) => s + g.amount, 0),
      b2b: e.stats.b2b,
      combo: e.stats.combo,
      over: this.#over || e.frame >= this.totalFrames
    };
  }
}
