import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { analyzeSnapshot, rulesFromConfig, toEngineConfig, type FastRules, type PlayerGame } from "@tta/core";

import { buildApp } from "../src/app";
import { JobStore, type AnalysisRunner } from "../src/jobs";
import { AnalysisCancelledError } from "../src/pool";
import { getCachedRules } from "../src/worker";

/** Runs analysis in-process instead of in worker threads. */
const inProcess: AnalysisRunner = {
  run: async ({ config, settings, snapshots, count }) => {
    const rules = rulesFromConfig(config);
    const fast = { ...settings, search: { ...settings.search, depth: 2, width: 4 } };
    return snapshots.slice(0, count).map((s, i) => analyzeSnapshot(s, rules, fast, snapshots.slice(i + 1, i + 2)));
  }
};

const app = buildApp(new JobStore(inProcess));
afterAll(() => app.close());

const multipart = (name: string, content: string) => {
  const boundary = "----tta-test";
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
};

const fixtureDir = join(__dirname, "../../../fixtures/replays");
const forty = readdirSync(fixtureDir).find((f) => f.endsWith(".ttr") && readFileSync(join(fixtureDir, f), "utf8").includes('"gamemode":"40l"'));

describe("api", () => {
  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ data: { ok: true } });
  });

  it("rejects a non-replay upload with a clear error", async () => {
    const res = await app.inject({ method: "POST", url: "/api/replays", ...multipart("x.ttrm", "not json") });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not JSON/);
  });

  it("validates the analysis request body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/analyses", payload: { replayId: "nope", player: "x" } });
    expect(res.statusCode).toBe(400);
  });

  it("404s unknown jobs and replays", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await app.inject({ method: "GET", url: `/api/analyses/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/api/analyses/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/analyses", payload: { replayId: id, player: "x" } })).statusCode).toBe(404);
  });

  it.skipIf(!forty)("cancels a running analysis job and aborts pending work", async () => {
    let aborted = 0;
    const blockingRunner: AnalysisRunner = {
      run: (_task, signal) =>
        new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            aborted++;
            reject(new AnalysisCancelledError());
            return;
          }
          signal?.addEventListener(
            "abort",
            () => {
              aborted++;
              reject(new AnalysisCancelledError());
            },
            { once: true }
          );
        })
    };
    const cancelApp = buildApp(new JobStore(blockingRunner));
    try {
      const up = await cancelApp.inject({ method: "POST", url: "/api/replays", ...multipart(forty!, readFileSync(join(fixtureDir, forty!), "utf8")) });
      const { replayId, players } = up.json().data;
      const start = await cancelApp.inject({ method: "POST", url: "/api/analyses", payload: { replayId, player: players[0].username } });
      const { jobId } = start.json().data;

      // let the job simulate and dispatch chunks to the runner
      await new Promise((r) => setTimeout(r, 50));

      const del = await cancelApp.inject({ method: "DELETE", url: `/api/analyses/${jobId}` });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ data: { status: "cancelled" } });

      const status = await cancelApp.inject({ method: "GET", url: `/api/analyses/${jobId}` });
      expect(status.statusCode).toBe(200);
      expect(status.json().data.status).toBe("cancelled");
      expect(status.json().data.result).toBeUndefined();
      expect(aborted).toBeGreaterThan(0);
    } finally {
      await cancelApp.close();
    }
  });

  it("evicts oldest entries from the worker rules cache using LRU order", () => {
    const cache = new Map<string, FastRules>();
    const cfg = toEngineConfig(
      {
        kind: "solo",
        roundIndex: 0,
        playerId: "p1",
        username: "u1",
        gameid: null,
        opponents: [],
        options: { seed: 1 },
        events: [],
        recordedStats: null
      } satisfies PlayerGame,
      "2025-01-01T00:00:00.000Z"
    );

    const a = getCachedRules(cache, "a", cfg, 2);
    getCachedRules(cache, "b", cfg, 2);
    // touch "a" so "b" becomes least recently used
    expect(getCachedRules(cache, "a", cfg, 2)).toBe(a);
    getCachedRules(cache, "c", cfg, 2);

    expect([...cache.keys()]).toEqual(["a", "c"]);
  });

  it.skipIf(!forty)("uploads, analyzes and returns results", async () => {
    const up = await app.inject({ method: "POST", url: "/api/replays", ...multipart(forty!, readFileSync(join(fixtureDir, forty!), "utf8")) });
    expect(up.statusCode).toBe(200);
    const { replayId, players, games } = up.json().data;
    expect(games[0].supported).toBe(true);
    expect(games[0].pieces).toBeGreaterThan(0);
    expect(games[0].durationMs).toBeGreaterThan(0);
    expect(games[0].outcome).toBeNull(); // solo replay: no winner

    const start = await app.inject({ method: "POST", url: "/api/analyses", payload: { replayId, player: players[0].username } });
    expect(start.statusCode).toBe(202);
    const { jobId, preview } = start.json().data;
    expect(preview.roundIndex).toBe(0);
    expect(preview.events.length).toBeGreaterThan(0);

    let job;
    for (let i = 0; i < 200; i++) {
      job = (await app.inject({ method: "GET", url: `/api/analyses/${jobId}` })).json().data;
      if (job.status !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(job.status).toBe("done");
    const round = job.result.rounds[0];
    expect(round.snapshots).toHaveLength(round.analyses.length);
    expect(round.summary.pieces).toBe(round.snapshots.length);
    expect(job.progress.done).toBe(job.progress.total);
    expect(job.progress.rounds).toEqual([{ roundIndex: 0, done: job.progress.total, total: job.progress.total }]);
  });
});
