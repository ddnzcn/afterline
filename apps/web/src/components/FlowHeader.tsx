import { Wordmark } from "./TopBar";

/** Header for the upload / picker / progress screens. */
export function FlowHeader({ meta = [] }: { meta?: string[] }) {
  return (
    <header className="flow-header">
      <Wordmark />
      {meta.filter(Boolean).length > 0 && <span className="topbar-meta">{meta.filter(Boolean).join(" · ")}</span>}
    </header>
  );
}
