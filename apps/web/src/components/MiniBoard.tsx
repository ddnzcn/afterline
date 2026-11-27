import { useEffect, useRef } from "react";

import { BOARD_WIDTH, cellAt, completedRows, type Grid } from "../board";
import { theme } from "../theme";
import type { LineStep } from "../types";

interface MiniBoardProps {
  /** Board before this step. */
  grid: Grid;
  step: LineStep;
  cols?: number;
  rows?: number;
  cell?: number;
}

/** A small board for line strips: the landed piece solid with an ink edge, the rest at 50%, cleared rows tinted. */
export function MiniBoard({ grid, step, cols = BOARD_WIDTH, rows = 12, cell = 5 }: MiniBoardProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = cols * cell;
  const h = rows * cell;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !ref.current) return;
    const t = theme();
    const dpr = window.devicePixelRatio || 1;
    ref.current.width = w * dpr;
    ref.current.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.boardBg;
    ctx.fillRect(0, 0, w, h);
    // keep the landed piece in view: show the rows up to just above it
    const top = Math.max(rows, Math.max(...step.cells.map(([, y]) => y)) + 2);
    const base = top - rows;
    const sy = (y: number): number => (top - 1 - y) * cell;
    for (const y of completedRows(grid, step.cells, cols)) {
      if (y < base) continue;
      ctx.fillStyle = t.accentSoft;
      ctx.fillRect(0, sy(y), w, cell);
    }
    ctx.globalAlpha = 0.62;
    for (let y = base; y < top; y++) {
      for (let x = 0; x < cols; x++) {
        const c = cellAt(grid, x, y);
        if (c === ".") continue;
        ctx.fillStyle = t.piece[c] ?? t.piece.x!;
        ctx.fillRect(x * cell + 0.5, sy(y) + 0.5, cell - 1, cell - 1);
      }
    }
    ctx.globalAlpha = 1;
    for (const [x, y] of step.cells) {
      if (y < base) continue;
      ctx.fillStyle = t.piece[step.piece] ?? t.ink;
      ctx.fillRect(x * cell, sy(y), cell, cell);
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell + 0.5, sy(y) + 0.5, cell - 1, cell - 1);
    }
  }, [grid, step, cols, rows, cell, w, h]);
  // drawn at a fixed resolution, scaled by CSS to the slot so six fit the narrow panel
  return <canvas ref={ref} className="mini-canvas" style={{ aspectRatio: `${w} / ${h}` }} aria-hidden="true" />;
}
