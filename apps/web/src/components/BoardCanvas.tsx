import { useEffect, useRef } from "react";

import { BOARD_WIDTH, SPAWN_ROWS, VISIBLE_ROWS, cellAt, type Grid } from "../board";
import { theme, type Theme } from "../theme";

type Cells = readonly (readonly [number, number])[];

/**
 * What to draw on top of the grid.
 * - live / shadow: the falling piece and where it would land (Live mode)
 * - you / engine: the player's placement and the engine's choice (Review), different patterns
 * - landed: a line step's piece, solid with an ink edge
 */
export interface BoardOverlays {
  live?: { cells: Cells; piece: string };
  shadow?: { cells: Cells; piece: string };
  you?: { cells: Cells; piece: string };
  engine?: { cells: Cells; piece: string };
  landed?: { cells: Cells; piece: string };
  /** Rows completed by the landed piece (tinted until the next step clears them). */
  clearedRows?: readonly number[];
}

interface BoardCanvasProps {
  grid: Grid;
  overlays: BoardOverlays;
  cell: number;
  label: string;
  cols?: number;
  rows?: number;
}

export function BoardCanvas({ grid, overlays, cell, label, cols = BOARD_WIDTH, rows = VISIBLE_ROWS }: BoardCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = cols * cell;
  const height = rows * cell;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(ctx, theme(), grid, overlays, cell, cols, rows, width, height);
  }, [grid, overlays, cell, cols, rows, width, height]);

  return <canvas ref={ref} className="board-canvas" style={{ width, height }} role="img" aria-label={label} />;
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  t: Theme,
  grid: Grid,
  o: BoardOverlays,
  cell: number,
  cols: number,
  rows: number,
  width: number,
  height: number
): void {
  const toScreen = (x: number, y: number): [number, number] => [x * cell, (rows - 1 - y) * cell];
  const visible = (y: number): boolean => y >= 0 && y < rows;

  // well, spawn rows, grid
  ctx.fillStyle = t.boardBg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = t.boardSpawn;
  ctx.fillRect(0, 0, width, Math.min(SPAWN_ROWS, rows) * cell);
  ctx.strokeStyle = t.boardGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < cols; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, height);
  }
  for (let y = 1; y < rows; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(width, y * cell + 0.5);
  }
  ctx.stroke();

  // rows a landed line step completes
  for (const y of o.clearedRows ?? []) {
    if (!visible(y)) continue;
    const [, sy] = toScreen(0, y);
    ctx.fillStyle = t.accentSoft;
    ctx.fillRect(0, sy, width, cell);
  }

  // settled cells
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cellAt(grid, x, y);
      if (c === ".") continue;
      const [sx, sy] = toScreen(x, y);
      block(ctx, sx, sy, cell, t.piece[c] ?? t.piece.x!);
    }
  }

  const each = (cells: Cells | undefined, fn: (sx: number, sy: number) => void): void => {
    for (const [x, y] of cells ?? []) {
      if (!visible(y)) continue;
      const [sx, sy] = toScreen(x, y);
      fn(sx, sy);
    }
  };

  if (o.shadow) {
    const color = t.piece[o.shadow.piece] ?? t.ink;
    each(o.shadow.cells, (sx, sy) => block(ctx, sx, sy, cell, color, 0.18));
  }
  if (o.live) {
    const color = t.piece[o.live.piece] ?? t.ink;
    each(o.live.cells, (sx, sy) => block(ctx, sx, sy, cell, color));
  }

  // Review overlays, in the specified order: engine fill -> your hatch -> engine ring -> your outline
  if (o.engine) {
    const color = t.piece[o.engine.piece] ?? t.ink;
    each(o.engine.cells, (sx, sy) => block(ctx, sx, sy, cell, color, 0.45));
  }
  if (o.you) each(o.you.cells, (sx, sy) => hatch(ctx, sx, sy, cell, t.overlayYou));
  if (o.engine) {
    each(o.engine.cells, (sx, sy) => {
      ctx.strokeStyle = t.overlayEngine;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 2, sy + 2, cell - 4, cell - 4);
    });
  }
  if (o.you) {
    each(o.you.cells, (sx, sy) => {
      ctx.strokeStyle = t.overlayYou;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, cell - 2, cell - 2);
    });
  }

  if (o.landed) {
    const color = t.piece[o.landed.piece] ?? t.ink;
    each(o.landed.cells, (sx, sy) => {
      block(ctx, sx, sy, cell, color);
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1.5, sy + 1.5, cell - 3, cell - 3);
    });
  }
}

/** A cell inset 1px with radius 2. */
function block(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 45° hatch: 1.5px lines at a 4px pitch, ~85% opacity, clipped to the cell. */
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, size - 2, size - 2);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let d = -size; d < size * 2; d += 4) {
    ctx.moveTo(x + d, y + size);
    ctx.lineTo(x + d + size, y);
  }
  ctx.stroke();
  ctx.restore();
}
