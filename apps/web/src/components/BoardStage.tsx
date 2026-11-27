import { useEffect, useMemo, useRef, useState } from "react";

import type { LiveFrame } from "@tta/core";

import { BOARD_WIDTH, VISIBLE_ROWS, boardAfter, completedRows, formatTime, shortName, type BoardDims } from "../board";
import { CATEGORY, Glyph } from "../categories";
import type { Line, Snapshot, SnapshotAnalysis } from "../types";

import { BoardCanvas, type BoardOverlays } from "./BoardCanvas";
import type { LineChoice } from "./LineCompare";
import { PiecePreview } from "./PiecePreview";

export type StageMode = "live" | "review" | "line";

interface BoardStageProps {
  mode: StageMode;
  dims?: BoardDims;
  live: LiveFrame;
  snapshot: Snapshot;
  analysis: SnapshotAnalysis;
  engineLine: Line | null;
  altRank: number | null;
  line: Line | null;
  lineChoice: LineChoice;
  lineStep: number;
  replaying: boolean;
  speed: number;
}

const HEAD = 28; // mode chip + caption row (min-height in styles.css)
const MIN_CELL = 16;
const MAX_CELL = 48;
const DEFAULT_DIMS: BoardDims = { width: BOARD_WIDTH, visibleRows: VISIBLE_ROWS };

/**
 * The largest cell that fits the space the stage actually has: visibleRows under the head row,
 * board width columns plus the hold / next columns (which grow with the board) and the garbage meter.
 */
function useBoardCell(dims: BoardDims): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(24);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const byHeight = (el.clientHeight - HEAD - 8) / dims.visibleRows;
      // side columns are ~3.4 cells wide each, plus the 6px meter and three 12px gaps
      const byWidth = (el.clientWidth - 6 - 36) / (dims.width + 2 * 3.4);
      setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(byHeight, byWidth)))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.width, dims.visibleRows]);
  return [ref, cell];
}

const sameCells = (a: readonly [number, number][], b: readonly [number, number][]): boolean =>
  a.length === b.length && a.every(([x, y]) => b.some(([bx, by]) => bx === x && by === y));

export function BoardStage({ mode, dims = DEFAULT_DIMS, live, snapshot, analysis, engineLine, altRank, line, lineChoice, lineStep, replaying, speed }: BoardStageProps) {
  const [stageRef, cell] = useBoardCell(dims);
  const side = Math.round(Math.max(88, cell * 3.4));
  const pieceSize = Math.round(Math.max(12, cell * 0.55));
  const engineChipName = altRank !== null ? `Alt #${altRank}` : "engine line";
  const engineTitle = altRank !== null ? `Alt #${altRank}` : "Engine line";
  const lineName = lineChoice === "engine" ? engineChipName : "what you played";
  const target = engineLine?.steps[0];
  const matched = !!target && target.piece === snapshot.placement.piece && sameCells(target.cells, snapshot.placement.cells);

  const view = useMemo((): { grid: string[]; overlays: BoardOverlays; caption: string; chip: string } => {
    if (mode === "line" && line && lineStep > 0) {
      const before = boardAfter(snapshot.board, line.steps, lineStep - 1, dims.width);
      const step = line.steps[lineStep - 1]!;
      return {
        grid: before,
        overlays: { landed: { cells: step.cells, piece: step.piece }, clearedRows: completedRows(before, step.cells, dims.width) },
        chip: `Review · ${lineName} ${lineStep}/${line.steps.length}`,
        caption: `${lineChoice === "engine" ? engineTitle : "What you played"} · step ${lineStep} of ${line.steps.length} · ${shortName(step)} +${step.attack}`
      };
    }
    if (mode !== "live") {
      const overlays: BoardOverlays = matched
        ? { live: { cells: snapshot.placement.cells, piece: snapshot.placement.piece } }
        : {
            you: { cells: snapshot.placement.cells, piece: snapshot.placement.piece },
            ...(target ? { engine: { cells: target.cells, piece: target.piece } } : {})
          };
      const altLabel = altRank !== null ? `Alt #${altRank}` : "engine";
      return {
        grid: snapshot.board,
        overlays,
        chip: altRank !== null ? `Review · piece ${snapshot.index + 1} · Alt #${altRank}` : `Review · piece ${snapshot.index + 1}`,
        caption: matched
          ? altRank !== null
            ? `You played Alt #${altRank}`
            : "You matched the engine"
          : `Paused where piece ${snapshot.index + 1} spawned · your move (hatched) vs ${altLabel} (ringed)`
      };
    }
    const overlays: BoardOverlays = live.falling
      ? { live: { cells: live.falling.cells, piece: live.falling.piece }, ...(live.shadow ? { shadow: { cells: live.shadow, piece: live.falling.piece } } : {}) }
      : {};
    return {
      grid: live.board,
      overlays,
      chip: "Live",
      caption: live.over ? "End of game" : replaying ? `Playing · ${speed}×` : `Paused mid-piece · ${formatTime(live.frame)}`
    };
  }, [mode, dims.width, line, lineStep, lineChoice, lineName, engineTitle, altRank, snapshot, target, matched, live, replaying, speed]);

  const isReview = mode !== "live";
  const hold = isReview ? snapshot.hold : live.hold;
  const next = isReview ? snapshot.next : live.next;
  const b2b = isReview ? snapshot.b2b : live.b2b;
  const combo = isReview ? snapshot.combo : live.combo;
  const confirmed = isReview ? snapshot.incomingGarbage.filter((g) => g.confirmed).reduce((s, g) => s + g.amount, 0) : live.incoming;
  const pending = isReview ? snapshot.incomingGarbage.filter((g) => !g.confirmed).reduce((s, g) => s + g.amount, 0) : 0;
  const incoming = confirmed + pending;
  const missCategory = isReview && analysis.flagged ? analysis.primary : null;

  return (
    <div className="stage-board" ref={stageRef} style={{ ["--side" as string]: `${side}px` }}>
      <div className="stage-head">
        <span className={`mode-chip${isReview ? " review" : ""}`}>{view.chip}</span>
        <span className="stage-caption">{view.caption}</span>
      </div>
      <div className="stage-row">
        <div className="side-col side-left">
          <span className="al-label">Hold</span>
          <div className="piece-box">{hold ? <PiecePreview piece={hold} size={pieceSize} /> : <span className="faint">Empty</span>}</div>
          <dl className="side-stats">
            <dt className="al-label">B2B</dt>
            <dd className="num">{b2b > 0 ? `×${b2b}` : "–"}</dd>
            <dt className="al-label">Combo</dt>
            <dd className="num">{combo > 0 ? combo : "–"}</dd>
            <dt className="al-label">Incoming</dt>
            <dd className={`num${incoming > 0 ? " bad" : ""}`}>{incoming}</dd>
            {pending > 0 && <dd className="side-note">{confirmed > 0 ? `${pending} pending` : "pending"}</dd>}
          </dl>
        </div>
        <div
          className="meter"
          style={{ height: dims.visibleRows * cell }}
          aria-label={`Incoming garbage: ${incoming}`}
          role="meter"
          aria-valuenow={incoming}
          aria-valuemin={0}
          aria-valuemax={dims.visibleRows}
        >
          <i className="meter-pending" style={{ height: Math.min(incoming, dims.visibleRows) * cell }} />
          <i style={{ height: Math.min(confirmed, dims.visibleRows) * cell }} />
        </div>
        <div className="well">
          <BoardCanvas grid={view.grid} overlays={view.overlays} cell={cell} cols={dims.width} rows={dims.visibleRows} label={view.caption} />
          {missCategory && (
            <span className="miss-marker" title={CATEGORY[missCategory].label}>
              <Glyph category={missCategory} size={12} />
            </span>
          )}
        </div>
        <div className="side-col side-right">
          <span className="al-label">Next</span>
          <div className="piece-box next-box">
            {next.map((p, i) => (
              <PiecePreview key={i} piece={p} size={i === 0 ? pieceSize : Math.round(pieceSize * 0.8)} />
            ))}
          </div>
          {isReview && mode === "review" && !matched && (
            <ul className="legend">
              <li>
                <span className="swatch you" /> You
              </li>
              <li>
                <span className="swatch engine" /> {altRank !== null ? `Alt #${altRank}` : "Best at your position"}
              </li>
              <li>
                <span className="swatch both" /> Both
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
