import type { PieceType } from "../sim/types";

import { columnHeights, filled, type FastBoard } from "../fast/board";
import type { FastOutcome } from "../fast/apply";

import type { BoardWeights, MoveWeights } from "./weights";

/** Reward for the move itself: attack, B2B, combo, garbage handling. */
export function moveReward(o: FastOutcome, b2bBefore: number, w: MoveWeights): number {
  let score = o.attack * w.attack + (o.attack - o.sent) * w.cancel + o.tanked * w.tanked;
  if (o.lines > 0) {
    if (o.b2bAfter > b2bBefore && o.b2bAfter >= 0) score += w.b2bKeep;
    if (o.attack === 0) score += w.wastedClear;
    if (o.comboAfter > 0) score += o.comboAfter * w.combo;
  }
  if (o.brokeB2B >= 0) score -= w.b2bBreakFlat + o.brokeB2B * w.b2bBreakPerLevel;
  if (o.perfectClear) score += w.perfectClear;
  return score;
}

export interface BoardFeatures {
  holes: number;
  coveredDepth: number;
  maxHeight: number;
  bumpiness: number;
  extraWellDepth: number;
  tSlotLines: number;
  tSlots: number;
  readyLines: number;
}

export function boardFeatures(board: FastBoard): BoardFeatures {
  const width = board.width;
  const heights = columnHeights(board);
  const full = (1 << width) - 1;

  let holes = 0;
  let coveredDepth = 0;
  for (let x = 0; x < width; x++) {
    let above = 0;
    for (let y = heights[x]! - 1; y >= 0; y--) {
      if ((board.rows[y]! >> x) & 1) above++;
      else {
        holes++;
        coveredDepth += Math.min(above, 6);
      }
    }
  }

  // main well = lowest column; it is excluded from bumpiness and from the extra-well penalty
  let well = 0;
  for (let x = 1; x < width; x++) if (heights[x]! < heights[well]!) well = x;

  let bumpiness = 0;
  for (let x = 0; x < width - 1; x++) {
    if (x === well || x + 1 === well) continue;
    bumpiness += Math.abs(heights[x]! - heights[x + 1]!);
  }

  let extraWellDepth = 0;
  for (let x = 0; x < width; x++) {
    if (x === well) continue;
    const left = x > 0 ? heights[x - 1]! : Infinity;
    const right = x < width - 1 ? heights[x + 1]! : Infinity;
    const depth = Math.min(left, right) - heights[x]!;
    if (depth > 2) extraWellDepth += depth;
  }

  let readyLines = 0;
  const maxHeight = Math.max(...heights);
  for (let y = 0; y < maxHeight; y++) {
    const gap = full & ~board.rows[y]!;
    if (gap && (gap & (gap - 1)) === 0) {
      const x = 31 - Math.clz32(gap);
      if (heights[x]! <= y) readyLines++;
    }
  }

  const slots = tSlots(board, heights);
  return { holes, coveredDepth, maxHeight, bumpiness, extraWellDepth, tSlotLines: slots.lines, tSlots: slots.count, readyLines };
}

/**
 * TSD-shaped slots: a 3-wide gap at row y over a 1-wide gap at y-1, both lower corners filled,
 * exactly one upper corner filled (the overhang) and the other side open so a T can rotate in.
 * Lines = how many of rows y-1 / y a T would complete. Only the best slot counts.
 */
function tSlots(board: FastBoard, heights: readonly number[]): { lines: number; count: number } {
  const width = board.width;
  const full = (1 << width) - 1;
  let best = 0;
  let count = 0;
  for (let x = 1; x < width - 1; x++) {
    const y = heights[x]!;
    for (let yy = Math.max(1, y - 2); yy <= y + 1; yy++) {
      if (filled(board, x - 1, yy) || filled(board, x, yy) || filled(board, x + 1, yy) || filled(board, x, yy - 1)) continue;
      if (!filled(board, x - 1, yy - 1) || !filled(board, x + 1, yy - 1)) continue;
      if (filled(board, x, yy + 1)) continue;
      const leftRoof = filled(board, x - 1, yy + 1);
      const rightRoof = filled(board, x + 1, yy + 1);
      if (leftRoof === rightRoof) continue;
      if (yy - 2 >= 0 && !filled(board, x, yy - 2)) continue; // T stem must be supported
      const tMaskLow = 1 << x;
      const tMaskHigh = (1 << (x - 1)) | (1 << x) | (1 << (x + 1));
      let lines = 0;
      if ((board.rows[yy - 1]! | tMaskLow) === full) lines++;
      if ((board.rows[yy]! | tMaskHigh) === full) lines++;
      count++;
      if (lines > best) best = lines;
    }
  }
  return { lines: best, count };
}

export function boardScore(board: FastBoard, rise: number, hold: PieceType | null, b2b: number, w: BoardWeights): number {
  const f = boardFeatures(board);
  const height = f.maxHeight + rise;
  const over = Math.max(0, height - w.dangerHeight);
  return (
    f.holes * w.holes +
    f.coveredDepth * w.coveredHoleDepth +
    height * w.maxHeight +
    over * over * w.danger +
    f.bumpiness * w.bumpiness +
    f.extraWellDepth * w.extraWells +
    (f.tSlots > 0 ? w.tSlotBase + f.tSlotLines * w.tSlotLine : 0) +
    f.readyLines * w.readyLines +
    (hold === "t" ? w.heldT : 0) +
    Math.max(0, b2b) * w.b2bChain
  );
}
