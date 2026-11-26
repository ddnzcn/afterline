import type { PlayerGame, ReplayFrame } from "../../src";

type Key = "hardDrop" | "moveLeft" | "moveRight" | "rotateCW" | "rotateCCW" | "rotate180" | "hold" | "softDrop";

/** Build a key tap (keydown + keyup on the same frame). */
export function tap(frame: number, key: Key): ReplayFrame[] {
  return [
    { frame, type: "keydown", data: { key, subframe: 0 } },
    { frame, type: "keyup", data: { key, subframe: 0.1 } }
  ] as unknown as ReplayFrame[];
}

/** A solo game where every piece is hard-dropped at spawn, optionally holding first. */
export function soloGame(inputs: Key[][], seed = 12345): PlayerGame {
  const events: ReplayFrame[] = [{ frame: 0, type: "start", data: {} } as unknown as ReplayFrame];
  let frame = 10;
  for (const keys of inputs) {
    for (const key of keys) {
      events.push(...tap(frame, key));
      frame += 2;
    }
    frame += 6;
  }
  events.push({ frame: frame + 5, type: "end", data: {} } as unknown as ReplayFrame);
  return {
    kind: "solo",
    roundIndex: 0,
    playerId: "p1",
    username: "tester",
    gameid: null,
    opponents: [],
    options: { seed, bagtype: "7-bag", kickset: "SRS+", spinbonuses: "all-mini+", g: 0 },
    events,
    recordedStats: null
  };
}

export const TS = "2025-09-01T00:00:00.000Z";
