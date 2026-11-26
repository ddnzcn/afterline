import { Engine, type EngineInitializeParams, type EngineSnapshot } from "@haelp/teto/engine";

import { outcomeFromLock } from "../sim/simulate";
import type { PieceType } from "../sim/types";

import { findArrivals, type Arrival } from "./reach";
import type { GeneratedPlacement, Input, MoveGenOptions } from "./types";

export class MoveReplayError extends Error {
  override name = "MoveReplayError";
}

interface Start {
  state: EngineSnapshot;
  usedHold: boolean;
}

const cellsKey = (cells: readonly [number, number][]): string =>
  cells
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join(";");

/**
 * Enumerates every reachable final placement for the current piece (and the hold line),
 * tagged with Triangle's own spin/attack result.
 *
 * Reachability is a BFS over Triangle's movement + kick rules; tagging replays each input path
 * on a scratch Triangle engine and hard-drops it, so spin detection and attack match the game.
 */
export class MoveGenerator {
  readonly #engine: Engine;

  constructor(config: EngineInitializeParams) {
    this.#engine = new Engine(config);
  }

  generate(state: EngineSnapshot, opts: MoveGenOptions = {}): GeneratedPlacement[] {
    const starts = this.#starts(state, opts.useHold ?? true);
    const best = new Map<string, GeneratedPlacement>();

    for (const start of starts) {
      this.#engine.fromSnapshot(start.state);
      const f = this.#engine.falling;
      const arrivals = findArrivals(
        this.#engine.board.state,
        {
          symbol: f.symbol,
          states: f.states,
          x: f.location[0],
          y: f.y,
          rotation: f.rotation,
          ao: [f.aox, f.aoy]
        },
        { kickTable: this.#engine.kickTableName, allow180: this.#engine.misc.allowed.spin180 }
      );

      for (const arrival of arrivals) {
        const placement = this.#tag(start, arrival);
        const key = `${cellsKey(placement.cells)}|${placement.spin}`;
        const existing = best.get(key);
        if (!existing || placement.inputs.length < existing.inputs.length) best.set(key, placement);
      }
    }

    return [...best.values()];
  }

  /** Canonical spawn states: the active piece freshly spawned (no IRS/IHS), and the hold line. */
  #starts(state: EngineSnapshot, useHold: boolean): Start[] {
    const e = this.#engine;
    e.fromSnapshot(state);
    const active = e.falling.symbol;
    e.state = 0;
    e.falling.irs = 0;
    e.falling.ihs = false;
    for (const k of Object.keys(e.input.keys) as (keyof typeof e.input.keys)[]) e.input.keys[k] = false;
    e.holdLocked = false;
    e.initiatePiece(active, true);

    const starts: Start[] = [{ state: e.snapshot(), usedHold: false }];
    // Holding into the same piece type yields exactly the same placements, so skip that line.
    if (useHold && e.misc.allowed.hold && e.held !== active && e.hold(false, true)) {
      starts.push({ state: e.snapshot(), usedHold: true });
    }
    return starts;
  }

  #tag(start: Start, arrival: Arrival): GeneratedPlacement {
    const e = this.#engine;
    e.fromSnapshot(start.state);
    for (const input of arrival.inputs) {
      if (!this.#apply(input)) {
        throw new MoveReplayError(`Engine rejected "${input}" while replaying ${arrival.inputs.join(",")}`);
      }
    }
    const f = e.falling;
    if (f.location[0] !== arrival.x || f.y !== arrival.y || f.rotation !== arrival.rotation) {
      throw new MoveReplayError(
        `Replay ended at (${f.location[0]},${f.y},r${f.rotation}), expected (${arrival.x},${arrival.y},r${arrival.rotation})`
      );
    }
    const piece = f.symbol as PieceType;
    const position = {
      piece,
      x: f.location[0],
      y: f.y,
      rotation: f.rotation,
      cells: f.absoluteBlocks.map(([x, y]) => [x, Math.floor(y)] as [number, number])
    };
    const res = e.hardDrop();
    // Drops right before the hard drop are redundant: hard dropping falls anyway and clears spin the same way.
    const inputs = [...arrival.inputs];
    while (inputs.length > 0 && (inputs.at(-1) === "softDrop" || inputs.at(-1) === "down")) inputs.pop();
    return {
      ...position,
      ...outcomeFromLock(res, e),
      usedHold: start.usedHold,
      inputs: start.usedHold ? ["hold", ...inputs] : inputs
    };
  }

  #apply(input: Input): boolean {
    const e = this.#engine;
    switch (input) {
      case "left":
        return e.moveLeft();
      case "right":
        return e.moveRight();
      case "dasLeft":
        return e.dasLeft();
      case "dasRight":
        return e.dasRight();
      case "cw":
        return e.rotateCW() !== false;
      case "ccw":
        return e.rotateCCW() !== false;
      case "180":
        return e.rotate180() !== false;
      case "softDrop":
        return e.softDrop();
      case "down": {
        // One row of gravity / a soft-drop tap. Falling clears spin credit, exactly like the engine's fall.
        const f = e.falling;
        const below = f.absoluteBlocks.map(([x, y]) => [x, Math.floor(y) - 1] as const);
        const free = below.every(([x, y]) => y >= 0 && x >= 0 && x < e.board.width && !e.board.state[y]?.[x]);
        if (!free) return false;
        f.location[1] -= 1;
        if (e.gameOptions.spinBonuses !== "stupid") e.lastSpin = null;
        return true;
      }
      case "hold":
        throw new MoveReplayError("hold is applied via the start state, not replayed");
    }
  }
}
