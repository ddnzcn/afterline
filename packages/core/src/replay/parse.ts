import { z } from "zod";

import type { ParsedReplay, PlayerGame, RecordedStats, ReplayFrame, ReplayOptions } from "./types";

export class ReplayParseError extends Error {
  override name = "ReplayParseError";
}

const frameSchema = z.looseObject({ frame: z.number(), type: z.string() });

const optionsSchema = z.looseObject({ seed: z.number() });

const innerGameSchema = z.looseObject({
  events: z.array(frameSchema),
  options: optionsSchema,
  results: z.looseObject({ stats: z.looseObject({}).optional() }).optional()
});

const userSchema = z.looseObject({ id: z.string(), username: z.string() });

const versusSchema = z.looseObject({
  id: z.string().nullable().optional(),
  gamemode: z.string().nullable().optional(),
  ts: z.string(),
  users: z.array(userSchema),
  replay: z.looseObject({
    rounds: z.array(
      z.array(
        z.looseObject({
          id: z.string(),
          active: z.boolean(),
          replay: innerGameSchema
        })
      )
    )
  })
});

const soloSchema = z.looseObject({
  id: z.string().nullable().optional(),
  gamemode: z.string().nullable().optional(),
  ts: z.string(),
  users: z.array(userSchema),
  replay: innerGameSchema
});

/** Decode raw file bytes or text into a JS value. Pure: no I/O. */
export function decodeReplay(input: Uint8Array | string): unknown {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  try {
    return JSON.parse(text);
  } catch {
    throw new ReplayParseError(
      "Replay is not JSON. Only JSON .ttrm/.ttr files from the current TETR.IO client are supported."
    );
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

function toStats(raw: unknown): RecordedStats | null {
  return raw && typeof raw === "object" ? (raw as RecordedStats) : null;
}

function usernameFor(users: { id: string; username: string }[], id: string): string {
  return users.find((u) => u.id === id)?.username ?? id;
}

function parseVersus(data: z.infer<typeof versusSchema>): ParsedReplay {
  const games: PlayerGame[] = [];
  data.replay.rounds.forEach((round, roundIndex) => {
    const activeIds = round
      .filter((p) => p.active)
      .map((p) => p.replay.options.gameid)
      .filter((g): g is number => typeof g === "number");

    for (const entry of round) {
      if (!entry.active) continue;
      const options = entry.replay.options as ReplayOptions;
      const gameid = typeof options.gameid === "number" ? options.gameid : null;
      games.push({
        kind: "versus",
        roundIndex,
        playerId: entry.id,
        username: usernameFor(data.users, entry.id),
        gameid,
        opponents: activeIds.filter((g) => g !== gameid),
        options,
        events: entry.replay.events as unknown as ReplayFrame[],
        recordedStats: toStats(entry.replay.results?.stats)
      });
    }
  });

  return {
    kind: "versus",
    id: data.id ?? null,
    gamemode: data.gamemode ?? null,
    ts: data.ts,
    players: data.users.map((u) => ({ id: u.id, username: u.username })),
    games
  };
}

function parseSolo(data: z.infer<typeof soloSchema>): ParsedReplay {
  const user = data.users[0];
  if (!user) throw new ReplayParseError("Solo replay has no user.");
  const options = data.replay.options as ReplayOptions;
  return {
    kind: "solo",
    id: data.id ?? null,
    gamemode: data.gamemode ?? null,
    ts: data.ts,
    players: [{ id: user.id, username: user.username }],
    games: [
      {
        kind: "solo",
        roundIndex: 0,
        playerId: user.id,
        username: user.username,
        gameid: typeof options.gameid === "number" ? options.gameid : null,
        opponents: [],
        options,
        events: data.replay.events as unknown as ReplayFrame[],
        recordedStats: toStats(data.replay.results?.stats)
      }
    ]
  };
}

/** Validate a decoded replay and normalise it into per-player games. */
export function parseReplay(raw: unknown): ParsedReplay {
  if (!raw || typeof raw !== "object") throw new ReplayParseError("Replay root is not an object.");
  const root = raw as Record<string, unknown>;
  const inner = root.replay as Record<string, unknown> | undefined;

  if (inner && Array.isArray(inner.rounds)) {
    const result = versusSchema.safeParse(raw);
    if (!result.success) {
      throw new ReplayParseError(`Invalid versus replay: ${describeIssues(result.error)}`);
    }
    return parseVersus(result.data);
  }

  if (inner && Array.isArray(inner.events)) {
    const result = soloSchema.safeParse(raw);
    if (!result.success) {
      throw new ReplayParseError(`Invalid solo replay: ${describeIssues(result.error)}`);
    }
    return parseSolo(result.data);
  }

  if (Array.isArray(root.data) || "endcontext" in root) {
    throw new ReplayParseError(
      "This looks like a legacy (pre-2024) replay format, which Triangle.js does not support."
    );
  }
  throw new ReplayParseError("Unrecognised replay format: expected replay.rounds (.ttrm) or replay.events (.ttr).");
}

export interface GameSelector {
  /** Username (case-insensitive) or user id. */
  player?: string;
  /** Zero-based round indexes. Defaults to all rounds. */
  rounds?: number[];
}

/** Pick the games to analyze for one player. */
export function selectGames(replay: ParsedReplay, selector: GameSelector = {}): PlayerGame[] {
  const players = replay.players;
  let playerId: string;

  if (selector.player) {
    const wanted = selector.player.toLowerCase();
    const match = players.find((p) => p.id === selector.player || p.username.toLowerCase() === wanted);
    if (!match) {
      throw new ReplayParseError(
        `Player "${selector.player}" not in replay. Players: ${players.map((p) => p.username).join(", ")}`
      );
    }
    playerId = match.id;
  } else if (players.length === 1 && players[0]) {
    playerId = players[0].id;
  } else {
    throw new ReplayParseError(
      `Replay has ${players.length} players; choose one with --player. Players: ${players
        .map((p) => p.username)
        .join(", ")}`
    );
  }

  const games = replay.games.filter(
    (g) => g.playerId === playerId && (!selector.rounds || selector.rounds.includes(g.roundIndex))
  );
  if (games.length === 0) throw new ReplayParseError("No matching rounds for that player.");
  return games;
}
