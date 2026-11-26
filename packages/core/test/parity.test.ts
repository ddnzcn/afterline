/**
 * Parity against real replays: drop .ttrm / .ttr files into fixtures/replays/.
 * Re-simulated stats must match the stats TETR.IO recorded at the end of each game.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UnsupportedReplayError, decodeReplay, parseReplay, simulateGame } from "../src";
import { compareStats } from "./helpers/parity";

const dir = join(__dirname, "../../../fixtures/replays");
const files = readdirSync(dir).filter((f) => /\.ttrm?$/.test(f));

describe.skipIf(files.length === 0)("replay parity", () => {
  for (const file of files) {
    const replay = parseReplay(decodeReplay(readFileSync(join(dir, file))));
    for (const game of replay.games) {
      const o = game.options as Record<string, unknown>;
      const unsupported = o.levels === true || o.zenith === true || o.bagtype === "zenith";
      if (unsupported) {
        it(`${file} round ${game.roundIndex + 1}: rejected as unsupported`, () => {
          expect(() => simulateGame(game, replay.ts)).toThrow(UnsupportedReplayError);
        });
        continue;
      }
      it(`${file} round ${game.roundIndex + 1} (${game.username})`, () => {
        const sim = simulateGame(game, replay.ts);
        expect(game.recordedStats, "replay has no recorded stats").not.toBeNull();
        expect(compareStats(sim, game)).toEqual({});
        expect(sim.snapshots).toHaveLength(sim.stats.pieces);
      });
    }
  }
});
