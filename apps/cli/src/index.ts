import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { decodeReplay, parseReplay, selectGames, simulateGame } from "@tta/core";

const USAGE = `Usage: bun run analyze <replay.ttrm|.ttr> [--player <name>] [--round <n>]... [--out <file.json>] [--pretty]`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      player: { type: "string", short: "p" },
      round: { type: "string", short: "r", multiple: true },
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

  const output = {
    meta: {
      file: basename(file),
      kind: replay.kind,
      id: replay.id,
      gamemode: replay.gamemode,
      ts: replay.ts,
      player: games[0]?.username
    },
    rounds: games.map((g) => {
      const sim = simulateGame(g, replay.ts);
      return { ...sim, recordedStats: g.recordedStats };
    })
  };

  const json = JSON.stringify(output, null, values.pretty ? 2 : undefined);
  if (values.out) await writeFile(values.out, json);
  else process.stdout.write(`${json}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
