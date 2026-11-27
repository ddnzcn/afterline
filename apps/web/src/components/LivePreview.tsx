import { useEffect, useMemo, useState } from "react";

import { ReplayPlayer, type LiveFrame, type PlayerGame } from "@tta/core";

import { reducedMotion } from "../theme";

import { BoardCanvas } from "./BoardCanvas";

const FPS = 60;
const CELL = 16;

/**
 * A small board replaying one round in real time while the analysis runs, looping at the end.
 * Under reduced motion it shows a still frame from mid-round instead.
 */
export function LivePreview({ game, ts }: { game: PlayerGame; ts: string }) {
  const player = useMemo(() => {
    try {
      return new ReplayPlayer(game, ts);
    } catch {
      return null; // an unplayable round just means no preview
    }
  }, [game, ts]);
  const [frame, setFrame] = useState<LiveFrame | null>(() => player?.live() ?? null);

  useEffect(() => {
    if (!player) return;
    if (reducedMotion()) {
      player.seek(Math.floor(player.totalFrames / 2));
      setFrame(player.live());
      return;
    }
    let raf = 0;
    let last = performance.now();
    let budget = 0;
    const loop = (now: number): void => {
      budget += ((now - last) / 1000) * FPS;
      last = now;
      const steps = Math.floor(budget);
      budget -= steps;
      if (steps > 0 && !player.advance(steps)) player.seek(0);
      setFrame(player.live());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [player]);

  if (!frame) return null;
  return (
    <BoardCanvas
      grid={frame.board}
      cell={CELL}
      label="Replay of the round while the analysis runs"
      overlays={frame.falling ? { live: { cells: frame.falling.cells, piece: frame.falling.piece } } : {}}
    />
  );
}
