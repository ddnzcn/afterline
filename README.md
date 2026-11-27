# TETR.IO Replay Analyzer

Re-simulates a TETR.IO replay piece by piece and compares each placement to a search engine's best
line, to surface missed attack: spins, B2B breaks, setups within the preview, garbage handling.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Replay → snapshots, CLI, parity tests | done |
| 2 | Move generator | done |
| 3 | Beam search + heuristic eval | done |
| 4 | Diff & insights | done |
| 5 | Web UI | done |

## Usage

```bash
bun install
bun run dev          # API on :3001 + web UI on http://localhost:5173
bun run test         # all workspaces (core parity/movegen tests need fixtures/replays/)
bun run typecheck
bun run analyze <replay.ttrm|.ttr> [--player <name>] [--round <n>]... [--insights] [--weights w.json] [--out f.json]
```

`--player` is required for multi-player (league) replays. `--round` is 1-based and repeatable.
`--insights` runs the search and prints a per-round summary; without it the CLI dumps snapshots.

**Web UI**: drop a replay, pick the player and rounds, wait for the progress bar. The results view
has a replay player that plays the actual game: Triangle runs your recorded inputs in the browser
frame by frame (`ReplayPlayer` in core, with a restore point at every piece spawn so seeking is
instant), so you see pieces fall, move and spin, with a drop shadow. Play at 0.5×–4×, click or drag
anywhere on the track, and your misses sit on it as points (colored by category, sized by how big
the miss was; hover for the reason, click to jump). With "Pause at misses" on, playback stops at the
spawn of each missed piece and shows where you put it (outline) against the engine's choice (ghost);
Space plays on. Click misses in the sidebar, and step through the
engine's line (or your move + the engine's continuation).
Keys: `Space` play/pause replay, `←/→` piece, `Shift+←/→` previous/next miss, `↑/↓` step the line,
`L` play the line, `E` switch engine/your line, `Esc` reset, `Home/End` first/last piece.

## Architecture

```
apps/web (React + Vite, canvas) ──HTTP /api──▶ apps/api (Fastify, in-memory jobs)
                                                  │  chunks of snapshots
                                                  ▼
                                          worker_threads pool (cores - 1)
apps/cli ───────────────────────────────────────┤
                                                  ▼
                              packages/core (pure TS, no I/O)
                                 replay/   parse · config · frames · support
                                 sim/      simulate → Snapshot[]
                                 movegen/  BFS + engine-tagged placements (authoritative, ~11 ms)
                                 fast/     bitboard model: movegen, spins, attack (~0.1 ms)
                                 search/   weights.ts · eval · beam search
                                 insights/ per-move diff, miss categories, game summary
                                          │
                                          ▼
                              @haelp/teto/engine (Triangle.js)
```

Data flow: upload → `parseReplay` → `simulateGame` (Triangle) → one `Snapshot` per piece →
worker pool runs `analyzeSnapshot` on each → `summarizeGame` → JSON to the UI.

- **core is pure and deterministic.** No fs, network, clock or randomness; all I/O lives in the apps.
  Given the same replay it always produces the same snapshots (the game's seed drives every RNG).
- **TETR.IO rules come from Triangle.js.** We never reimplement the rules engine. `replay/config.ts`
  maps replay options to an engine config; `sim/simulate.ts` feeds the recorded key/garbage events into
  `Engine.tick()` frame by frame and records a snapshot at every piece lock.
- **Snapshot** = the decision state when the piece spawned (board, active, hold, next queue, B2B,
  combo, incoming garbage) + what the player did (`placement`: position, cells, spin, hold, lines,
  attack before/after cancel, surge, garbage that entered the board). Boards are bottom-up row
  strings: `.` empty, piece letter, `g` garbage.

## Move generator

`MoveGenerator.generate(engineSnapshot)` returns every reachable final placement for the current
piece and the hold line, each with its shortest input path and Triangle's own lock result.

- **Reachability** (`movegen/reach.ts`): breadth-first search over (x, y, rotation) using Triangle's
  movement rules and `performKick` with the game's kick table (SRS+ including 180 kicks).
  Inputs: left/right, DAS left/right, CW/CCW/180, soft drop to floor, and one-row `down` (gravity
  or a soft-drop tap), which makes mid-height tucks reachable. **Lock-reset limits are ignored.**
- **Spin-aware arrivals**: any successful move or fall clears spin credit, so a resting position is
  recorded once per distinct last action: "moved/fell in", or rotated in with a specific kick
  (TST/fin kicks change the result).
- **Tagging is engine-authoritative** (`movegen/generator.ts`): each arrival's path is replayed
  on a scratch Triangle engine through its public input methods and hard-dropped. Spin, lines,
  attack, B2B and combo come from Triangle's `LockRes`, and the replay asserts the engine accepts every
  input and ends at the expected position.
- **Dedupe** by final cells + spin, keeping the shortest path. Holding into the same piece type is
  skipped (identical placements), and drops right before the hard drop are trimmed from paths.

Verified by fixture boards (TSD, TST via the TST kick, STSD-style double, S/Z/L/J/I all-spin
minis, T-spins-only rules, 180 disabled, empty-board placement counts). The generator also
reproduces every one of the 1,898 placements in the fixture replays with identical spin, lines
and attack. Average cost is ~11 ms per snapshot (~48 placements), too slow for search, hence the fast model.

## Search model and insights

- **Fast model** (`fast/`): bitboard board, BFS on Triangle's kick tables and piece states, spin
  detection mirroring Triangle's private rules (T corners + front corners, TST/fin kick, all-spin
  immobility), and attack via Triangle's own `garbageCalcV2` plus its surge / perfect-clear /
  special-bonus rules. **Parity test**: on every one of the 1,898 replay states, the fast model's
  placements, spins, lines and attack equal the engine-tagged generator's exactly.
- **Beam search** (`search/beam.ts`): over current + hold + preview (default depth 6, width 24).
  Node score = discounted move rewards + evaluation of the resulting board. Returns the best line
  and the top-N alternatives by distinct first move. Approximations: future garbage is a uniform
  stack rise (hole columns are random), and pending garbage is cancelled/tanked by amount.
- **Insights** (`insights/analyze.ts`): each snapshot is searched freely and with the first move
  forced to what you played. Your move's score is the better of that forced search and the free
  search's own branch for the same move (beam search isn't monotonic, so a forced search alone can
  find a worse continuation than the free one; this way an identical move always has gap 0).
  `gap = best − your move`. A move is flagged when the gap exceeds `missThreshold`, **unless your
  plan paid off**: your real next pieces (replayed up to the search depth, stopping where garbage
  entered the board) score at least as well as the engine's line over the same number of pieces.
  Categories (headline = first that applies): **missed spin** (a spin clear was available now and
  you didn't get one in the next `setupHorizon` pieces), **B2B break** (you broke it, the engine
  didn't have to), **missed setup** (the engine line reaches a spin clear within `setupHorizon`
  pieces, you didn't), **garbage handling** (garbage incoming, you cleared nothing, the engine did),
  otherwise **other**. The UI shows both the engine's line and what you actually played next.
- Performance: p50 ~77 ms, p95 ~90 ms per snapshot single-threaded; a 9-round league replay
  (834 pieces) takes ~13 s end-to-end in the UI with 11 workers.

## Replay support and parity

Parity is tested against the end-of-game stats TETR.IO records in the replay
(`packages/core/test/parity.test.ts`). Drop replays into `fixtures/replays/` (git-ignored, since they
contain user ids) and run the tests.

| Replay | Status |
|---|---|
| League `.ttrm` | Exact parity: pieces, lines, holds, top combo/B2B, attack, sent, garbage cleared, every clear type |
| 40L `.ttr` | Exact parity, with a local `no_szo` patch (below) |
| Blitz `.ttr` | **Rejected**: Triangle.js does not model level gravity, so the game drifts |
| Quick Play / Zenith `.ttr` | **Rejected**: Triangle.js has no Zenith bag or floor mechanics |

Conventions found while matching TETR.IO's recorded stats:

- **Top combo / top B2B**: Triangle's counters start at -1, so TETR.IO's value is the max counter + 1.
- **Clear buckets**: every mini spin, of any piece (all-mini+), is counted under `minitspin*`,
  zero-line minis included. Full spins are T-only.
- **Holds** are counted when `hold()` succeeds, which also catches T-for-T swaps and holds on a
  final piece that never locks.
- **`garbage.received` is not asserted.** Triangle counts garbage after passthrough netting; it equals
  TETR.IO's number when only one side attacks, but overcounts by 1–15 lines in counter-attack rounds.
  Simulation is unaffected (boards, lines and attack all match).
- **Solo modes** record 0 attack/sent, so those are compared in versus only.
- **`no_szo`** (set by stride mode) is ignored by Triangle. `replay/support.ts` applies it: leading
  S/Z/O pieces of the first bag rotate to the back of that bag. This was picked empirically as the only
  candidate rule that reproduced both 40L fixtures exactly.

## Tuning the eval weights

Everything lives in **`packages/core/src/search/weights.ts`** (`DEFAULT_SETTINGS`). Units are
"attack-line equivalents": one line of attack = `move.attack` = 1.0, so read every other weight
relative to that. Positive = reward, negative = penalty.

| Group | Weight | What it does |
|---|---|---|
| move | `attack`, `cancel` | per line of attack generated / incoming line cancelled |
| move | `b2bKeep` | flat bonus when a clear keeps or extends B2B |
| move | `b2bBreakFlat`, `b2bBreakPerLevel` | cost of breaking B2B (flat + per level lost) |
| move | `combo`, `wastedClear`, `tanked`, `perfectClear` | combo steps, clears that send nothing, garbage entering, PCs |
| board | `holes`, `coveredHoleDepth` | covered empty cells, and how buried they are (capped at 6) |
| board | `maxHeight`, `danger`, `dangerHeight` | linear height cost, plus a squared cost above `dangerHeight` |
| board | `bumpiness`, `extraWells` | surface roughness (main well excluded), extra deep wells |
| board | `tSlotBase`, `tSlotLine` | TSD-shaped slot present, plus per line it would clear |
| board | `readyLines`, `heldT` | rows one cell from complete with an open gap; a T in hold |
| board | `b2bChain` | latent value per B2B level held. With B2B charging the chain is stored surge; set this to 0 and the engine will cash out surges greedily |
| search | `depth`, `width`, `topN`, `discount` | look-ahead pieces, beam width, alternatives, per-step reward discount |
| insights | `missThreshold`, `setupHorizon`, `topMisses` | flag threshold, setup window, summary list length |

**A/B a change** without editing the file: write overrides as JSON and compare summaries.

```bash
echo '{ "board": { "tSlotLine": 1.4 }, "insights": { "missThreshold": 2 } }' > spin-heavy.json
bun run analyze game.ttrm -p you -r 3 --insights              > /dev/null   # baseline summary on stderr
bun run analyze game.ttrm -p you -r 3 --insights -w spin-heavy.json > /dev/null
```

Raising `depth` or `width` makes the engine stronger but slower (keep an eye on the ~200 ms per
snapshot budget). If the engine flags too many harmless moves, raise `missThreshold`. If it
undervalues building toward spins, raise `tSlotLine` / `tSlotBase`. If it ignores defense, raise
`cancel` or lower `dangerHeight`.
