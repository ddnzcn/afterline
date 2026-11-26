import { Engine, type LockRes, type Tile } from "@haelp/teto/engine";

import { toEngineConfig } from "../replay/config";
import { splitFrames } from "../replay/frames";
import { applyNoSzo, assertSupported } from "../replay/support";
import type { PlayerGame } from "../replay/types";

import type {
  BoardRows,
  IncomingGarbageInfo,
  PieceType,
  SimStats,
  SimulatedGame,
  Snapshot,
  SpinKind
} from "./types";

const PREVIEW_DEFAULT = 5;

function tileChar(tile: Tile): string {
  if (!tile) return ".";
  if (tile.mino === "gb") return "g";
  if (tile.mino === "bomb") return "b";
  return tile.mino;
}

export function boardToRows(state: readonly (readonly Tile[])[]): BoardRows {
  const rows = state.map((row) => row.map(tileChar).join(""));
  let top = rows.length;
  while (top > 0 && !/[^.]/.test(rows[top - 1]!)) top--;
  return rows.slice(0, top);
}

function incoming(engine: Engine): IncomingGarbageInfo[] {
  return engine.garbageQueue.queue.map((g) => ({
    amount: g.amount,
    size: g.size,
    confirmed: g.confirmed,
    frame: g.frame
  }));
}

/** State captured when a piece spawns: the decision the player faces. */
interface SpawnState {
  frame: number;
  board: BoardRows;
  active: PieceType;
  hold: PieceType | null;
  next: PieceType[];
  b2b: number;
  combo: number;
  incomingGarbage: IncomingGarbageInfo[];
}

function captureSpawn(engine: Engine, preview: number): SpawnState {
  return {
    frame: engine.frame,
    board: boardToRows(engine.board.state),
    active: engine.falling.symbol as PieceType,
    hold: (engine.held as PieceType | null) ?? null,
    next: Array.from(engine.queue).slice(0, preview) as PieceType[],
    b2b: engine.stats.b2b,
    combo: engine.stats.combo,
    incomingGarbage: incoming(engine)
  };
}

interface LockPosition {
  piece: PieceType;
  x: number;
  y: number;
  rotation: number;
  cells: [number, number][];
  heldAfter: PieceType | null;
}

/**
 * TETR.IO's end-screen clear buckets. Verified against league replays: every mini spin (any piece,
 * under all-mini+) lands in the `minitspin*` buckets, zero-line minis included; full spins are T-only.
 */
function clearKey(spin: SpinKind, lines: number): string | null {
  const names = ["", "singles", "doubles", "triples", "quads", "pentas"];
  const n = names[lines] ?? `${lines}lines`;
  if (spin === "normal") return lines === 0 ? "realtspins" : `tspin${n}`;
  if (spin === "mini") return lines === 0 ? "minitspins" : `minitspin${n}`;
  return lines === 0 ? null : n;
}

export interface SimulateOptions {
  /** Preview length shown in snapshots. Defaults to the replay's nextcount, else 5. */
  preview?: number;
  /** Called after every snapshot with the live engine positioned at the next spawn. */
  onSnapshot?: (snapshot: Snapshot, engine: Engine) => void;
}

/** Re-simulate one player's game with Triangle.js and emit a snapshot per placement. Pure and deterministic. */
export function simulateGame(game: PlayerGame, ts: string, opts: SimulateOptions = {}): SimulatedGame {
  assertSupported(game);
  const engine = new Engine(toEngineConfig(game, ts));
  if (game.options.no_szo === true) applyNoSzo(engine);
  const frames = splitFrames(game.events);
  const nextcount = game.options.nextcount;
  const preview = opts.preview ?? (typeof nextcount === "number" ? nextcount : PREVIEW_DEFAULT);

  const snapshots: Snapshot[] = [];
  const clears: Record<string, number> = {};
  let holds = 0;
  // Triangle counters start at -1 ("none"); TETR.IO's top stats are those counters + 1.
  let topB2B = -1;
  let topCombo = -1;
  let tanked = 0;
  let toppedOut = false;

  let spawn = captureSpawn(engine, preview);
  let lockPos: LockPosition | null = null;
  let holdsThisPiece = 0;

  // Count successful holds directly: a T-for-T swap leaves no visible trace but TETR.IO counts it.
  const originalHold = engine.hold.bind(engine);
  engine.hold = (...args: Parameters<Engine["hold"]>): boolean => {
    const ok = originalHold(...args);
    if (ok) {
      holdsThisPiece++;
      holds++;
    }
    return ok;
  };

  const refreshIncoming = (): void => {
    spawn = { ...spawn, incomingGarbage: incoming(engine) };
  };
  engine.events.on("garbage.receive", refreshIncoming);
  engine.events.on("garbage.confirm", refreshIncoming);

  // Fired after the piece is written to the board but before the next piece spawns.
  engine.events.on("falling.lock.pre", () => {
    const f = engine.falling;
    lockPos = {
      piece: f.symbol as PieceType,
      x: f.location[0],
      y: Math.floor(f.location[1]),
      rotation: f.rotation,
      cells: f.absoluteBlocks.map(([x, y]) => [x, Math.floor(y)] as [number, number]),
      heldAfter: (engine.held as PieceType | null) ?? null
    };
  });

  engine.events.on("falling.lock", (res: LockRes) => {
    const pos = lockPos;
    if (!pos) throw new Error(`Lock without position at frame ${engine.frame}`);
    const spin = res.spin as SpinKind;
    const usedHold = holdsThisPiece > 0;
    const attack = res.rawGarbage.reduce((a, b) => a + b, 0);
    const sent = res.garbage.reduce((a, b) => a + b, 0);
    const garbageReceived = res.garbageAdded ? res.garbageAdded.reduce((a, g) => a + g.amount, 0) : 0;
    const perfectClear = res.lines > 0 && engine.board.perfectClear;

    tanked += garbageReceived;
    topB2B = Math.max(topB2B, res.stats.b2b);
    topCombo = Math.max(topCombo, res.stats.combo);
    const key = clearKey(spin, res.lines);
    if (key) clears[key] = (clears[key] ?? 0) + 1;
    if (perfectClear) clears.allclear = (clears.allclear ?? 0) + 1;

    const snapshot: Snapshot = {
      index: snapshots.length,
      ...spawn,
      placement: {
        piece: pos.piece,
        x: pos.x,
        y: pos.y,
        rotation: pos.rotation,
        cells: pos.cells,
        spin,
        allSpin: spin !== "none" && pos.piece !== "t",
        usedHold,
        linesCleared: res.lines,
        garbageCleared: res.garbageCleared,
        perfectClear,
        attack,
        sent,
        surge: res.surge,
        garbageReceived,
        b2bAfter: res.stats.b2b,
        comboAfter: res.stats.combo,
        topout: res.topout
      }
    };
    snapshots.push(snapshot);
    if (res.topout) toppedOut = true;

    lockPos = null;
    holdsThisPiece = 0;
    spawn = captureSpawn(engine, preview);
    opts.onSnapshot?.(snapshot, engine);
  });

  while (engine.frame < frames.length && !toppedOut) {
    engine.tick(frames[engine.frame]!);
  }

  const stats: SimStats = {
    pieces: engine.stats.pieces,
    lines: engine.stats.lines,
    holds,
    attack: engine.stats.garbage.attack,
    sent: engine.stats.garbage.sent,
    received: engine.stats.garbage.receive,
    tanked,
    garbageCleared: engine.stats.garbage.cleared,
    topB2B: topB2B + 1,
    topCombo: topCombo + 1,
    clears
  };

  return {
    roundIndex: game.roundIndex,
    username: game.username,
    snapshots,
    stats,
    finalBoard: boardToRows(engine.board.state),
    toppedOut,
    frames: engine.frame
  };
}
