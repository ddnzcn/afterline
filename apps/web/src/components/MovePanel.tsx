import { CATEGORY_COLOR, describeStep } from "../board";
import { CATEGORY_LABEL, type Line, type LineStep, type Snapshot, type SnapshotAnalysis } from "../types";

export type LineChoice = "engine" | "yours";

interface MovePanelProps {
  snapshot: Snapshot;
  analysis: SnapshotAnalysis;
  lineChoice: LineChoice;
  lineStep: number;
  playing: boolean;
  onLineChoice: (c: LineChoice) => void;
  onLineStep: (n: number) => void;
  onTogglePlay: () => void;
}

export function MovePanel({ snapshot, analysis, lineChoice, lineStep, playing, onLineChoice, onLineStep, onTogglePlay }: MovePanelProps) {
  const p = snapshot.placement;
  const best = analysis.best;
  const line: Line | null = lineChoice === "engine" ? best : analysis.played;
  const yourStep: LineStep | undefined = analysis.played?.steps[0] ?? analysis.actual?.steps[0];

  return (
    <aside className="move-panel">
      <section className="panel">
        <div className="panel-head">
          <h3>Piece #{snapshot.index + 1}</h3>
          {analysis.flagged && analysis.primary ? (
            <span className="badge" style={{ background: CATEGORY_COLOR[analysis.primary] }}>
              {CATEGORY_LABEL[analysis.primary]}
            </span>
          ) : (
            <span className="badge ok">OK</span>
          )}
        </div>
        <div className="compare">
          <div className="compare-col">
            <span className="label">You</span>
            <strong>{yourStep ? describeStep(yourStep) : p.piece.toUpperCase()}</strong>
            <span className="muted">
              {p.linesCleared} lines · {p.attack} atk{p.usedHold ? " · hold" : ""}
            </span>
          </div>
          <div className="compare-col engine">
            <span className="label">Engine</span>
            <strong>{best?.steps[0] ? describeStep(best.steps[0]) : "—"}</strong>
            <span className="muted">
              {best?.steps[0] ? `${best.steps[0].lines} lines · ${best.steps[0].attack} atk${best.steps[0].usedHold ? " · hold" : ""}` : ""}
            </span>
          </div>
        </div>
        <div className="gap-row">
          <span className="label">Score gap</span>
          <span className={`gap-value${analysis.flagged ? " bad" : ""}`}>{analysis.gap.toFixed(2)}</span>
        </div>
        {analysis.planPaidOff && analysis.gap > 0 && !analysis.flagged && (
          <p className="reason muted">The engine's choice looked better here, but your next pieces scored as well, so it isn't counted as a miss.</p>
        )}
        {analysis.reasons.map((r) => (
          <p key={r} className="reason">
            {r}
          </p>
        ))}
        <div className="state-row muted">
          B2B {snapshot.b2b < 0 ? "–" : `×${snapshot.b2b}`} · combo {snapshot.combo < 0 ? "–" : snapshot.combo} · incoming{" "}
          {snapshot.incomingGarbage.reduce((s, g) => s + g.amount, 0)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Line</h3>
          <div className="segmented small">
            <button className={lineChoice === "engine" ? "active" : ""} onClick={() => onLineChoice("engine")}>
              Engine
            </button>
            <button className={lineChoice === "yours" ? "active" : ""} onClick={() => onLineChoice("yours")}>
              What you played
            </button>
          </div>
        </div>
        {line ? (
          <>
            <div className="line-controls">
              <button onClick={() => onLineStep(0)} title="Reset (Esc)">⏮</button>
              <button onClick={() => onLineStep(Math.max(0, lineStep - 1))} title="Step back (↑)">◀</button>
              <button className="play" onClick={onTogglePlay} title="Play line (L)">
                {playing ? "❚❚" : "▶"}
              </button>
              <button onClick={() => onLineStep(Math.min(line.steps.length, lineStep + 1))} title="Step forward (↓)">▶</button>
              <span className="muted">
                {lineStep}/{line.steps.length} · score {line.score.toFixed(1)}
              </span>
            </div>
            <ol className="line-steps">
              {line.steps.map((s, i) => (
                <li key={i}>
                  <button className={lineStep === i + 1 ? "active" : ""} onClick={() => onLineStep(i + 1)}>
                    <span className="step-no">{i + 1}</span>
                    <span>
                      {s.usedHold ? "hold → " : ""}
                      {describeStep(s)}
                    </span>
                    {s.attack > 0 && <span className="atk">+{s.attack}</span>}
                    {s.brokeB2B >= 0 && <span className="warn">B2B break</span>}
                  </button>
                </li>
              ))}
            </ol>
            {lineChoice === "yours" && (
              <p className="hint">Your real next {line.steps.length} pieces, scored like the engine's line (stops where garbage entered the board).</p>
            )}
          </>
        ) : (
          <p className="muted">No line available.</p>
        )}
      </section>

      {lineChoice === "engine" && analysis.alternatives.length > 0 && (
        <section className="panel">
          <h3>Alternatives</h3>
          <ol className="alts">
            {analysis.alternatives.map((alt, i) => (
              <li key={i}>
                <span>{alt.steps[0] ? describeStep(alt.steps[0]) : "—"}</span>
                <span className="muted">{alt.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel keys">
        <h3>Keys</h3>
        <dl>
          <dt>← →</dt>
          <dd>previous / next piece</dd>
          <dt>⇧ ← →</dt>
          <dd>previous / next miss</dd>
          <dt>↑ ↓</dt>
          <dd>step through the line</dd>
          <dt>Space</dt>
          <dd>play / pause replay</dd>
          <dt>L</dt>
          <dd>play line</dd>
          <dt>E</dt>
          <dd>engine / your line</dd>
          <dt>Home End</dt>
          <dd>first / last piece</dd>
        </dl>
      </section>
    </aside>
  );
}
