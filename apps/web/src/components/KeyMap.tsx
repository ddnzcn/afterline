import { useEffect, useRef } from "react";

const KEYS: [string[], string][] = [
  [["Space"], "Play / pause"],
  [["←", "→"], "Previous / next piece"],
  [["Shift", "←", "→"], "Previous / next miss"],
  [["↑", "↓"], "Step the line (review)"],
  [["L"], "Play the line (review)"],
  [["E"], "Engine line / What you played"],
  [["Esc"], "Reset the line step"],
  [["Home", "End"], "Start / last piece"],
  [["?"], "This list"]
];

interface KeyMapProps {
  onClose: () => void;
}

/** Keyboard map popover, opened from the "?" button or the ? key. */
export function KeyMap({ onClose }: KeyMapProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div className="keymap" role="dialog" aria-label="Keyboard shortcuts">
      <div className="keymap-head">
        <strong>Keyboard</strong>
        <span className="muted">each key has a button too</span>
        <button ref={closeRef} className="al-btn al-btn-ghost al-btn-icon keymap-close" onClick={onClose} aria-label="Close keyboard shortcuts">
          ✕
        </button>
      </div>
      <div className="al-keys">
        {KEYS.map(([keys, action]) => (
          <div key={action} style={{ display: "contents" }}>
            <div>
              {keys.map((k) => (
                <kbd key={k} className="al-kbd">
                  {k}
                </kbd>
              ))}
            </div>
            <div>{action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
