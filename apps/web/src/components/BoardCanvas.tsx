import { useEffect, useRef } from "react";

import { BOARD_WIDTH, PIECE_COLOR, VISIBLE_ROWS, cellAt, type Grid } from "../board";

export interface Overlay {
  cells: [number, number][];
  piece: string;
  style: "solid" | "ghost" | "outline";
  label?: string;
}

interface BoardCanvasProps {
  grid: Grid;
  overlays: Overlay[];
  cellSize?: number;
}

const BG = "#11141a";
const GRID_LINE = "#1b2029";

export function BoardCanvas({ grid, overlays, cellSize = 28 }: BoardCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = BOARD_WIDTH * cellSize;
  const height = VISIBLE_ROWS * cellSize;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let x = 1; x < BOARD_WIDTH; x++) line(ctx, x * cellSize + 0.5, 0, x * cellSize + 0.5, height);
    for (let y = 1; y < VISIBLE_ROWS; y++) line(ctx, 0, y * cellSize + 0.5, width, y * cellSize + 0.5);

    // spawn zone above the visible 20 rows
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(0, 0, width, 2 * cellSize);

    const toScreen = (x: number, y: number): [number, number] => [x * cellSize, (VISIBLE_ROWS - 1 - y) * cellSize];

    for (let y = 0; y < VISIBLE_ROWS; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const c = cellAt(grid, x, y);
        if (c === ".") continue;
        const [sx, sy] = toScreen(x, y);
        drawBlock(ctx, sx, sy, cellSize, PIECE_COLOR[c] ?? PIECE_COLOR.x!, 1);
      }
    }

    for (const o of overlays) {
      const color = PIECE_COLOR[o.piece] ?? "#ffffff";
      for (const [x, y] of o.cells) {
        if (y >= VISIBLE_ROWS) continue;
        const [sx, sy] = toScreen(x, y);
        if (o.style === "solid") drawBlock(ctx, sx, sy, cellSize, color, 1);
        if (o.style === "ghost") drawBlock(ctx, sx, sy, cellSize, color, 0.35);
        ctx.strokeStyle = o.style === "solid" ? "#ffffff" : color;
        ctx.lineWidth = 2;
        ctx.setLineDash(o.style === "outline" || o.style === "ghost" ? [5, 3] : []);
        ctx.strokeRect(sx + 2, sy + 2, cellSize - 4, cellSize - 4);
        ctx.setLineDash([]);
      }
    }
  }, [grid, overlays, cellSize, width, height]);

  return <canvas ref={ref} className="board-canvas" style={{ width, height }} aria-label="Board" />;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 1, y + 1, size - 2, 3);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 1, y + size - 4, size - 2, 3);
  ctx.globalAlpha = 1;
}
