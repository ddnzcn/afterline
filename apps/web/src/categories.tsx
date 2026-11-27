import type { MissCategory } from "./types";

export const CATEGORIES: MissCategory[] = ["missed_spin", "b2b_break", "missed_setup", "garbage", "taken_late", "other"];

type GlyphShape = "diamond" | "triangle" | "circle" | "square" | "half" | "ring";

interface CategoryMeta {
  label: string;
  /** Plural used in the round headline ("Missed setups cost you the most"). */
  plural: string;
  shape: GlyphShape;
  color: string;
  cls: string;
}

/** Category meaning is always glyph + label + colour, never colour alone. */
export const CATEGORY: Record<MissCategory, CategoryMeta> = {
  missed_spin: { label: "Missed spin", plural: "Missed spins", shape: "diamond", color: "var(--cat-missed-spin)", cls: "al-c-missed-spin" },
  b2b_break: { label: "B2B break", plural: "B2B breaks", shape: "triangle", color: "var(--cat-b2b-break)", cls: "al-c-b2b-break" },
  missed_setup: { label: "Missed setup", plural: "Missed setups", shape: "circle", color: "var(--cat-missed-setup)", cls: "al-c-missed-setup" },
  garbage: { label: "Garbage handling", plural: "Garbage handling misses", shape: "square", color: "var(--cat-garbage)", cls: "al-c-garbage" },
  taken_late: { label: "Taken late", plural: "Moves taken late", shape: "half", color: "var(--cat-taken-late)", cls: "al-c-taken-late" },
  other: { label: "Other", plural: "Other misses", shape: "ring", color: "var(--cat-other)", cls: "al-c-other" }
};

interface GlyphProps {
  category: MissCategory;
  size?: number;
  className?: string;
}

export function Glyph({ category, size = 10, className }: GlyphProps) {
  const { shape, color } = CATEGORY[category];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={className} aria-hidden="true" style={{ flex: "none" }}>
      {shape === "diamond" && <path d="M5 0.5 9.5 5 5 9.5 0.5 5Z" fill={color} />}
      {shape === "triangle" && <path d="M5 0.8 9.6 9.2H0.4Z" fill={color} />}
      {shape === "circle" && <circle cx="5" cy="5" r="4.4" fill={color} />}
      {shape === "square" && <rect x="1" y="1" width="8" height="8" rx="0.8" fill={color} />}
      {shape === "half" && (
        <>
          <circle cx="5" cy="5" r="3.9" fill="none" stroke={color} strokeWidth="1.3" />
          <path d="M5 1.1A3.9 3.9 0 0 1 5 8.9Z" fill={color} />
        </>
      )}
      {shape === "ring" && <circle cx="5" cy="5" r="3.7" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
}

export function CategoryBadge({ category }: { category: MissCategory }) {
  return (
    <span className="al-badge">
      <Glyph category={category} />
      <span className="al-t">{CATEGORY[category].label}</span>
    </span>
  );
}
