import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import {
  analyzeSnapshot,
  decodeReplay,
  mergeSettings,
  parseReplay,
  rulesFromConfig,
  selectGames,
  simulateGame,
  summarizeGame,
  toEngineConfig,
  type AnalyzerSettings,
  type DeepPartial,
  type GameSummary
} from "@tta/core";

const USAGE = `Usage: bun run analyze <replay.ttrm|.ttr> [options]

  -p, --player <name>    player to analyze (required for multi-player replays)
  -r, --round <n>        1-based round, repeatable (default: all)
  -i, --insights         run the search engine and report missed opportunities
  -w, --weights <file>   JSON overrides for search/weights.ts settings
  -o, --out <file>       write JSON here instead of stdout
      --pretty           pretty-print JSON`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      player: { type: "string", short: "p" },
      round: { type: "string", short: "r", multiple: true },
      insights: { type: "boolean", short: "i", default: false },
      weights: { type: "string", short: "w" },
      out: { type: "string", short: "o" },
      pretty: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });

  const file = positionals[0];
  if (values.help || !file) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(values.help ? 0 : 1);
  }

  const replay = parseReplay(decodeReplay(await readFile(file)));
  const rounds = values.round?.map((r) => {
    const n = Number.parseInt(r, 10);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--round must be a positive integer, got "${r}"`);
    return n - 1;
  });
  const games = selectGames(replay, { player: values.player, rounds });
  const settings = values.weights ? mergeSettings(JSON.parse(await readFile(values.weights, "utf8")) as DeepPartial<AnalyzerSettings>) : mergeSettings();

  const output = {
    meta: { file: basename(file), kind: replay.kind, id: replay.id, gamemode: replay.gamemode, ts: replay.ts, player: games[0]?.username },
    rounds: games.map((g) => {
      const sim = simulateGame(g, replay.ts);
      if (!values.insights) return { ...sim, recordedStats: g.recordedStats };
      const rules = rulesFromConfig(toEngineConfig(g, replay.ts));
      const analyses = sim.snapshots.map((s, i) => {
        process.stderr.write(`\rround ${g.roundIndex + 1}: ${i + 1}/${sim.snapshots.length}`);
        return analyzeSnapshot(s, rules, settings);
      });
      process.stderr.write("\n");
      const summary = summarizeGame(sim.snapshots, analyses, settings);
      printSummary(g.roundIndex, summary);
      return { ...sim, recordedStats: g.recordedStats, analyses, summary };
    })
  };

  const json = JSON.stringify(output, null, values.pretty ? 2 : undefined);
  if (values.out) await writeFile(values.out, json);
  else process.stdout.write(`${json}\n`);
}

function printSummary(roundIndex: number, s: GameSummary): void {
  const lines = [
    `Round ${roundIndex + 1}: ${s.pieces} pieces, ${s.flagged} flagged`,
    `  APP actual ${s.actualApp.toFixed(2)} vs engine ${s.engineApp.toFixed(2)} | spin clears ${s.actualSpinClears} vs ${s.engineSpinClears}`,
    `  ${Object.entries(s.byCategory)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  ")}`,
    ...s.topMisses.slice(0, 5).map((m) => `  #${m.index + 1} gap ${m.gap.toFixed(1)} [${m.primary}] ${m.reason}`)
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
