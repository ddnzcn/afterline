import { performKick, type KickTable, type Tile } from "@haelp/teto/engine";

import type { Input } from "./types";

/** Block offsets for one rotation state, as Triangle stores them: cell = [x + dx, y - dy]. */
type Blocks = readonly (readonly [number, number])[];

export interface ReachPiece {
  symbol: string;
  /** Triangle rotation states (Tetromino.states). */
  states: readonly Blocks[];
  x: number;
  y: number;
  rotation: number;
  /** Rotation axis offsets (Tetromino.aox/aoy), passed through to performKick. */
  ao: [number, number];
}

export interface ReachOptions {
  kickTable: KickTable;
  allow180: boolean;
}

/**
 * How the piece arrived at a resting position. Spin credit depends only on the last action:
 * any successful move or fall clears it, so every non-rotation arrival is equivalent ("move"),
 * while rotation arrivals are distinguished by kick (TST/fin kicks change the spin result).
 */
export interface Arrival {
  x: number;
  y: number;
  rotation: number;
  signature: string;
  inputs: Input[];
}

interface Node {
  x: number;
  y: number;
  r: number;
  parent: number;
  input: Input | null;
}

const ROTATIONS: readonly [Input, number][] = [
  ["cw", 1],
  ["ccw", 3],
  ["180", 2]
];

/**
 * Breadth-first search over (x, y, rotation) from the spawn position using Triangle's own
 * movement rules and kick tables. Lock-reset limits are ignored (standard bot assumption).
 * Returns every distinct arrival at a resting position with its shortest input path.
 */
export function findArrivals(board: readonly (readonly Tile[])[], piece: ReachPiece, opts: ReachOptions): Arrival[] {
  const width = board[0]?.length ?? 0;
  const height = board.length;
  const xOffset = 4;
  const stride = width + 2 * xOffset;
  const key = (x: number, y: number, r: number): number => (r * height + y) * stride + x + xOffset;

  const legalAt = (x: number, y: number, r: number): boolean => {
    for (const [dx, dy] of piece.states[r]!) {
      const ax = x + dx;
      const ay = y - dy;
      if (ax < 0 || ax >= width || ay < 0 || ay >= height || board[ay]![ax]) return false;
    }
    return true;
  };

  if (!legalAt(piece.x, piece.y, piece.rotation)) return [];

  const nodes: Node[] = [{ x: piece.x, y: piece.y, r: piece.rotation, parent: -1, input: null }];
  const visited = new Set<number>([key(piece.x, piece.y, piece.rotation)]);
  const arrivals = new Map<string, { parent: number; input: Input | null; x: number; y: number; r: number }>();

  const pathTo = (index: number): Input[] => {
    const out: Input[] = [];
    for (let i = index; i > 0; i = nodes[i]!.parent) out.push(nodes[i]!.input!);
    return out.reverse();
  };

  const visit = (parent: number, input: Input, x: number, y: number, r: number, signature: string): void => {
    if (!legalAt(x, y - 1, r)) {
      const arrivalKey = `${key(x, y, r)}|${signature}`;
      if (!arrivals.has(arrivalKey)) arrivals.set(arrivalKey, { parent, input, x, y, r });
    }
    const k = key(x, y, r);
    if (visited.has(k)) return;
    visited.add(k);
    nodes.push({ x, y, r, parent, input });
  };

  if (!legalAt(piece.x, piece.y - 1, piece.rotation)) {
    arrivals.set(`${key(piece.x, piece.y, piece.rotation)}|move`, {
      parent: 0,
      input: null,
      x: piece.x,
      y: piece.y,
      r: piece.rotation
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const { x, y, r } = nodes[i]!;

    if (legalAt(x - 1, y, r)) {
      visit(i, "left", x - 1, y, r, "move");
      let dx = x - 1;
      while (legalAt(dx - 1, y, r)) dx--;
      if (dx !== x - 1) visit(i, "dasLeft", dx, y, r, "move");
    }
    if (legalAt(x + 1, y, r)) {
      visit(i, "right", x + 1, y, r, "move");
      let dx = x + 1;
      while (legalAt(dx + 1, y, r)) dx++;
      if (dx !== x + 1) visit(i, "dasRight", dx, y, r, "move");
    }
    if (legalAt(x, y - 1, r)) {
      visit(i, "down", x, y - 1, r, "move");
      let dy = y - 1;
      while (legalAt(x, dy - 1, r)) dy--;
      if (dy !== y - 1) visit(i, "softDrop", x, dy, r, "move");
    }

    for (const [input, amt] of ROTATIONS) {
      if (amt === 2 && !opts.allow180) continue;
      const to = (r + amt) % 4;
      // Fractional y (n + 0.5) reproduces the engine's floor/ceil arithmetic in performKick.
      const kick = performKick(
        opts.kickTable,
        piece.symbol as Parameters<typeof performKick>[1],
        [x, y + 0.5],
        piece.ao,
        false,
        piece.states[to] as [number, number][],
        r as 0 | 1 | 2 | 3,
        to as 0 | 1 | 2 | 3,
        board as Tile[][]
      );
      if (kick === false) continue;
      if (kick === true) visit(i, input, x, y, to, `r${r}${to}:none`);
      else visit(i, input, kick.newLocation[0], Math.floor(kick.newLocation[1]), to, `r${kick.id}:${kick.index}`);
    }
  }

  return [...arrivals.entries()].map(([k, a]) => ({
    x: a.x,
    y: a.y,
    rotation: a.r,
    signature: k.slice(k.indexOf("|") + 1),
    inputs: a.input === null ? pathTo(a.parent) : [...pathTo(a.parent), a.input]
  }));
}
