import { Tetromino, kickData, type EngineInitializeParams } from "@haelp/teto/engine";
// Triangle does not re-export these from its public entry; they are plain game data.
import { cornerTable, spinbonusRules } from "@haelp/teto/src/engine/utils/kicks/data.ts";

import type { PieceType } from "../sim/types";

export const PIECES: readonly PieceType[] = ["i", "j", "l", "o", "s", "t", "z"];

/** Cell offsets per rotation, Triangle convention: cell = (x + dx, y - dy). */
export type Offsets = readonly (readonly [number, number])[];

export interface PieceData {
  rotations: readonly Offsets[];
  spawnX: number;
  spawnY: number;
  spawnRotation: number;
  /** Kick lists keyed by `${from}${to}`; [dx, dy] with dy positive = down. */
  kicks: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /** Largest dy across rotations (how far cells reach below the origin). */
  maxDy: number;
}

export type SpinMode = "none" | "T-spins" | "T-spins+" | "all" | "all-mini" | "all+" | "all-mini+" | "mini-only";

/** Everything the fast model needs, derived once from a Triangle engine config. */
export interface FastRules {
  width: number;
  /** Visible height + buffer, matching Triangle's board array. */
  fullHeight: number;
  visibleHeight: number;
  allow180: boolean;
  allowHold: boolean;
  spinMode: SpinMode;
  /** Whether a T-spin can be downgraded to mini (Triangle's types_mini). */
  tMiniEligible: boolean;
  /** T corner table: [dx, dy, frontRotA, frontRotB] per corner, per rotation. */
  tCorners: readonly (readonly (readonly [number, number, number, number])[])[];
  pieces: Readonly<Record<PieceType, PieceData>>;
  comboTable: EngineInitializeParams["options"]["comboTable"];
  garbageTargetBonus: string;
  b2bChaining: boolean;
  b2bCharging: false | { at: number; base: number };
  pc: false | { garbage: number; b2b: number };
  specialBonus: boolean;
  garbageCap: number;
}

const SUPPORTED_SPIN_MODES = new Set<string>(["none", "T-spins", "T-spins+", "all", "all-mini", "all+", "all-mini+", "mini-only"]);

export class UnsupportedRulesError extends Error {
  override name = "UnsupportedRulesError";
}

export function rulesFromConfig(config: EngineInitializeParams): FastRules {
  const spinMode = config.options.spinBonuses as string;
  if (!SUPPORTED_SPIN_MODES.has(spinMode)) {
    throw new UnsupportedRulesError(`Spin bonus mode "${spinMode}" is not supported by the search model.`);
  }
  const table = kickData[config.kickTable] as unknown as Record<string, unknown> & {
    kicks: Record<string, [number, number][]>;
    spawn_rotation: Record<string, number>;
  };
  const width = config.board.width;
  const height = config.board.height;

  const pieces = {} as Record<PieceType, PieceData>;
  for (const p of PIECES) {
    const spawnRotation = table.spawn_rotation[p] ?? 0;
    const t = new Tetromino({ symbol: p as Tetromino["symbol"], initialRotation: spawnRotation as 0, boardHeight: height, boardWidth: width });
    const rotations = t.states.map((s) => s.map(([dx, dy]) => [dx, dy] as const));
    const custom = table[`${p}_kicks`] as Record<string, [number, number][]> | undefined;
    pieces[p] = {
      rotations,
      spawnX: t.location[0],
      spawnY: Math.floor(t.location[1]),
      spawnRotation,
      kicks: custom ?? table.kicks,
      maxDy: Math.max(...rotations.flat().map(([, dy]) => dy))
    };
  }

  const rules = (spinbonusRules as Record<string, { types_mini?: string[] }>)[spinMode];
  return {
    width,
    fullHeight: height + config.board.buffer,
    visibleHeight: height,
    allow180: config.misc.allowed.spin180,
    allowHold: config.misc.allowed.hold,
    spinMode: spinMode as SpinMode,
    tMiniEligible: !!rules?.types_mini?.includes("t"),
    tCorners: cornerTable.t as unknown as FastRules["tCorners"],
    pieces,
    comboTable: config.options.comboTable,
    garbageTargetBonus: config.options.garbageTargetBonus,
    b2bChaining: config.b2b.chaining,
    b2bCharging: config.b2b.charging,
    pc: config.pc,
    specialBonus: config.garbage.specialBonus,
    garbageCap: config.garbage.cap.value
  };
}
