import { CATEGORY_COLOR } from "../board";
import type { MissCategory, SnapshotAnalysis } from "../types";

interface TimelineProps {
  count: number;
  index: number;
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  onSeek: (index: number) => void;
}

/** Piece-by-piece scrubber with a strip of miss markers (colored by category, height by gap). */
export function Timeline({ count, index, analyses, visible, onSeek }: TimelineProps) {
  const maxGap = Math.max(1, ...analyses.map((a) => a.gap));
  return (
    <div className="timeline">
      <div className="timeline-markers">
        {analyses.map((a) =>
          a.flagged && a.primary && visible.has(a.primary) ? (
            <button
              key={a.index}
              className="marker"
              title={`#${a.index + 1} · gap ${a.gap.toFixed(1)}`}
              style={{
                left: `${(a.index / Math.max(1, count - 1)) * 100}%`,
                height: `${30 + (a.gap / maxGap) * 70}%`,
                background: CATEGORY_COLOR[a.primary]
              }}
              onClick={() => onSeek(a.index)}
            />
          ) : null
        )}
        <div className="playhead" style={{ left: `${(index / Math.max(1, count - 1)) * 100}%` }} />
      </div>
      <input type="range" min={0} max={Math.max(0, count - 1)} value={index} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Piece" />
    </div>
  );
}
