export type IconName = "play" | "pause" | "restart" | "prev" | "next" | "prev-miss" | "next-miss" | "upload" | "file" | "keyboard" | "copy" | "close" | "info" | "check";

const PATHS: Record<IconName, string> = {
  play: "M5 3.5v9l7-4.5z",
  pause: "M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z",
  restart: "M8 3a5 5 0 1 1-4.6 3M3 2.5v3.6h3.6",
  prev: "M10 3.5 5.5 8l4.5 4.5",
  next: "M6 3.5 10.5 8 6 12.5",
  "prev-miss": "M4 3.5v9M12 3.5 6.5 8l5.5 4.5",
  "next-miss": "M12 3.5v9M4 3.5 9.5 8 4 12.5",
  upload: "M8 10.5V3M5 5.5 8 2.5l3 3M3 10v3h10v-3",
  file: "M4 2h5l3 3v9H4zM9 2v3h3",
  keyboard: "M2 4.5h12v7H2zM4.5 7h1M7.5 7h1M10.5 7h1M5 9.5h6",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  close: "M4 4l8 8M12 4l-8 8",
  info: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.5v3.5M8 5v.5",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5"
};

const FILLED = new Set<IconName>(["play", "pause"]);

/** 16px line icons drawn in currentColor. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill={FILLED.has(name) ? "currentColor" : "none"} stroke={FILLED.has(name) ? "none" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
