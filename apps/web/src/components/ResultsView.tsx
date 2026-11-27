import { useCallback, useEffect, useMemo, useState } from "react";

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

/**
 * Board cell size from the space the centre column actually has: 26px at 1280x800, 24px when narrower,
 * and smaller only when the window is too short for 22 rows plus the replay bar (e.g. 1100x700).
 */
function boardCell(vw: number, vh: number): number {
  const rail = vw < 1140 ? 280 : 304;
  const panel = vw < 1240 ? 312 : 344;
  const centre = Math.max(vw, 1100) - 24 - rail - panel - 32;
  const byWidth = Math.floor((centre - 2 * 88 - 6 - 3 * 12) / 10);
  const byHeight = Math.floor((vh - 52 - 12 - 36 - 120 - 16) / 22);
  const preferred = vw < 1240 ? 24 : 26;
  return Math.max(16, Math.min(preferred, byWidth, byHeight));
}

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const on = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export function ResultsView({ result, replay, fileName, onReset }: ResultsViewProps) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [visible, setVisible] = useState<Set<MissCategory>>(new Set(CATEGORIES));
  const [sortByGap, setSortByGap] = useState(false);
  const [lineChoice, setLineChoice] = useState<LineChoice>("engine");
  const [lineStep, setLineStep] = useState(0);
  const [linePlaying, setLinePlaying] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Review is entered explicitly (jump to a piece, pause at a miss); results open Live at 0:00. */
  const [review, setReview] = useState(false);
  const viewport = useViewport();
  const cell = boardCell(viewport.width, viewport.height);

  const round = result.rounds[roundIdx]!;
  const lastIndex = round.snapshots.length - 1;
  const misses = useMemo(
    () => round.analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)).map((a) => a.index),
    [round, visible]
  );
  const missSet = useMemo(() => new Set(misses), [misses]);
  const r = useReplay(round.game, result.meta.ts, lastIndex, missSet, () => setReview(true));

  const index = Math.min(r.live.pieces, lastIndex);
  const snapshot = round.snapshots[index]!;
  const analysis = round.analyses[index]!;
  const atSpawn = review && !r.replaying && r.live.frame === r.player.spawnFrame(index) && r.live.pieces <= lastIndex;
  const line = lineChoice === "engine" ? analysis.best : analysis.played;
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
      setReview(true);
      r.seekPiece(i);
    },
    [r, resetLine]
  );
  const goFrame = useCallback(
    (f: number) => {
      resetLine();
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

  // keyboard (interactions.md, plus ? for the key map)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
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
      else if (e.key === "Escape") resetLine();
      else if (e.key.toLowerCase() === "e") {
        setLineChoice((c) => (c === "engine" ? "yours" : "engine"));
        setLineStep(0);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
            live={r.live}
            snapshot={snapshot}
            analysis={analysis}
            line={line}
            lineChoice={lineChoice}
            lineStep={lineStep}
            replaying={r.replaying}
            speed={r.speed}
            cell={cell}
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
            snapshot={snapshot}
            analysis={analysis}
            lineChoice={lineChoice}
            lineStep={lineStep}
            linePlaying={linePlaying}
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
