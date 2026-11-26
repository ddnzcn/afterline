/**
 * Coverage against real replays: every placement the player actually made must be among the
 * generated placements, with identical spin, lines and attack. This checks reachability,
 * kick handling and engine-authoritative tagging together.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Engine } from "@haelp/teto/engine";

import {
  MoveGenerator,
  applyPlacement,
  assertSupported,
  boardFromTiles,
  decodeReplay,
  fastPlacements,
  parseReplay,
  placementCells,
  rulesFromConfig,
  simulateGame,
  toEngineConfig,
  type PieceType
} from "../src";
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

describe.skipIf(files.length === 0)("move generators vs real replays (coverage + fast-model parity)", () => {
  for (const file of files) {
    const replay = parseReplay(decodeReplay(readFileSync(join(dir, file))));
    for (const game of replay.games.filter(supported)) {
      it(`${file} round ${game.roundIndex + 1} (${game.username})`, () => {
        const sim = simulateGame(game, replay.ts, { captureStates: true });
        const config = toEngineConfig(game, replay.ts);
        const generator = new MoveGenerator(config);
        const rules = rulesFromConfig(config);
        const scratch = new Engine(config);
        const missing: string[] = [];
        const fastMismatch: string[] = [];
        sim.snapshots.forEach((snap, i) => {
          const p = snap.placement;
          const generated = generator.generate(sim.states![i]!);

          // The fast search model must produce exactly the same placements, spins, lines and attack.
          scratch.fromSnapshot(sim.states![i]!);
          const board = boardFromTiles(scratch.board.state);
          const state = { board, b2b: scratch.stats.b2b, combo: scratch.stats.combo, pending: 0, rise: 0 };
          const mult = scratch.dynamic.garbageMultiplier.get();
          for (const usedHold of [false, true]) {
            const engineSet = generated.filter((g) => g.usedHold === usedHold);
            const piece = engineSet[0]?.piece as PieceType | undefined;
            if (!piece) continue;
            const keyOf = (cells: [number, number][], spin: string, lines: number, attack: number) => `${cellsOf(cells)}|${spin}|${lines}|${attack}`;
            const e = new Set(engineSet.map((g) => keyOf(g.cells, g.spin, g.linesCleared, g.attack)));
            const f = new Set(
              fastPlacements(board, rules, piece).map((fp) => {
                const o = applyPlacement(state, fp, rules, mult).outcome;
                return keyOf(placementCells(rules, fp), fp.spin, o.lines, o.attack);
              })
            );
            if (e.size !== f.size || [...e].some((k) => !f.has(k))) fastMismatch.push(`#${i} ${piece} hold=${usedHold}`);
          }

          const hit = generated.find((g) => cellsOf(g.cells) === cellsOf(p.cells) && g.spin === p.spin);
          // A same-piece hold swap (e.g. I for I) is the same placement as not holding.
          const holdMatches = hit?.usedHold === p.usedHold || snap.hold === snap.active;
          if (!hit || hit.linesCleared !== p.linesCleared || hit.attack !== p.attack || !holdMatches) {
            missing.push(`#${i} ${p.piece} spin=${p.spin} lines=${p.linesCleared}`);
          }
        });
        expect(missing).toEqual([]);
        expect(fastMismatch).toEqual([]);
      });
    }
  }
});
