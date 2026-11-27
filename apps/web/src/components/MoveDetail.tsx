import { BOARD_WIDTH, describeStep, formatTime, shortPlayedNote, type Grid } from "../board";
import { CategoryBadge } from "../categories";
import type { LineStep, Snapshot, SnapshotAnalysis } from "../types";

import { LineCompare, type LineChoice } from "./LineCompare";
import { KeyHints } from "./NowPlaying";

interface MoveDetailProps {
  snapshots: readonly Snapshot[];
  snapshot: Snapshot;
  analysis: SnapshotAnalysis;
  boardWidth?: number;
  altIndex: number | null;
  lineChoice: LineChoice;
  lineStep: number;
  linePlaying: boolean;
  onAltIndex: (index: number | null) => void;
  onLineChoice: (c: LineChoice) => void;
  onLineStep: (c: LineChoice, step: number) => void;
  onTogglePlayLine: () => void;
}

const sameCells = (a: readonly [number, number][], b: readonly [number, number][]): boolean =>
  a.length === b.length && a.every(([x, y]) => b.some(([bx, by]) => bx === x && by === y));

/** Right panel in Review mode: you vs the best at your position, the gap, reasons and the lines. */
export function MoveDetail(props: MoveDetailProps) {
  const { snapshots, snapshot, analysis, boardWidth = BOARD_WIDTH, altIndex } = props;
  const p = snapshot.placement;
  const best = analysis.best?.steps[0];
  const yours = analysis.played?.steps[0] ?? analysis.actual?.steps[0];
  const matched = !!best && best.piece === p.piece && sameCells(best.cells, p.cells);
  const pending = snapshot.incomingGarbage.filter((g) => !g.confirmed).reduce((s, g) => s + g.amount, 0);
  const incoming = snapshot.incomingGarbage.reduce((s, g) => s + g.amount, 0);
  const playedLen = analysis.played?.steps.length ?? 0;
  const shortNote = shortPlayedNote(snapshots, snapshot.index, playedLen);
  const activeEngine = altIndex !== null ? (analysis.alternatives[altIndex] ?? analysis.best) : analysis.best;
  const altRank = altIndex !== null && analysis.alternatives[altIndex] ? altIndex + 2 : null;
  const engineLabel = altRank !== null ? `Alt #${altRank}` : "Engine line";
  const engineShortLabel = altRank !== null ? `Alt #${altRank}` : "Engine";

  return (
    <aside className="panel move-detail" aria-label={`Piece ${snapshot.index + 1}`}>
      <div className="panel-head">
        <h2>
          Piece #{snapshot.index + 1} <span className="num faint">{formatTime(snapshot.frame)}</span>
        </h2>
        {analysis.flagged && analysis.primary ? (
          <CategoryBadge category={analysis.primary} />
        ) : (
          <span className="al-badge">{matched || analysis.gap === 0 ? "No miss" : "Not a miss"}</span>
        )}
      </div>

      {matched ? (
        <div className="cmp-card">
          <span className="al-label">
            <span className="swatch you" /> <span className="swatch engine" /> You and best at your position
          </span>
          <strong>{best.usedHold ? `hold → ${describeStep(best)}` : describeStep(best)}</strong>
          <span className="muted">
            {best.lines} lines · {best.attack} atk · {best.usedHold ? "hold" : "no hold"}
          </span>
        </div>
      ) : (
        <div className="cmp">
          <CompareCard title="You" swatch="you" step={yours} fallback={{ lines: p.linesCleared, attack: p.attack, hold: p.usedHold, name: p.piece.toUpperCase() }} />
          <CompareCard title="Best at your position" swatch="engine" step={best} />
        </div>
      )}

      {matched && (
        <p className="note good-note">
          <span aria-hidden="true">✓</span> <strong>You matched the engine.</strong> Same cells as the best at your position.
        </p>
      )}

      {!matched && (
        <div className="gap-row">
          <span className={`gap-big num${analysis.flagged ? " bad" : ""}`}>{analysis.gap.toFixed(analysis.gap < 1 ? 2 : 1)}</span>
          <span>
            <strong>Gap</strong>
            <span className="muted"> gap = attack-line equivalents, not lines sent</span>
          </span>
        </div>
      )}

      {analysis.flagged ? (
        <ul className="reasons">
          {analysis.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        !matched &&
        analysis.gap > 0 && (
          <p className="note">
            {analysis.planPaidOff
                ? `The engine preferred ${best ? describeStep(best) : "a different move"}, but your next pieces scored as well.`
                : "Below the miss threshold."}
          </p>
        )
      )}

      <div className="state-row muted">
        B2B <span className="num">{snapshot.b2b > 0 ? `×${snapshot.b2b}` : "–"}</span> · Combo{" "}
        <span className="num">{snapshot.combo > 0 ? snapshot.combo : "–"}</span> · Incoming{" "}
        <span className={`num${incoming > 0 ? " bad" : ""}`}>{incoming}</span>
        {pending > 0 && " pending"}
      </div>

      <LineCompare
        start={snapshot.board as Grid}
        boardWidth={boardWidth}
        engine={activeEngine}
        engineLabel={engineLabel}
        engineShortLabel={engineShortLabel}
        played={analysis.played}
        choice={props.lineChoice}
        step={props.lineStep}
        playing={props.linePlaying}
        shortNote={shortNote}
        onChoice={props.onLineChoice}
        onStep={props.onLineStep}
        onTogglePlay={props.onTogglePlayLine}
      />

      <section>
        <div className="alts-head">
          <h3 className="al-label">Other first moves</h3>
          {altRank !== null && (
            <button className="link-btn alts-reset" onClick={() => props.onAltIndex(null)}>
              Back to best
            </button>
          )}
        </div>
        {analysis.alternatives.length > 0 ? (
          <ol className="alts">
            {analysis.alternatives.map((alt, i) => {
              const s0 = alt.steps[0];
              const active = altIndex === i;
              const label = s0 ? (s0.usedHold ? `Hold → ${describeStep(s0)}` : describeStep(s0)) : "—";
              const delta = (alt.score - (analysis.best?.score ?? 0)).toFixed(1);
              return (
                <li key={i}>
                  <button
                    className="alt-btn"
                    aria-pressed={active}
                    onClick={() => props.onAltIndex(active ? null : i)}
                    aria-label={`Preview alternative #${i + 2}: ${label}, ${delta}`}
                  >
                    <span className="alt-rank num faint">#{i + 2}</span>
                    <span className="alt-name">{label}</span>
                    <span className="num faint">{delta}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted">No other first moves to show for this piece.</p>
        )}
      </section>

      <KeyHints hints={[[["↑", "↓"], "step"], [["L"], "play line"], [["E"], "switch"], [["Esc"], "reset"]]} />
    </aside>
  );
}

interface CompareCardProps {
  title: string;
  swatch: "you" | "engine";
  step: LineStep | undefined;
  fallback?: { lines: number; attack: number; hold: boolean; name: string };
}

function CompareCard({ title, swatch, step, fallback }: CompareCardProps) {
  const name = step ? (step.usedHold ? `hold → ${describeStep(step)}` : describeStep(step)) : (fallback?.name ?? "—");
  const lines = step?.lines ?? fallback?.lines ?? 0;
  const attack = step?.attack ?? fallback?.attack ?? 0;
  const hold = step?.usedHold ?? fallback?.hold ?? false;
  return (
    <div className="cmp-card">
      <span className="al-label">
        <span className={`swatch ${swatch}`} /> {title}
      </span>
      <strong>{name}</strong>
      <dl>
        <dt>Lines</dt>
        <dd className="num">{lines}</dd>
        <dt>Attack</dt>
        <dd className="num">{attack}</dd>
        <dt>Hold</dt>
        <dd>{hold ? `Yes${step ? ` (${step.piece.toUpperCase()})` : ""}` : "No"}</dd>
      </dl>
    </div>
  );
}
