import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReplayPlayer, type LiveFrame } from "@tta/core";

import { boardAfter } from "../board";
import { CATEGORIES, type AnalysisResult, type MissCategory } from "../types";

import { BoardCanvas, type Overlay } from "./BoardCanvas";
import { MovePanel, type LineChoice } from "./MovePanel";
import { PiecePreview } from "./PiecePreview";
import { ReplayBar } from "./ReplayBar";
import { Sidebar } from "./Sidebar";

interface ResultsViewProps {
  result: AnalysisResult;
  fileName: string;
  onReset: () => void;
}

const LINE_STEP_MS = 650;
const FPS = 60;

export function ResultsView({ result, fileName, onReset }: ResultsViewProps) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [visible, setVisible] = useState<Set<MissCategory>>(new Set(CATEGORIES));
  const [sortByGap, setSortByGap] = useState(false);
  const [lineChoice, setLineChoice] = useState<LineChoice>("engine");
  const [lineStep, setLineStep] = useState(0);
  const [linePlaying, setLinePlaying] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtMisses, setPauseAtMisses] = useState(true);

  const round = result.rounds[roundIdx]!;
  // Triangle re-runs the player's recorded inputs in the browser, so playback is the real game.
  const player = useMemo(() => new ReplayPlayer(round.game, result.meta.ts), [round, result.meta.ts]);
  const [live, setLive] = useState<LiveFrame>(() => player.live());
  useEffect(() => setLive(player.live()), [player]);

  const lastIndex = round.snapshots.length - 1;
  const index = Math.min(live.pieces, lastIndex);
  const snapshot = round.snapshots[index]!;
  const analysis = round.analyses[index]!;
  const line = lineChoice === "engine" ? analysis.best : analysis.played;
  const lineLength = line?.steps.length ?? 0;
  /** Paused exactly where this piece spawned: show the analysis overlays for it. */
  const atSpawn = !replaying && live.frame === player.spawnFrame(index) && live.pieces <= lastIndex;

  const misses = useMemo(
    () => round.analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)).map((a) => a.index),
    [round, visible]
  );
  const missSet = useMemo(() => new Set(misses), [misses]);

  const resetLine = (): void => {
    setLineStep(0);
    setLinePlaying(false);
  };

  const seekFrame = useCallback(
    (frame: number) => {
      player.seek(frame);
      setLive(player.live());
      setLineStep(0);
      setLinePlaying(false);
    },
    [player]
  );
  const seekPiece = useCallback((i: number) => seekFrame(player.spawnFrame(Math.max(0, Math.min(lastIndex, i)))), [player, seekFrame, lastIndex]);

  // "previous piece" from mid-piece goes back to the current piece's spawn first, like a video chapter
  const prevPiece = useCallback(() => seekPiece(live.frame > player.spawnFrame(index) ? index : index - 1), [seekPiece, live.frame, player, index]);
  const nextPiece = useCallback(() => seekPiece(index + 1), [seekPiece, index]);
  const nextMiss = useCallback(() => {
    const m = misses.find((x) => x > index || (x === index && !atSpawn));
    if (m !== undefined) seekPiece(m);
  }, [misses, index, atSpawn, seekPiece]);
  const prevMiss = useCallback(() => {
    const m = [...misses].reverse().find((x) => x < index);
    if (m !== undefined) seekPiece(m);
  }, [misses, index, seekPiece]);

  const togglePlay = useCallback(() => {
    if (live.over) seekFrame(0);
    resetLine();
    setReplaying((r) => !r);
  }, [live.over, seekFrame]);

  // live playback: tick Triangle at 60 fps × speed, stopping at the spawn of a missed piece
  const pauseRef = useRef({ pauseAtMisses, missSet });
  pauseRef.current = { pauseAtMisses, missSet };
  useEffect(() => {
    if (!replaying) return;
    let raf = 0;
    let last = performance.now();
    let budget = 0;
    const loop = (now: number): void => {
      budget += ((now - last) / 1000) * FPS * speed;
      last = now;
      let stop = false;
      while (budget >= 1) {
        budget -= 1;
        const before = player.live().pieces;
        if (!player.advance(1)) {
          stop = true;
          break;
        }
        const after = player.live().pieces;
        if (after !== before && pauseRef.current.pauseAtMisses && pauseRef.current.missSet.has(after)) {
          stop = true;
          break;
        }
      }
      setLive(player.live());
      if (stop) setReplaying(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [replaying, speed, player]);

  // engine-line step-through animation
  useEffect(() => {
    if (!linePlaying) return;
    if (lineStep >= lineLength) {
      setLinePlaying(false);
      return;
    }
    const t = window.setTimeout(() => setLineStep((s) => s + 1), LINE_STEP_MS);
    return () => window.clearTimeout(t);
  }, [linePlaying, lineStep, lineLength]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range" && e.target.type !== "checkbox") return;
      if (e.key === "ArrowRight" && e.shiftKey) nextMiss();
      else if (e.key === "ArrowLeft" && e.shiftKey) prevMiss();
      else if (e.key === "ArrowRight") nextPiece();
      else if (e.key === "ArrowLeft") prevPiece();
      else if (e.key === "Home") seekFrame(0);
      else if (e.key === "End") seekPiece(lastIndex);
      else if (e.key === "ArrowDown" && atSpawn) setLineStep((s) => Math.min(lineLength, s + 1));
      else if (e.key === "ArrowUp" && atSpawn) setLineStep((s) => Math.max(0, s - 1));
      else if (e.key === " ") togglePlay();
      else if (e.key.toLowerCase() === "l" && atSpawn) setLinePlaying((p) => !p);
      else if (e.key === "Escape") resetLine();
      else if (e.key.toLowerCase() === "e") {
        setLineChoice((c) => (c === "engine" ? "yours" : "engine"));
        setLineStep(0);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextMiss, prevMiss, nextPiece, prevPiece, seekFrame, seekPiece, lastIndex, atSpawn, lineLength, togglePlay]);

  const { grid, overlays, caption } = useMemo(() => {
    if (atSpawn && lineStep > 0 && line) {
      const step = line.steps[lineStep - 1]!;
      return {
        grid: boardAfter(snapshot.board, line.steps, lineStep - 1),
        overlays: [{ cells: step.cells, piece: step.piece, style: "solid" as const }],
        caption: `${lineChoice === "engine" ? "Engine line" : "What you played"} · step ${lineStep}/${line.steps.length} · ${step.lines > 0 ? `clears ${step.lines} (shown before the clear)` : "piece landing"}`
      };
    }
    if (atSpawn) {
      const o: Overlay[] = [];
      const ghost = analysis.best?.steps[0];
      if (ghost) o.push({ cells: ghost.cells, piece: ghost.piece, style: "ghost" });
      o.push({ cells: snapshot.placement.cells, piece: snapshot.placement.piece, style: "outline" });
      return {
        grid: snapshot.board,
        overlays: o,
        caption: analysis.flagged ? "Miss: where you put it (outline) · engine's choice (ghost) · Space to play on" : "Where you put it (outline) · engine's choice (ghost)"
      };
    }
    const o: Overlay[] = [];
    if (live.falling) {
      if (live.shadow) o.push({ cells: live.shadow, piece: live.falling.piece, style: "shadow" });
      o.push({ cells: live.falling.cells, piece: live.falling.piece, style: "plain" });
    }
    return { grid: live.board, overlays: o, caption: live.over ? "End of game" : replaying ? "Playing" : "Paused" };
  }, [atSpawn, lineStep, line, snapshot, analysis, lineChoice, live, replaying]);

  const toggleCategory = (c: MissCategory): void => {
    const next = new Set(visible);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setVisible(next);
  };

  return (
    <div className="results">
      <header className="topbar">
        <div className="title">
          <button className="link" onClick={onReset}>
            ← New replay
          </button>
          <span className="file">{fileName}</span>
          <span className="muted">
            {result.meta.player} · {result.meta.gamemode ?? result.meta.kind}
          </span>
        </div>
        {result.rounds.length > 1 && (
          <div className="segmented">
            {result.rounds.map((r, i) => (
              <button
                key={r.roundIndex}
                className={i === roundIdx ? "active" : ""}
                onClick={() => {
                  setReplaying(false);
                  resetLine();
                  setRoundIdx(i);
                }}
              >
                R{r.roundIndex + 1}
              </button>
            ))}
          </div>
        )}
      </header>

      <Sidebar
        summary={round.summary}
        analyses={round.analyses}
        visible={visible}
        current={index}
        sortByGap={sortByGap}
        onToggleCategory={toggleCategory}
        onToggleSort={() => setSortByGap((s) => !s)}
        onJump={(i) => {
          setReplaying(false);
          seekPiece(i);
        }}
      />

      <main className="stage">
        <div className="board-wrap">
          <div className="side-col">
            <span className="label">Hold</span>
            <PiecePreview piece={live.hold} />
          </div>
          <div>
            <BoardCanvas grid={grid} overlays={overlays} />
            <p className="caption">{caption}</p>
          </div>
          <div className="side-col">
            <span className="label">Next</span>
            {live.next.map((p, i) => (
              <PiecePreview key={i} piece={p} dim={i > 0} />
            ))}
            {live.incoming > 0 && (
              <div className="incoming">
                <span className="label">Incoming</span>
                <strong>{live.incoming}</strong>
              </div>
            )}
            <div className="live-stats muted">
              {live.b2b > 0 && <span>B2B ×{live.b2b}</span>}
              {live.combo > 0 && <span>{live.combo} combo</span>}
            </div>
          </div>
        </div>
        <ReplayBar
          analyses={round.analyses}
          visible={visible}
          index={index}
          pieceCount={round.snapshots.length}
          frame={live.frame}
          totalFrames={player.totalFrames}
          spawnFrame={(i) => player.spawnFrame(i)}
          replaying={replaying}
          speed={speed}
          pauseAtMisses={pauseAtMisses}
          onSeekFrame={seekFrame}
          onSeekPiece={(i) => {
            setReplaying(false);
            seekPiece(i);
          }}
          onTogglePlay={togglePlay}
          onSpeed={setSpeed}
          onPauseAtMisses={setPauseAtMisses}
          onPrevMiss={() => {
            setReplaying(false);
            prevMiss();
          }}
          onNextMiss={() => {
            setReplaying(false);
            nextMiss();
          }}
        />
      </main>

      <MovePanel
        snapshot={snapshot}
        analysis={analysis}
        lineChoice={lineChoice}
        lineStep={lineStep}
        playing={linePlaying}
        onLineChoice={(c) => {
          setLineChoice(c);
          resetLine();
        }}
        onLineStep={(n) => {
          if (!atSpawn) {
            setReplaying(false);
            seekPiece(index);
          }
          setLineStep(n);
          setLinePlaying(false);
        }}
        onTogglePlay={() => {
          if (!atSpawn) {
            setReplaying(false);
            seekPiece(index);
          }
          if (lineStep >= lineLength) setLineStep(0);
          setLinePlaying((p) => !p);
        }}
      />
    </div>
  );
}
