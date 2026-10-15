import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/**
 * Six one-digit boxes: typing moves to the next box, Backspace on an empty box
 * goes back, and pasting (or SMS/email autofill) spreads the digits.
 * `value` is the digits typed so far (0–6 characters).
 */
export function CodeInput({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();
  // Move focus only after React has rendered the new value; focusing earlier
  // runs onFocus with the old value and bounces focus back.
  const focusAfterRender = useRef<number | null>(null);
  const moveFocus = (i: number) => {
    focusAfterRender.current = i;
  };
  useEffect(() => {
    if (focusAfterRender.current === null) return;
    const i = focusAfterRender.current;
    focusAfterRender.current = null;
    focus(i);
  });

  const setFrom = (start: number, digits: string) => {
    const chars = value.padEnd(LENGTH, " ").split("");
    let i = start;
    for (const d of digits) {
      if (i >= LENGTH) break;
      chars[i] = d;
      i += 1;
    }
    const next = chars.join("").replace(/\s+$/, "");
    // A gap (typing into box 4 while box 2 is empty) is not a valid code: keep only the prefix.
    onChange(next.split(" ")[0] ?? "");
    moveFocus(i);
  };

  const handleInput = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // One box may receive the whole code (autofill); spread it from the start.
    setFrom(digits.length >= LENGTH ? 0 : i, digits);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) onChange(value.slice(0, i));
      else if (i > 0) {
        onChange(value.slice(0, i - 1));
        moveFocus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    e.preventDefault();
    setFrom(0, digits.slice(0, LENGTH));
  };

  return (
    <div
      className="code-input"
      role="group"
      aria-label="6-digit code"
      aria-describedby={describedBy}
    >
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="code-input-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? LENGTH : 1}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          value={value[i] ?? ""}
          disabled={disabled}
          // Only the next empty box (or a filled one) can be focused by click.
          onFocus={(e) => {
            if (i > value.length) focus(value.length);
            else e.currentTarget.select();
          }}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}
