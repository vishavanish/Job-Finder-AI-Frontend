import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../app/useFocusTrap";

/**
 * A modal with its own content and actions (ConfirmDialog is the yes/no
 * case). Focus is trapped inside; Escape and the backdrop call onClose.
 */
export function Dialog({
  title,
  children,
  actions,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, true, onClose);
  return (
    <div className="dialog-layer">
      <div className="dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`dialog${wide ? " dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="link-button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}
