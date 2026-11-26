import { CATEGORY_COLOR } from "../board";
import { CATEGORIES, CATEGORY_LABEL, type GameSummary, type MissCategory, type SnapshotAnalysis } from "../types";

interface SidebarProps {
  summary: GameSummary;
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  current: number;
  sortByGap: boolean;
  onToggleCategory: (c: MissCategory) => void;
  onToggleSort: () => void;
  onJump: (index: number) => void;
}

export function Sidebar({ summary, analyses, visible, current, sortByGap, onToggleCategory, onToggleSort, onJump }: SidebarProps) {
  const misses = analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary));
  const ordered = sortByGap ? [...misses].sort((a, b) => b.gap - a.gap) : misses;

  return (
    <aside className="sidebar">
      <section className="panel">
        <h3>Summary</h3>
        <div className="stat-grid">
          <Stat label="APP" value={summary.actualApp.toFixed(2)} compare={summary.engineApp.toFixed(2)} />
          <Stat label="Spin clears" value={String(summary.actualSpinClears)} compare={String(summary.engineSpinClears)} />
          <Stat label="Attack" value={String(summary.actualAttack)} compare={String(summary.engineAttack)} />
          <Stat label="Flagged" value={`${summary.flagged}`} sub={`of ${summary.pieces} pieces`} />
        </div>
        <p className="hint">Engine numbers are its best first move at each of your positions, not a full game it played.</p>
      </section>

      <section className="panel">
        <h3>Categories</h3>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip${visible.has(c) ? " on" : ""}`} onClick={() => onToggleCategory(c)} style={{ ["--c" as string]: CATEGORY_COLOR[c] }}>
              <span className="dot" />
              {CATEGORY_LABEL[c]}
              <span className="count">{summary.byCategory[c]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel miss-panel">
        <div className="panel-head">
          <h3>Misses ({ordered.length})</h3>
          <button className="link" onClick={onToggleSort}>
            {sortByGap ? "by size" : "in order"}
          </button>
        </div>
        <ol className="miss-list">
          {ordered.map((a) => (
            <li key={a.index}>
              <button className={a.index === current ? "active" : ""} onClick={() => onJump(a.index)}>
                <span className="miss-top">
                  <span className="piece-no">#{a.index + 1}</span>
                  <span className="badge" style={{ background: CATEGORY_COLOR[a.primary!] }}>
                    {CATEGORY_LABEL[a.primary!]}
                  </span>
                  <span className="gap">−{a.gap.toFixed(1)}</span>
                </span>
                <span className="miss-reason">{a.reasons[0]}</span>
              </button>
            </li>
          ))}
          {ordered.length === 0 && <li className="muted empty">No misses in the selected categories.</li>}
        </ol>
      </section>
    </aside>
  );
}

function Stat({ label, value, compare, sub }: { label: string; value: string; compare?: string; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {compare && <span className="stat-sub">engine {compare}</span>}
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
