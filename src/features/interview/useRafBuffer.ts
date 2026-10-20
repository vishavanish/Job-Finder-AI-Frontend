/**
 * Collects streamed answer chunks in a ref and flushes them to React at
 * most once per animation frame (spec §7.3), so a fast stream doesn't
 * re-render the feed for every token.
 */
import { useCallback, useEffect, useRef } from "react";

export function useRafBuffer(flush: (chunks: Record<string, string>) => void) {
  const pending = useRef<Record<string, string>>({});
  const frame = useRef<number | null>(null);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const run = useCallback(() => {
    frame.current = null;
    const chunks = pending.current;
    pending.current = {};
    if (Object.keys(chunks).length) flushRef.current(chunks);
  }, []);

  const push = useCallback(
    (id: string, text: string) => {
      pending.current[id] = (pending.current[id] ?? "") + text;
      if (frame.current === null) {
        frame.current =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame(run)
            : window.setTimeout(run, 16);
      }
    },
    [run],
  );

  /** Flush now (before a done/cancel event replaces the text). */
  const flushNow = useCallback(() => {
    if (frame.current !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
      else window.clearTimeout(frame.current);
    }
    run();
  }, [run]);

  useEffect(
    () => () => {
      if (frame.current !== null && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { push, flushNow };
}
