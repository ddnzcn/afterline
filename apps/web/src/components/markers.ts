import type { SnapshotAnalysis } from "../types";

export interface Marker {
  a: SnapshotAnalysis;
  /** Centre on the track, px. */
  x: number;
  /** Glyph size, px: linear 8-14 over the round's gap range. */
  size: number;
}

export interface Stack {
  key: string;
  x: number;
  items: Marker[];
  /** The three largest-gap misses, shown as glyphs on the chip. */
  top: Marker[];
}

const MERGE_PX = 6;
const stackWidth = (n: number): number => 8 + Math.min(3, n) * 10 + (n > 3 ? 18 : 0);

interface Group {
  items: Marker[];
  x: number;
}

const half = (g: Group): number => (g.items.length === 1 ? g.items[0]!.size / 2 : stackWidth(g.items.length) / 2);

/**
 * Place miss markers and merge crowded ones (handoff §11):
 * 1. neighbours whose centres are < 6px apart merge into a stack;
 * 2. any marker whose shape would overlap a stack joins it; repeat until stable;
 * a stack containing the current miss splits back into single markers.
 */
export function buildMarkers(misses: readonly SnapshotAnalysis[], xOf: (index: number) => number, currentIndex: number): { singles: Marker[]; stacks: Stack[] } {
  if (misses.length === 0) return { singles: [], stacks: [] };
  const gaps = misses.map((m) => m.gap);
  const lo = Math.min(...gaps);
  const hi = Math.max(...gaps);
  const markers: Marker[] = misses
    .map((a) => ({ a, x: xOf(a.index), size: hi > lo ? 8 + ((a.gap - lo) / (hi - lo)) * 6 : 11 }))
    .sort((p, q) => p.x - q.x);

  let groups: Group[] = markers.map((m) => ({ items: [m], x: m.x }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i + 1 < groups.length; i++) {
      const a = groups[i]!;
      const b = groups[i + 1]!;
      const both1 = a.items.length === 1 && b.items.length === 1;
      const threshold = both1 ? MERGE_PX : half(a) + half(b);
      if (b.x - a.x < threshold) {
        const items = [...a.items, ...b.items];
        groups = [...groups.slice(0, i), { items, x: items.reduce((s, m) => s + m.x, 0) / items.length }, ...groups.slice(i + 2)];
        changed = true;
        break;
      }
    }
  }

  const singles: Marker[] = [];
  const stacks: Stack[] = [];
  for (const g of groups) {
    if (g.items.length === 1 || g.items.some((m) => m.a.index === currentIndex)) {
      singles.push(...g.items);
      continue;
    }
    const top = [...g.items].sort((p, q) => q.a.gap - p.a.gap).slice(0, 3);
    stacks.push({ key: `s${g.items[0]!.a.index}`, x: g.x, items: g.items, top });
  }
  return { singles, stacks };
}
