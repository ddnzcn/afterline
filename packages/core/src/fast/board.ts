import type { Tile } from "@haelp/teto/engine";

import type { Offsets } from "./rules";

/**
 * Immutable bitboard. rows[y] has bit x set when (x, y) is filled; y = 0 is the floor.
 * garbage[y] marks garbage cells, so line clears can report garbage cleared like Triangle.
 */
export interface FastBoard {
  readonly width: number;
  readonly rows: readonly number[];
  readonly garbage: readonly number[];
}

export function boardFromTiles(state: readonly (readonly Tile[])[]): FastBoard {
  const width = state[0]?.length ?? 10;
  const rows: number[] = [];
  const garbage: number[] = [];
  for (const row of state) {
    let bits = 0;
    let g = 0;
    row.forEach((tile, x) => {
      if (tile) bits |= 1 << x;
      if (tile?.mino === "gb") g |= 1 << x;
    });
    rows.push(bits);
    garbage.push(g);
  }
  return { width, rows, garbage };
}

/** Bottom-up row strings (like Snapshot.board) back to a board, for tests and fixtures. */
export function boardFromRows(lines: readonly string[], width: number, fullHeight: number): FastBoard {
  const rows = new Array<number>(fullHeight).fill(0);
  const garbage = new Array<number>(fullHeight).fill(0);
  lines.forEach((line, y) => {
    for (let x = 0; x < width; x++) {
      const c = line[x];
      if (c && c !== ".") rows[y]! |= 1 << x;
      if (c === "g") garbage[y]! |= 1 << x;
    }
  });
  return { width, rows, garbage };
}

export function filled(board: FastBoard, x: number, y: number): boolean {
  if (x < 0 || x >= board.width || y < 0 || y >= board.rows.length) return true;
  return ((board.rows[y]! >> x) & 1) === 1;
}

export function fits(board: FastBoard, cells: Offsets, x: number, y: number): boolean {
  for (const [dx, dy] of cells) {
    const ax = x + dx;
    const ay = y - dy;
    if (ax < 0 || ax >= board.width || ay < 0 || ay >= board.rows.length) return false;
    if ((board.rows[ay]! >> ax) & 1) return false;
  }
  return true;
}

export interface LockResult {
  board: FastBoard;
  lines: number;
  garbageCleared: number;
  perfectClear: boolean;
}

/** Place cells and clear full lines. Returns a new board; the input is untouched. */
export function lockCells(board: FastBoard, cells: Offsets, x: number, y: number): LockResult {
  const rows = board.rows.slice();
  for (const [dx, dy] of cells) rows[y - dy]! |= 1 << (x + dx);
  const full = (1 << board.width) - 1;
  const keptRows: number[] = [];
  const keptGarbage: number[] = [];
  let lines = 0;
  let garbageCleared = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] === full) {
      lines++;
      if (board.garbage[i]) garbageCleared++;
    } else {
      keptRows.push(rows[i]!);
      keptGarbage.push(board.garbage[i]!);
    }
  }
  while (keptRows.length < rows.length) {
    keptRows.push(0);
    keptGarbage.push(0);
  }
  return {
    board: { width: board.width, rows: keptRows, garbage: keptGarbage },
    lines,
    garbageCleared,
    perfectClear: lines > 0 && keptRows.every((r) => r === 0)
  };
}

/** Column heights (index of highest filled cell + 1, 0 for empty columns). */
export function columnHeights(board: FastBoard): number[] {
  const heights = new Array<number>(board.width).fill(0);
  for (let y = board.rows.length - 1; y >= 0; y--) {
    const row = board.rows[y]!;
    if (!row) continue;
    for (let x = 0; x < board.width; x++) {
      if (heights[x] === 0 && (row >> x) & 1) heights[x] = y + 1;
    }
  }
  return heights;
}

export function highestRow(board: FastBoard): number {
  for (let y = board.rows.length - 1; y >= 0; y--) if (board.rows[y]) return y;
  return -1;
}

export function fastBoardToRows(board: FastBoard): string[] {
  const out: string[] = [];
  const top = highestRow(board);
  for (let y = 0; y <= top; y++) {
    let s = "";
    for (let x = 0; x < board.width; x++) {
      s += (board.rows[y]! >> x) & 1 ? ((board.garbage[y]! >> x) & 1 ? "g" : "x") : ".";
    }
    out.push(s);
  }
  return out;
}
