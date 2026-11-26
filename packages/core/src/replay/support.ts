import type { Engine } from "@haelp/teto/engine";

import type { PlayerGame } from "./types";

export class UnsupportedReplayError extends Error {
  override name = "UnsupportedReplayError";
}

const SUPPORTED_BAGS = new Set(["7-bag", "14-bag", "classic", "pairs", "total mayhem", "7+1-bag", "7+2-bag", "7+x-bag"]);

/**
 * Reject games that use mechanics Triangle.js does not implement, instead of silently mis-simulating them.
 * Verified against fixtures: Blitz (level gravity) drifts, Zenith (QP) has no bag implementation.
 */
export function assertSupported(game: PlayerGame): void {
  const o = game.options as Record<string, unknown>;
  const bag = typeof o.bagtype === "string" ? o.bagtype : "7-bag";

  if (o.zenith === true || bag === "zenith") {
    throw new UnsupportedReplayError("Quick Play (Zenith) replays are not supported: Triangle.js has no Zenith bag or floor mechanics.");
  }
  if (!SUPPORTED_BAGS.has(bag)) {
    throw new UnsupportedReplayError(`Bag type "${bag}" is not supported by Triangle.js.`);
  }
  if (o.levels === true || o.masterlevels === true) {
    throw new UnsupportedReplayError("Replays with level gravity (e.g. Blitz) are not supported: Triangle.js does not model level-based gravity.");
  }
  if (o.no_szo === true && bag !== "7-bag") {
    throw new UnsupportedReplayError(`no_szo is only supported with 7-bag (got "${bag}").`);
  }
}

const SZO = new Set(["s", "z", "o"]);

/**
 * TETR.IO's no_szo option (set by stride mode, e.g. in 40L): the first piece is never S, Z or O.
 * Triangle.js ignores it. Rule determined empirically: leading S/Z/O pieces of the first bag
 * rotate to the back of that bag. This was the only candidate rule that reproduced both 40L
 * fixtures exactly (reshuffle-until-valid, swap-with-first-valid and partitioning all diverged).
 *
 * Must run on a freshly constructed engine, before any frame is ticked.
 */
export function applyNoSzo(engine: Engine): void {
  if (engine.frame !== 0 || engine.stats.pieces !== 0) {
    throw new Error("applyNoSzo must run before the first tick.");
  }
  const firstBag = [engine.falling.symbol, ...engine.queue.slice(0, 6)];
  if (!SZO.has(firstBag[0]!)) return;

  const rotated = [...firstBag];
  while (SZO.has(rotated[0]!)) rotated.push(rotated.shift()!);

  engine.queue.splice(0, 6, ...rotated.slice(1));
  engine.initiatePiece(rotated[0]!);
}
