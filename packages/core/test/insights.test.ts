import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, analyzeSnapshot, beamSearch, takenLater, type LineStep, boardFromRows, fastBoardToRows, fastPlacements, lockCells, placementCells, rulesFromConfig, searchInputFor, type Snapshot } from "../src";
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

  it("never flags a move identical to the engine's first move", () => {
    const snap = snapshotWith({ x: 0, y: 0, rotation: 0 }, { active: "o", next: ["s", "z", "l", "j", "i"] });
    const best = beamSearch(searchInputFor(snap, rules), rules, DEFAULT_SETTINGS).best!.steps[0]!;
    const same = {
      ...snap,
      active: best.usedHold ? snap.active : best.piece,
      placement: { ...snap.placement, piece: best.piece, x: best.x, y: best.y, rotation: best.rotation, cells: best.cells, spin: best.spin, usedHold: best.usedHold }
    };
    const a = analyzeSnapshot(same, rules, DEFAULT_SETTINGS);
    expect(a.gap).toBe(0);
    expect(a.flagged).toBe(false);
  });

  it("does not call it a missed spin when the player takes the spin a piece later", () => {
    // Engine: hold the O and TSD right away. Player: O on the right, then the same TSD next piece.
    const b0 = board(TSD);
    const o = fastPlacements(b0, rules, "o").find((p) => p.spin === "none" && placementCells(rules, p).every(([x]) => x >= 8))!;
    const b1 = lockCells(b0, rules.pieces.o.rotations[o.rotation]!, o.x, o.y).board;
    const tsd = fastPlacements(b1, rules, "t").find((p) => p.spin === "normal")!;

    const first = snapshotWith(
      { x: o.x, y: o.y, rotation: o.rotation },
      { active: "o", next: ["t", "i", "l", "j", "s"] }
    );
    first.placement = { ...first.placement, piece: "o", cells: placementCells(rules, o) };
    const second = snapshotWith({ x: tsd.x, y: tsd.y, rotation: tsd.rotation }, { index: 1, board: fastBoardToRows(b1), active: "t", next: ["i", "l", "j", "s", "z"] });
    second.placement = { ...second.placement, piece: "t", spin: "normal", linesCleared: 2, attack: 4, cells: placementCells(rules, tsd) };

    const a = analyzeSnapshot(first, rules, DEFAULT_SETTINGS, [second]);
    expect(a.played!.steps.map((s) => [s.piece, s.spin, s.lines])).toEqual([
      ["o", "none", 0],
      ["t", "normal", 2]
    ]);
    expect(a.primary).not.toBe("missed_spin");
    expect(a.planPaidOff).toBe(true);
    expect(a.flagged).toBe(false);
  });

  describe("takenLater", () => {
    const step = (o: Partial<LineStep>): LineStep => ({
      piece: "t", x: 0, y: 0, rotation: 0, cells: [[0, 0], [1, 0], [2, 0], [1, 1]], usedHold: false, spin: "none", lines: 0,
      attack: 0, sent: 0, b2bAfter: -1, comboAfter: -1, brokeB2B: -1, boardAfter: [], ...o
    });
    const tsd = step({ spin: "normal", lines: 2, attack: 4, cells: [[3, 1], [4, 0], [4, 1], [5, 1]] });

    it("matches the same spin clear a few pieces later, wherever it lands", () => {
      const played = [step({ piece: "o" }), step({ piece: "i" }), step({ spin: "normal", lines: 2, cells: [[6, 3], [7, 2], [7, 3], [8, 3]] })];
      expect(takenLater(tsd, played)).toBe(2);
    });

    it("does not match a smaller clear or a different spin", () => {
      expect(takenLater(tsd, [step({ piece: "o" }), step({ spin: "normal", lines: 1 })])).toBeNull();
      expect(takenLater(tsd, [step({ piece: "o" }), step({ spin: "mini", lines: 2 })])).toBeNull();
    });

    it("matches a non-clearing placement only in the same cells with no clears in between", () => {
      const flat = step({ piece: "o", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] });
      expect(takenLater(flat, [step({ piece: "i" }), step({ piece: "o", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] })])).toBe(1);
      expect(takenLater(flat, [step({ piece: "i", lines: 1 }), step({ piece: "o", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] })])).toBeNull();
    });

    it("ignores the player's first move (that is the move being judged)", () => {
      expect(takenLater(tsd, [tsd])).toBeNull();
    });
  });

  it("labels a costly move the player made later as taken_late, not a missed spin", () => {
    // engine: hold the O and TSD now; player: O on top of the slot's open side first (costly), then the TSD
    const b0 = board(TSD);
    const tsdNow = fastPlacements(b0, rules, "t").find((p) => p.spin === "normal")!;
    const tsdCells = placementCells(rules, tsdNow);
    // an O stacked high on the left makes the first move clearly worse than holding into the TSD
    const o = fastPlacements(b0, rules, "o").filter((p) => p.spin === "none" && placementCells(rules, p).every(([x]) => x <= 1))[0]!;
    const b1 = lockCells(b0, rules.pieces.o.rotations[o.rotation]!, o.x, o.y).board;
    const tsd1 = fastPlacements(b1, rules, "t").find((p) => p.spin === "normal" && placementCells(rules, p).join() === tsdCells.join())!;
    const first = snapshotWith({ x: o.x, y: o.y, rotation: o.rotation }, { active: "o", next: ["t", "i", "l", "j", "s"] });
    first.placement = { ...first.placement, piece: "o", cells: placementCells(rules, o) };
    const second = snapshotWith({ x: tsd1.x, y: tsd1.y, rotation: tsd1.rotation }, { index: 1, board: fastBoardToRows(b1), active: "t", next: ["i", "l", "j", "s", "z"] });
    second.placement = { ...second.placement, piece: "t", spin: "normal", linesCleared: 2, attack: 4, cells: placementCells(rules, tsd1) };
    const a = analyzeSnapshot(first, rules, { ...DEFAULT_SETTINGS, insights: { ...DEFAULT_SETTINGS.insights, missThreshold: 0.1 } }, [second]);
    expect(a.takenLater).toBe(1);
    if (a.flagged) {
      expect(a.categories).toEqual(["taken_late"]);
      expect(a.reasons[0]).toMatch(/1 piece later/);
    }
  });
});
