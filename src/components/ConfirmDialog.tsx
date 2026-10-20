import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useFocusTrap } from "../app/useFocusTrap";
import { errorMessage } from "../lib/api/errors";

/**
 * Confirmation for destructive or account-changing actions (spec §6.12): the
 * body spells out the consequence, the confirm button repeats the verb.
 * Focus starts on Cancel; Escape cancels. Errors from `onConfirm` stay in the
 * dialog so the user can retry or cancel.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useFocusTrap(ref, true, close);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="dialog-layer">
      <div className="dialog-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={ref}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className="dialog-body">
          {children}
        </div>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-run"}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
