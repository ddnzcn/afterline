import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ReplayPlayer, decodeReplay, parseReplay, simulateGame } from "../src";
import { TS, soloGame } from "./helpers/synthetic";

describe("ReplayPlayer", () => {
  const game = soloGame(Array.from({ length: 12 }, (_, i) => (i % 2 ? ["moveLeft", "hardDrop"] : ["rotateCW", "hardDrop"])));

  it("plays to the same final board as the simulator", () => {
    const sim = simulateGame(game, TS);
    const player = new ReplayPlayer(game, TS);
    while (player.advance(10));
    const end = player.live();
    expect(end.pieces).toBe(sim.stats.pieces);
    expect(end.board).toEqual(sim.finalBoard);
    expect(end.over).toBe(true);
  });

  it("seeking to a piece spawn shows that piece's decision state", () => {
    const sim = simulateGame(game, TS);
    const player = new ReplayPlayer(game, TS);
    for (const i of [7, 2, 11, 0]) {
      player.seek(player.spawnFrame(i));
      const f = player.live();
      expect(f.pieces).toBe(i);
      expect(f.board).toEqual(sim.snapshots[i]!.board);
      expect(f.falling?.piece).toBe(sim.snapshots[i]!.active);
      expect(f.next).toEqual(sim.snapshots[i]!.next);
    }
  });

  it("is identical whether reached by playing or by seeking", () => {
    const a = new ReplayPlayer(game, TS);
    a.advance(57);
    const b = new ReplayPlayer(game, TS);
    b.seek(80);
    b.seek(57);
    expect(b.live()).toEqual(a.live());
  });

  it("puts the falling piece's shadow on the stack", () => {
    const player = new ReplayPlayer(game, TS);
    const f = player.live();
    expect(Math.min(...f.shadow!.map(([, y]) => y))).toBe(0);
  });
});

const dir = join(__dirname, "../../../fixtures/replays");
const league = readdirSync(dir).find((f) => f.endsWith(".ttrm"));

describe.skipIf(!league)("ReplayPlayer on a real league round", () => {
  it("matches simulated snapshots at every spawn and ends with the same stats", () => {
    const replay = parseReplay(decodeReplay(readFileSync(join(dir, league!))));
    const game = replay.games.find((g) => g.roundIndex === 2)!;
    const sim = simulateGame(game, replay.ts);
    const player = new ReplayPlayer(game, replay.ts);
    sim.snapshots.forEach((s, i) => {
      player.seek(player.spawnFrame(i));
      const f = player.live();
      expect(f.board, `piece ${i}`).toEqual(s.board);
      expect(f.hold).toBe(s.hold);
    });
    player.seek(0);
    while (player.advance(120));
    expect(player.live().pieces).toBe(sim.stats.pieces);
  });
});
