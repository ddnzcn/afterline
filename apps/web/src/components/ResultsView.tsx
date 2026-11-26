import { useCallback, useEffect, useMemo, useState } from "react";

import { boardAfter } from "../board";
import { CATEGORIES, type AnalysisResult, type MissCategory } from "../types";

import { BoardCanvas, type Overlay } from "./BoardCanvas";
import { MovePanel, type LineChoice } from "./MovePanel";
import { PiecePreview } from "./PiecePreview";
import { Sidebar } from "./Sidebar";
import { ReplayBar } from "./ReplayBar";

interface ResultsViewProps {
  result: AnalysisResult;
  fileName: string;
  onReset: () => void;
}

const PLAY_INTERVAL_MS = 650;

export function ResultsView({ result, fileName, onReset }: ResultsViewProps) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState<Set<MissCategory>>(new Set(CATEGORIES));
  const [sortByGap, setSortByGap] = useState(false);
  const [lineChoice, setLineChoice] = useState<LineChoice>("engine");
  const [lineStep, setLineStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtMisses, setPauseAtMisses] = useState(true);

  const round = result.rounds[roundIdx]!;
  const snapshot = round.snapshots[index]!;
  const analysis = round.analyses[index]!;
  const line = lineChoice === "engine" ? analysis.best : analysis.actual;
  const lineLength = line?.steps.length ?? 0;

  const misses = useMemo(
    () => round.analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)).map((a) => a.index),
    [round, visible]
  );

  const nextMiss = useCallback(() => misses.find((m) => m > index) ?? index, [misses, index]);
  const prevMiss = useCallback(() => [...misses].reverse().find((m) => m < index) ?? index, [misses, index]);

  const seek = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(round.snapshots.length - 1, i)));
      setLineStep(0);
      setPlaying(false);
    },
    [round]
  );

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.key === "ArrowRight" && e.shiftKey) seek(nextMiss());
      else if (e.key === "ArrowLeft" && e.shiftKey) seek(prevMiss());
      else if (e.key === "ArrowRight") seek(index + 1);
      else if (e.key === "ArrowLeft") seek(index - 1);
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(round.snapshots.length - 1);
      else if (e.key === "ArrowDown") setLineStep((s) => Math.min(lineLength, s + 1));
      else if (e.key === "ArrowUp") setLineStep((s) => Math.max(0, s - 1));
      else if (e.key === " ") setReplaying((r) => !r);
      else if (e.key.toLowerCase() === "l") setPlaying((p) => !p);
      else if (e.key === "Escape") {
        setLineStep(0);
        setPlaying(false);
      } else if (e.key.toLowerCase() === "e") {
        setLineChoice((c) => (c === "engine" ? "yours" : "engine"));
        setLineStep(0);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, round, lineLength, seek, nextMiss, prevMiss]);

  // step-through animation
  useEffect(() => {
    if (!playing) return;
    if (lineStep >= lineLength) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setLineStep((s) => s + 1), PLAY_INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [playing, lineStep, lineLength]);

  // replay playback: advance pieces in game time, optionally stopping on each miss
  useEffect(() => {
    if (!replaying) return;
    const snaps = round.snapshots;
    if (index >= snaps.length - 1) {
      setReplaying(false);
      return;
    }
    const frames = snaps[index + 1]!.frame - snaps[index]!.frame;
    const delay = Math.max(16, (frames / 60 / speed) * 1000);
    const t = window.setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      setLineStep(0);
      setPlaying(false);
      if (pauseAtMisses && misses.includes(next)) setReplaying(false);
    }, delay);
    return () => window.clearTimeout(t);
  }, [replaying, index, speed, pauseAtMisses, misses, round]);

  const { grid, overlays, caption } = useMemo(() => {
    if (lineStep === 0 || !line) {
      const o: Overlay[] = [];
      const ghost = analysis.best?.steps[0];
      // while the replay plays, only show the engine ghost where you missed something
      if (ghost && (!replaying || analysis.flagged)) o.push({ cells: ghost.cells, piece: ghost.piece, style: "ghost" });
      o.push({ cells: snapshot.placement.cells, piece: snapshot.placement.piece, style: "solid" });
      const cap = replaying ? (analysis.flagged ? "Miss: your placement (solid) · engine's choice (ghost)" : "Your placement") : "Your placement (solid) · engine's choice (ghost)";
      return { grid: snapshot.board, overlays: o, caption: cap };
    }
    const placed = boardAfter(snapshot.board, line.steps, lineStep - 1);
    const step = line.steps[lineStep - 1]!;
    return {
      grid: placed,
      overlays: [{ cells: step.cells, piece: step.piece, style: "solid" as const }],
      caption: `${lineChoice === "engine" ? "Engine" : "Your"} line · step ${lineStep}/${line.steps.length} · ${step.lines > 0 ? `clears ${step.lines} (shown before the clear)` : "piece landing"}`
    };
  }, [lineStep, line, analysis, snapshot, lineChoice, replaying]);

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
                  setRoundIdx(i);
                  setIndex(0);
                  setLineStep(0);
                  setPlaying(false);
                  setReplaying(false);
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
        onJump={seek}
      />

      <main className="stage">
        <div className="board-wrap">
          <div className="side-col">
            <span className="label">Hold</span>
            <PiecePreview piece={snapshot.hold} />
          </div>
          <div>
            <BoardCanvas grid={grid} overlays={overlays} />
            <p className="caption">{caption}</p>
          </div>
          <div className="side-col">
            <span className="label">Next</span>
            {snapshot.next.map((p, i) => (
              <PiecePreview key={i} piece={p} dim={i > 0} />
            ))}
            {snapshot.incomingGarbage.length > 0 && (
              <div className="incoming">
                <span className="label">Incoming</span>
                <strong>{snapshot.incomingGarbage.reduce((s, g) => s + g.amount, 0)}</strong>
              </div>
            )}
          </div>
        </div>
        <ReplayBar
          snapshots={round.snapshots}
          analyses={round.analyses}
          visible={visible}
          index={index}
          replaying={replaying}
          speed={speed}
          pauseAtMisses={pauseAtMisses}
          onSeek={seek}
          onTogglePlay={() => {
            if (index >= round.snapshots.length - 1) seek(0);
            setReplaying((r) => !r);
          }}
          onSpeed={setSpeed}
          onPauseAtMisses={setPauseAtMisses}
          onPrevMiss={() => seek(prevMiss())}
          onNextMiss={() => seek(nextMiss())}
        />
      </main>

      <MovePanel
        snapshot={snapshot}
        analysis={analysis}
        lineChoice={lineChoice}
        lineStep={lineStep}
        playing={playing}
        onLineChoice={(c) => {
          setLineChoice(c);
          setLineStep(0);
          setPlaying(false);
        }}
        onLineStep={(n) => {
          setLineStep(n);
          setPlaying(false);
        }}
        onTogglePlay={() => {
          if (lineStep >= lineLength) setLineStep(0);
          setReplaying(false);
          setPlaying((p) => !p);
        }}
      />
    </div>
  );
}
