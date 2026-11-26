import { Engine, type EngineInitializeParams, type Tile } from "@haelp/teto/engine";

import { toEngineConfig, type PieceType } from "../../src";
import { TS, soloGame } from "./synthetic";

/** Solo 10x20 SRS+ all-mini+ config with zero gravity, for fixture boards. */
export function fixtureConfig(extra: Record<string, unknown> = {}): EngineInitializeParams {
  const g = soloGame([["hardDrop"]]);
  return toEngineConfig({ ...g, options: { ...g.options, ...extra } }, TS);
}

/**
 * Build an engine with a board drawn top-down in ASCII ("X" filled, "." empty; rows are the
 * bottom of the board) and `piece` freshly spawned.
 */
export function engineFromBoard(ascii: string, piece: PieceType, opts: { hold?: PieceType | null; config?: EngineInitializeParams } = {}): Engine {
  const engine = new Engine(opts.config ?? fixtureConfig());
  const rows = ascii
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .reverse();
  for (let y = 0; y < engine.board.state.length; y++) {
    const row = rows[y];
    engine.board.state[y] = Array.from({ length: engine.board.width }, (_, x): Tile =>
      row && row[x] === "X" ? { mino: "gb" as Tile extends infer T ? (T extends { mino: infer M } ? M : never) : never, connections: 0 } : null
    );
  }
  engine.held = (opts.hold ?? null) as Engine["held"];
  engine.initiatePiece(piece as Engine["falling"]["symbol"], true);
  return engine;
}

export const cellsOf = (cells: [number, number][]): string =>
  cells
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join(" ");
