import type { LiveFrame } from "@tta/core";

import { CategoryBadge } from "../categories";
import type { SnapshotAnalysis } from "../types";

import { PiecePreview } from "./PiecePreview";

interface NowPlayingProps {
  live: LiveFrame;
  pieceCount: number;
  analyses: SnapshotAnalysis[];
  nextMiss: SnapshotAnalysis | null;
  onJump: (index: number) => void;
}

/** Right panel in Live mode. */
export function NowPlaying({ live, pieceCount, analyses, nextMiss, onJump }: NowPlayingProps) {
  const index = Math.min(live.pieces, pieceCount - 1);
  const sofar = analyses.slice(0, index);
  const misses = sofar.filter((a) => a.flagged).length;
  const attack = sofar.reduce((s, a) => s + (a.played?.steps[0]?.attack ?? 0), 0);
  const best = sofar.reduce((s, a) => s + (a.best?.steps[0]?.attack ?? 0), 0);

  return (
    <aside className="panel" aria-label="Now playing">
      <div className="panel-head">
        <h2>{live.over ? "End of game" : "Now playing"}</h2>
        <span className="num faint">
          piece {index + 1} / {pieceCount}
        </span>
      </div>
      {live.falling && !live.over && (
        <div className="card piece-card">
          <div className="piece-box small">
            <PiecePreview piece={live.falling.piece} size={12} />
          </div>
          <div>
            <strong>{live.falling.piece.toUpperCase()}</strong>
            <div className="muted">Falling, not locked yet</div>
          </div>
        </div>
      )}
      <div className="mini-stats">
        <div>
          <span className="al-label">B2B</span>
          <span className="num">{live.b2b > 0 ? `×${live.b2b}` : "–"}</span>
        </div>
        <div>
          <span className="al-label">Combo</span>
          <span className="num">{live.combo > 0 ? live.combo : "–"}</span>
        </div>
        <div>
          <span className="al-label">Incoming</span>
          <span className={`num${live.incoming > 0 ? " bad" : ""}`}>{live.incoming}</span>
        </div>
      </div>
      {!live.over && (
      <div className="card">
        <strong>Pause on a miss to see the better line</strong>
        <p className="muted">
          Playback stops by itself at the next miss while “Pause at misses” is on. Your placement and the best at your position appear on the board.
        </p>
      </div>
      )}
      {nextMiss && (
        <>
          <div className="al-label">
            Next miss · in {nextMiss.index - index} {nextMiss.index - index === 1 ? "piece" : "pieces"}
          </div>
          <button className="card next-miss" onClick={() => onJump(nextMiss.index)}>
            <span className="next-miss-top">
              <span className="num faint">#{nextMiss.index + 1}</span>
              <CategoryBadge category={nextMiss.primary!} />
              <span className="num bad">{nextMiss.gap.toFixed(1)}</span>
            </span>
            <span className="next-miss-reason">{nextMiss.reasons[0]}</span>
            <span className="next-miss-jump muted">
              → Jump to piece {nextMiss.index + 1}
              <span className="keys-inline">
                <kbd className="al-kbd">Shift</kbd>
                <kbd className="al-kbd">→</kbd>
              </span>
            </span>
          </button>
        </>
      )}
      <div className="card quiet">
        <span className="al-label">So far this round</span>
        <span>
          <span className="num">{misses}</span> {misses === 1 ? "miss" : "misses"} of <span className="num">{index}</span> · attack <span className="num">{attack}</span> /{" "}
          <span className="num">{best}</span> best at your positions
        </span>
      </div>
      <KeyHints hints={[[["Space"], "play / pause"], [["←", "→"], "piece"], [["Shift", "←→"], "miss"]]} />
    </aside>
  );
}

export function KeyHints({ hints }: { hints: [string[], string][] }) {
  return (
    <div className="key-hints">
      {hints.map(([keys, label]) => (
        <span key={label}>
          {keys.map((k) => (
            <kbd key={k} className="al-kbd">
              {k}
            </kbd>
          ))}{" "}
          {label}
        </span>
      ))}
    </div>
  );
}
