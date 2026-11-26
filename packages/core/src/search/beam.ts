import type { PieceType } from "../sim/types";

import { applyPlacement, type FastOutcome, type FastState } from "../fast/apply";
import { fastBoardToRows, type FastBoard } from "../fast/board";
import { fastPlacements, placementCells, type FastPlacement } from "../fast/movegen";
import type { FastRules } from "../fast/rules";

import { boardScore, moveReward } from "./eval";
import type { AnalyzerSettings } from "./weights";

export interface SearchInput {
  board: FastBoard;
  active: PieceType;
  hold: PieceType | null;
  queue: readonly PieceType[];
  b2b: number;
  combo: number;
  pending: number;
  multiplier: number;
}

export interface FirstMove {
  placement: FastPlacement;
  usedHold: boolean;
}

export interface LineStep {
  piece: PieceType;
  x: number;
  y: number;
  rotation: number;
  cells: [number, number][];
  usedHold: boolean;
  spin: FastOutcome["spin"];
  lines: number;
  attack: number;
  sent: number;
  b2bAfter: number;
  comboAfter: number;
  brokeB2B: number;
  /** Board after this step, bottom-up rows ("x" filled, "g" garbage). */
  boardAfter: string[];
}

export interface Line {
  score: number;
  steps: LineStep[];
}

export interface SearchResult {
  best: Line | null;
  alternatives: Line[];
  nodes: number;
}

interface Node {
  state: FastState;
  current: PieceType | undefined;
  hold: PieceType | null;
  qi: number;
  reward: number;
  score: number;
  depth: number;
  parent: Node | null;
  placement: FastPlacement | null;
  usedHold: boolean;
  outcome: FastOutcome | null;
  root: number;
}

const DEAD = -1e6;

/**
 * Beam search over current piece + hold + preview queue on the fast model.
 * Node score = discounted move rewards so far + board evaluation of the resulting position.
 * `forced` restricts the first step (used to score the player's actual move over the same horizon).
 */
export function beamSearch(input: SearchInput, rules: FastRules, settings: AnalyzerSettings, forced?: FirstMove): SearchResult {
  const { search, move, board: boardW } = settings;
  // Each step consumes one known piece (active, hold or queue); nodes stop when they run out.
  const depth = Math.max(1, Math.min(search.depth, 1 + input.queue.length));

  const rootState: FastState = { board: input.board, b2b: input.b2b, combo: input.combo, pending: input.pending, rise: 0 };
  const root: Node = {
    state: rootState,
    current: input.active,
    hold: input.hold,
    qi: 0,
    reward: 0,
    score: 0,
    depth: 0,
    parent: null,
    placement: null,
    usedHold: false,
    outcome: null,
    root: -1
  };

  let beam: Node[] = [root];
  let nodes = 0;
  let rootCounter = 0;

  for (let d = 0; d < depth; d++) {
    const children: Node[] = [];
    const seen = new Map<string, Node>();
    for (const node of beam) {
      for (const child of expand(node, input.queue, rules, input.multiplier, d === 0 ? forced : undefined)) {
        nodes++;
        if (d === 0) child.root = rootCounter++;
        const discount = search.discount ** d;
        child.reward = node.reward + discount * moveReward(child.outcome!, node.state.b2b, move);
        child.score = child.reward + boardScore(child.state.board, child.state.rise, child.hold, child.state.b2b, boardW);
        const key = `${child.state.board.rows.join(",")}|${child.hold}|${child.current}|${child.state.b2b}|${child.state.combo}`;
        const prev = seen.get(key);
        if (prev && prev.score >= child.score) continue;
        seen.set(key, child);
        children.push(child);
      }
    }
    if (children.length === 0) break;
    const unique = [...seen.values()];
    unique.sort((a, b) => b.score - a.score);
    beam = unique.slice(0, search.width);
  }

  if (beam[0] === root) return { best: null, alternatives: [], nodes };

  const bestPerRoot = new Map<number, Node>();
  for (const n of beam) {
    const prev = bestPerRoot.get(n.root);
    if (!prev || n.score > prev.score) bestPerRoot.set(n.root, n);
  }
  const ranked = [...bestPerRoot.values()].sort((a, b) => b.score - a.score);
  const lines = ranked.slice(0, search.topN + 1).map((n) => toLine(n, rules));
  return { best: lines[0] ?? null, alternatives: lines.slice(1), nodes };
}

function expand(node: Node, queue: readonly PieceType[], rules: FastRules, multiplier: number, forced?: FirstMove): Node[] {
  if (!node.current) return [];
  const options: { piece: PieceType; hold: PieceType | null; next: PieceType | undefined; qi: number; usedHold: boolean }[] = [
    { piece: node.current, hold: node.hold, next: queue[node.qi], qi: node.qi + 1, usedHold: false }
  ];
  if (rules.allowHold) {
    if (node.hold === null) {
      const piece = queue[node.qi];
      if (piece) options.push({ piece, hold: node.current, next: queue[node.qi + 1], qi: node.qi + 2, usedHold: true });
    } else if (node.hold !== node.current) {
      options.push({ piece: node.hold, hold: node.current, next: queue[node.qi], qi: node.qi + 1, usedHold: true });
    }
  }

  const out: Node[] = [];
  for (const opt of options) {
    if (forced && forced.usedHold !== opt.usedHold) continue;
    let placements = fastPlacements(node.state.board, rules, opt.piece);
    if (forced) placements = placements.filter((p) => samePlacement(p, forced.placement, rules));
    for (const p of placements) {
      const { state, outcome } = applyPlacement(node.state, p, rules, multiplier);
      out.push({
        state,
        current: opt.next,
        hold: opt.hold,
        qi: opt.qi,
        reward: 0,
        score: DEAD,
        depth: node.depth + 1,
        parent: node,
        placement: p,
        usedHold: opt.usedHold,
        outcome,
        root: node.root
      });
    }
  }
  return out;
}

export function samePlacement(a: FastPlacement, b: FastPlacement, rules: FastRules): boolean {
  if (a.piece !== b.piece || a.spin !== b.spin) return false;
  const ka = placementCells(rules, a).map(([x, y]) => y * 32 + x).sort((m, n) => m - n).join();
  const kb = placementCells(rules, b).map(([x, y]) => y * 32 + x).sort((m, n) => m - n).join();
  return ka === kb;
}

function toLine(leaf: Node, rules: FastRules): Line {
  const steps: LineStep[] = [];
  for (let n: Node | null = leaf; n && n.parent; n = n.parent) {
    const p = n.placement!;
    const o = n.outcome!;
    steps.push({
      piece: p.piece,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      cells: placementCells(rules, p),
      usedHold: n.usedHold,
      spin: o.spin,
      lines: o.lines,
      attack: o.attack,
      sent: o.sent,
      b2bAfter: o.b2bAfter,
      comboAfter: o.comboAfter,
      brokeB2B: o.brokeB2B,
      boardAfter: fastBoardToRows(n.state.board)
    });
  }
  return { score: leaf.score, steps: steps.reverse() };
}
