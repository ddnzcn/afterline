import { useMemo } from "react";

import { boardAfter, shortName, type Grid } from "../board";
import type { Line } from "../types";

import { MiniBoard } from "./MiniBoard";

export type LineChoice = "engine" | "yours";

const SLOTS = 6;

interface LineCompareProps {
  start: Grid;
  engine: Line | null;
  played: Line | null;
  choice: LineChoice;
  step: number;
  playing: boolean;
  /** Why "What you played" is shorter than six pieces, if it is. */
  shortNote: string | null;
  onChoice: (c: LineChoice) => void;
  onStep: (choice: LineChoice, step: number) => void;
  onTogglePlay: () => void;
}

const attackOf = (line: Line | null, n: number): number => (line?.steps.slice(0, n) ?? []).reduce((s, x) => s + x.attack, 0);

export function LineCompare({ start, engine, played, choice, step, playing, shortNote, onChoice, onStep, onTogglePlay }: LineCompareProps) {
  const active = choice === "engine" ? engine : played;
  const length = active?.steps.length ?? 0;
  const horizon = Math.min(engine?.steps.length ?? 0, played?.steps.length ?? SLOTS) || (engine?.steps.length ?? 0);
  const engineAttack = attackOf(engine, horizon);
  const youAttack = attackOf(played, horizon);
  const maxAttack = Math.max(1, engineAttack, youAttack);

  return (
    <section className="line-compare" aria-label="Line comparison">
      <div className="lc-head">
        <h3>Line comparison</h3>
        <div className="al-seg" role="group" aria-label="Line on the board">
          <button aria-pressed={choice === "engine"} onClick={() => onChoice("engine")}>
            Engine line
          </button>
          <button aria-pressed={choice === "yours"} onClick={() => onChoice("yours")} disabled={!played}>
            What you played
          </button>
        </div>
      </div>
      <div className="lc-controls">
        <button className="al-btn al-btn-icon" onClick={() => onStep(choice, 0)} aria-label="Reset the line (Esc)">
          ↺
        </button>
        <button className="al-btn al-btn-icon" onClick={() => onStep(choice, Math.max(0, step - 1))} aria-label="Step back (↑)" disabled={step === 0}>
          ‹
        </button>
        <button className="al-btn" onClick={onTogglePlay} disabled={!active}>
          {playing ? "❚❚ Pause" : "▶ Play line"}
        </button>
        <button className="al-btn al-btn-icon" onClick={() => onStep(choice, Math.min(length, step + 1))} aria-label="Step forward (↓)" disabled={step >= length}>
          ›
        </button>
        <span className="num lc-count">
          {step} <span className="faint">/ {length}</span>
        </span>
      </div>
      <StepTable start={start} engine={engine} played={played} choice={choice} step={step} onPick={onStep} />
      {shortNote && <p className="lc-note">{shortNote}</p>}
      <div className="lc-totals" aria-label="Attack over the same pieces">
        <div className="lc-bar">
          <span>Engine</span>
          <i style={{ width: `${(engineAttack / maxAttack) * 100}%` }} className="engine" />
          <b className="num">+{engineAttack}</b>
        </div>
        <div className="lc-bar">
          <span>You</span>
          <i style={{ width: `${(youAttack / maxAttack) * 100}%` }} />
          <b className="num">+{youAttack}</b>
        </div>
        <p className="faint">Attack over the same {horizon} pieces · H = used hold</p>
      </div>
    </section>
  );
}

interface StepTableProps {
  start: Grid;
  engine: Line | null;
  played: Line | null;
  choice: LineChoice;
  step: number;
  onPick: (choice: LineChoice, step: number) => void;
}

/** Both lines side by side, one row per step, so each step reads across: engine vs what you played. */
function StepTable({ start, engine, played, choice, step, onPick }: StepTableProps) {
  const engineBefores = useMemo(() => (engine ? engine.steps.map((_, i) => boardAfter(start, engine.steps, i)) : []), [start, engine]);
  const playedBefores = useMemo(() => (played ? played.steps.map((_, i) => boardAfter(start, played.steps, i)) : []), [start, played]);
  return (
    <div className="step-table" role="table" aria-label="Engine line and what you played, step by step">
      <div className="step-row step-head" role="row">
        <span role="columnheader" aria-label="Step" />
        <span role="columnheader">
          <strong>Engine line</strong>
          {engine && <span className="faint num"> {engine.score.toFixed(1)}</span>}
        </span>
        <span role="columnheader">
          <strong>What you played</strong>
          {played && <span className="faint num"> {played.score.toFixed(1)}</span>}
        </span>
      </div>
      {Array.from({ length: SLOTS }, (_, i) => (
        <div key={i} className="step-row" role="row">
          <span className="step-no num" role="rowheader">
            {i + 1}
          </span>
          <StepCell step={engine?.steps[i]} before={engineBefores[i]} current={choice === "engine" && step === i + 1} onPick={() => onPick("engine", i + 1)} who="Engine" />
          <StepCell step={played?.steps[i]} before={playedBefores[i]} current={choice === "yours" && step === i + 1} onPick={() => onPick("yours", i + 1)} who="You" />
        </div>
      ))}
    </div>
  );
}

interface StepCellProps {
  step: Line["steps"][number] | undefined;
  before: Grid | undefined;
  current: boolean;
  who: string;
  onPick: () => void;
}

function StepCell({ step, before, current, who, onPick }: StepCellProps) {
  if (!step || !before) {
    return (
      <span className="step-cell empty" role="cell">
        <span className="mini-empty" aria-hidden="true" />
        <span className="faint">—</span>
      </span>
    );
  }
  return (
    <span role="cell">
      <button className="step-cell" aria-current={current} onClick={onPick} aria-label={`${who}: ${shortName(step)}, ${step.attack} attack${step.usedHold ? ", used hold" : ""}`}>
        <span className="mini">
          <MiniBoard grid={before} step={step} rows={10} cell={8} />
        </span>
        <span className="step-text">
          <span className="step-name">{shortName(step)}</span>
          <span className="step-meta">
            <span className={`num${step.attack > 0 ? " good" : " faint"}`}>+{step.attack}</span>
            {step.usedHold && <span className="hold-tag">H</span>}
          </span>
        </span>
      </button>
    </span>
  );
}
