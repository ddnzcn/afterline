import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReplayPlayer, type LiveFrame, type PlayerGame } from "@tta/core";

const FPS = 60;

export interface ReplayControls {
  player: ReplayPlayer;
  live: LiveFrame;
  replaying: boolean;
  speed: number;
  pauseAtMisses: boolean;
  setSpeed: (s: number) => void;
  setPauseAtMisses: (on: boolean) => void;
  setReplaying: (on: boolean) => void;
  seekFrame: (frame: number) => void;
  seekPiece: (index: number) => void;
  togglePlay: () => void;
}

/**
 * Frame-by-frame playback of one round with Triangle running in the browser.
 * Playback stops at the spawn of any piece in `stopAt` while "pause at misses" is on.
 */
export function useReplay(game: PlayerGame, ts: string, lastIndex: number, stopAt: ReadonlySet<number>): ReplayControls {
  const player = useMemo(() => new ReplayPlayer(game, ts), [game, ts]);
  const [live, setLive] = useState<LiveFrame>(() => player.live());
  const [replaying, setReplaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtMisses, setPauseAtMisses] = useState(true);

  useEffect(() => {
    setReplaying(false);
    setLive(player.live());
  }, [player]);

  const seekFrame = useCallback(
    (frame: number) => {
      player.seek(frame);
      setLive(player.live());
    },
    [player]
  );
  const seekPiece = useCallback(
    (i: number) => seekFrame(player.spawnFrame(Math.max(0, Math.min(lastIndex, i)))),
    [player, seekFrame, lastIndex]
  );

  const togglePlay = useCallback(() => {
    if (player.live().over) seekFrame(0);
    setReplaying((r) => !r);
  }, [player, seekFrame]);

  const stopRef = useRef({ pauseAtMisses, stopAt });
  stopRef.current = { pauseAtMisses, stopAt };

  useEffect(() => {
    if (!replaying) return;
    let raf = 0;
    let last = performance.now();
    let budget = 0;
    const loop = (now: number): void => {
      budget += ((now - last) / 1000) * FPS * speed;
      last = now;
      let stop = false;
      while (budget >= 1) {
        budget -= 1;
        const before = player.live().pieces;
        if (!player.advance(1)) {
          stop = true;
          break;
        }
        const after = player.live().pieces;
        if (after !== before && stopRef.current.pauseAtMisses && stopRef.current.stopAt.has(after)) {
          stop = true;
          break;
        }
      }
      setLive(player.live());
      if (stop) setReplaying(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [replaying, speed, player]);

  return { player, live, replaying, speed, pauseAtMisses, setSpeed, setPauseAtMisses, setReplaying, seekFrame, seekPiece, togglePlay };
}
