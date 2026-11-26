import { useEffect, useRef, useState } from "react";

import { getJob, startAnalysis, uploadReplay } from "./api";
import { ProgressView } from "./components/ProgressView";
import { ResultsView } from "./components/ResultsView";
import { UploadView } from "./components/UploadView";
import type { AnalysisResult, UploadedReplay } from "./types";

type Phase =
  | { kind: "upload" }
  | { kind: "running"; jobId: string; done: number; total: number; startedAt: number }
  | { kind: "results"; result: AnalysisResult };

const POLL_MS = 500;

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "upload" });
  const [replay, setReplay] = useState<UploadedReplay | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const onFile = async (file: File): Promise<void> => {
    setBusy(true);
    setError(null);
    setReplay(null);
    try {
      setFileName(file.name);
      setReplay(await uploadReplay(file));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAnalyze = async (player: string, rounds: number[]): Promise<void> => {
    if (!replay) return;
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await startAnalysis(replay.replayId, player, rounds);
      setPhase({ kind: "running", jobId, done: 0, total: 0, startedAt: Date.now() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase.kind !== "running") return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const job = await getJob(phase.jobId);
        if (cancelled) return;
        if (job.status === "done" && job.result) setPhase({ kind: "results", result: job.result });
        else if (job.status === "error") {
          setError(job.error ?? "Analysis failed.");
          setPhase({ kind: "upload" });
        } else {
          setPhase((p) => (p.kind === "running" ? { ...p, done: job.progress.done, total: job.progress.total } : p));
          pollRef.current = window.setTimeout(poll, POLL_MS);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase({ kind: "upload" });
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

  if (phase.kind === "running") return <ProgressView done={phase.done} total={phase.total} startedAt={phase.startedAt} />;
  if (phase.kind === "results")
    return (
      <ResultsView
        result={phase.result}
        fileName={fileName}
        onReset={() => {
          setPhase({ kind: "upload" });
          setReplay(null);
        }}
      />
    );
  return <UploadView replay={replay} busy={busy} error={error} onFile={(f) => void onFile(f)} onAnalyze={(p, r) => void onAnalyze(p, r)} />;
}
