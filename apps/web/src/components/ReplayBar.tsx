import { useMemo, useRef, useState, type PointerEvent } from "react";

import { CATEGORY_COLOR } from "../board";
import { CATEGORY_LABEL, type MissCategory, type Snapshot, type SnapshotAnalysis } from "../types";

export const SPEEDS = [0.5, 1, 2, 4] as const;
const FPS = 60;

interface ReplayBarProps {
  snapshots: Snapshot[];
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  index: number;
  replaying: boolean;
  speed: number;
  pauseAtMisses: boolean;
  onSeek: (index: number) => void;
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
  const { snapshots, analyses, visible, index, replaying, speed, pauseAtMisses } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<{ ratio: number; miss: SnapshotAnalysis | null } | null>(null);

  const start = snapshots[0]?.frame ?? 0;
  const end = Math.max(start + 1, snapshots.at(-1)?.frame ?? 1);
  const ratioOf = (i: number): number => ((snapshots[i]?.frame ?? start) - start) / (end - start);

  const misses = useMemo(() => analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)), [analyses, visible]);
  const maxGap = Math.max(1, ...misses.map((m) => m.gap));

  /** Piece whose spawn is closest to a point in game time. */
  const indexAt = (ratio: number): number => {
    const frame = start + ratio * (end - start);
    let lo = 0;
    let hi = snapshots.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (snapshots[mid]!.frame <= frame) lo = mid;
      else hi = mid - 1;
    }
    const next = snapshots[lo + 1];
    return next && next.frame - frame < frame - snapshots[lo]!.frame ? lo + 1 : lo;
  };

  const ratioFromEvent = (e: PointerEvent): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).dataset.miss) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    props.onSeek(indexAt(ratioFromEvent(e)));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const ratio = ratioFromEvent(e);
    if (dragging.current) props.onSeek(indexAt(ratio));
    const missEl = (e.target as HTMLElement).dataset.miss;
    setHover({ ratio, miss: missEl ? (analyses[Number(missEl)] ?? null) : null });
  };
  const stopDrag = (): void => {
    dragging.current = false;
  };

  const current = snapshots[index];
  const hoverIndex = hover ? (hover.miss ? hover.miss.index : indexAt(hover.ratio)) : null;

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
        <div className="track-fill" style={{ width: `${ratioOf(index) * 100}%` }} />
        {misses.map((m) => {
          const size = 8 + (m.gap / maxGap) * 8;
          return (
            <button
              key={m.index}
              data-miss={m.index}
              className={`miss-point${m.index === index ? " current" : ""}`}
              style={{ left: `${ratioOf(m.index) * 100}%`, width: size, height: size, background: CATEGORY_COLOR[m.primary!] }}
              onClick={() => props.onSeek(m.index)}
              aria-label={`Miss at piece ${m.index + 1}: ${CATEGORY_LABEL[m.primary!]}`}
            />
          );
        })}
        <div className="track-thumb" style={{ left: `${ratioOf(index) * 100}%` }} />
        {hover && hoverIndex !== null && (
          <div className={`track-tip${hover.miss ? " miss" : ""}`} style={{ left: `${(hover.miss ? ratioOf(hover.miss.index) : hover.ratio) * 100}%` }}>
            {hover.miss ? (
              <>
                <strong style={{ color: CATEGORY_COLOR[hover.miss.primary!] }}>
                  #{hover.miss.index + 1} · {CATEGORY_LABEL[hover.miss.primary!]} · −{hover.miss.gap.toFixed(1)}
                </strong>
                <span>{hover.miss.reasons[0]}</span>
              </>
            ) : (
              <span>
                Piece {hoverIndex + 1} · {formatTime((snapshots[hoverIndex]?.frame ?? start) - start)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="replay-controls">
        <div className="group">
          <button onClick={props.onPrevMiss} title="Previous miss (Shift+←)" aria-label="Previous miss">
            ⏮
          </button>
          <button onClick={() => props.onSeek(index - 1)} disabled={index === 0} title="Previous piece (←)" aria-label="Previous piece">
            ◀
          </button>
          <button className="play" onClick={props.onTogglePlay} title="Play / pause (Space)" aria-label={replaying ? "Pause" : "Play"}>
            {replaying ? "❚❚" : "▶"}
          </button>
          <button onClick={() => props.onSeek(index + 1)} disabled={index === snapshots.length - 1} title="Next piece (→)" aria-label="Next piece">
            ▶
          </button>
          <button onClick={props.onNextMiss} title="Next miss (Shift+→)" aria-label="Next miss">
            ⏭
          </button>
        </div>
        <span className="time">
          {formatTime((current?.frame ?? start) - start)} <span className="muted">/ {formatTime(end - start)}</span>
        </span>
        <span className="piece-counter muted">
          piece {index + 1} / {snapshots.length}
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
