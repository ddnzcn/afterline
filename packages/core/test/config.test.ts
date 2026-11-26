import { describe, expect, it } from "vitest";

import { splitFrames, toEngineConfig, type PlayerGame, type ReplayFrame } from "../src";

const base: PlayerGame = {
  kind: "versus",
  roundIndex: 0,
  playerId: "u1",
  username: "a",
  gameid: 1,
  opponents: [2],
  options: { seed: 42, boardwidth: 10, boardheight: 20, b2bcharging: true, b2bcharge_at: 4, b2bcharge_base: 3, passthrough: "zero" },
  events: [],
  recordedStats: null
};

describe("toEngineConfig", () => {
  it("maps width/height the right way round", () => {
    const c = toEngineConfig(base, "2025-09-01T00:00:00Z");
    expect(c.board).toEqual({ width: 10, height: 20, buffer: 20 });
  });
  it("uses charging (surge) and disables chaining when b2bcharging is on", () => {
    const c = toEngineConfig(base, "2025-09-01T00:00:00Z");
    expect(c.b2b).toEqual({ chaining: false, charging: { at: 4, base: 3 } });
  });
  it("adds multiplayer only for versus", () => {
    expect(toEngineConfig(base, "2025-09-01T00:00:00Z").multiplayer).toEqual({ opponents: [2], passthrough: "zero" });
    expect(toEngineConfig({ ...base, kind: "solo" }, "2025-09-01T00:00:00Z").multiplayer).toBeUndefined();
  });
  it("passes the replay timestamp as the engine date", () => {
    expect(toEngineConfig(base, "2025-09-01T00:00:00Z").misc.date?.toISOString()).toBe("2025-09-01T00:00:00.000Z");
  });
});

describe("splitFrames", () => {
  const ev = (frame: number) => ({ frame, type: "keydown", data: {} }) as unknown as ReplayFrame;
  it("buckets events by frame", () => {
    const f = splitFrames([ev(0), ev(2), ev(2)]);
    expect(f.map((x) => x.length)).toEqual([1, 0, 2, 0]);
  });
  it("rejects empty and unsorted input", () => {
    expect(() => splitFrames([])).toThrow();
    expect(() => splitFrames([ev(3), ev(1)])).toThrow(/out of order/);
  });
});
