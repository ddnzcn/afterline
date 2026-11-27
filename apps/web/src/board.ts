import type { LineStep, MissCategory } from "./types";

/** Bottom-up rows: "." empty, piece letter, "g" garbage. */
export type Grid = string[];

export const VISIBLE_ROWS = 22;
export const BOARD_WIDTH = 10;

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
export function placeStep(grid: Grid, step: Pick<LineStep, "cells" | "piece">): Grid {
  const height = Math.max(grid.length, ...step.cells.map(([, y]) => y + 1));
  const rows = Array.from({ length: height }, (_, y) => (grid[y] ?? ".".repeat(BOARD_WIDTH)).split(""));
  for (const [x, y] of step.cells) rows[y]![x] = step.piece;
  return rows.map((r) => r.join("")).filter((r) => r.includes("."));
}

/** Board after the first `count` steps of a line. */
export function boardAfter(start: Grid, steps: readonly LineStep[], count: number): Grid {
  let grid = start;
  for (let i = 0; i < count && i < steps.length; i++) grid = placeStep(grid, steps[i]!);
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
export function completedRows(grid: Grid, cells: readonly (readonly [number, number])[]): number[] {
  const rows = new Set(cells.map(([, y]) => y));
  return [...rows].filter((y) => {
    const row = (grid[y] ?? ".".repeat(BOARD_WIDTH)).split("");
    for (const [x, cy] of cells) if (cy === y) row[x] = "x";
    return !row.includes(".");
  });
}

/** Game frames (60/s) as m:ss.s */
export function formatTime(frames: number): string {
  const s = Math.max(0, frames) / 60;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
