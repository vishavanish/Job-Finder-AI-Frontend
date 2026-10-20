import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/api/errors";

/**
 * Enter an API key once. The field is a password input, cleared on save, and
 * the key is never shown again — the server returns only its last 4 characters.
 */
export function KeyForm({
  scope,
  label,
  saved,
  onSave,
  submitLabel = "Save key",
}: {
  scope: string;
  label: string;
  /** "••••1234" when a key is already stored. */
  saved?: string | null;
  onSave: (key: string) => Promise<unknown>;
  submitLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);
    const key = value.trim();
    if (key.length < 8 || /\s/.test(key)) {
      setError("That doesn't look like an API key (at least 8 characters, no spaces).");
      return;
    }
    setBusy(true);
    try {
      await onSave(key);
      setValue("");
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the key."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="key-form" onSubmit={submit} noValidate>
      <label htmlFor={id}>{label}</label>
      <div className="key-form-row">
        <input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            saved ? `Saved ${saved} — paste a new key to replace it` : `Paste your ${scope} key`
          }
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDone(false);
          }}
          disabled={busy}
          aria-describedby={`${id}-hint`}
        />
        <button type="submit" className="btn-small" disabled={busy || !value.trim()}>
          {busy ? "Saving…" : saved ? "Replace key" : submitLabel}
        </button>
      </div>
      <p id={`${id}-hint`} className="field-hint">
        {error ? (
          <span className="key-form-error" role="alert">
            {error}
          </span>
        ) : done ? (
          <span role="status">Saved. For your safety the key won&apos;t be shown again.</span>
        ) : (
          "Stored encrypted. Only the last 4 characters are ever shown."
        )}
      </p>
    </form>
  );
}
