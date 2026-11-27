import { useEffect, useState } from "react";

import { reducedMotion } from "../theme";

import { FlowHeader } from "./FlowHeader";
import { Icon } from "./Icon";

export interface RoundProgress {
  roundIndex: number;
  done: number;
  total: number;
}

interface ProgressViewProps {
  fileName: string;
  player: string;
  gamemode: string | null;
  done: number;
  total: number;
  rounds: RoundProgress[];
  startedAt: number;
  onCancel: () => void;
}

const CHECKS = [
  (piece: number) => `Checking spins and back-to-back chains at piece ${piece}`,
  () => "Looking for T-slots and setups within the preview",
  () => "Comparing garbage handling when lines were incoming",
  () => "Replaying your next pieces to see if your plan paid off"
];

/** Analysis progress: round n of N, pieces and time left, a row of rounds, what is being checked. */
export function ProgressView({ fileName, player, gamemode, done, total, rounds, startedAt, onCancel }: ProgressViewProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, []);

  const starting = total === 0;
  const currentPos = Math.max(0, rounds.findIndex((r) => r.done < r.total));
  const current = rounds[currentPos];
  const elapsed = (Date.now() - startedAt) / 1000;
  const eta = done > 0 && total > done ? Math.max(1, Math.round((elapsed / done) * (total - done))) : null;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const mode = gamemode === "league" ? "League" : gamemode === "40l" ? "40L" : (gamemode ?? "");
  const check = CHECKS[tick % CHECKS.length]!(current ? current.done + 1 : 1);

  return (
    <div className="flow">
      <FlowHeader meta={[fileName, player, mode]} />
      <main className="flow-main">
        <section className="progress-card">
          <div className="progress-head">
            <div>
              <h1 className="flow-title">
                {starting ? "Starting…" : rounds.length > 1 && current ? `Analyzing round ${current.roundIndex + 1} (${currentPos + 1} of ${rounds.length})` : "Analyzing"}
              </h1>
              <p className="muted num">
                {starting ? (
                  "Reading the rounds and counting pieces"
                ) : current ? (
                  <>
                    {current.done} / {current.total} pieces{eta ? ` · about ${eta} s left` : ""}
                  </>
                ) : (
                  `${done} / ${total} pieces`
                )}
              </p>
            </div>
            <button className="al-btn al-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <div
            className={`al-progress${starting ? " indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total || undefined}
            aria-valuenow={starting ? undefined : done}
            aria-valuetext={starting ? "Starting" : `${done} of ${total} pieces`}
          >
            <i style={starting ? undefined : { width: `${pct}%` }} />
          </div>
          {rounds.length > 1 && (
            <ol className="round-steps" aria-label="Rounds">
              {rounds.map((r, i) => {
                const state = r.done >= r.total && r.total > 0 ? "done" : i === currentPos ? "current" : "todo";
                return (
                  <li key={r.roundIndex} className={state} aria-current={state === "current" ? "step" : undefined}>
                    <span className="step-dot">{state === "done" && <Icon name="check" size={12} />}</span>
                    <span className="step-label">R{r.roundIndex + 1}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="progress-card checking">
          <span className="al-label">What's being checked</span>
          <h2>{starting ? "Getting the rounds ready" : check}</h2>
          <p className="muted">Every placement is compared with the best move at your position, six pieces deep.</p>
        </section>
      </main>
    </div>
  );
}
