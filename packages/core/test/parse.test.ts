import { describe, expect, it } from "vitest";

import { ReplayParseError, decodeReplay, parseReplay, selectGames } from "../src";

const round = (id: string, gameid: number, active = true) => ({
  id,
  active,
  alive: id === "u1",
  replay: { events: [{ frame: 0, type: "start", data: {} }], options: { seed: 1, gameid }, results: { stats: { piecesplaced: 3 } } }
});

const versus = {
  id: "abc",
  gamemode: "league",
  ts: "2025-09-01T00:00:00.000Z",
  users: [
    { id: "u1", username: "alice" },
    { id: "u2", username: "bob" }
  ],
  replay: { leaderboard: [], rounds: [[round("u1", 10), round("u2", 20)], [round("u2", 21), round("u1", 11)]] },
  version: 1
};

describe("decodeReplay", () => {
  it("decodes JSON bytes", () => {
    expect(decodeReplay(new TextEncoder().encode('{"a":1}'))).toEqual({ a: 1 });
  });
  it("rejects non-JSON", () => {
    expect(() => decodeReplay(new Uint8Array([0x81, 0xa1]))).toThrow(ReplayParseError);
  });
});

describe("parseReplay", () => {
  it("normalises a versus replay into per-player games with opponents", () => {
    const parsed = parseReplay(versus);
    expect(parsed.kind).toBe("versus");
    expect(parsed.games).toHaveLength(4);
    const aliceR2 = parsed.games.find((g) => g.username === "alice" && g.roundIndex === 1)!;
    expect(aliceR2.gameid).toBe(11);
    expect(aliceR2.opponents).toEqual([21]);
    expect(aliceR2.recordedStats?.piecesplaced).toBe(3);
    expect(aliceR2.alive).toBe(true);
    expect(parsed.games.find((g) => g.username === "bob")!.alive).toBe(false);
  });

  it("skips inactive players", () => {
    const v = structuredClone(versus);
    v.replay.rounds[0]![1]!.active = false;
    const parsed = parseReplay(v);
    expect(parsed.games.filter((g) => g.roundIndex === 0)).toHaveLength(1);
    expect(parsed.games[0]!.opponents).toEqual([]);
  });

  it("parses a solo replay", () => {
    const parsed = parseReplay({
      id: null,
      gamemode: "40l",
      ts: "2025-09-01T00:00:00.000Z",
      users: [{ id: "u1", username: "alice" }],
      replay: { frames: 1, events: [], options: { seed: 5 }, results: { stats: { lines: 40 } } }
    });
    expect(parsed.kind).toBe("solo");
    expect(parsed.games[0]!.recordedStats?.lines).toBe(40);
  });

  it("rejects legacy and unknown formats with clear errors", () => {
    expect(() => parseReplay({ data: [], endcontext: [] })).toThrow(/legacy/);
    expect(() => parseReplay({ foo: 1 })).toThrow(/Unrecognised/);
    expect(() => parseReplay({ ...versus, ts: 5 })).toThrow(/Invalid versus replay: ts/);
  });
});

describe("selectGames", () => {
  const parsed = parseReplay(versus);
  it("requires --player when ambiguous", () => {
    expect(() => selectGames(parsed)).toThrow(/alice, bob/);
  });
  it("matches username case-insensitively and filters rounds", () => {
    const games = selectGames(parsed, { player: "BOB", rounds: [1] });
    expect(games.map((g) => [g.username, g.roundIndex])).toEqual([["bob", 1]]);
  });
  it("errors on unknown player", () => {
    expect(() => selectGames(parsed, { player: "carol" })).toThrow(/not in replay/);
  });
});
