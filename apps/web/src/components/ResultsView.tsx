import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { boardDims } from "../board";
import { CATEGORIES } from "../categories";
import type { AnalysisResult, MissCategory, UploadedReplay } from "../types";
import { useReplay } from "../useReplay";

import { BoardStage, type StageMode } from "./BoardStage";
import { KeyMap } from "./KeyMap";
import { LeftRail } from "./LeftRail";
import type { LineChoice } from "./LineCompare";
import { MoveDetail } from "./MoveDetail";
import { NowPlaying } from "./NowPlaying";
import { ReplayBar } from "./ReplayBar";
import { TopBar } from "./TopBar";

interface ResultsViewProps {
  result: AnalysisResult;
  replay: UploadedReplay | null;
  fileName: string;
  onReset: () => void;
}

const LINE_STEP_MS = 650;

export function ResultsView({ result, replay, fileName, onReset }: ResultsViewProps) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [visible, setVisible] = useState<Set<MissCategory>>(new Set(CATEGORIES));
  const [sortByGap, setSortByGap] = useState(false);
  const [lineChoice, setLineChoice] = useState<LineChoice>("engine");
  const [altIndex, setAltIndex] = useState<number | null>(null);
  const [lineStep, setLineStep] = useState(0);
  const [linePlaying, setLinePlaying] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Review is entered explicitly (jump to a piece, pause at a miss); results open Live at 0:00. */
  const [review, setReview] = useState(false);

  const round = result.rounds[roundIdx]!;
  const dims = useMemo(() => boardDims(round.game.options), [round.game.options]);
  const lastIndex = round.snapshots.length - 1;
  const misses = useMemo(
    () => round.analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)).map((a) => a.index),
    [round, visible]
  );
  const missSet = useMemo(() => new Set(misses), [misses]);
  const r = useReplay(round.game, result.meta.ts, lastIndex, missSet, () => {
    setAltIndex(null);
    setReview(true);
  });

  const index = Math.min(r.live.pieces, lastIndex);
  const snapshot = round.snapshots[index]!;
  const analysis = round.analyses[index]!;
  const atSpawn = review && !r.replaying && r.live.frame === r.player.spawnFrame(index) && r.live.pieces <= lastIndex;
  const activeAlt = altIndex !== null && altIndex < analysis.alternatives.length ? altIndex : null;
  const engineLine = activeAlt !== null ? (analysis.alternatives[activeAlt] ?? analysis.best) : analysis.best;
  const altRank = activeAlt !== null ? activeAlt + 2 : null;
  const line = lineChoice === "engine" ? engineLine : analysis.played;
  const lineLength = line?.steps.length ?? 0;
  const mode: StageMode = !atSpawn ? "live" : lineStep > 0 ? "line" : "review";

  const resetLine = useCallback(() => {
    setLineStep(0);
    setLinePlaying(false);
  }, []);
  const goPiece = useCallback(
    (i: number) => {
      r.setReplaying(false);
      resetLine();
      setAltIndex(null);
      setReview(true);
      r.seekPiece(i);
    },
    [r, resetLine]
  );
  const goFrame = useCallback(
    (f: number) => {
      resetLine();
      setAltIndex(null);
      setReview(false);
      r.seekFrame(f);
    },
    [r, resetLine]
  );
  // "previous piece" from mid-piece goes back to the current piece's spawn first, like a chapter
  const prevPiece = (): void => goPiece(r.live.frame > r.player.spawnFrame(index) ? index : index - 1);
  const nextPiece = (): void => goPiece(index + 1);
  const nextMiss = (): void => {
    const m = misses.find((x) => x > index || (x === index && !atSpawn));
    if (m !== undefined) goPiece(m);
  };
  const prevMiss = (): void => {
    const m = [...misses].reverse().find((x) => x < index);
    if (m !== undefined) goPiece(m);
  };
  const togglePlay = (): void => {
    resetLine();
    setAltIndex(null);
    setReview(false);
    r.togglePlay();
  };
  const ensureReview = (): void => {
    if (!atSpawn) goPiece(index);
  };

  // engine-line step-through
  useEffect(() => {
    if (!linePlaying) return;
    if (lineStep >= lineLength) {
      setLinePlaying(false);
      return;
    }
    const t = window.setTimeout(() => setLineStep((s) => s + 1), LINE_STEP_MS);
    return () => window.clearTimeout(t);
  }, [linePlaying, lineStep, lineLength]);

  // keyboard (interactions.md, plus ? for the key map); single stable listener reading fresh state via ref
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(null);
  onKeyRef.current = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "text") return;
    if (e.key === "?") setHelpOpen((o) => !o);
    else if (e.key === "Escape" && helpOpen) setHelpOpen(false);
    else if (e.key === "ArrowRight" && e.shiftKey) nextMiss();
    else if (e.key === "ArrowLeft" && e.shiftKey) prevMiss();
    else if (e.key === "ArrowRight") nextPiece();
    else if (e.key === "ArrowLeft") prevPiece();
    else if (e.key === "Home") goFrame(0);
    else if (e.key === "End") goPiece(lastIndex);
    else if (e.key === "ArrowDown" && atSpawn) setLineStep((s) => Math.min(lineLength, s + 1));
    else if (e.key === "ArrowUp" && atSpawn) setLineStep((s) => Math.max(0, s - 1));
    else if (e.key === " " && !(t instanceof HTMLButtonElement)) togglePlay();
    else if (e.key.toLowerCase() === "l" && atSpawn) setLinePlaying((p) => !p);
    else if (e.key === "Escape") {
      if (lineStep > 0 || linePlaying) resetLine();
      else if (activeAlt !== null) setAltIndex(null);
    } else if (e.key.toLowerCase() === "e") {
      setLineChoice((c) => (c === "engine" ? "yours" : "engine"));
      setLineStep(0);
    } else return;
    e.preventDefault();
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => onKeyRef.current?.(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const outcomes = result.rounds.map((rd) => ({
    roundIndex: rd.roundIndex,
    outcome: replay?.games.find((g) => g.roundIndex === rd.roundIndex && g.username === rd.username)?.outcome ?? null
  }));
  const date = new Date(result.meta.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const mode2 = result.meta.gamemode ? result.meta.gamemode.replace(/^league$/, "League").replace(/^40l$/, "40L") : result.meta.kind;

  return (
    <div className="app-results">
      <TopBar
        file={fileName}
        meta={[result.meta.player, mode2, date]}
        rounds={outcomes}
        current={roundIdx}
        onRound={(i) => {
          r.setReplaying(false);
          resetLine();
          setAltIndex(null);
          setReview(false);
          setRoundIdx(i);
        }}
        onHelp={() => setHelpOpen((o) => !o)}
        helpOpen={helpOpen}
      >
        <button className="al-btn al-btn-ghost" onClick={onReset}>
          New replay
        </button>
      </TopBar>
      {helpOpen && <KeyMap onClose={() => setHelpOpen(false)} />}

      <div className="results-grid">
        <LeftRail
          roundNumber={round.roundIndex + 1}
          pieces={round.snapshots.length}
          totalFrames={r.player.totalFrames}
          summary={round.summary}
          analyses={round.analyses}
          visible={visible}
          current={atSpawn ? index : null}
          sortByGap={sortByGap}
          onToggleCategory={(c) => {
            const next = new Set(visible);
            if (next.has(c)) next.delete(c);
            else next.add(c);
            setVisible(next);
          }}
          onShowAll={() => setVisible(new Set(CATEGORIES))}
          onSort={setSortByGap}
          onJump={goPiece}
        />

        <main className="center">
          <BoardStage
            mode={mode}
            dims={dims}
            live={r.live}
            snapshot={snapshot}
            analysis={analysis}
            engineLine={engineLine}
            altRank={altRank}
            line={line}
            lineChoice={lineChoice}
            lineStep={lineStep}
            replaying={r.replaying}
            speed={r.speed}
          />
          <ReplayBar
            snapshots={round.snapshots}
            analyses={round.analyses}
            visible={visible}
            index={index}
            frame={r.live.frame}
            totalFrames={r.player.totalFrames}
            spawnFrame={(i) => r.player.spawnFrame(i)}
            replaying={r.replaying}
            over={r.live.over}
            speed={r.speed}
            pauseAtMisses={r.pauseAtMisses}
            onSeekFrame={goFrame}
            onSeekPiece={goPiece}
            onTogglePlay={togglePlay}
            onSpeed={r.setSpeed}
            onPauseAtMisses={r.setPauseAtMisses}
            onPrevMiss={prevMiss}
            onNextMiss={nextMiss}
            onShowAll={() => setVisible(new Set(CATEGORIES))}
          />
        </main>

        {atSpawn ? (
          <MoveDetail
            snapshots={round.snapshots}
            snapshot={snapshot}
            analysis={analysis}
            boardWidth={dims.width}
            altIndex={activeAlt}
            lineChoice={lineChoice}
            lineStep={lineStep}
            linePlaying={linePlaying}
            onAltIndex={(next) => {
              setAltIndex(next);
              setLineChoice("engine");
              resetLine();
            }}
            onLineChoice={(c) => {
              setLineChoice(c);
              resetLine();
            }}
            onLineStep={(c, n) => {
              ensureReview();
              setLineChoice(c);
              setLineStep(n);
              setLinePlaying(false);
            }}
            onTogglePlayLine={() => {
              ensureReview();
              if (lineStep >= lineLength) setLineStep(0);
              setLinePlaying((p) => !p);
            }}
          />
        ) : (
          <NowPlaying
            live={r.live}
            pieceCount={round.snapshots.length}
            analyses={round.analyses}
            nextMiss={round.analyses.find((a) => a.flagged && a.primary && visible.has(a.primary) && a.index > index) ?? null}
            onJump={goPiece}
          />
        )}
      </div>
    </div>
  );
}
