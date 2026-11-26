import type { ReplayFrame } from "./types";

/**
 * Group a flat event list by frame number. Index i holds the events for engine frame i.
 * Events must be sorted by frame (TETR.IO writes them that way).
 */
export function splitFrames(events: readonly ReplayFrame[]): ReplayFrame[][] {
  const last = events.at(-1);
  if (!last) throw new Error("Replay has no events.");
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.frame < events[i - 1]!.frame) {
      throw new Error(`Replay events out of order at frame ${events[i]!.frame}.`);
    }
  }
  const frames: ReplayFrame[][] = Array.from({ length: last.frame + 2 }, () => []);
  for (const event of events) frames[event.frame]!.push(event);
  return frames;
}
