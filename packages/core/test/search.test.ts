import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  beamSearch,
  boardFeatures,
  boardFromRows,
  fastPlacements,
  lockCells,
  mergeSettings,
  rulesFromConfig,
  type PieceType
} from "../src";
import { fixtureConfig } from "./helpers/board";

const rules = rulesFromConfig(fixtureConfig());
/** Top-down ASCII to bottom-up rows. */
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

describe("fast board", () => {
  it("clears full lines and counts garbage cleared", () => {
    const b = board("XXXXXX.XXX\nXXXXXX.XXX");
    const iVertical = rules.pieces.i.rotations[1]!; // column at x+2, rows y..y-3
    const res = lockCells(b, iVertical, 4, 3);
    expect(res.lines).toBe(2);
    expect(res.garbageCleared).toBe(2);
    expect(res.board.rows[0]).toBe(1 << 6);
    expect(res.perfectClear).toBe(false);
  });

  it("measures holes, covered depth and TSD slots", () => {
    const f = boardFeatures(board(TSD));
    expect(f.holes).toBe(1); // the cell under the T-slot overhang
    expect(f.coveredDepth).toBe(1);
    expect(f.tSlots).toBeGreaterThan(0);
    expect(f.tSlotLines).toBe(2);
    const holey = boardFeatures(board("XXXXXXXXX.\nX.XXXXXXX."));
    expect(holey.holes).toBe(1);
    expect(holey.coveredDepth).toBe(1);
  });
});

describe("beam search", () => {
  const input = (b: string, active: PieceType, queue: PieceType[], hold: PieceType | null = null) => ({
    board: board(b),
    active,
    hold,
    queue,
    b2b: -1,
    combo: -1,
    pending: 0,
    multiplier: 1
  });

  it("takes the TSD with a T in a ready slot", () => {
    const res = beamSearch(input(TSD, "t", ["i", "o", "l", "j", "s"]), rules, DEFAULT_SETTINGS);
    expect(res.best!.steps[0]).toMatchObject({ piece: "t", spin: "normal", lines: 2, attack: 4 });
    expect(res.best!.steps).toHaveLength(6);
    expect(res.alternatives.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.search.topN);
  });

  it("holds into a T to take the TSD", () => {
    const res = beamSearch(input(TSD, "o", ["i", "l", "j", "s", "z"], "t"), rules, DEFAULT_SETTINGS);
    expect(res.best!.steps[0]).toMatchObject({ piece: "t", usedHold: true, spin: "normal", lines: 2 });
  });

  it("respects a forced first move", () => {
    const flat = fastPlacements(board(TSD), rules, "t").find((p) => p.spin === "none" && p.rotation === 0 && p.x === 6)!;
    const res = beamSearch(input(TSD, "t", ["i", "o", "l"]), rules, DEFAULT_SETTINGS, { placement: flat, usedHold: false });
    expect(res.best!.steps[0]).toMatchObject({ piece: "t", x: 6, rotation: 0, spin: "none" });
  });

  it("caps depth by known pieces and honours settings", () => {
    const short = beamSearch(input(TSD, "t", ["i"]), rules, DEFAULT_SETTINGS);
    expect(short.best!.steps.length).toBeLessThanOrEqual(2);
    const shallow = beamSearch(input(TSD, "t", ["i", "o", "l", "j"]), rules, mergeSettings({ search: { depth: 2 } }));
    expect(shallow.best!.steps).toHaveLength(2);
  });

  it("is deterministic", () => {
    const a = beamSearch(input(TSD, "t", ["i", "o", "l", "j", "s"]), rules, DEFAULT_SETTINGS);
    const b = beamSearch(input(TSD, "t", ["i", "o", "l", "j", "s"]), rules, DEFAULT_SETTINGS);
    expect(a).toEqual(b);
  });
});
