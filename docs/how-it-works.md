# How Afterline works

The engine notes behind the [README](../README.md): how a replay is re-simulated, how moves are
generated and searched, how a miss is decided, and how the results were checked against TETR.IO.

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
                                 sim/      simulate → Snapshot[] · ReplayPlayer (frame-by-frame)
                                 movegen/  BFS + engine-tagged placements (authoritative, ~11 ms)
                                 fast/     bitboard model: movegen, spins, attack (~0.1 ms)
                                 search/   weights.ts · eval · beam search
                                 insights/ per-move diff, miss categories, game summary
                                          │
                                          ▼
                              @haelp/teto/engine (Triangle.js)
```

Data flow: upload → `parseReplay` → `simulateGame` (Triangle) → one `Snapshot` per piece → the worker
pool runs `analyzeSnapshot` on each → `summarizeGame` → JSON to the UI. The browser replays the same
recorded inputs with `ReplayPlayer` for live playback.

- **core is pure and deterministic.** No fs, network, clock or randomness; all I/O lives in the apps.
  The same replay always produces the same snapshots (the game's seed drives every RNG).
- **TETR.IO rules come from Triangle.js.** The rules engine is never reimplemented: `replay/config.ts`
  maps replay options to an engine config, and `sim/simulate.ts` feeds the recorded key and garbage
  events into `Engine.tick()` frame by frame, recording a snapshot at every piece lock.
- **Snapshot** = the decision state when the piece spawned (board, active, hold, next queue, B2B, combo,
  incoming garbage) plus what the player did (position, cells, spin, hold, lines, attack before and
  after cancelling, surge, garbage that entered the board).

## Move generator

`MoveGenerator.generate(engineSnapshot)` returns every reachable final placement for the current piece
and the hold line, each with its shortest input path and Triangle's own lock result.

- **Reachability**: breadth-first search over (x, y, rotation) using Triangle's movement rules and
  `performKick` with the game's kick table (SRS+ including 180 kicks). Inputs: left/right, DAS, CW/CCW/180,
  soft drop, and one-row drops, which make mid-height tucks reachable. Lock-reset limits are ignored.
- **Spin-aware arrivals**: any move or fall clears spin credit, so a resting position is recorded once per
  distinct last action (moved in, or rotated in with a specific kick; TST/fin kicks change the result).
- **Engine-authoritative tagging**: each path is replayed on a scratch Triangle engine and hard-dropped,
  so spin, lines, attack, B2B and combo come straight from Triangle.
- **Dedupe** by final cells + spin, keeping the shortest path.

It reproduces every one of the 1,898 placements in the test replays with identical spin, lines and attack.

## Search and insights

- **Fast model** (`fast/`): a bitboard with spin detection mirroring Triangle's rules and attack from
  Triangle's own `garbageCalcV2`. On all 1,898 replay states its placements, spins, lines and attack equal
  the engine-tagged generator's exactly, at about 100x the speed.
- **Beam search** over current + hold + preview (default depth 6, width 24). Node score = discounted move
  rewards + evaluation of the resulting board. Future garbage is modelled as a uniform stack rise.
- **Deciding a miss** (`insights/analyze.ts`): each piece is searched freely and with the first move forced
  to what you played. `gap = best − your move`. A move is flagged when the gap exceeds `missThreshold`,
  unless **your plan paid off** (your real next pieces scored as well as the engine's line over the same
  number of pieces). If you made the engine's move yourself a few pieces later, it is labelled
  **Taken late** instead of a missed spin or garbage miss.
- **Performance**: about 77 ms per piece single-threaded; a 9-round league match (834 pieces) takes about
  13 s with the worker pool.

## Replay support and accuracy

Re-simulated games are checked against the end-of-game stats TETR.IO stores in the replay
(`packages/core/test/parity.test.ts`; put replays in `fixtures/replays/`, which is git-ignored).

| Replay | Status |
| --- | --- |
| League `.ttrm` | Exact match: pieces, lines, holds, top combo/B2B, attack, sent, garbage cleared, every clear type |
| 40L `.ttr` | Exact match, with a local `no_szo` patch (below) |
| Blitz `.ttr` | Not supported: Triangle.js doesn't model level gravity |
| Quick Play `.ttr` | Not supported: Triangle.js has no Zenith bag or floor mechanics |

Conventions found while matching TETR.IO's recorded stats:

- Top combo / top B2B are Triangle's counters + 1 (Triangle starts at -1).
- Every mini spin of any piece counts under TETR.IO's `minitspin*` buckets; full spins are T-only.
- Holds are counted when a hold happens, which catches T-for-T swaps and holds on a final piece.
- `garbage.received` isn't asserted: Triangle counts after passthrough netting and overcounts in
  counter-attack rounds. Boards, lines and attack are unaffected.
- `no_szo` (stride mode) is ignored by Triangle; Afterline rotates leading S/Z/O pieces of the first bag to
  its back, the only rule that reproduced both 40L test games exactly.
