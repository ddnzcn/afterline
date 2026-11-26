# TETR.IO Replay Analyzer

Re-simulates a TETR.IO replay piece by piece and (in later phases) compares each placement to a
search engine's best line, to surface missed attack: spins, B2B breaks, setups, garbage handling.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Replay → snapshots, CLI, parity tests | done |
| 2 | Move generator | done |
| 3 | Beam search + heuristic eval | — |
| 4 | Diff & insights | — |
| 5 | Web UI | — |

## Usage

```bash
bun install
bun run analyze <replay.ttrm|.ttr> [--player <name>] [--round <n>]... [--out file.json] [--pretty]
bun run --filter @tta/core test
```

`--player` is required for multi-player (league) replays. `--round` is 1-based and repeatable.

## Architecture

```
apps/web (React, Phase 5) ──HTTP──▶ apps/api (Fastify + worker pool, Phase 3+)
                                          │
apps/cli ─────────────────────────────────┤
                                          ▼
                              packages/core (pure TS, no I/O)
                                 replay/  parse · config · frames · support
                                 sim/     simulate → Snapshot[]
                                 movegen/ reach (BFS) · generator (engine-tagged placements)
                                          │
                                          ▼
                              @haelp/teto/engine (Triangle.js)
```

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
and attack. Average cost is ~11 ms per snapshot (~48 placements). That's fine for tagging, but Phase 3 search
will need a faster board model.

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

All weights will live in one file, `packages/core/src/search/weights.ts` (Phase 3). This section will
explain each weight and how to A/B them from the CLI once it exists.
