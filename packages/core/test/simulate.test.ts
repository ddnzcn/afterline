import { describe, expect, it } from "vitest";

import { simulateGame } from "../src";
import { TS, soloGame } from "./helpers/synthetic";

describe("simulateGame (synthetic solo input)", () => {
  it("emits one snapshot per hard drop with consistent queue/active chaining", () => {
    const sim = simulateGame(soloGame(Array.from({ length: 8 }, () => ["hardDrop"])), TS);
    expect(sim.snapshots).toHaveLength(8);
    expect(sim.stats.pieces).toBe(8);
    for (let i = 1; i < sim.snapshots.length; i++) {
      const prev = sim.snapshots[i - 1]!;
      expect(sim.snapshots[i]!.active).toBe(prev.next[0]);
      expect(sim.snapshots[i]!.next.slice(0, 4)).toEqual(prev.next.slice(1, 5));
    }
    const first = sim.snapshots[0]!;
    expect(first.board).toEqual([]);
    expect(first.placement.cells).toHaveLength(4);
    expect(first.placement.usedHold).toBe(false);
    // the second snapshot's board contains exactly the first piece's cells
    const filled = sim.snapshots[1]!.board.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [[x, y]])));
    expect(filled.sort()).toEqual([...first.placement.cells].sort());
  });

  it("detects hold usage and tracks hold contents", () => {
    const sim = simulateGame(soloGame([["hold", "hardDrop"], ["hardDrop"]]), TS);
    const [a, b] = sim.snapshots;
    expect(a!.hold).toBeNull();
    expect(a!.placement.usedHold).toBe(true);
    expect(a!.placement.piece).toBe(a!.next[0]);
    expect(b!.hold).toBe(a!.active);
    expect(b!.placement.usedHold).toBe(false);
    expect(sim.stats.holds).toBe(1);
  });

  it("is deterministic", () => {
    const g = soloGame(Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? ["moveLeft", "hardDrop"] : ["rotateCW", "hardDrop"])));
    expect(simulateGame(g, TS)).toEqual(simulateGame(g, TS));
  });
});
