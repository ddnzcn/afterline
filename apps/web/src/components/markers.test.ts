import { describe, expect, it } from "vitest";

import type { SnapshotAnalysis } from "../types";

import { buildMarkers } from "./markers";

const miss = (index: number, gap: number): SnapshotAnalysis => ({
  index,
  gap,
  flagged: true,
  primary: "other",
  categories: ["other"],
  reasons: [""],
  best: null,
  actual: null,
  played: null,
  alternatives: [],
  planPaidOff: false,
  nodes: 0,
  ms: 0
});

describe("buildMarkers (handoff §11 merge rule)", () => {
  const x = (i: number): number => i * 10; // piece index -> px

  it("keeps markers that are far apart as singles, sized 8-14px by gap", () => {
    const { singles, stacks } = buildMarkers([miss(0, 1), miss(5, 4), miss(10, 7)], x, -1);
    expect(stacks).toHaveLength(0);
    expect(singles.map((m) => m.size)).toEqual([8, 11, 14]);
  });

  it("merges neighbours closer than 6px into one stack, top 3 by gap", () => {
    const xs = (i: number): number => [0, 100, 104, 107, 109, 300][i]!;
    const { singles, stacks } = buildMarkers([miss(0, 1), miss(1, 2), miss(2, 9), miss(3, 3), miss(4, 5), miss(5, 1)], xs, -1);
    expect(singles.map((m) => m.a.index)).toEqual([0, 5]);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.items.map((m) => m.a.index)).toEqual([1, 2, 3, 4]);
    expect(stacks[0]!.top.map((m) => m.a.index)).toEqual([2, 4, 3]);
  });

  it("pulls a marker that would overlap a stack into it, until stable", () => {
    const xs = (i: number): number => [100, 103, 120][i]!; // 0+1 stack: 28px wide at 101.5; an 11px marker at 120 overlaps it (18.5 < 14 + 5.5)
    const { singles, stacks } = buildMarkers([miss(0, 1), miss(1, 1), miss(2, 1)], xs, -1);
    expect(singles).toHaveLength(0);
    expect(stacks[0]!.items).toHaveLength(3);
    // ...but one just clear of it (23.5 > 19.5) stays single
    const clear = buildMarkers([miss(0, 1), miss(1, 1), miss(2, 1)], (i) => [100, 103, 125][i]!, -1);
    expect(clear.singles.map((m) => m.a.index)).toEqual([2]);
  });

  it("splits a stack that contains the current miss back into singles", () => {
    const xs = (i: number): number => [100, 103][i]!;
    const { singles, stacks } = buildMarkers([miss(0, 1), miss(1, 2)], xs, 1);
    expect(stacks).toHaveLength(0);
    expect(singles.map((m) => m.a.index).sort()).toEqual([0, 1]);
  });

  it("handles no misses", () => {
    expect(buildMarkers([], x, 0)).toEqual({ singles: [], stacks: [] });
  });
});
