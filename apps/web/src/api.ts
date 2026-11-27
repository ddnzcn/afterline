import type { PlayerGame } from "@tta/core";

import type { JobState, UploadedReplay } from "./types";

/** The analysis server could not be reached (not running, or the dev proxy has nothing behind it). */
export class ServerUnreachableError extends Error {
  override name = "ServerUnreachableError";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ServerUnreachableError("Can't reach the analysis server.");
  }
  // with the API down, the Vite proxy answers 5xx without our JSON envelope
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!body) {
    if (res.status >= 500) throw new ServerUnreachableError("Can't reach the analysis server.");
    throw new Error(`Request failed (${res.status})`);
  }
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data;
}

export function uploadReplay(file: File): Promise<UploadedReplay> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/replays", { method: "POST", body: form });
}

export function startAnalysis(replayId: string, player: string, rounds: number[]): Promise<{ jobId: string; preview: PlayerGame | null }> {
  return request("/api/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replayId, player, rounds })
  });
}

export function getJob(jobId: string): Promise<JobState> {
  return request(`/api/analyses/${jobId}`);
}
