import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { formatTime } from "../board";
import { CATEGORY, CategoryBadge, Glyph } from "../categories";
import type { MissCategory, Snapshot, SnapshotAnalysis } from "../types";

import { Icon } from "./Icon";
import { buildMarkers, type Marker, type Stack } from "./markers";

export const SPEEDS = [0.5, 1, 2, 4] as const;

interface ReplayBarProps {
  snapshots: Snapshot[];
  analyses: SnapshotAnalysis[];
  visible: Set<MissCategory>;
  index: number;
  frame: number;
  totalFrames: number;
  spawnFrame: (index: number) => number;
  replaying: boolean;
  over: boolean;
  speed: number;
  pauseAtMisses: boolean;
  onSeekFrame: (frame: number) => void;
  onSeekPiece: (index: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: number) => void;
  onPauseAtMisses: (on: boolean) => void;
  onPrevMiss: () => void;
  onNextMiss: () => void;
  onShowAll: () => void;
}

type Hover = { kind: "track"; x: number } | { kind: "miss"; marker: Marker } | { kind: "stack"; stack: Stack } | null;

/** Video-player style scrubber over game time: attack lane, miss markers (with stacks), controls. */
export function ReplayBar(props: ReplayBarProps) {
  const { snapshots, analyses, visible, index, frame, totalFrames, replaying, over, speed, pauseAtMisses } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(600);
  const [barWidth, setBarWidth] = useState(800);
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setWidth(trackRef.current?.clientWidth ?? 600);
      setBarWidth(barRef.current?.clientWidth ?? 800);
    });
    if (trackRef.current) ro.observe(trackRef.current);
    if (barRef.current) ro.observe(barRef.current);
    return () => ro.disconnect();
  }, []);

  const total = Math.max(1, totalFrames);
  const xOf = (f: number): number => (Math.min(total, Math.max(0, f)) / total) * width;
  const misses = useMemo(() => analyses.filter((a) => a.flagged && a.primary && visible.has(a.primary)), [analyses, visible]);
  const allMisses = analyses.filter((a) => a.flagged).length;
  const { singles, stacks } = useMemo(
    () => buildMarkers(misses, (i) => (props.spawnFrame(i) / total) * width, index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [misses, width, total, index]
  );

  const lane = useMemo(() => {
    const maxSent = Math.max(1, ...snapshots.map((s) => s.placement.sent));
    const maxRecv = Math.max(1, ...snapshots.map((s) => s.placement.garbageReceived));
    return snapshots.map((s) => ({ x: xOf(props.spawnFrame(s.index)), up: s.placement.sent / maxSent, down: s.placement.garbageReceived / maxRecv }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots, width, total]);

  const frameFromEvent = (e: PointerEvent): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.round((Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))) * total);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    props.onSeekFrame(frameFromEvent(e));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) props.onSeekFrame(frameFromEvent(e));
    if (!(e.target as HTMLElement).closest("[data-marker], .al-tip")) setHover({ kind: "track", x: e.clientX - trackRef.current!.getBoundingClientRect().left });
  };

  const nextMiss = misses.find((m) => m.index > index);
  const compact = barWidth < 600;
  const filtered = visible.size < 5 && allMisses > 0;
  const status = over
    ? null
    : replaying && pauseAtMisses && nextMiss
      ? `Playing · stops at the next miss (piece ${nextMiss.index + 1})`
      : null;

  return (
    <div className="al-replay replay" ref={barRef}>
      <div
        className="al-track"
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      >
        <svg className="al-lane" width={width} height={16} aria-hidden="true">
          {lane.map((b, i) => (
            <g key={i}>
              {b.up > 0 && <rect x={b.x - 0.75} y={8 - b.up * 7} width={1.5} height={b.up * 7} className="lane-up" />}
              {b.down > 0 && <rect x={b.x - 0.75} y={9} width={1.5} height={b.down * 7} className="lane-down" />}
            </g>
          ))}
        </svg>
        <div className="al-rail" />
        <div className="al-fill" style={{ width: xOf(frame) }} />
        {singles.map((m) => (
          <button
            key={m.a.index}
            data-marker
            className={`marker${m.a.index === index ? " current" : ""}`}
            style={{ left: m.x, width: m.size, height: m.size, marginLeft: -m.size / 2, marginTop: -m.size / 2 }}
            onClick={() => props.onSeekPiece(m.a.index)}
            onPointerEnter={() => setHover({ kind: "miss", marker: m })}
            aria-label={`Piece ${m.a.index + 1}: ${CATEGORY[m.a.primary!].label}, gap ${m.a.gap.toFixed(1)}`}
          >
            <Glyph category={m.a.primary!} size={m.size} />
          </button>
        ))}
        {stacks.map((s) => (
          <button
            key={s.key}
            data-marker
            className="al-stack"
            style={{ left: s.x }}
            onClick={() => setHover({ kind: "stack", stack: s })}
            onPointerEnter={() => setHover({ kind: "stack", stack: s })}
            aria-label={`${s.items.length} misses, pieces ${s.items[0]!.a.index + 1} to ${s.items.at(-1)!.a.index + 1}`}
          >
            {s.top.map((m) => (
              <Glyph key={m.a.index} category={m.a.primary!} size={8} />
            ))}
            {s.items.length > 3 && <span>+{s.items.length - 3}</span>}
          </button>
        ))}
        <div className="al-head" style={{ left: xOf(frame) }} />
        {hover?.kind === "track" && (
          <div className="al-tip tip-time" style={{ left: hover.x }}>
            <span className="num">{formatTime((hover.x / width) * total)}</span>
          </div>
        )}
        {hover?.kind === "miss" && <MissTip marker={hover.marker} frame={props.spawnFrame(hover.marker.a.index)} />}
        {hover?.kind === "stack" && (
          <div className="al-tip stack-pop" style={{ left: Math.min(Math.max(hover.stack.x, 130), width - 130) }} role="dialog" aria-label="Misses in this stretch">
            <div className="stack-pop-head">
              <strong>{hover.stack.items.length} misses</strong>
              <span className="faint">
                pieces {hover.stack.items[0]!.a.index + 1}–{hover.stack.items.at(-1)!.a.index + 1}
              </span>
              <span className="faint stack-gap">Gap</span>
            </div>
            {hover.stack.items.slice(0, 5).map((m) => (
              <button key={m.a.index} className="stack-row" onClick={() => props.onSeekPiece(m.a.index)}>
                <Glyph category={m.a.primary!} />
                <span className="num faint">#{m.a.index + 1}</span>
                <span>{CATEGORY[m.a.primary!].label}</span>
                <span className="num bad">{m.a.gap.toFixed(1)}</span>
              </button>
            ))}
            <div className="stack-pop-foot faint">
              <span>{hover.stack.items.length > 5 ? `and ${hover.stack.items.length - 5} more` : ""}</span>
              <span>Click a row to jump</span>
            </div>
          </div>
        )}
      </div>

      <div className={`al-controls${compact ? " compact" : ""}`}>
        <button className="al-btn al-btn-icon" onClick={props.onPrevMiss} aria-label="Previous miss (Shift+←)">
          <Icon name="prev-miss" />
        </button>
        <button className="al-btn al-btn-icon" onClick={() => props.onSeekPiece(index - 1)} disabled={index === 0 && frame === 0} aria-label="Previous piece (←)">
          <Icon name="prev" />
        </button>
        <button className="al-btn al-btn-primary al-btn-icon" onClick={props.onTogglePlay} aria-label={over ? "Play from the start" : replaying ? "Pause" : "Play"}>
          <Icon name={over ? "restart" : replaying ? "pause" : "play"} />
        </button>
        <button className="al-btn al-btn-icon" onClick={() => props.onSeekPiece(index + 1)} disabled={index >= snapshots.length - 1} aria-label="Next piece (→)">
          <Icon name="next" />
        </button>
        <button className="al-btn al-btn-icon" onClick={props.onNextMiss} aria-label="Next miss (Shift+→)">
          <Icon name="next-miss" />
        </button>
        <span className={`al-time${compact ? " stacked" : ""}`}>
          {formatTime(frame)} <span>/ {formatTime(total)}</span>
          {compact ? <br /> : " "}
          <span className="piece-of">
            Piece <b>{Math.min(index + 1, snapshots.length)}</b> / {snapshots.length}
          </span>
        </span>
        {!compact && over && (
          <span className="bar-note">
            <strong>End of game</strong> · play starts again from piece 1
          </span>
        )}
        {!compact && !over && status && <span className="bar-note">{status}</span>}
        {!compact && !over && !status && filtered && (
          <span className="bar-note">
            {[...visible].slice(0, 1).map((c) => (
              <Glyph key={c} category={c} />
            ))}{" "}
            Showing {visible.size === 1 ? CATEGORY[[...visible][0]!].label.toLowerCase() : `${visible.size} categories`} ·{" "}
            <span className="num">
              {misses.length} of {allMisses}
            </span>{" "}
            <button className="link-btn" onClick={props.onShowAll}>
              Show all
            </button>
          </span>
        )}
        <span className="al-spacer" />
        <label className="al-toggle">
          <input type="checkbox" className="switch" checked={pauseAtMisses} onChange={(e) => props.onPauseAtMisses(e.target.checked)} />
          Pause at misses
        </label>
        {compact ? (
          <button className="al-btn speed-cycle num" onClick={() => props.onSpeed(SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!)} aria-label={`Speed ${speed}×, click to change`}>
            {speed}×
          </button>
        ) : (
          <div className="al-seg" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} aria-pressed={speed === s} onClick={() => props.onSpeed(s)} className="num">
                {s}×
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissTip({ marker, frame }: { marker: Marker; frame: number }) {
  const a = marker.a;
  return (
    <div className="al-tip" style={{ left: Math.max(marker.x, 120) }}>
      <div className="tip-head">
        <CategoryBadge category={a.primary!} />
        <span className="faint">
          Piece <b className="num">{a.index + 1}</b>
        </span>
      </div>
      <div>
        Gap <b className="num bad">{a.gap.toFixed(1)}</b> <span className="num faint">{formatTime(frame)}</span>
      </div>
      <div className="al-r">{a.reasons[0]}</div>
      <div className="tip-hint faint">
        Click to jump · <kbd className="al-kbd">Shift</kbd> <kbd className="al-kbd">→</kbd> next miss
      </div>
    </div>
  );
}
