import { useEffect, useRef, useState } from "react";

import { ServerUnreachableError, getJob, startAnalysis, uploadReplay } from "./api";
import { PickerView, type Selection } from "./components/PickerView";
import { ProgressView, type RoundProgress } from "./components/ProgressView";
import { ResultsView } from "./components/ResultsView";
import { UploadView, type UploadError } from "./components/UploadView";
import type { AnalysisResult, UploadedReplay } from "./types";

type Phase =
  | { kind: "upload" }
  | { kind: "picker" }
  | { kind: "running"; jobId: string; done: number; total: number; rounds: RoundProgress[]; startedAt: number }
  | { kind: "results"; result: AnalysisResult };

const POLL_MS = 500;

/** Turn an upload failure into the copy the design specifies. */
function classifyUploadError(e: unknown): UploadError {
  if (e instanceof ServerUnreachableError) return { kind: "server" };
  const message = e instanceof Error ? e.message : String(e);
  if (/not JSON|Unrecognised replay format/i.test(message)) return { kind: "not-replay" };
  if (/legacy/i.test(message)) return { kind: "legacy" };
  return { kind: "other", message };
}

/** Default selection: the only (or first) player, all of their supported rounds. */
function defaultSelection(replay: UploadedReplay): Selection {
  const player = replay.players[0]?.id ?? "";
  return { player, rounds: new Set(replay.games.filter((g) => g.playerId === player && g.supported).map((g) => g.roundIndex)) };
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "upload" });
  const [replay, setReplay] = useState<UploadedReplay | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [selection, setSelection] = useState<Selection>({ player: "", rounds: new Set() });
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const onFile = async (file: File): Promise<void> => {
    setReading(true);
    setUploadError(null);
    setFileName(file.name);
    try {
      const uploaded = await uploadReplay(file);
      setReplay(uploaded);
      setSelection(defaultSelection(uploaded));
      setAnalysisError(null);
      setPhase({ kind: "picker" });
    } catch (e: unknown) {
      setUploadError(classifyUploadError(e));
    } finally {
      setReading(false);
    }
  };

  const onAnalyze = async (): Promise<void> => {
    if (!replay) return;
    setStarting(true);
    setAnalysisError(null);
    try {
      const rounds = [...selection.rounds].sort((a, b) => a - b);
      const { jobId } = await startAnalysis(replay.replayId, selection.player, rounds);
      setPhase({ kind: "running", jobId, done: 0, total: 0, rounds: [], startedAt: Date.now() });
    } catch (e: unknown) {
      setAnalysisError(e instanceof ServerUnreachableError ? "Can't reach the analysis server. Start it with bun run dev and try again." : e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (phase.kind !== "running") return;
    let cancelled = false;
    const fail = (message: string): void => {
      setAnalysisError(message);
      setPhase({ kind: "picker" });
    };
    const poll = async (): Promise<void> => {
      try {
        const job = await getJob(phase.jobId);
        if (cancelled) return;
        if (job.status === "done" && job.result) setPhase({ kind: "results", result: job.result });
        else if (job.status === "error") fail(`Analysis stopped: ${job.error ?? "unknown error"}.`);
        else {
          setPhase((p) => (p.kind === "running" ? { ...p, done: job.progress.done, total: job.progress.total, rounds: job.progress.rounds ?? [] } : p));
          pollRef.current = window.setTimeout(poll, POLL_MS);
        }
      } catch (e: unknown) {
        if (!cancelled) fail(e instanceof ServerUnreachableError ? "Lost the analysis server during analysis." : e instanceof Error ? e.message : String(e));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // only restart polling when a new job starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === "running" ? phase.jobId : null]);

  const toUpload = (): void => {
    setPhase({ kind: "upload" });
    setReplay(null);
    setUploadError(null);
  };
  const playerName = replay?.players.find((p) => p.id === selection.player)?.username ?? "";

  if (phase.kind === "running" && replay) {
    return (
      <ProgressView
        fileName={fileName}
        player={playerName}
        gamemode={replay.gamemode}
        done={phase.done}
        total={phase.total}
        rounds={phase.rounds}
        startedAt={phase.startedAt}
        onCancel={() => setPhase({ kind: "picker" })}
      />
    );
  }
  if (phase.kind === "results") return <ResultsView result={phase.result} replay={replay} fileName={fileName} onReset={toUpload} />;
  if (phase.kind === "picker" && replay) {
    return (
      <PickerView
        replay={replay}
        fileName={fileName}
        selection={selection}
        error={analysisError}
        busy={starting}
        onSelection={setSelection}
        onDismissError={() => setAnalysisError(null)}
        onChangeFile={toUpload}
        onAnalyze={() => void onAnalyze()}
      />
    );
  }
  return <UploadView reading={reading} fileName={fileName} error={uploadError} onFile={(f) => void onFile(f)} />;
}
