import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { isFinished, useActivity, type Activity } from "./activity";

function announcement(a: Activity): string {
  if (a.status === "completed") return `${a.label}: finished.`;
  if (a.status === "failed") return `${a.label}: failed. ${a.detail ?? ""}`.trim();
  if (a.status === "cancelled") return `${a.label}: cancelled.`;
  return "";
}

export function ActivityTray() {
  const { items, dismiss, clearFinished } = useActivity();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const running = items.filter((a) => !isFinished(a)).length;
  const finished = items.length - running;

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Close on Escape or on a click outside the tray.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Polite announcement when something finishes, even with the tray closed.
  const [liveText, setLiveText] = useState("");
  const seen = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const a of items) {
      if (seen.current[a.id] !== a.status) {
        const msg = seen.current[a.id] !== undefined ? announcement(a) : "";
        seen.current[a.id] = a.status;
        if (msg) setLiveText(msg);
      }
    }
  }, [items]);

  const buttonLabel = running
    ? `Activity, ${running} running`
    : finished
      ? `Activity, ${finished} finished`
      : "Activity";

  return (
    <div className="tray">
      <button
        ref={buttonRef}
        type="button"
        className="topbar-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={buttonLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="activity" />
        <span className="topbar-button-text">Activity</span>
        {running > 0 && (
          <span className="tray-count num" aria-hidden="true">
            {running}
          </span>
        )}
      </button>

      <div className="sr-only" aria-live="polite">
        {liveText}
      </div>

      {open && (
        <div ref={panelRef} id={panelId} className="tray-panel" role="region" aria-label="Activity">
          <div className="tray-header">
            <h2 className="tray-title">Activity</h2>
            {finished > 0 && (
              <button type="button" className="link-button" onClick={clearFinished}>
                Clear finished
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="tray-empty">
              Nothing running. Searches and apply runs you start show up here, so you can leave a
              page and come back.
            </p>
          ) : (
            <ul className="tray-list">
              {items.map((a) => (
                <li key={a.id} className="tray-item">
                  <div className="tray-item-main">
                    <span className="tray-item-label">{a.label}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.detail && <p className="tray-item-detail">{a.detail}</p>}
                  <div className="tray-item-actions">
                    {a.href && (
                      <Link to={a.href} className="link-button" onClick={() => setOpen(false)}>
                        Open
                      </Link>
                    )}
                    {isFinished(a) && (
                      <button type="button" className="link-button" onClick={() => dismiss(a.id)}>
                        Dismiss
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
