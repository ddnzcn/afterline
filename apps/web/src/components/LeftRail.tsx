import { useEffect, useRef } from "react";

import { formatTime } from "../board";
import { CATEGORIES, CATEGORY, CategoryBadge, Glyph } from "../categories";
import type { GameSummary, MissCategory, SnapshotAnalysis } from "../types";

interface LeftRailProps {
  roundNumber: number;
  pieces: number;
  totalFrames: number;
  summary: GameSummary;
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  current: number | null;
  sortByGap: boolean;
  onToggleCategory: (c: MissCategory) => void;
  onShowAll: () => void;
  onSort: (byGap: boolean) => void;
  onJump: (index: number) => void;
}

const SHORT_ROUND = 7;

/** The costliest habit: category with the largest summed gap, "Other" excluded (it isn't a habit). */
function headline(analyses: SnapshotAnalysis[], pieces: number): { category: MissCategory | null; text: string } {
  const flagged = analyses.filter((a) => a.flagged && a.primary);
  if (flagged.length === 0) {
    return {
      category: null,
      text: pieces <= SHORT_ROUND ? "Clean while it lasted: no misses. Too short to name a habit." : "No misses this round: every move was close to the best at your positions."
    };
  }
  const sums = new Map<MissCategory, { gap: number; count: number }>();
  for (const a of flagged) {
    if (a.primary === "other") continue;
    const s = sums.get(a.primary!) ?? { gap: 0, count: 0 };
    sums.set(a.primary!, { gap: s.gap + a.gap, count: s.count + 1 });
  }
  const top = [...sums.entries()].sort((a, b) => b[1].gap - a[1].gap)[0];
  if (!top) return { category: "other", text: `${flagged.length} misses, none of them a repeated habit.` };
  const [cat, { gap, count }] = top;
  return { category: cat, text: `${CATEGORY[cat].plural} cost you the most: ${count} ${count === 1 ? "miss" : "misses"}, gap ${gap.toFixed(1)} in total.` };
}

export function LeftRail(props: LeftRailProps) {
  const { summary, analyses, visible, current, sortByGap, pieces } = props;
  const misses = analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary));
  const ordered = sortByGap ? [...misses].sort((a, b) => b.gap - a.gap) : misses;
  const allFlagged = analyses.filter((a) => a.flagged).length;
  const h = headline(analyses, pieces);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <aside className="rail" aria-label="Round summary and misses">
      <section className="rail-summary">
        <div className="rail-title">
          <h2>Round {props.roundNumber} summary</h2>
          <span className="num faint">
            {pieces} pieces · {formatTime(props.totalFrames)}
          </span>
        </div>
        {pieces <= SHORT_ROUND && <div className="note-box">Short round · {pieces} pieces</div>}
        <p className="headline">
          {h.category && <Glyph category={h.category} size={10} />}
          <span>{h.text}</span>
        </p>
        <div className="al-label">Yours / best at your positions</div>
        <div className="quad">
          <Quad label="APP" value={summary.actualApp.toFixed(2)} best={summary.engineApp.toFixed(2)} />
          <Quad label="Spin clears" value={String(summary.actualSpinClears)} best={String(summary.engineSpinClears)} />
          <Quad label="Attack" value={String(summary.actualAttack)} best={String(summary.engineAttack)} />
          <div className="quad-cell">
            <span className="al-label">Misses</span>
            <span className="quad-value">
              <span className="num">{summary.flagged}</span> <span className="quad-of">of {summary.pieces} pieces</span>
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="al-label rail-label">Categories</div>
        <div className="cat-chips">
          {CATEGORIES.map((c) => (
            <button key={c} className="cat-chip" aria-pressed={visible.has(c)} onClick={() => props.onToggleCategory(c)}>
              <Glyph category={c} />
              {CATEGORY[c].label}
              <span className="num">{summary.byCategory[c]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rail-misses">
        <div className="rail-misses-head">
          <h3>
            Misses <span className="num faint">{allFlagged}</span>
          </h3>
          <div className="al-seg" role="group" aria-label="Sort misses">
            <button aria-pressed={!sortByGap} onClick={() => props.onSort(false)}>
              In order
            </button>
            <button aria-pressed={sortByGap} onClick={() => props.onSort(true)}>
              By size
            </button>
          </div>
        </div>
        <ol className="miss-list" ref={listRef}>
          {ordered.map((a) => (
            <li key={a.index}>
              <button className="al-miss" aria-current={a.index === current} onClick={() => props.onJump(a.index)}>
                <span className="al-p">#{a.index + 1}</span>
                <CategoryBadge category={a.primary!} />
                <span className="al-g">{a.gap.toFixed(1)}</span>
                <span className="al-r">{a.reasons[0]}</span>
              </button>
            </li>
          ))}
        </ol>
        {allFlagged === 0 && (
          <div className="empty-ok">
            <span className="check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>No misses in this round.</strong>
              <div className="muted">Every move was close to the best at your positions.</div>
            </div>
          </div>
        )}
        {allFlagged > 0 && ordered.length === 0 && (
          <div className="empty-filtered">
            {visible.size === 0 ? "All categories are filtered off" : "No misses in the selected categories"}
            <button className="al-btn al-btn-ghost" onClick={props.onShowAll}>
              Show all
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}

function Quad({ label, value, best }: { label: string; value: string; best: string }) {
  return (
    <div className="quad-cell">
      <span className="al-label">{label}</span>
      <span className="quad-value">
        <span className="num">{value}</span> <span className="quad-of num">/ {best}</span>
      </span>
    </div>
  );
}
