import type { PieceType, Snapshot } from "../sim/types";

import { applyPlacement, type FastState } from "../fast/apply";
import { boardFromRows, fastBoardToRows } from "../fast/board";
import { fastPlacements, placementCells, type FastPlacement } from "../fast/movegen";
import type { FastRules } from "../fast/rules";
import { beamSearch, type FirstMove, type Line, type LineStep, type SearchInput } from "../search/beam";
import { boardScore, moveReward } from "../search/eval";
import type { AnalyzerSettings } from "../search/weights";

export type MissCategory = "missed_spin" | "b2b_break" | "missed_setup" | "garbage" | "taken_late" | "other";

/** Priority when several categories apply: the first one is the headline. */
export const CATEGORY_ORDER: readonly MissCategory[] = ["missed_spin", "b2b_break", "missed_setup", "garbage", "taken_late", "other"];

export interface SnapshotAnalysis {
  index: number;
  /** Best line starting with the player's actual move (engine continuation). */
  actual: Line | null;
  /** What the player actually played next, scored the same way (up to the search depth). */
  played: Line | null;
  best: Line | null;
  alternatives: Line[];
  /** best.score - actual.score (>= 0), in attack-line equivalents. */
  gap: number;
  /** True when the player's own next moves scored as well as the engine's line over the same pieces. */
  planPaidOff: boolean;
  /** How many pieces later the player made the engine's preferred move (same clear, or same cells), or null. */
  takenLater: number | null;
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

interface StepInput {
  piece: PieceType;
  cells: [number, number][];
  spin: LineStep["spin"];
  usedHold: boolean;
}

const cellKey = (cells: readonly [number, number][]): string =>
  cells
    .map(([x, y]) => y * 32 + x)
    .sort((a, b) => a - b)
    .join(",");

const sameMove = (a: StepInput, b: StepInput): boolean =>
  a.piece === b.piece && a.spin === b.spin && a.usedHold === b.usedHold && cellKey(a.cells) === cellKey(b.cells);

/**
 * Replay a sequence of placements on the fast model and score it like the beam search does.
 * Stops early at the first placement that is not reachable. `cumulative[k]` is the score after k+1 steps.
 */
export function replayLine(input: SearchInput, steps: readonly StepInput[], rules: FastRules, settings: AnalyzerSettings): { line: Line; cumulative: number[] } {
  let state: FastState = { board: input.board, b2b: input.b2b, combo: input.combo, pending: input.pending, rise: 0 };
  let hold = input.hold;
  let reward = 0;
  const out: LineStep[] = [];
  const cumulative: number[] = [];
  for (const [d, step] of steps.entries()) {
    const target = cellKey(step.cells);
    const placement = fastPlacements(state.board, rules, step.piece).find((p) => p.spin === step.spin && cellKey(placementCells(rules, p)) === target);
    if (!placement) break;
    const before = state.b2b;
    const res = applyPlacement(state, placement, rules, input.multiplier);
    reward += settings.search.discount ** d * moveReward(res.outcome, before, settings.move);
    state = res.state;
    if (step.usedHold) hold = holdAfter(input, out, step);
    out.push({
      piece: step.piece,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      cells: placementCells(rules, placement),
      usedHold: step.usedHold,
      spin: res.outcome.spin,
      lines: res.outcome.lines,
      attack: res.outcome.attack,
      sent: res.outcome.sent,
      b2bAfter: res.outcome.b2bAfter,
      comboAfter: res.outcome.comboAfter,
      brokeB2B: res.outcome.brokeB2B,
      boardAfter: fastBoardToRows(state.board)
    });
    cumulative.push(reward + boardScore(state.board, state.rise, hold, state.b2b, settings.board));
  }
  return { line: { score: cumulative.at(-1) ?? 0, steps: out }, cumulative };
}

/** Piece left in hold after a holding step (hold swaps with the piece that was current). */
function holdAfter(input: SearchInput, done: readonly LineStep[], step: StepInput): PieceType | null {
  // Walk the known pieces to find what was current when this step was played.
  let current: PieceType | undefined = input.active;
  let hold = input.hold;
  let qi = 0;
  for (const s of [...done, step]) {
    if (!s.usedHold) {
      current = input.queue[qi++];
      continue;
    }
    if (hold === null) {
      hold = current ?? null;
      qi++; // the placed piece came from the queue
      current = input.queue[qi++];
    } else {
      hold = current ?? null;
      current = input.queue[qi++];
    }
  }
  return hold;
}

/** The player's real next placements, stopping where garbage entered the board (positions shift). */
function playedSteps(snapshot: Snapshot, future: readonly Snapshot[], depth: number): StepInput[] {
  const steps: StepInput[] = [];
  for (const s of [snapshot, ...future].slice(0, depth)) {
    const p = s.placement;
    steps.push({ piece: p.piece, cells: p.cells, spin: p.spin, usedHold: p.usedHold && s.hold !== s.active });
    if (p.garbageReceived > 0 || p.topout) break;
  }
  return steps;
}

/**
 * Did the player make the engine's preferred first move a few pieces later? A clearing move matches
 * when the player cleared at least as many lines with the same piece and spin (the board may have
 * changed, so cells are not compared); a non-clearing move matches the same piece in the same cells,
 * as long as nothing cleared in between (cleared rows would shift the board).
 * Returns how many pieces later, or null.
 */
export function takenLater(best: LineStep, played: readonly LineStep[]): number | null {
  const clearing = best.lines > 0 || best.spin !== "none";
  const key = cellKey(best.cells);
  let clearedSince = false;
  for (let k = 1; k < played.length; k++) {
    const p = played[k]!;
    clearedSince ||= played[k - 1]!.lines > 0;
    if (p.piece !== best.piece) continue;
    if (clearing ? p.spin === best.spin && p.lines >= best.lines : !clearedSince && cellKey(p.cells) === key) return k;
  }
  return null;
}

const better = (a: Line | null, b: Line | null): Line | null => (!a ? b : !b ? a : b.score > a.score ? b : a);

/**
 * Compare the player's move with the engine.
 * - gap: best line vs the best line starting with the player's move (taking the better of the free
 *   search's branch for that move and a search forced to it, so identical moves always score 0).
 * - Not flagged when the player's own next moves scored as well as the engine's line over the same
 *   number of pieces (they had a plan, e.g. took the spin a couple of pieces later).
 * `future` = the snapshots after this one (only the first `search.depth - 1` are used).
 */
export function analyzeSnapshot(snapshot: Snapshot, rules: FastRules, settings: AnalyzerSettings, future: readonly Snapshot[] = []): SnapshotAnalysis {
  const t0 = performance.now();
  const input = searchInputFor(snapshot, rules);
  const first = actualFirstMove(snapshot);
  const firstStep: StepInput = { piece: first.placement.piece, cells: snapshot.placement.cells, spin: first.placement.spin, usedHold: first.usedHold };

  const free = beamSearch(input, rules, settings);
  const forced = beamSearch(input, rules, settings, first);
  const freeBranch = free.byFirstMove.find((l) => l.steps[0] && sameMove(l.steps[0], firstStep)) ?? null;
  const actual = better(forced.best, freeBranch);
  const best = better(free.best, forced.best);
  const sameAsEngine = !!best?.steps[0] && sameMove(best.steps[0], firstStep);
  const gap = best && actual && !sameAsEngine ? Math.max(0, best.score - actual.score) : 0;

  const played = replayLine(input, playedSteps(snapshot, future, settings.search.depth), rules, settings);
  const k = played.line.steps.length;
  const engineAtK = best ? replayLine(input, best.steps.slice(0, k), rules, settings).cumulative[k - 1] : undefined;
  const planPaidOff = k >= 2 && engineAtK !== undefined && played.line.score >= engineAtK - settings.insights.missThreshold;

  const later = best?.steps[0] && !sameAsEngine ? takenLater(best.steps[0], played.line.steps) : null;
  const flagged = !!best && !!actual && gap > settings.insights.missThreshold && !planPaidOff;
  const categories: MissCategory[] = [];
  const reasons: string[] = [];

  if (best && actual && flagged && later !== null) {
    // the player made the engine's move, just later: label it as such, not as a missed spin / garbage miss
    categories.push("taken_late");
    reasons.push(`The engine's ${describe(best.steps[0]!)} was available now; you made it ${later} ${later === 1 ? "piece" : "pieces"} later.`);
  } else if (best && actual && flagged) {
    const b0 = best.steps[0]!;
    const a0 = played.line.steps[0] ?? actual.steps[0]!;
    const horizon = settings.insights.setupHorizon;
    // any spin clear in what the player actually went on to play counts, not only the first few pieces
    const playedSpin = played.line.steps.some(isSpinClear);

    if (isSpinClear(b0) && !playedSpin) {
      categories.push("missed_spin");
      reasons.push(`A ${describe(b0)} was available; you played ${describe(a0)} and didn't get a spin clear in the next ${played.line.steps.length} pieces.`);
    }
    if (a0.brokeB2B >= 0 && b0.brokeB2B < 0) {
      categories.push("b2b_break");
      reasons.push(`Your ${describe(a0)} broke B2B x${a0.brokeB2B}; the engine kept it with ${describe(b0)}.`);
    }
    const bestSpinAt = best.steps.slice(0, horizon).findIndex(isSpinClear);
    if (bestSpinAt > 0 && !playedSpin) {
      categories.push("missed_setup");
      reasons.push(`The engine line sets up a ${describe(best.steps[bestSpinAt]!)} within ${bestSpinAt + 1} pieces; you didn't get a spin clear in the next ${played.line.steps.length} pieces.`);
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
    played: k > 0 ? played.line : null,
    best,
    alternatives: free.alternatives,
    gap,
    planPaidOff,
    takenLater: later,
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
