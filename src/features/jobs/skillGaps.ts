/** Skill gaps across a search's jobs (QA2 §5: one chip per skill, no near-duplicates). */
import type { StreamedJob } from "../../lib/api/types";

/** "PostgreSQL / MongoDB" → "PostgreSQL", "MongoDB". A phrase with a bracketed note stays whole. */
export function splitSkills(raw: string): string[] {
  if (raw.includes("(")) return [raw.trim()];
  return raw
    .split(/\s*(?:\/|,|&|\bor\b|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The skills found jobs ask for that the profile lacks, most asked first. */
export function skillGaps(jobs: StreamedJob[]): { skill: string; n: number }[] {
  const counts = new Map<string, { skill: string; n: number }>();
  for (const j of jobs) {
    const seen = new Set<string>(); // a job counts once per skill
    for (const raw of j.match?.missing_required ?? []) {
      for (const skill of splitSkills(raw)) {
        const key = skill.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = counts.get(key) ?? { skill, n: 0 };
        entry.n += 1;
        counts.set(key, entry);
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.skill.localeCompare(b.skill))
    .slice(0, 8);
}
