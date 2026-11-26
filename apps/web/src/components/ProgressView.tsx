interface ProgressViewProps {
  done: number;
  total: number;
  startedAt: number;
}

export function ProgressView({ done, total, startedAt }: ProgressViewProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = (Date.now() - startedAt) / 1000;
  const eta = done > 0 && total > done ? ((elapsed / done) * (total - done)).toFixed(0) : null;
  return (
    <div className="upload-view">
      <div className="upload-card progress-card">
        <h2>Analyzing</h2>
        <p className="muted">Searching every placement against the engine{total ? ` (${total} pieces)` : ""}.</p>
        <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            {done} / {total || "…"}
          </span>
          <span className="muted">{eta ? `~${eta}s left` : `${elapsed.toFixed(0)}s`}</span>
        </div>
      </div>
    </div>
  );
}
