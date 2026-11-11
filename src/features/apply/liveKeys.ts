/** QA11: keyboard events on the live view, as the live browser understands them. */
const SPECIAL_KEYS = new Set([
  "Enter",
  "Backspace",
  "Tab",
  "Delete",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export type LiveKey = { type: "key"; key: string } | { type: "text"; text: string };

/** A named key (Enter, Control+a…), a typed character as text, or null to let the browser handle it. */
export function keyFor(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): LiveKey | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.length === 1) return { type: "key", key: `Control+${e.key.toLowerCase()}` };
  if (SPECIAL_KEYS.has(e.key))
    return { type: "key", key: e.shiftKey && e.key === "Tab" ? "Shift+Tab" : e.key };
  if (e.key.length === 1 && !e.altKey) return { type: "text", text: e.key };
  return null;
}
