/** The ATS platforms the registry indexes (backend providers/ats/platforms.py) and small formatting helpers. */

export const PLATFORMS: { key: string; name: string }[] = [
  { key: "greenhouse", name: "Greenhouse" },
  { key: "lever", name: "Lever" },
  { key: "workday", name: "Workday" },
  { key: "recruitee", name: "Recruitee" },
  { key: "ashby", name: "Ashby" },
  { key: "smartrecruiters", name: "SmartRecruiters" },
  { key: "workable", name: "Workable" },
  { key: "personio", name: "Personio" },
  { key: "breezy", name: "Breezy" },
  { key: "teamtailor", name: "Teamtailor" },
  { key: "rippling", name: "Rippling" },
  { key: "gem", name: "Gem" },
  { key: "homerun", name: "Homerun" },
];

export function platformName(key: string): string {
  return PLATFORMS.find((p) => p.key === key)?.name ?? key;
}

export const POSTED_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

/** "3 days ago", "today" — for posted dates. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const hours = Math.floor((Date.now() - t) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}

/** Only http(s) links are rendered. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
