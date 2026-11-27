import { describe, expect, it } from "vitest";

import { BOARD_WIDTH, VISIBLE_ROWS, boardAfter, boardDims, completedRows, placeStep, shortPlayedNote } from "./board";
import type { Snapshot } from "./types";

const snap = (index: number, overrides: Partial<Snapshot["placement"]> = {}): Snapshot => ({
  index,
  frame: index * 30,
  board: [],
  active: "i",
  hold: null,
  next: ["o", "t", "l", "j", "s"],
  b2b: -1,
  combo: -1,
  incomingGarbage: [],
  garbageMultiplier: 1,
  placement: {
    piece: "i",
    x: 0,
    y: 0,
    rotation: 0,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0]
    ],
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
    topout: false,
    ...overrides
  }
});

describe("boardDims", () => {
  it("defaults to standard 10x20 (+2 spawn rows)", () => {
    expect(boardDims()).toEqual({ width: BOARD_WIDTH, visibleRows: VISIBLE_ROWS });
    expect(boardDims({})).toEqual({ width: 10, visibleRows: 22 });
  });

  it("uses custom boardwidth and boardheight from replay options", () => {
    expect(boardDims({ boardwidth: 4, boardheight: 16 })).toEqual({ width: 4, visibleRows: 18 });
    expect(boardDims({ boardwidth: 12, boardheight: 24 })).toEqual({ width: 12, visibleRows: 26 });
  });

  it("falls back when dimensions are invalid", () => {
    expect(boardDims({ boardwidth: 0, boardheight: -5 })).toEqual({ width: 10, visibleRows: 22 });
  });
});

describe("variable-width board helpers", () => {
  it("places pieces and clears rows on a 4-wide board", () => {
    const step = {
      piece: "i" as const,
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
      ] as [number, number][]
    };
    expect(completedRows([], step.cells, 4)).toEqual([0]);
    expect(placeStep([], step, 4)).toEqual([]);

    const partial = {
      piece: "o" as const,
      cells: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
      ] as [number, number][]
    };
    const next = placeStep([], partial, 4);
    expect(next).toEqual(["oo..", "oo.."]);
    expect(
      boardAfter(
        [],
        [
          { ...partial, x: 0, y: 0, rotation: 0, usedHold: false, spin: "none", lines: 0, attack: 0, sent: 0, b2bAfter: -1, comboAfter: -1, brokeB2B: -1, boardAfter: [] },
          {
            piece: "o",
            cells: [
              [2, 0],
              [3, 0],
              [2, 1],
              [3, 1]
            ],
            x: 2,
            y: 0,
            rotation: 0,
            usedHold: false,
            spin: "none",
            lines: 2,
            attack: 1,
            sent: 1,
            b2bAfter: -1,
            comboAfter: 0,
            brokeB2B: -1,
            boardAfter: []
          }
        ],
        2,
        4
      )
    ).toEqual([]);
  });
});

describe("shortPlayedNote", () => {
  it("returns null when all slots are filled or line is empty", () => {
    const snaps = Array.from({ length: 10 }, (_, i) => snap(i));
    expect(shortPlayedNote(snaps, 0, 6)).toBeNull();
    expect(shortPlayedNote(snaps, 0, 0)).toBeNull();
  });

  it("explains garbage arrival when garbage entered after the last replayed step", () => {
    const snaps = [snap(0), snap(1), snap(2, { garbageReceived: 4 }), snap(3), snap(4), snap(5), snap(6)];
    expect(shortPlayedNote(snaps, 0, 3)).toBe("Garbage arrived after step 3, so the line stops here.");
  });

  it("explains round end near the end of a game (e.g. 40L) or on topout", () => {
    const snaps = [snap(0), snap(1), snap(2), snap(3)];
    expect(shortPlayedNote(snaps, 1, 3)).toBe("Round ended after step 3.");

    const topoutSnaps = [snap(0), snap(1, { topout: true }), snap(2), snap(3), snap(4), snap(5), snap(6)];
    expect(shortPlayedNote(topoutSnaps, 0, 2)).toBe("Round ended after step 2.");
  });

  it("falls back to a neutral message when stopped early without garbage or round end", () => {
    const snaps = Array.from({ length: 10 }, (_, i) => snap(i));
    expect(shortPlayedNote(snaps, 0, 2)).toBe("Line stops after step 2.");
  });
});
