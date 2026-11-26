import type { MoveOutcome, PiecePosition } from "../sim/types";

/**
 * One input step. `softDrop` drops to the floor (sonic drop); `down` is a single row
 * (gravity or a soft-drop tap) and is what makes mid-height tucks reachable. A hard drop
 * is implied at the end of every path.
 */
export type Input = "hold" | "left" | "right" | "dasLeft" | "dasRight" | "cw" | "ccw" | "180" | "softDrop" | "down";

export interface GeneratedPlacement extends PiecePosition, MoveOutcome {
  usedHold: boolean;
  /** Shortest input path to this placement (excluding the final hard drop). */
  inputs: Input[];
}

export interface MoveGenOptions {
  /** Include placements that use hold (default true; ignored if the game disallows hold). */
  useHold?: boolean;
}
