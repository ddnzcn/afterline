import type { PieceType, Snapshot } from "../sim/types";

import { boardFromRows } from "../fast/board";
import type { FastPlacement } from "../fast/movegen";
import type { FastRules } from "../fast/rules";
import { beamSearch, type FirstMove, type Line, type LineStep, type SearchInput } from "../search/beam";
import type { AnalyzerSettings } from "../search/weights";

export type MissCategory = "missed_spin" | "b2b_break" | "missed_setup" | "garbage" | "other";

/** Priority when several categories apply: the first one is the headline. */
export const CATEGORY_ORDER: readonly MissCategory[] = ["missed_spin", "b2b_break", "missed_setup", "garbage", "other"];

export interface SnapshotAnalysis {
  index: number;
  /** Best line when the first move is forced to the player's actual move. */
  actual: Line | null;
  best: Line | null;
  alternatives: Line[];
  /** best.score - actual.score (>= 0), in attack-line equivalents. */
  gap: number;
  flagged: boolean;
  categories: MissCategory[];
  primary: MissCategory | null;
  reasons: string[];
  nodes: number;
  ms: number;
}

const isSpinClear = (s: LineStep | undefined): boolean => !!s && s.spin !== "none" && s.lines > 0;

const describe = (s: LineStep): string => {
  const piece = s.piece.toUpperCase();
  const lines = ["", "single", "double", "triple", "quad"][s.lines] ?? `${s.lines}-line clear`;
  const what =
    s.spin === "normal" ? `${piece}-spin ${lines}`.trim() : s.spin === "mini" ? `${piece}-spin mini ${lines}`.trim() : s.lines > 0 ? `${piece} ${lines}` : `${piece} placement`;
  return s.attack > 0 ? `${what} (${s.attack} attack)` : what;
};

export function searchInputFor(snapshot: Snapshot, rules: FastRules): SearchInput {
  return {
    board: boardFromRows(snapshot.board, rules.width, rules.fullHeight),
    active: snapshot.active,
    hold: snapshot.hold,
    queue: snapshot.next,
    b2b: snapshot.b2b,
    combo: snapshot.combo,
    pending: snapshot.incomingGarbage.reduce((a, g) => a + g.amount, 0),
    multiplier: snapshot.garbageMultiplier
  };
}

/** The player's move as a forced first step. A same-piece hold swap counts as no hold. */
export function actualFirstMove(snapshot: Snapshot): FirstMove {
  const p = snapshot.placement;
  const usedHold = p.usedHold && snapshot.hold !== snapshot.active;
  const placement: FastPlacement = { piece: p.piece as PieceType, x: p.x, y: p.y, rotation: p.rotation, spin: p.spin };
  return { placement, usedHold };
}

export function analyzeSnapshot(snapshot: Snapshot, rules: FastRules, settings: AnalyzerSettings): SnapshotAnalysis {
  const t0 = performance.now();
  const input = searchInputFor(snapshot, rules);
  const free = beamSearch(input, rules, settings);
  const forced = beamSearch(input, rules, settings, actualFirstMove(snapshot));
  const best = free.best;
  const actual = forced.best;

  const gap = best && actual ? Math.max(0, best.score - actual.score) : 0;
  const flagged = !!best && !!actual && gap > settings.insights.missThreshold;
  const categories: MissCategory[] = [];
  const reasons: string[] = [];

  if (best && actual && flagged) {
    const b0 = best.steps[0]!;
    const a0 = actual.steps[0]!;
    const horizon = settings.insights.setupHorizon;

    if (isSpinClear(b0) && !isSpinClear(a0)) {
      categories.push("missed_spin");
      reasons.push(`A ${describe(b0)} was available; you played ${describe(a0)}.`);
    }
    if (a0.brokeB2B >= 0 && b0.brokeB2B < 0) {
      categories.push("b2b_break");
      reasons.push(`Your ${describe(a0)} broke B2B x${a0.brokeB2B}; the engine kept it with ${describe(b0)}.`);
    }
    const bestSpinAt = best.steps.slice(0, horizon).findIndex(isSpinClear);
    const actualHasSpin = actual.steps.slice(0, horizon).some(isSpinClear);
    if (bestSpinAt > 0 && !actualHasSpin) {
      categories.push("missed_setup");
      reasons.push(`The engine line sets up a ${describe(best.steps[bestSpinAt]!)} within ${bestSpinAt + 1} pieces; after your move no spin is reachable in that window.`);
    }
    if (input.pending > 0 && a0.lines === 0 && b0.lines > 0) {
      categories.push("garbage");
      reasons.push(`${input.pending} garbage incoming: the engine cleared lines (${describe(b0)}) while your move cleared none.`);
    }
    if (categories.length === 0) {
      categories.push("other");
      reasons.push(`The engine prefers ${describe(b0)} here (score gap ${gap.toFixed(1)}).`);
    }
  } else if (!actual) {
    reasons.push("The search model could not reproduce the actual move.");
  }

  return {
    index: snapshot.index,
    actual,
    best,
    alternatives: free.alternatives,
    gap,
    flagged,
    categories,
    primary: categories[0] ?? null,
    reasons,
    nodes: free.nodes + forced.nodes,
    ms: performance.now() - t0
  };
}

export interface MissSummary {
  index: number;
  gap: number;
  primary: MissCategory;
  reason: string;
}

export interface GameSummary {
  pieces: number;
  flagged: number;
  byCategory: Record<MissCategory, number>;
  actualAttack: number;
  engineAttack: number;
  /** Attack per piece: actual vs the engine's first move at each snapshot. */
  actualApp: number;
  engineApp: number;
  actualSpinClears: number;
  engineSpinClears: number;
  averageGap: number;
  topMisses: MissSummary[];
}

export function summarizeGame(snapshots: readonly Snapshot[], analyses: readonly SnapshotAnalysis[], settings: AnalyzerSettings): GameSummary {
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<MissCategory, number>;
  let engineAttack = 0;
  let engineSpinClears = 0;
  let gapSum = 0;
  for (const a of analyses) {
    if (a.primary) byCategory[a.primary]++;
    const first = a.best?.steps[0];
    engineAttack += first?.attack ?? 0;
    if (isSpinClear(first)) engineSpinClears++;
    gapSum += a.gap;
  }
  const actualAttack = snapshots.reduce((s, x) => s + x.placement.attack, 0);
  const actualSpinClears = snapshots.filter((s) => s.placement.spin !== "none" && s.placement.linesCleared > 0).length;
  const pieces = snapshots.length;
  const topMisses = analyses
    .filter((a) => a.flagged && a.primary)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, settings.insights.topMisses)
    .map((a) => ({ index: a.index, gap: a.gap, primary: a.primary!, reason: a.reasons[0] ?? "" }));

  return {
    pieces,
    flagged: analyses.filter((a) => a.flagged).length,
    byCategory,
    actualAttack,
    engineAttack,
    actualApp: pieces ? actualAttack / pieces : 0,
    engineApp: pieces ? engineAttack / pieces : 0,
    actualSpinClears,
    engineSpinClears,
    averageGap: analyses.length ? gapSum / analyses.length : 0,
    topMisses
  };
}
