import { garbageCalcV2 } from "@haelp/teto/engine";

import type { PieceType, SpinKind } from "../sim/types";

import { lockCells, type FastBoard } from "./board";
import type { FastPlacement } from "./movegen";
import type { FastRules } from "./rules";

/** Game state carried through the search. */
export interface FastState {
  board: FastBoard;
  /** Triangle counters: -1 = none. */
  b2b: number;
  combo: number;
  /** Garbage waiting to enter the board (lines). */
  pending: number;
  /** Garbage lines that entered the board during the search (modelled as stack rise). */
  rise: number;
}

export interface FastOutcome {
  piece: PieceType;
  spin: SpinKind;
  lines: number;
  garbageCleared: number;
  perfectClear: boolean;
  /** Attack before cancelling, rounded down like Triangle's "down" rounding. */
  attack: number;
  /** Attack left after cancelling pending garbage. */
  sent: number;
  surge: number;
  /** B2B level that was lost (>= 0), or -1 if B2B was not broken. */
  brokeB2B: number;
  b2bAfter: number;
  comboAfter: number;
  tanked: number;
}

/**
 * Lock a placement and apply Triangle's B2B/combo/attack rules (mirrors Engine#lock).
 * `multiplier` is the garbage multiplier at the snapshot time; future garbage is a stack-rise penalty.
 */
export function applyPlacement(state: FastState, p: FastPlacement, rules: FastRules, multiplier: number): { state: FastState; outcome: FastOutcome } {
  const cells = rules.pieces[p.piece].rotations[p.rotation]!;
  const lock = lockCells(state.board, cells, p.x, p.y);
  const { lines, garbageCleared, perfectClear } = lock;
  const isSpin = p.spin !== "none";
  const pcB2b = perfectClear && rules.pc ? rules.pc.b2b : 0;

  let b2b = state.b2b;
  let combo = state.combo;
  let broke = -1;
  if (lines > 0) {
    combo++;
    if ((isSpin || lines >= 4) && !(perfectClear && pcB2b)) b2b++;
    else if (perfectClear && pcB2b) b2b += pcB2b;
    else {
      broke = b2b;
      b2b = -1;
    }
  } else {
    combo = -1;
  }

  const base = garbageCalcV2(
    { b2b: Math.max(b2b, 0), combo: Math.max(combo, 0), enemies: 0, lines, piece: p.piece as never, spin: p.spin },
    { spinBonuses: rules.spinMode, comboTable: rules.comboTable, garbageTargetBonus: rules.garbageTargetBonus, b2b: { chaining: rules.b2bChaining, charging: !!rules.b2bCharging } }
  ).garbage;
  const special = rules.specialBonus && garbageCleared > 0 && (isSpin || lines >= 4) ? 1 : 0;

  let attack = base > 0 || special > 0 ? Math.floor(base * multiplier + special) : 0;
  let surge = 0;
  if (broke >= 0 && rules.b2bCharging && broke + 1 > rules.b2bCharging.at) {
    surge = Math.floor((broke - rules.b2bCharging.at + rules.b2bCharging.base + 1) * multiplier);
    attack += surge;
  }
  if (perfectClear && rules.pc) attack += Math.floor(rules.pc.garbage * multiplier);

  let pending = state.pending;
  let sent = attack;
  let tanked = 0;
  if (lines > 0) {
    const cancel = Math.min(pending, sent);
    pending -= cancel;
    sent -= cancel;
  } else if (pending > 0) {
    tanked = Math.min(pending, rules.garbageCap);
    pending -= tanked;
  }

  return {
    state: { board: lock.board, b2b, combo, pending, rise: state.rise + tanked },
    outcome: {
      piece: p.piece,
      spin: p.spin,
      lines,
      garbageCleared,
      perfectClear,
      attack,
      sent,
      surge,
      brokeB2B: broke,
      b2bAfter: b2b,
      comboAfter: combo,
      tanked
    }
  };
}
