import { Wordmark } from "./TopBar";

/** Header for the upload / picker / progress screens. */
export function FlowHeader({ meta = [] }: { meta?: string[] }) {
  return (
    <header className="flow-header">
      <Wordmark />
      {meta.filter(Boolean).map((m, i) => (
        <span key={m} className="topbar-meta">
          {i > 0 && <span aria-hidden="true">· </span>}
          {m}
        </span>
      ))}
    </header>
  );
}
