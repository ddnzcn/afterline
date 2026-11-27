import type { LineStep, MissCategory, Snapshot } from "./types";

/** Bottom-up rows: "." empty, piece letter, "g" garbage. */
export type Grid = string[];

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const SPAWN_ROWS = 2;
export const VISIBLE_ROWS = BOARD_HEIGHT + SPAWN_ROWS;

export interface BoardDims {
  width: number;
  visibleRows: number;
}

/** Board dimensions from replay options, falling back to standard 10x20 (+ 2 spawn rows). */
export function boardDims(options?: Record<string, unknown>): BoardDims {
  const width = typeof options?.boardwidth === "number" && options.boardwidth > 0 ? Math.floor(options.boardwidth) : BOARD_WIDTH;
  const height = typeof options?.boardheight === "number" && options.boardheight > 0 ? Math.floor(options.boardheight) : BOARD_HEIGHT;
  return { width, visibleRows: height + SPAWN_ROWS };
}

/** Colours as CSS variables (styles/tokens.css); the canvas resolves them through theme(). */
export const PIECE_COLOR: Record<string, string> = {
  i: "var(--piece-i)",
  j: "var(--piece-j)",
  l: "var(--piece-l)",
  o: "var(--piece-o)",
  s: "var(--piece-s)",
  t: "var(--piece-t)",
  z: "var(--piece-z)",
  g: "var(--piece-garbage)",
  x: "var(--ink-3)",
  b: "var(--piece-garbage)"
};

export const CATEGORY_COLOR: Record<MissCategory, string> = {
  missed_spin: "var(--cat-missed-spin)",
  b2b_break: "var(--cat-b2b-break)",
  missed_setup: "var(--cat-missed-setup)",
  garbage: "var(--cat-garbage)",
  taken_late: "var(--cat-taken-late)",
  other: "var(--cat-other)"
};

/** Generic tetromino shapes for hold/next previews (row 0 at the top). */
export const PREVIEW_SHAPE: Record<string, [number, number][]> = {
  i: [[0, 0], [1, 0], [2, 0], [3, 0]],
  o: [[0, 0], [1, 0], [0, 1], [1, 1]],
  t: [[1, 0], [0, 1], [1, 1], [2, 1]],
  s: [[1, 0], [2, 0], [0, 1], [1, 1]],
  z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  j: [[0, 0], [0, 1], [1, 1], [2, 1]],
  l: [[2, 0], [0, 1], [1, 1], [2, 1]]
};

export function cellAt(grid: Grid, x: number, y: number): string {
  return grid[y]?.[x] ?? ".";
}

/** Place a step's cells (colored by piece) and clear full rows. Returns a new grid. */
export function placeStep(grid: Grid, step: Pick<LineStep, "cells" | "piece">, width = BOARD_WIDTH): Grid {
  const cols = grid[0]?.length ?? width;
  const height = Math.max(grid.length, ...step.cells.map(([, y]) => y + 1));
  const rows = Array.from({ length: height }, (_, y) => (grid[y] ?? ".".repeat(cols)).split(""));
  for (const [x, y] of step.cells) {
    if (y >= 0 && x >= 0 && x < cols) rows[y]![x] = step.piece;
  }
  return rows.map((r) => r.join("")).filter((r) => r.includes("."));
}

/** Board after the first `count` steps of a line. */
export function boardAfter(start: Grid, steps: readonly LineStep[], count: number, width = BOARD_WIDTH): Grid {
  let grid = start;
  for (let i = 0; i < count && i < steps.length; i++) grid = placeStep(grid, steps[i]!, width);
  return grid;
}

export function describeStep(s: LineStep): string {
  const piece = s.piece.toUpperCase();
  const name = ["", "single", "double", "triple", "quad"][s.lines] ?? `${s.lines} lines`;
  if (s.spin === "normal") return `${piece}-spin ${name}`.trim();
  if (s.spin === "mini") return `${piece}-spin mini ${name}`.trim();
  return s.lines > 0 ? `${piece} ${name}` : `${piece}`;
}

/** Compact names for the mini-board strips: TSS/TSD/TST, "T mini", "J mini", "Quad", "Z double", or the piece letter. */
export function shortName(s: Pick<LineStep, "piece" | "spin" | "lines">): string {
  const p = s.piece.toUpperCase();
  if (s.piece === "t" && s.spin === "normal") return ["T-spin", "TSS", "TSD", "TST", "TSQ"][s.lines] ?? "T-spin";
  if (s.spin !== "none") return `${p} mini`;
  if (s.lines === 4) return "Quad";
  if (s.lines > 0) return `${p} ${["", "single", "double", "triple"][s.lines] ?? `${s.lines}L`}`;
  return p;
}

/** Rows that become full once `cells` are added to `grid` (the rows that step clears). */
export function completedRows(grid: Grid, cells: readonly (readonly [number, number])[], width = BOARD_WIDTH): number[] {
  const cols = grid[0]?.length ?? width;
  const rows = new Set(cells.map(([, y]) => y));
  return [...rows].filter((y) => {
    const row = (grid[y] ?? ".".repeat(cols)).split("");
    for (const [x, cy] of cells) if (cy === y && x >= 0 && x < cols) row[x] = "x";
    return !row.includes(".");
  });
}

/** Explain why "What you played" has fewer than `slots` steps, based on the actual snapshots. */
export function shortPlayedNote(snapshots: readonly Snapshot[], index: number, playedLen: number, slots = 6): string | null {
  if (playedLen <= 0 || playedLen >= slots) return null;
  const last = snapshots[index + playedLen - 1];
  if (last?.placement.topout) return `Round ended after step ${playedLen}.`;
  if (last && last.placement.garbageReceived > 0) return `Garbage arrived after step ${playedLen}, so the line stops here.`;
  if (index + playedLen >= snapshots.length) return `Round ended after step ${playedLen}.`;
  return `Line stops after step ${playedLen}.`;
}

/** Game frames (60/s) as m:ss.s */
export function formatTime(frames: number): string {
  const s = Math.max(0, frames) / 60;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
