/**
 * Coverage against real replays: every placement the player actually made must be among the
 * generated placements, with identical spin, lines and attack. This checks reachability,
 * kick handling and engine-authoritative tagging together.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MoveGenerator, assertSupported, decodeReplay, parseReplay, simulateGame, toEngineConfig } from "../src";
import { cellsOf } from "./helpers/board";

const dir = join(__dirname, "../../../fixtures/replays");
const files = readdirSync(dir).filter((f) => /\.ttrm?$/.test(f));

const supported = (game: Parameters<typeof assertSupported>[0]): boolean => {
  try {
    assertSupported(game);
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(files.length === 0)("move generator covers every actual placement", () => {
  for (const file of files) {
    const replay = parseReplay(decodeReplay(readFileSync(join(dir, file))));
    for (const game of replay.games.filter(supported)) {
      it(`${file} round ${game.roundIndex + 1} (${game.username})`, () => {
        const sim = simulateGame(game, replay.ts, { captureStates: true });
        const generator = new MoveGenerator(toEngineConfig(game, replay.ts));
        const missing: string[] = [];
        sim.snapshots.forEach((snap, i) => {
          const p = snap.placement;
          const hit = generator
            .generate(sim.states![i]!)
            .find((g) => cellsOf(g.cells) === cellsOf(p.cells) && g.spin === p.spin);
          // A same-piece hold swap (e.g. I for I) is the same placement as not holding.
          const holdMatches = hit?.usedHold === p.usedHold || snap.hold === snap.active;
          if (!hit || hit.linesCleared !== p.linesCleared || hit.attack !== p.attack || !holdMatches) {
            missing.push(`#${i} ${p.piece} spin=${p.spin} lines=${p.linesCleared}`);
          }
        });
        expect(missing).toEqual([]);
      });
    }
  }
});
