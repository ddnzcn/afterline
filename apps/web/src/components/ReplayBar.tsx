import { useMemo, useRef, useState, type PointerEvent } from "react";

import { CATEGORY_COLOR } from "../board";
import { CATEGORY_LABEL, type MissCategory, type SnapshotAnalysis } from "../types";

export const SPEEDS = [0.5, 1, 2, 4] as const;
const FPS = 60;

interface ReplayBarProps {
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  /** Piece currently on screen (0-based) and the number of pieces. */
  index: number;
  pieceCount: number;
  /** Current and total game frames, and the frame each piece spawns on. */
  frame: number;
  totalFrames: number;
  spawnFrame: (index: number) => number;
  replaying: boolean;
  speed: number;
  pauseAtMisses: boolean;
  onSeekFrame: (frame: number) => void;
  onSeekPiece: (index: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: number) => void;
  onPauseAtMisses: (on: boolean) => void;
  onPrevMiss: () => void;
  onNextMiss: () => void;
}

export const formatTime = (frames: number): string => {
  const s = Math.max(0, frames) / FPS;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

/** Video-player style scrubber over game time, with misses as points on the track. */
export function ReplayBar(props: ReplayBarProps) {
  const { analyses, visible, index, pieceCount, frame, totalFrames, spawnFrame, replaying, speed, pauseAtMisses } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<{ ratio: number; miss: SnapshotAnalysis | null } | null>(null);

  const total = Math.max(1, totalFrames);
  const ratioOfFrame = (f: number): number => Math.min(1, Math.max(0, f / total));
  const misses = useMemo(() => analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)), [analyses, visible]);
  const maxGap = Math.max(1, ...misses.map((m) => m.gap));

  const ratioFromEvent = (e: PointerEvent): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).dataset.miss) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    props.onSeekFrame(Math.round(ratioFromEvent(e) * total));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const ratio = ratioFromEvent(e);
    if (dragging.current) props.onSeekFrame(Math.round(ratio * total));
    const missEl = (e.target as HTMLElement).dataset.miss;
    setHover({ ratio, miss: missEl ? (analyses[Number(missEl)] ?? null) : null });
  };
  const stopDrag = (): void => {
    dragging.current = false;
  };

  return (
    <div className="replay-bar">
      <div
        className="track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={() => setHover(null)}
      >
        <div className="track-rail" />
        <div className="track-fill" style={{ width: `${ratioOfFrame(frame) * 100}%` }} />
        {misses.map((m) => {
          const size = 8 + (m.gap / maxGap) * 8;
          return (
            <button
              key={m.index}
              data-miss={m.index}
              className={`miss-point${m.index === index ? " current" : ""}`}
              style={{ left: `${ratioOfFrame(spawnFrame(m.index)) * 100}%`, width: size, height: size, background: CATEGORY_COLOR[m.primary!] }}
              onClick={() => props.onSeekPiece(m.index)}
              aria-label={`Miss at piece ${m.index + 1}: ${CATEGORY_LABEL[m.primary!]}`}
            />
          );
        })}
        <div className="track-thumb" style={{ left: `${ratioOfFrame(frame) * 100}%` }} />
        {hover && (
          <div className={`track-tip${hover.miss ? " miss" : ""}`} style={{ left: `${(hover.miss ? ratioOfFrame(spawnFrame(hover.miss.index)) : hover.ratio) * 100}%` }}>
            {hover.miss ? (
              <>
                <strong style={{ color: CATEGORY_COLOR[hover.miss.primary!] }}>
                  #{hover.miss.index + 1} · {CATEGORY_LABEL[hover.miss.primary!]} · −{hover.miss.gap.toFixed(1)}
                </strong>
                <span>{hover.miss.reasons[0]}</span>
              </>
            ) : (
              <span>{formatTime(hover.ratio * total)}</span>
            )}
          </div>
        )}
      </div>

      <div className="replay-controls">
        <div className="group">
          <button onClick={props.onPrevMiss} title="Previous miss (Shift+←)" aria-label="Previous miss">
            ⏮
          </button>
          <button onClick={() => props.onSeekPiece(index - 1)} disabled={index === 0 && frame === spawnFrame(0)} title="Previous piece (←)" aria-label="Previous piece">
            ◀
          </button>
          <button className="play" onClick={props.onTogglePlay} title="Play / pause (Space)" aria-label={replaying ? "Pause" : "Play"}>
            {replaying ? "❚❚" : "▶"}
          </button>
          <button onClick={() => props.onSeekPiece(index + 1)} disabled={index >= pieceCount - 1} title="Next piece (→)" aria-label="Next piece">
            ▶
          </button>
          <button onClick={props.onNextMiss} title="Next miss (Shift+→)" aria-label="Next miss">
            ⏭
          </button>
        </div>
        <span className="time">
          {formatTime(frame)} <span className="muted">/ {formatTime(total)}</span>
        </span>
        <span className="piece-counter muted">
          piece {Math.min(index + 1, pieceCount)} / {pieceCount}
        </span>
        <div className="group right">
          <label className="toggle">
            <input type="checkbox" checked={pauseAtMisses} onChange={(e) => props.onPauseAtMisses(e.target.checked)} />
            Pause at misses
          </label>
          <div className="segmented small">
            {SPEEDS.map((s) => (
              <button key={s} className={speed === s ? "active" : ""} onClick={() => props.onSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
