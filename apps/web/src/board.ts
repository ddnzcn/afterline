import type { LineStep, MissCategory } from "./types";

/** Bottom-up rows: "." empty, piece letter, "g" garbage. */
export type Grid = string[];

export const VISIBLE_ROWS = 22;
export const BOARD_WIDTH = 10;

export const PIECE_COLOR: Record<string, string> = {
  i: "#38c3d4",
  j: "#4f6ff0",
  l: "#ef8a3c",
  o: "#e9cf3f",
  s: "#57c768",
  t: "#ac5cf0",
  z: "#ec5868",
  g: "#5b6270",
  x: "#7d8594",
  b: "#5b6270"
};

export const CATEGORY_COLOR: Record<MissCategory, string> = {
  missed_spin: "#c27bff",
  b2b_break: "#ff9f45",
  missed_setup: "#4fd1e8",
  garbage: "#ff5d6c",
  other: "#8b93a3"
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
