import type { PlayerGame, SimulatedGame } from "../../src";

const CLEAR_KEYS = [
  "singles", "doubles", "triples", "quads", "pentas",
  "realtspins", "minitspins", "minitspinsingles", "minitspindoubles",
  "tspinsingles", "tspindoubles", "tspintriples", "tspinquads", "allclear"
];

export function compareStats(sim: SimulatedGame, game: PlayerGame): Record<string, { sim: number; recorded: number }> {
  const r = game.recordedStats ?? {};
  const pairs: Record<string, [number, number | undefined]> = {
    piecesplaced: [sim.stats.pieces, r.piecesplaced],
    lines: [sim.stats.lines, r.lines],
    holds: [sim.stats.holds, r.holds],
    topcombo: [sim.stats.topCombo, r.topcombo],
    topbtb: [sim.stats.topB2B, r.topbtb],
    // TETR.IO records 0 attack/sent in solo modes (no opponent), so only compare them in versus.
    ...(game.kind === "versus"
      ? {
          "garbage.attack": [sim.stats.attack, r.garbage?.attack] as [number, number | undefined],
          "garbage.sent": [sim.stats.sent, r.garbage?.sent] as [number, number | undefined]
        }
      : {}),
    "garbage.cleared": [sim.stats.garbageCleared, r.garbage?.cleared]
  };
  for (const k of CLEAR_KEYS) pairs[`clears.${k}`] = [sim.stats.clears[k] ?? 0, r.clears?.[k]];
  const diffs: Record<string, { sim: number; recorded: number }> = {};
  for (const [k, [s, rec]] of Object.entries(pairs)) {
    if (rec !== undefined && rec !== s) diffs[k] = { sim: s, recorded: rec };
  }
  return diffs;
}
