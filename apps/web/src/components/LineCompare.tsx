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
      <Strip title="Engine line" sub="best at your positions" start={start} line={engine} current={choice === "engine" ? step : 0} onPick={(i) => onStep("engine", i)} />
      <Strip title="What you played" sub={played && played.steps.length < SLOTS ? `${played.steps.length} of ${SLOTS}` : ""} start={start} line={played} current={choice === "yours" ? step : 0} onPick={(i) => onStep("yours", i)} />
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

interface StripProps {
  title: string;
  sub: string;
  start: Grid;
  line: Line | null;
  current: number;
  onPick: (step: number) => void;
}

function Strip({ title, sub, start, line, current, onPick }: StripProps) {
  const befores = useMemo(() => (line ? line.steps.map((_, i) => boardAfter(start, line.steps, i)) : []), [start, line]);
  if (!line) return null;
  return (
    <div className="strip">
      <div className="strip-head">
        <span>
          <strong>{title}</strong> {sub && <span className="faint">· {sub}</span>}
        </span>
        <span className="faint">
          score <span className="num">{line.score.toFixed(1)}</span>
        </span>
      </div>
      <ol className="strip-boards">
        {Array.from({ length: SLOTS }, (_, i) => {
          const s = line.steps[i];
          if (!s) {
            return (
              <li key={i} className="strip-slot empty" aria-hidden="true">
                <span className="mini-empty" />
                <span className="strip-name faint">—</span>
              </li>
            );
          }
          return (
            <li key={i} className="strip-slot">
              <button className="mini" aria-current={current === i + 1} onClick={() => onPick(i + 1)} aria-label={`Step ${i + 1}: ${shortName(s)}, ${s.attack} attack${s.usedHold ? ", used hold" : ""}`}>
                <MiniBoard grid={befores[i]!} step={s} />
                {s.usedHold && <span className="mini-tag">H</span>}
                {s.attack > 0 && <span className="mini-atk num">+{s.attack}</span>}
              </button>
              <span className="strip-name">{shortName(s)}</span>
              <span className={`strip-atk num${s.attack > 0 ? " good" : " faint"}`}>+{s.attack}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
