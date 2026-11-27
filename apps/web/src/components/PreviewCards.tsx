import { CategoryBadge, Glyph } from "../categories";

/** Three small illustrations of what the results show (original artwork, static). */
export function PreviewCards() {
  return (
    <div className="preview-cards">
      <article className="preview-card">
        <div className="preview-art">
          <svg viewBox="0 0 150 120" width="150" height="120" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((r) =>
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) =>
                r < 4 && !(r === 3 && (c === 6 || c === 7)) && !(r === 2 && c === 7) && !(c === 3 && r > 1) ? (
                  <rect key={`${r}-${c}`} x={4 + c * 11} y={104 - r * 11} width="10" height="10" rx="1.5" fill={`var(--piece-${"ijlostz"[(r * 3 + c) % 7]})`} opacity="0.9" />
                ) : null
              )
            )}
            <g>
              {[[6, 3], [7, 3], [7, 2]].map(([c, r]) => (
                <rect key={`e${c}${r}`} x={4 + c! * 11} y={104 - r! * 11} width="10" height="10" rx="1.5" fill="var(--piece-t)" opacity="0.45" stroke="var(--overlay-engine)" strokeWidth="1.5" />
              ))}
              {[[3, 2], [3, 3], [3, 4], [4, 4]].map(([c, r]) => (
                <g key={`y${c}${r}`}>
                  <rect x={4 + c! * 11} y={104 - r! * 11} width="10" height="10" fill="url(#hatch)" stroke="var(--overlay-you)" strokeWidth="1.5" />
                </g>
              ))}
            </g>
            <defs>
              <pattern id="hatch" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1.2" height="3.5" fill="var(--overlay-you)" />
              </pattern>
            </defs>
            <g fontSize="9" fill="var(--ink-2)">
              <rect x="118" y="40" width="9" height="9" fill="url(#hatch)" stroke="var(--overlay-you)" />
              <text x="131" y="48">You</text>
              <rect x="118" y="58" width="9" height="9" fill="none" stroke="var(--overlay-engine)" strokeWidth="1.5" />
              <text x="131" y="66">Best</text>
            </g>
          </svg>
        </div>
        <h3>Both moves on one board</h3>
        <p className="muted">Where you put the piece and the best move at your position, overlaid.</p>
      </article>
      <article className="preview-card">
        <div className="preview-art preview-track">
          <div className="preview-dots" aria-hidden="true">
            {(["missed_setup", "other", "garbage", "missed_spin", "missed_setup", "other", "b2b_break", "missed_setup", "garbage", "missed_spin"] as const).map((c, i) => (
              <span key={i} style={{ left: `${6 + i * 9.5}%`, top: `${i % 3 === 0 ? 8 : i % 3 === 1 ? 22 : 14}px` }}>
                <Glyph category={c} size={i % 4 === 0 ? 12 : 9} />
              </span>
            ))}
          </div>
          <div className="preview-rail" aria-hidden="true">
            <i />
          </div>
          <div className="preview-key">
            <span>
              <Glyph category="missed_spin" /> Spin
            </span>
            <span>
              <Glyph category="missed_setup" /> Setup
            </span>
            <span>
              <Glyph category="garbage" /> Garbage
            </span>
          </div>
        </div>
        <h3>Misses on the timeline</h3>
        <p className="muted">Play the round back; it pauses at each miss so you can see what happened.</p>
      </article>
      <article className="preview-card">
        <div className="preview-art">
          <div className="preview-miss">
            <div className="preview-miss-top">
              <span className="num faint">#16</span>
              <CategoryBadge category="garbage" />
            </div>
            <div className="muted">
              Gap <span className="num bad">5.6</span>
            </div>
            <p>Garbage was incoming: the engine cleared lines while your move cleared none.</p>
          </div>
        </div>
        <h3>A reason for every miss</h3>
        <p className="muted">Plain words and a gap, so you know what it cost.</p>
      </article>
    </div>
  );
}
