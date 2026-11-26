/**
 * THE tuning file. Every eval weight, search setting and insight threshold lives here.
 * Positive weights are rewards, negative are penalties. Scores are in "attack-line equivalents":
 * one line of attack sent is worth `attack` (1.0 by default), so the rest reads relative to that.
 * See README "Tuning the eval weights".
 */

export interface MoveWeights {
  /** Per line of attack generated (before cancelling). */
  attack: number;
  /** Per line of incoming garbage cancelled. */
  cancel: number;
  /** Flat reward for a clear that keeps or extends B2B (spins, quads). */
  b2bKeep: number;
  /** Penalty for breaking B2B: flat part... */
  b2bBreakFlat: number;
  /** ...plus this much per B2B level lost. */
  b2bBreakPerLevel: number;
  /** Per combo step on a clearing move. */
  combo: number;
  /** Clearing lines without sending anything (burning rows). */
  wastedClear: number;
  /** Per garbage line that enters the board. */
  tanked: number;
  perfectClear: number;
}

export interface BoardWeights {
  /** Per empty cell with something above it. */
  holes: number;
  /** Per filled cell stacked on top of a hole (capped at 6 per hole). */
  coveredHoleDepth: number;
  /** Per row of the tallest column. */
  maxHeight: number;
  /** Squared penalty per row above `dangerHeight` (incl. garbage that entered during the line). */
  danger: number;
  dangerHeight: number;
  /** Per unit of height difference between neighbouring columns (main well excluded). */
  bumpiness: number;
  /** Per row of depth of every well deeper than 2 other than the main well. */
  extraWells: number;
  /** A TSD-shaped slot: reward per line it would clear (0-2), plus `tSlotBase` for the shape. */
  tSlotLine: number;
  tSlotBase: number;
  /** Rows one cell from complete whose gap is open from above (downstack potential). */
  readyLines: number;
  /** Held piece: T in hold is worth keeping for spins. */
  heldT: number;
  /**
   * Latent value per B2B level held at the end of the line. With B2B charging, a chain is stored
   * attack (it pays out as surge when broken), so breaking only converts it; without this the
   * search greedily cashes out surges because it cannot see the chain growing.
   */
  b2bChain: number;
}

export interface SearchConfig {
  /** Max pieces to look ahead (capped by current + preview). */
  depth: number;
  /** Beam width: nodes kept per depth. */
  width: number;
  /** Alternatives (distinct first moves) to return besides the best. */
  topN: number;
  /** Per-step discount on move rewards; later steps are less certain. */
  discount: number;
}

export interface InsightConfig {
  /** A move is flagged when best - actual exceeds this (attack-line equivalents). */
  missThreshold: number;
  /** "Missed setup": a spin clear within this many pieces of the best line. */
  setupHorizon: number;
  /** How many biggest misses to list in the summary. */
  topMisses: number;
}

export interface AnalyzerSettings {
  move: MoveWeights;
  board: BoardWeights;
  search: SearchConfig;
  insights: InsightConfig;
}

export const DEFAULT_SETTINGS: AnalyzerSettings = {
  move: {
    attack: 1.0,
    cancel: 0.6,
    b2bKeep: 0.6,
    b2bBreakFlat: 1.5,
    b2bBreakPerLevel: 0.15,
    combo: 0.15,
    wastedClear: -0.4,
    tanked: -0.5,
    perfectClear: 4
  },
  board: {
    holes: -1.6,
    coveredHoleDepth: -0.25,
    maxHeight: -0.06,
    danger: -0.08,
    dangerHeight: 12,
    bumpiness: -0.12,
    extraWells: -0.3,
    tSlotLine: 0.9,
    tSlotBase: 0.4,
    readyLines: 0.15,
    heldT: 0.3,
    b2bChain: 0.9
  },
  search: {
    depth: 6,
    width: 24,
    topN: 3,
    discount: 0.92
  },
  insights: {
    missThreshold: 1.5,
    setupHorizon: 3,
    topMisses: 10
  }
};

/** Deep-merge partial overrides (e.g. from a CLI --weights JSON file) onto the defaults. */
export function mergeSettings(overrides: DeepPartial<AnalyzerSettings> = {}): AnalyzerSettings {
  return {
    move: { ...DEFAULT_SETTINGS.move, ...overrides.move },
    board: { ...DEFAULT_SETTINGS.board, ...overrides.board },
    search: { ...DEFAULT_SETTINGS.search, ...overrides.search },
    insights: { ...DEFAULT_SETTINGS.insights, ...overrides.insights }
  };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
