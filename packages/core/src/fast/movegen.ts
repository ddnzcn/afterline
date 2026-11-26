import type { PieceType, SpinKind } from "../sim/types";

import { filled, fits, highestRow, type FastBoard } from "./board";
import type { FastRules, PieceData } from "./rules";

export interface FastPlacement {
  piece: PieceType;
  x: number;
  y: number;
  rotation: number;
  spin: SpinKind;
}

/**
 * Spin result at a resting position, mirroring Triangle's #detectSpin / #detectSpinFromCorners.
 * Verified against the engine by test/fast-parity.test.ts.
 */
export function detectSpin(board: FastBoard, rules: FastRules, piece: PieceType, x: number, y: number, r: number, finOrTst: boolean): SpinKind {
  const mode = rules.spinMode;
  if (mode === "none") return "none";
  const cells = rules.pieces[piece].rotations[r]!;

  // Every supported mode scores T-spins from corners (Triangle: all, all-mini(+), all+, T-spins(+), mini-only).
  const tSpin: SpinKind | false = piece === "t" ? tCornerSpin(board, rules, x, y, r, finOrTst) : false;

  const immobile = !fits(board, cells, x - 1, y) && !fits(board, cells, x + 1, y) && !fits(board, cells, x, y + 1) && !fits(board, cells, x, y - 1);

  switch (mode) {
    case "T-spins":
      return tSpin || "none";
    case "T-spins+":
      return maxSpin(tSpin || "none", immobile && piece === "t" ? "mini" : "none");
    case "all":
      return tSpin || (immobile ? "normal" : "none");
    case "all-mini":
      return tSpin || (immobile ? "mini" : "none");
    case "all+":
      return maxSpin(tSpin || "none", immobile ? (piece === "t" ? "mini" : "normal") : "none");
    case "all-mini+":
      return maxSpin(tSpin || "none", immobile ? "mini" : "none");
    case "mini-only":
      return tSpin === "normal" ? "mini" : maxSpin(tSpin || "none", immobile ? "mini" : "none");
  }
}

function maxSpin(a: SpinKind, b: SpinKind): SpinKind {
  const score = (s: SpinKind): number => (s === "normal" ? 2 : s === "mini" ? 1 : 0);
  return score(b) >= score(a) ? b : a;
}

function tCornerSpin(board: FastBoard, rules: FastRules, x: number, y: number, r: number, finOrTst: boolean): SpinKind {
  if (fits(board, rules.pieces.t.rotations[r]!, x, y - 1)) return "none";
  let corners = 0;
  let front = 0;
  for (const [dx, dy, fa, fb] of rules.tCorners[r]!) {
    if (filled(board, x + dx + 1, y - dy - 1)) {
      corners++;
      if (r === fa || r === fb) front++;
    }
  }
  if (corners < 3) return "none";
  if (finOrTst) return "normal";
  return rules.tMiniEligible && front !== 2 ? "mini" : "normal";
}

/** Triangle's #isTSpinKick: the fin/TST kick always awards a full spin. */
function isFinOrTstKick(id: string, dx: number, dy: number): boolean {
  return ((id === "23" || id === "03") && dx === 1 && dy === 2) || ((id === "21" || id === "01") && dx === -1 && dy === 2);
}

// Arrival flags: how the piece entered a resting position (only the last action matters for spin).
const MOVE = 0;
const ROT = 1;
const ROT_TST = 2;

/**
 * Every reachable final placement for one piece, deduped by final cells + spin.
 * Same movement and kick rules as movegen/reach.ts, on a bitboard, without input paths.
 * When the stack is low, the search starts from every column/rotation just above the stack:
 * that air is reachable from spawn without kicks, so it is equivalent and much faster.
 */
export function fastPlacements(board: FastBoard, rules: FastRules, piece: PieceType): FastPlacement[] {
  const data = rules.pieces[piece];
  const width = board.width;
  const height = board.rows.length;
  const stride = width + 8;
  const key = (x: number, y: number, r: number): number => (r * height + y) * stride + x + 4;

  const visited = new Uint8Array(4 * height * stride);
  const queue: number[] = [];
  const push = (x: number, y: number, r: number): void => {
    const k = key(x, y, r);
    if (visited[k]) return;
    visited[k] = 1;
    queue.push(x, y, r);
  };

  const top = highestRow(board);
  const airY = top + 1 + data.maxDy;
  if (airY < data.spawnY) {
    // In open air every rotation is reachable with CW/CCW alone, so 180 availability does not matter here.
    for (let r = 0; r < 4; r++) {
      for (let x = -3; x < width; x++) if (fits(board, data.rotations[r]!, x, airY)) push(x, airY, r);
    }
  } else if (fits(board, data.rotations[data.spawnRotation]!, data.spawnX, data.spawnY)) {
    push(data.spawnX, data.spawnY, data.spawnRotation);
  } else {
    return [];
  }

  // resting position -> bitmask of arrival flags seen
  const arrivals = new Map<number, number>();
  const arrive = (x: number, y: number, r: number, flag: number): void => {
    if (fits(board, data.rotations[r]!, x, y - 1)) return;
    const k = key(x, y, r);
    arrivals.set(k, (arrivals.get(k) ?? 0) | (1 << flag));
  };
  for (let i = 0; i < queue.length; i += 3) arrive(queue[i]!, queue[i + 1]!, queue[i + 2]!, MOVE);

  for (let i = 0; i < queue.length; i += 3) {
    const x = queue[i]!;
    const y = queue[i + 1]!;
    const r = queue[i + 2]!;
    const cells = data.rotations[r]!;
    if (fits(board, cells, x - 1, y)) {
      arrive(x - 1, y, r, MOVE);
      push(x - 1, y, r);
    }
    if (fits(board, cells, x + 1, y)) {
      arrive(x + 1, y, r, MOVE);
      push(x + 1, y, r);
    }
    if (fits(board, cells, x, y - 1)) {
      arrive(x, y - 1, r, MOVE);
      push(x, y - 1, r);
    }
    for (const amt of [1, 3, 2]) {
      if (amt === 2 && !rules.allow180) continue;
      const to = (r + amt) % 4;
      const res = rotate(board, data, x, y, r, to);
      if (!res) continue;
      arrive(res.x, res.y, to, res.tst ? ROT_TST : ROT);
      push(res.x, res.y, to);
    }
  }

  const out: FastPlacement[] = [];
  const seen = new Set<string>();
  for (const [k, flags] of arrivals) {
    const x = (k % stride) - 4;
    const y = Math.floor(k / stride) % height;
    const r = Math.floor(k / stride / height);
    const cellKey = cellsKey(data, x, y, r);
    const spins: SpinKind[] = [];
    if (flags & (1 << MOVE)) spins.push("none");
    if (flags & (1 << ROT)) spins.push(detectSpin(board, rules, piece, x, y, r, false));
    if (flags & (1 << ROT_TST)) spins.push(detectSpin(board, rules, piece, x, y, r, true));
    for (const spin of spins) {
      const dedupe = `${cellKey}|${spin}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ piece, x, y, rotation: r, spin });
    }
  }
  return out;
}

function rotate(board: FastBoard, data: PieceData, x: number, y: number, from: number, to: number): { x: number; y: number; tst: boolean } | null {
  const cells = data.rotations[to]!;
  if (fits(board, cells, x, y)) return { x, y, tst: false };
  const id = `${from}${to}`;
  const list = data.kicks[id];
  if (!list) return null;
  for (const [dx, dy] of list) {
    if (fits(board, cells, x + dx, y - dy)) return { x: x + dx, y: y - dy, tst: isFinOrTstKick(id, dx, dy) };
  }
  return null;
}

export function placementCells(rules: FastRules, p: Pick<FastPlacement, "piece" | "x" | "y" | "rotation">): [number, number][] {
  return rules.pieces[p.piece].rotations[p.rotation]!.map(([dx, dy]) => [p.x + dx, p.y - dy] as [number, number]);
}

function cellsKey(data: PieceData, x: number, y: number, r: number): string {
  return data.rotations[r]!.map(([dx, dy]) => (y - dy) * 32 + x + dx)
    .sort((a, b) => a - b)
    .join(",");
}
