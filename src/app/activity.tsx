/**
 * Global activity list behind the top-bar tray (spec §5.3): running searches,
 * apply runs, imports. Producers call `track()`; the tray only reads.
 * Kept in memory — on reload, running work is still visible on its own page.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ActivityKind = "search" | "apply" | "import" | "task";
export type ActivityStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Activity {
  id: string;
  kind: ActivityKind;
  label: string;
  status: ActivityStatus;
  /** One line of progress or error text. */
  detail?: string;
  /** Where the user can see or act on it. */
  href?: string;
  startedAt: number;
  updatedAt: number;
}

export type ActivityInput = Pick<Activity, "id"> &
  Partial<Omit<Activity, "id" | "startedAt" | "updatedAt">>;

interface ActivityValue {
  items: Activity[];
  /** Create or update an activity by id. */
  track: (input: ActivityInput) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
}

const FINISHED: ReadonlySet<ActivityStatus> = new Set(["completed", "failed", "cancelled"]);

export function isFinished(a: Activity): boolean {
  return FINISHED.has(a.status);
}

const ActivityContext = createContext<ActivityValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, Activity>>({});

  const track = useCallback((input: ActivityInput) => {
    setById((prev) => {
      const now = Date.now();
      const existing = prev[input.id];
      const next: Activity = existing
        ? { ...existing, ...stripUndefined(input), updatedAt: now }
        : {
            kind: "task",
            label: "Background task",
            status: "running",
            ...stripUndefined(input),
            id: input.id,
            startedAt: now,
            updatedAt: now,
          };
      return { ...prev, [input.id]: next };
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearFinished = useCallback(() => {
    setById((prev) => Object.fromEntries(Object.entries(prev).filter(([, a]) => !isFinished(a))));
  }, []);

  const items = useMemo(
    () => Object.values(byId).sort((a, b) => b.startedAt - a.startedAt),
    [byId],
  );

  const value = useMemo(
    () => ({ items, track, dismiss, clearFinished }),
    [items, track, dismiss, clearFinished],
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function useActivity(): ActivityValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}
