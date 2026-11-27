/** Design tokens read once from the CSS custom properties in styles/tokens.css, for canvas drawing. */
export interface Theme {
  piece: Record<string, string>;
  boardBg: string;
  boardGrid: string;
  boardSpawn: string;
  overlayYou: string;
  overlayEngine: string;
  accent: string;
  accentSoft: string;
  ink: string;
  ink2: string;
  ink3: string;
  bad: string;
  bg1: string;
  bg3: string;
}

let cached: Theme | null = null;

export function theme(): Theme {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string): string => css.getPropertyValue(name).trim();
  const garbage = v("--piece-garbage");
  cached = {
    piece: {
      i: v("--piece-i"),
      j: v("--piece-j"),
      l: v("--piece-l"),
      o: v("--piece-o"),
      s: v("--piece-s"),
      t: v("--piece-t"),
      z: v("--piece-z"),
      g: garbage,
      b: garbage,
      x: v("--ink-3")
    },
    boardBg: v("--board-bg"),
    boardGrid: v("--board-grid"),
    boardSpawn: v("--board-spawn"),
    overlayYou: v("--overlay-you"),
    overlayEngine: v("--overlay-engine"),
    accent: v("--accent"),
    accentSoft: v("--accent-soft"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    bad: v("--bad"),
    bg1: v("--bg-1"),
    bg3: v("--bg-3")
  };
  return cached;
}

/** Prefers-reduced-motion, checked at call time. */
export const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
