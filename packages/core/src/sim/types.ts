import type { EngineSnapshot } from "@haelp/teto/engine";

export type PieceType = "i" | "j" | "l" | "o" | "s" | "t" | "z";
export type SpinKind = "none" | "mini" | "normal";

/** Board rows bottom-up (row 0 = floor). Each row is `width` chars: "." empty, piece letter, "g" garbage. Trailing empty rows are trimmed. */
export type BoardRows = string[];

export interface IncomingGarbageInfo {
  amount: number;
  size: number;
  confirmed: boolean;
  /** Engine frame the garbage was received on (Number.MAX_SAFE_INTEGER-ish until confirmed). */
  frame: number;
}

/** What a placement produced when it locked, read from Triangle's LockRes. */
export interface MoveOutcome {
  spin: SpinKind;
  /** True when a non-T piece got spin credit (all-spin). */
  allSpin: boolean;
  linesCleared: number;
  garbageCleared: number;
  perfectClear: boolean;
  /** Attack generated before cancelling incoming garbage. */
  attack: number;
  /** Attack actually sent after cancelling. */
  sent: number;
  /** Garbage released by a B2B surge, already included in `attack`. */
  surge: number;
  /** Lines of garbage that entered the board after this placement. */
  garbageReceived: number;
  b2bAfter: number;
  comboAfter: number;
  topout: boolean;
}

export interface PiecePosition {
  piece: PieceType;
  /** Piece origin x/y in Triangle coordinates (y up), and rotation 0-3. */
  x: number;
  y: number;
  rotation: number;
  /** Absolute occupied cells [x, y], y up from the floor. */
  cells: [number, number][];
}

export interface Placement extends PiecePosition, MoveOutcome {
  usedHold: boolean;
}

/** The decision state when a piece spawned, plus what the player did with it. */
export interface Snapshot {
  index: number;
  frame: number;
  board: BoardRows;
  active: PieceType;
  hold: PieceType | null;
  next: PieceType[];
  /** Triangle counters: -1 = no B2B / no combo yet. */
  b2b: number;
  combo: number;
  incomingGarbage: IncomingGarbageInfo[];
  placement: Placement;
}

export interface SimStats {
  pieces: number;
  lines: number;
  holds: number;
  attack: number;
  sent: number;
  /** Garbage received after passthrough netting (Triangle's count; see README on parity). */
  received: number;
  /** Garbage lines that actually entered the board. */
  tanked: number;
  garbageCleared: number;
  topB2B: number;
  topCombo: number;
  clears: Record<string, number>;
}

export interface SimulatedGame {
  roundIndex: number;
  username: string;
  snapshots: Snapshot[];
  stats: SimStats;
  finalBoard: BoardRows;
  toppedOut: boolean;
  frames: number;
  /** Engine state at each spawn, only when requested via captureStates. Not JSON-friendly. */
  states?: EngineSnapshot[];
}
