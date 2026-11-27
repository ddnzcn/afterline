import { useMemo } from "react";

import type { LiveFrame } from "@tta/core";

import { VISIBLE_ROWS, boardAfter, completedRows, formatTime, shortName } from "../board";
import { CATEGORY, Glyph } from "../categories";
import type { Line, Snapshot, SnapshotAnalysis } from "../types";

import { BoardCanvas, type BoardOverlays } from "./BoardCanvas";
import type { LineChoice } from "./LineCompare";
import { PiecePreview } from "./PiecePreview";

export type StageMode = "live" | "review" | "line";

interface BoardStageProps {
  mode: StageMode;
  live: LiveFrame;
  snapshot: Snapshot;
  analysis: SnapshotAnalysis;
  line: Line | null;
  lineChoice: LineChoice;
  lineStep: number;
  replaying: boolean;
  speed: number;
  cell: number;
}

const sameCells = (a: readonly [number, number][], b: readonly [number, number][]): boolean =>
  a.length === b.length && a.every(([x, y]) => b.some(([bx, by]) => bx === x && by === y));

export function BoardStage({ mode, live, snapshot, analysis, line, lineChoice, lineStep, replaying, speed, cell }: BoardStageProps) {
  const lineName = lineChoice === "engine" ? "engine line" : "what you played";
  const best = analysis.best?.steps[0];
  const matched = !!best && best.piece === snapshot.placement.piece && sameCells(best.cells, snapshot.placement.cells);

  const view = useMemo((): { grid: string[]; overlays: BoardOverlays; caption: string; chip: string } => {
    if (mode === "line" && line && lineStep > 0) {
      const before = boardAfter(snapshot.board, line.steps, lineStep - 1);
      const step = line.steps[lineStep - 1]!;
      return {
        grid: before,
        overlays: { landed: { cells: step.cells, piece: step.piece }, clearedRows: completedRows(before, step.cells) },
        chip: `Review · ${lineName} ${lineStep}/${line.steps.length}`,
        caption: `${lineChoice === "engine" ? "Engine line" : "What you played"} · step ${lineStep} of ${line.steps.length} · ${shortName(step)} +${step.attack}`
      };
    }
    if (mode !== "live") {
      const overlays: BoardOverlays = matched
        ? { live: { cells: snapshot.placement.cells, piece: snapshot.placement.piece } }
        : {
            you: { cells: snapshot.placement.cells, piece: snapshot.placement.piece },
            ...(best ? { engine: { cells: best.cells, piece: best.piece } } : {})
          };
      return {
        grid: snapshot.board,
        overlays,
        chip: `Review · piece ${snapshot.index + 1}`,
        caption: matched ? "You matched the engine" : `Paused where piece ${snapshot.index + 1} spawned · your move (hatched) vs engine (ringed)`
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
  }, [mode, line, lineStep, lineChoice, lineName, snapshot, best, matched, live, replaying, speed]);

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
    <div className="stage-board">
      <div className="stage-head">
        <span className={`mode-chip${isReview ? " review" : ""}`}>{view.chip}</span>
        <span className="stage-caption">{view.caption}</span>
      </div>
      <div className="stage-row">
        <div className="side-col side-left">
          <span className="al-label">Hold</span>
          <div className="piece-box">{hold ? <PiecePreview piece={hold} size={14} /> : <span className="faint">Empty</span>}</div>
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
        <div className="meter" style={{ height: VISIBLE_ROWS * cell }} aria-label={`Incoming garbage: ${incoming}`} role="meter" aria-valuenow={incoming} aria-valuemin={0} aria-valuemax={VISIBLE_ROWS}>
          <i className="meter-pending" style={{ height: Math.min(incoming, VISIBLE_ROWS) * cell }} />
          <i style={{ height: Math.min(confirmed, VISIBLE_ROWS) * cell }} />
        </div>
        <div className="well">
          <BoardCanvas grid={view.grid} overlays={view.overlays} cell={cell} label={view.caption} />
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
              <PiecePreview key={i} piece={p} size={i === 0 ? 14 : 11} />
            ))}
          </div>
          {isReview && mode === "review" && !matched && (
            <ul className="legend">
              <li>
                <span className="swatch you" /> You
              </li>
              <li>
                <span className="swatch engine" /> Best at your position
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
