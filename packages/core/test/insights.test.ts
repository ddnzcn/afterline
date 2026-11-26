import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, analyzeSnapshot, boardFromRows, fastPlacements, rulesFromConfig, type Snapshot } from "../src";
import { fixtureConfig } from "./helpers/board";

const rules = rulesFromConfig(fixtureConfig());
const rows = (ascii: string): string[] =>
  ascii
    .trim()
    .split("\n")
    .map((r) => r.trim().replace(/X/g, "g"))
    .reverse();
const board = (ascii: string) => boardFromRows(rows(ascii), 10, rules.fullHeight);

const TSD = `
XXXX......
XXX...XXXX
XXXX.XXXXX`;

describe("insights", () => {
  const snapshotWith = (placement: { x: number; y: number; rotation: number }, extra: Partial<Snapshot> = {}): Snapshot => ({
    index: 0,
    frame: 0,
    board: rows(TSD),
    active: "t",
    hold: null,
    next: ["i", "o", "l", "j", "s"],
    b2b: -1,
    combo: -1,
    incomingGarbage: [],
    garbageMultiplier: 1,
    placement: {
      piece: "t",
      ...placement,
      cells: [],
      usedHold: false,
      spin: "none",
      allSpin: false,
      linesCleared: 0,
      garbageCleared: 0,
      perfectClear: false,
      attack: 0,
      sent: 0,
      surge: 0,
      garbageReceived: 0,
      b2bAfter: -1,
      comboAfter: -1,
      topout: false
    },
    ...extra
  });

  it("flags a missed TSD as missed_spin", () => {
    const a = analyzeSnapshot(snapshotWith({ x: 6, y: 3, rotation: 0 }), rules, DEFAULT_SETTINGS);
    expect(a.actual!.steps[0]).toMatchObject({ x: 6, rotation: 0 });
    expect(a.flagged).toBe(true);
    expect(a.primary).toBe("missed_spin");
    expect(a.reasons[0]).toMatch(/T-spin double/);
  });

  it("does not flag the TSD itself", () => {
    const tsd = fastPlacements(board(TSD), rules, "t").find((p) => p.spin === "normal")!;
    const snap = snapshotWith({ x: tsd.x, y: tsd.y, rotation: tsd.rotation });
    const a = analyzeSnapshot({ ...snap, placement: { ...snap.placement, spin: "normal", linesCleared: 2 } }, rules, DEFAULT_SETTINGS);
    expect(a.flagged).toBe(false);
    expect(a.gap).toBeLessThan(DEFAULT_SETTINGS.insights.missThreshold);
  });
});
