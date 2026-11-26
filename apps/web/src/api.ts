import type { JobState, UploadedReplay } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Cannot reach the analysis server. Is `bun run dev` running?");
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data;
}

export function uploadReplay(file: File): Promise<UploadedReplay> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/replays", { method: "POST", body: form });
}

export function startAnalysis(replayId: string, player: string, rounds: number[]): Promise<{ jobId: string }> {
  return request("/api/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replayId, player, rounds })
  });
}

export function getJob(jobId: string): Promise<JobState> {
  return request(`/api/analyses/${jobId}`);
}
