import type { UploadedReplay } from "../types";

import { FlowHeader } from "./FlowHeader";
import { Icon } from "./Icon";

export interface Selection {
  player: string;
  rounds: Set<number>;
}

interface PickerViewProps {
  replay: UploadedReplay;
  fileName: string;
  selection: Selection;
  error: string | null;
  busy: boolean;
  onSelection: (s: Selection) => void;
  onDismissError: () => void;
  onChangeFile: () => void;
  onAnalyze: () => void;
}

const modeName = (g: string | null, kind: string): string => (g === "league" ? "League" : g === "40l" ? "40L" : g === "blitz" ? "Blitz" : g === "zenith" ? "Quick Play" : g ?? kind);

const shortReason = (reason = ""): string =>
  /level gravity/i.test(reason) ? "Level gravity not supported" : /zenith/i.test(reason) ? "Zenith not supported" : "Not supported";

const seconds = (ms: number | null): string => (ms ? `${(ms / 1000).toFixed(1)} s` : "");

/** Choose whose game and which rounds to analyze. */
export function PickerView(props: PickerViewProps) {
  const { replay, fileName, selection, error, busy } = props;
  const games = replay.games.filter((g) => g.playerId === selection.player);
  const supported = games.filter((g) => g.supported);
  const chosen = supported.filter((g) => selection.rounds.has(g.roundIndex));
  const pieces = chosen.reduce((s, g) => s + (g.pieces ?? 0), 0);
  const player = replay.players.find((p) => p.id === selection.player)?.username ?? "";
  const date = new Date(replay.ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const single = replay.kind === "solo" && games.length === 1;
  const vs = replay.players.length > 1 ? replay.players.map((p) => p.username).join(" vs ") : (replay.players[0]?.username ?? "");

  const setPlayer = (id: string): void =>
    props.onSelection({ player: id, rounds: new Set(replay.games.filter((g) => g.playerId === id && g.supported).map((g) => g.roundIndex)) });
  const toggle = (round: number): void => {
    const rounds = new Set(selection.rounds);
    if (rounds.has(round)) rounds.delete(round);
    else rounds.add(round);
    props.onSelection({ ...selection, rounds });
  };

  return (
    <div className="flow">
      <FlowHeader />
      <main className="flow-main picker">
        <div className="file-card">
          <span className="file-icon" aria-hidden="true">
            <Icon name="file" />
          </span>
          <div>
            <strong>{fileName}</strong>
            <div className="muted">
              {modeName(replay.gamemode, replay.kind)} · <span className="num">{date}</span> · {vs}
            </div>
          </div>
          <button className="al-btn al-btn-ghost" onClick={props.onChangeFile}>
            Change file
          </button>
        </div>

        {error && (
          <div className="banner" role="alert">
            <span>{error} Your selection is kept, so you can try again.</span>
            <button className="al-btn al-btn-ghost al-btn-icon" onClick={props.onDismissError} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        )}

        {single ? (
          <SingleRun pieces={games[0]!.pieces} durationMs={games[0]!.durationMs} supported={games[0]!.supported} reason={games[0]!.reason} busy={busy} onAnalyze={props.onAnalyze} mode={modeName(replay.gamemode, replay.kind)} />
        ) : (
          <>
            <div>
              <h1 className="flow-title">Choose what to study</h1>
              <p className="muted">
                {supported.length === 0 ? "No round in this replay can be analyzed." : "All supported rounds are selected. Each round is analyzed from one player's side."}
              </p>
            </div>

            {replay.players.length > 1 && (
              <div className="field">
                <span className="al-label">Player</span>
                <div className="al-seg" role="group" aria-label="Player">
                  {replay.players.map((p) => (
                    <button key={p.id} aria-pressed={p.id === selection.player} onClick={() => setPlayer(p.id)}>
                      {p.username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <div className="rounds-head">
                <span className="al-label">
                  Rounds{" "}
                  <span className="muted">
                    <span className="num">{chosen.length}</span> of <span className="num">{games.length}</span> selected
                  </span>
                </span>
                <span>
                  <button className="al-btn al-btn-ghost" onClick={() => props.onSelection({ ...selection, rounds: new Set(supported.map((g) => g.roundIndex)) })} disabled={supported.length === 0}>
                    Select all
                  </button>
                  <button className="al-btn al-btn-ghost" onClick={() => props.onSelection({ ...selection, rounds: new Set() })} disabled={chosen.length === 0}>
                    Clear
                  </button>
                </span>
              </div>
              <div className="round-cards">
                {games.map((g) => (
                  <button key={g.roundIndex} className="round-card" aria-pressed={g.supported && selection.rounds.has(g.roundIndex)} disabled={!g.supported} onClick={() => toggle(g.roundIndex)}>
                    <span className="round-check" aria-hidden="true">
                      {g.supported && selection.rounds.has(g.roundIndex) && <Icon name="check" size={12} />}
                    </span>
                    <span>
                      <b>R{g.roundIndex + 1}</b>
                      <span className="round-meta">
                        {!g.supported ? (
                          shortReason(g.reason)
                        ) : (
                          <>
                            {g.outcome && <span className={`outcome-dot ${g.outcome}`} aria-hidden="true" />}
                            {g.outcome ? (g.outcome === "won" ? "Won" : "Lost") : "Played"}
                            {g.pieces !== null && (
                              <>
                                {" "}
                                · <span className="num">{g.pieces}</span> pieces
                              </>
                            )}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {supported.length === 0 && (
              <div className="info-note">
                <Icon name="info" />
                <span>Quick Play uses Zenith rules and Blitz uses level gravity. Afterline reads League and 40L replays for now.</span>
              </div>
            )}

            <div className="analyze-row">
              <button className="al-btn al-btn-primary analyze-btn" disabled={chosen.length === 0 || busy} onClick={props.onAnalyze}>
                Analyze{" "}
                {chosen.length === 1 ? (
                  `round ${chosen[0]!.roundIndex + 1}`
                ) : (
                  <>
                    <span className="num">{chosen.length}</span> rounds
                  </>
                )}
              </button>
              <span className="muted">
                {supported.length === 0
                  ? "No round in this replay can be analyzed."
                  : chosen.length === 0
                    ? "Select at least one round"
                    : <>{player} · <span className="num">{pieces.toLocaleString()}</span> pieces</>}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

interface SingleRunProps {
  pieces: number | null;
  durationMs: number | null;
  supported: boolean;
  reason?: string;
  busy: boolean;
  mode: string;
  onAnalyze: () => void;
}

function SingleRun({ pieces, durationMs, supported, reason, busy, mode, onAnalyze }: SingleRunProps) {
  return (
    <>
      <div className="run-summary">
        <span>
          Run <span className="num">1</span> of <span className="num">1</span>
        </span>
        {pieces !== null && (
          <span>
            <span className="num">{pieces}</span> pieces
          </span>
        )}
        {durationMs && <span className="num">{seconds(durationMs)}</span>}
      </div>
      {!supported && (
        <div className="info-note">
          <Icon name="info" />
          <span>{shortReason(reason)}. Quick Play uses Zenith rules and Blitz uses level gravity. Afterline reads League and 40L replays for now.</span>
        </div>
      )}
      <div className="analyze-row">
        <button className="al-btn al-btn-primary analyze-btn" disabled={!supported || busy} onClick={onAnalyze}>
          Analyze {mode} run
        </button>
        <span className="muted">{supported ? "One player and one run, so there is nothing to choose." : "This run can't be analyzed."}</span>
      </div>
    </>
  );
}
