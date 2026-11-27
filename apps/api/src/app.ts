import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { ReplayParseError, UnsupportedReplayError, assertSupported, decodeReplay, parseReplay, selectGames } from "@tta/core";

import type { JobStore } from "./jobs";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const analyzeBody = z.object({
  replayId: z.string().uuid(),
  player: z.string().min(1).max(64),
  rounds: z.array(z.number().int().min(0).max(100)).max(100).optional()
});

const idParams = z.object({ id: z.string().uuid() });

/** Build the HTTP app. Responses use { data } on success and { error } on failure. */
export function buildApp(store: JobStore): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 1024 * 1024 });
  void app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ReplayParseError || error instanceof UnsupportedReplayError || error instanceof z.ZodError) {
      return reply.status(400).send({ error: error instanceof z.ZodError ? "Invalid request body." : error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (error as Error).message });
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({ error: "Internal error." });
  });

  app.get("/api/health", async () => ({ data: { ok: true } }));

  app.post("/api/replays", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "Upload a .ttrm or .ttr file in the 'file' field." });
    const buffer = await file.toBuffer();
    const replay = parseReplay(decodeReplay(buffer));
    const replayId = store.addReplay(replay);
    const games = replay.games.map((g) => {
      const base = {
        roundIndex: g.roundIndex,
        playerId: g.playerId,
        username: g.username,
        outcome: g.alive === true ? ("won" as const) : g.alive === false ? ("lost" as const) : null,
        pieces: g.recordedStats?.piecesplaced ?? null,
        durationMs: g.recordedStats?.finaltime ?? null
      };
      try {
        assertSupported(g);
        return { ...base, supported: true as const };
      } catch (error: unknown) {
        return { ...base, supported: false as const, reason: (error as Error).message };
      }
    });
    return { data: { replayId, kind: replay.kind, gamemode: replay.gamemode, ts: replay.ts, players: replay.players, games } };
  });

  app.post("/api/analyses", async (request, reply) => {
    const body = analyzeBody.parse(request.body);
    const replay = store.getReplay(body.replayId);
    if (!replay) return reply.status(404).send({ error: "Replay not found; upload it again." });
    const games = selectGames(replay, { player: body.player, rounds: body.rounds });
    const job = store.start(body.replayId, replay, games);
    // the first supported round's inputs, so the progress screen can play it while analysis runs
    const preview = games.find((g) => {
      try {
        assertSupported(g);
        return true;
      } catch {
        return false;
      }
    });
    return reply.status(202).send({ data: { jobId: job.id, preview: preview ?? null } });
  });

  app.get("/api/analyses/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const job = store.getJob(id);
    if (!job) return reply.status(404).send({ error: "Analysis not found." });
    return {
      data: {
        status: job.status,
        progress: { done: job.done, total: job.total, rounds: job.rounds },
        ...(job.status === "done" ? { result: job.result } : {}),
        ...(job.status === "error" ? { error: job.error } : {})
      }
    };
  });

  app.delete("/api/analyses/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const job = store.cancel(id);
    if (!job) return reply.status(404).send({ error: "Analysis not found." });
    return { data: { status: job.status } };
  });

  return app;
}
