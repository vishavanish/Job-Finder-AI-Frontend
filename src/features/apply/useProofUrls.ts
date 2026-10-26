/** A run's screenshots (F4.1): their titles, and object URLs that never outlive the screen. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ApplyProof, ApplyRun } from "../../lib/api/types";
import { applyKeys, listProofs, proofImage } from "./applyApi";

export function proofTitle(p: ApplyProof): string {
  if (p.kind === "confirmation") return "Confirmation page";
  if (p.kind === "step") return p.confirmation_text || "Form page";
  return "Where the run stopped";
}

/** The run's screenshots and their object URLs (loaded one at a time, revoked on leave). */
export function useProofUrls(run: ApplyRun) {
  const proofs = useQuery({
    queryKey: [...applyKeys.proofs(run.id), run.proofs ?? 0],
    queryFn: () => listProofs(run.id),
    enabled: (run.proofs ?? 0) > 0,
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void (async () => {
      for (const p of proofs.data ?? []) {
        try {
          const url = URL.createObjectURL(await proofImage(run.id, p.id));
          made.push(url);
          if (alive) setUrls((u) => ({ ...u, [p.id]: url }));
        } catch {
          /* shown as "loading" — the caption still says what it was */
        }
      }
    })();
    return () => {
      alive = false;
      // Drop revoked URLs first so no image points at one while the new set loads.
      setUrls((u) => Object.fromEntries(Object.entries(u).filter(([, v]) => !made.includes(v))));
      made.forEach((u) => URL.revokeObjectURL(u)); // screenshots never outlive the screen
    };
  }, [proofs.data, run.id]);
  return { proofs: (run.proofs ?? 0) > 0 ? (proofs.data ?? []) : [], urls };
}
