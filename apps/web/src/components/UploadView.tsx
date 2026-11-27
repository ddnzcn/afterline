import { useEffect, useRef, useState } from "react";

import { FlowHeader } from "./FlowHeader";
import { Icon } from "./Icon";
import { PreviewCards } from "./PreviewCards";

export type UploadError = { kind: "server" } | { kind: "not-replay" } | { kind: "legacy" } | { kind: "other"; message: string };

const START_COMMAND = "bun run dev";

interface UploadViewProps {
  reading: boolean;
  fileName: string;
  error: UploadError | null;
  onFile: (file: File) => void;
}

/** Drop zone + preview of what the results show. Errors sit under the zone, which stays ready. */
export function UploadView({ reading, fileName, error, onFile }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // a file dragged anywhere over the window lights the zone
  useEffect(() => {
    const enter = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes("Files")) setOver(true);
    };
    const leave = (e: DragEvent): void => {
      if (!e.relatedTarget) setOver(false);
    };
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (file && !reading) onFile(file);
    };
    const prevent = (e: DragEvent): void => e.preventDefault();
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", drop);
    };
  }, [onFile, reading]);

  return (
    <div className="flow">
      <FlowHeader />
      <main className="flow-main">
        <button
          className={`al-drop dropzone${over ? " is-over" : ""}`}
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          aria-describedby="drop-help"
          aria-busy={reading}
        >
          <input ref={inputRef} type="file" accept=".ttrm,.ttr" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} tabIndex={-1} />
          {reading ? (
            <>
              <span className="al-h">Reading {fileName}</span>
              <span className="al-progress indeterminate" role="progressbar" aria-label={`Reading ${fileName}`}>
                <i />
              </span>
            </>
          ) : over ? (
            <>
              <span className="al-h">Release to analyze</span>
              <span className="al-s">League or 40L replay</span>
            </>
          ) : (
            <>
              <span className="drop-icon" aria-hidden="true">
                <Icon name="upload" size={18} />
              </span>
              <span className="al-h">Drop a replay to see the moves you missed</span>
              <span className="al-s" id="drop-help">
                League and 40L replays (.ttrm, .ttr). Blitz and Quick Play aren't supported yet.
              </span>
              <span className="al-btn drop-choose" aria-hidden="true">
                <Icon name="file" /> Choose a file
              </span>
            </>
          )}
        </button>
        <div role="alert" className="alert-slot">
          {error && <UploadErrorBox error={error} />}
        </div>
        <section className="preview" aria-label="What you'll get">
          <h2 className="al-label">What you'll get</h2>
          <PreviewCards />
        </section>
      </main>
    </div>
  );
}

function UploadErrorBox({ error }: { error: UploadError }) {
  const [copied, setCopied] = useState(false);
  if (error.kind === "server") {
    return (
      <div className="al-error">
        <span>
          Can't reach the analysis server. Start it with <code>{START_COMMAND}</code>, then drop the file again.
        </span>
        <button
          className="al-btn copy-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(START_COMMAND).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    );
  }
  const text =
    error.kind === "not-replay"
      ? "That file isn't a replay. Export a .ttrm from TETR.IO's replay menu and drop it here."
      : error.kind === "legacy"
        ? "This replay uses the pre-2024 format, which Afterline can't read."
        : error.message;
  return <div className="al-error">{text}</div>;
}
