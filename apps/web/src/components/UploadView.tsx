import { useMemo, useState, type DragEvent } from "react";

import type { UploadedReplay } from "../types";

interface UploadViewProps {
  replay: UploadedReplay | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onAnalyze: (player: string, rounds: number[]) => void;
}

export function UploadView({ replay, busy, error, onFile, onAnalyze }: UploadViewProps) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="upload-view">
      <div className="upload-card">
        <h1>Replay Analyzer</h1>
        <p className="muted">
          Load a TETR.IO replay. Every piece is re-simulated and compared with a search engine, to find missed spins, B2B breaks,
          setups and garbage handling.
        </p>
        <label
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept=".ttrm,.ttr,application/json" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <strong>{busy && !replay ? "Reading replay…" : "Drop a .ttrm / .ttr file"}</strong>
          <span className="muted">or click to choose. League and 40L are supported; Blitz and Quick Play are not.</span>
        </label>
        {error && <div className="error-box">{error}</div>}
        {replay && <GamePicker replay={replay} busy={busy} onAnalyze={onAnalyze} />}
      </div>
    </div>
  );
}

function GamePicker({ replay, busy, onAnalyze }: { replay: UploadedReplay; busy: boolean; onAnalyze: UploadViewProps["onAnalyze"] }) {
  const [player, setPlayer] = useState(replay.players.length === 1 ? replay.players[0]!.id : "");
  const games = useMemo(() => replay.games.filter((g) => g.playerId === player), [replay, player]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const selected = games.filter((g) => g.supported && !excluded.has(g.roundIndex)).map((g) => g.roundIndex);
  const unsupported = games.filter((g) => !g.supported);

  return (
    <div className="picker">
      <div className="picker-row">
        <span className="label">{replay.gamemode ?? replay.kind}</span>
        <span className="muted">{new Date(replay.ts).toLocaleString()}</span>
      </div>
      {replay.players.length > 1 && (
        <div className="field">
          <span className="label">Player</span>
          <div className="segmented">
            {replay.players.map((p) => (
              <button key={p.id} className={player === p.id ? "active" : ""} onClick={() => setPlayer(p.id)}>
                {p.username}
              </button>
            ))}
          </div>
        </div>
      )}
      {player && games.length > 1 && (
        <div className="field">
          <span className="label">Rounds</span>
          <div className="round-chips">
            {games.map((g) => (
              <button
                key={g.roundIndex}
                disabled={!g.supported}
                className={g.supported && !excluded.has(g.roundIndex) ? "active" : ""}
                onClick={() => {
                  const next = new Set(excluded);
                  if (next.has(g.roundIndex)) next.delete(g.roundIndex);
                  else next.add(g.roundIndex);
                  setExcluded(next);
                }}
              >
                {g.roundIndex + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      {unsupported.length > 0 && <div className="error-box">{unsupported[0]!.reason}</div>}
      <button className="primary" disabled={!player || selected.length === 0 || busy} onClick={() => onAnalyze(player, selected)}>
        Analyze {selected.length > 1 ? `${selected.length} rounds` : ""}
      </button>
    </div>
  );
}
