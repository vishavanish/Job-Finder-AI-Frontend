/**
 * A list of short text values as removable chips. Enter or comma adds the
 * typed value; Backspace on an empty field removes the last chip. Duplicates
 * (case-insensitive) are ignored.
 */
import { useId, useState, type KeyboardEvent } from "react";

export function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
  max = 50,
  disabled = false,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  max?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase()) || values.length >= max) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="chip-field">
      <label htmlFor={id}>{label}</label>
      <ul className="chip-list" aria-label={label}>
        {values.map((v) => (
          <li key={v} className="chip">
            <span>{v}</span>
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${v}`}
              disabled={disabled}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        disabled={disabled || values.length >= max}
        placeholder={placeholder ?? "Type and press Enter"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
