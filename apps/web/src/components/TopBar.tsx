import type { ReactNode } from "react";

interface RoundTab {
  roundIndex: number;
  outcome: "won" | "lost" | null;
}

interface TopBarProps {
  file: string;
  meta: string[];
  rounds?: RoundTab[];
  current?: number;
  onRound?: (index: number) => void;
  onHelp?: () => void;
  helpOpen?: boolean;
  children?: ReactNode;
}

export function Wordmark() {
  return <img src="/logos/afterline-wordmark.svg" alt="Afterline" className="wordmark" height={20} />;
}

/** App top bar: wordmark, file · player · mode · date, round switcher with won/lost dots, help. */
export function TopBar({ file, meta, rounds, current, onRound, onHelp, helpOpen, children }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Wordmark />
        {file && <span className="topbar-file">{file}</span>}
        {meta.length > 0 && <span className="topbar-meta">{`· ${meta.join(" · ")}`}</span>}
      </div>
      <div className="topbar-right">
        {rounds && rounds.length > 1 && (
          <div className="al-seg" role="group" aria-label="Round">
            {rounds.map((r, i) => (
              <button key={r.roundIndex} aria-pressed={i === current} onClick={() => onRound?.(i)}>
                R{r.roundIndex + 1}
                {r.outcome && <span className={`outcome-dot ${r.outcome}`} aria-label={r.outcome === "won" ? "won" : "lost"} />}
              </button>
            ))}
          </div>
        )}
        {children}
        {onHelp && (
          <button className="al-btn al-btn-ghost al-btn-icon" onClick={onHelp} aria-label="Keyboard shortcuts" aria-expanded={helpOpen}>
            ?
          </button>
        )}
      </div>
    </header>
  );
}
