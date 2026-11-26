import { describe, expect, it } from "vitest";

import { MoveGenerator, type GeneratedPlacement, type PieceType } from "../src";
import { cellsOf, engineFromBoard, fixtureConfig } from "./helpers/board";

const generate = (board: string, piece: PieceType, opts: { hold?: PieceType | null; useHold?: boolean; config?: Record<string, unknown> } = {}) => {
  const config = fixtureConfig(opts.config);
  const engine = engineFromBoard(board, piece, { hold: opts.hold, config });
  return new MoveGenerator(config).generate(engine.snapshot(), { useHold: opts.useHold ?? false });
};

const find = (ps: GeneratedPlacement[], cells: string, spin?: string) =>
  ps.find((p) => cellsOf(p.cells) === cells && (spin === undefined || p.spin === spin));

// Boards are top-down ASCII; the last line is the floor row. Cells are "x,y" with y up from the floor.
const TSD = `
XXXX......
XXX...XXXX
XXXX.XXXXX`;

const TST = `
....XXXXXX
.....XXXXX
XXXX.XXXXX
XXX..XXXXX
XXXX.XXXXX`;

describe("move generator: T-spins", () => {
  it("finds a TSD in a classic T-slot", () => {
    const tsd = find(generate(TSD, "t"), "3,1 4,0 4,1 5,1", "normal");
    expect(tsd).toMatchObject({ piece: "t", linesCleared: 2, attack: 4, allSpin: false });
    expect(tsd!.inputs).toEqual(["cw", "softDrop", "cw"]);
  });

  it("distinguishes spin and non-spin arrivals at the same cells", () => {
    const ps = generate(TSD, "t");
    // the vertical T in the slot: reached by a plain drop (no spin) and by rotating in (mini)
    const spins = ps.filter((p) => cellsOf(p.cells) === "4,0 4,1 4,2 5,1").map((p) => p.spin).sort();
    expect(spins).toEqual(["mini", "none"]);
  });

  it("finds a TST through the TST kick, under an overhang", () => {
    const tst = find(generate(TST, "t"), "3,1 4,0 4,1 4,2", "normal");
    expect(tst).toMatchObject({ linesCleared: 3, attack: 6 });
    expect(tst!.inputs.at(-1)).toBe("ccw");
  });

  it("finds an STSD (TST kick into a slot where only two rows complete)", () => {
    const stsd = `
....XXXXXX
.....XXXXX
XXXX.XXXX.
XXX..XXXXX
XXXX.XXXXX`;
    expect(find(generate(stsd, "t"), "3,1 4,0 4,1 4,2", "normal")).toMatchObject({ linesCleared: 2, attack: 4 });
  });

  it("finds no spin where the T can just drop in", () => {
    const open = `
XXX...XXXX
XXXX.XXXXX`;
    const ps = generate(open, "t");
    expect(find(ps, "3,1 4,0 4,1 5,1")).toMatchObject({ spin: "none", linesCleared: 2 });
  });
});

describe("move generator: all-spin minis (all-mini+)", () => {
  it.each<[string, PieceType, string, string, number]>([
    ["S", "s", "XXX...XXXX\nXXXX..XXXX\nXXX..XXXXX", "3,0 4,0 4,1 5,1", 2],
    ["Z", "z", "XXXX...XXX\nXXXX..XXXX\nXXXXX..XXX", "4,1 5,0 5,1 6,0", 2],
    ["L", "l", "XX...XXXXX\nXXX...XXXX\nXXX.XXXXXX", "3,0 3,1 4,1 5,1", 2],
    ["J", "j", "XXXX...XXX\nXXX...XXXX\nXXXXX.XXXX", "3,1 4,1 5,0 5,1", 2],
    ["I", "i", "XXX.......\nXXX.......\nXXX.XXXXXX\nXXX....XXX", "3,0 4,0 5,0 6,0", 1]
  ])("%s-spin", (_name, piece, board, cells, lines) => {
    expect(find(generate(board, piece), cells, "mini")).toMatchObject({ piece, allSpin: true, linesCleared: lines });
  });

  it("gives no spin credit under T-spins-only rules", () => {
    const board = "XXX...XXXX\nXXXX..XXXX\nXXX..XXXXX";
    const ps = generate(board, "s", { config: { spinbonuses: "T-spins" } });
    expect(find(ps, "3,0 4,0 4,1 5,1")).toMatchObject({ spin: "none", allSpin: false });
  });
});

describe("move generator: enumeration", () => {
  it.each<[PieceType, number]>([
    ["o", 9],
    ["i", 17],
    ["s", 17],
    ["z", 17],
    ["t", 34],
    ["l", 34],
    ["j", 34]
  ])("dedupes %s on an empty board to %i placements", (piece, n) => {
    const ps = generate("..........", piece);
    expect(ps).toHaveLength(n);
    expect(new Set(ps.map((p) => cellsOf(p.cells))).size).toBe(n);
  });

  it("includes hold placements, with hold as the first input", () => {
    const ps = generate("..........", "t", { hold: "i", useHold: true });
    const held = ps.filter((p) => p.usedHold);
    expect(held).toHaveLength(17);
    expect(held.every((p) => p.piece === "i" && p.inputs[0] === "hold")).toBe(true);
    expect(ps.filter((p) => !p.usedHold && p.piece === "t")).toHaveLength(34);
  });

  it("uses the next piece for hold when hold is empty", () => {
    const config = fixtureConfig();
    const engine = engineFromBoard("..........", "t", { config });
    const next = engine.queue[0];
    const held = new MoveGenerator(config).generate(engine.snapshot()).filter((p) => p.usedHold);
    expect(held.length).toBeGreaterThan(0);
    expect(new Set(held.map((p) => p.piece))).toEqual(new Set([next]));
  });

  it("skips 180 rotations when the game disallows them", () => {
    const ps = generate(TSD, "t", { config: { allow180: false } });
    expect(ps.some((p) => p.inputs.includes("180"))).toBe(false);
    expect(find(ps, "3,1 4,0 4,1 5,1", "normal")).toBeDefined();
  });

  it("returns the shortest path per placement", () => {
    const ps = generate("..........", "o");
    const leftmost = ps.find((p) => cellsOf(p.cells) === "0,0 0,1 1,0 1,1");
    expect(leftmost!.inputs).toEqual(["dasLeft"]);
    const spawnColumn = ps.find((p) => p.inputs.length === 0);
    expect(spawnColumn).toBeDefined();
  });

  it("skips the hold line when hold holds the same piece type", () => {
    const ps = generate("..........", "t", { hold: "t", useHold: true });
    expect(ps.some((p) => p.usedHold)).toBe(false);
    expect(ps).toHaveLength(34);
  });

  it("is deterministic", () => {
    expect(generate(TSD, "t", { hold: "l", useHold: true })).toEqual(generate(TSD, "t", { hold: "l", useHold: true }));
  });
});
