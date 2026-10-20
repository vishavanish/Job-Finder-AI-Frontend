/**
 * In-memory state for the F6 mocks (backend P6): a small shared ATS registry
 * (companies on 13 platforms with short job rows), the title search with the
 * backend's grouping and filters, live top-up tasks and platform switches.
 * Reset between tests.
 */
import type {
  AtsCompany,
  AtsCompanyGroup,
  AtsJob,
  AtsPlatform,
  AtsRegistryStats,
} from "../lib/api/types";

export interface MockAtsJob extends AtsJob {
  company_id: string;
  closed: boolean;
}

export interface MockTopUp {
  id: string;
  user_id: string;
  query: string;
  polls: number;
  status: "pending" | "running" | "completed";
  created_at: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  recruitee: "Recruitee",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  personio: "Personio",
  breezy: "Breezy",
  teamtailor: "Teamtailor",
  rippling: "Rippling",
  gem: "Gem",
  homerun: "Homerun",
};
const PLATFORM_KEYS = Object.keys(PLATFORM_NAMES);

const COMPANIES = [
  "Acme Analytics",
  "Bluefin Labs",
  "Cobalt Pay",
  "Deltawave",
  "Ember Health",
  "Fernwood Retail",
  "Granite Cloud",
  "Helix Bio",
  "Indigo Mobility",
  "Juniper Logistics",
  "Kite Security",
  "Lumen Data",
  "Monsoon Media",
  "Nimbus AI",
  "Orbit Fintech",
  "Pebble Games",
  "Quartz Systems",
  "Ridge Energy",
  "Saffron Foods",
  "Tidal Robotics",
  "Umbra Studios",
  "Vertex Learning",
  "Willow Insurance",
  "Xenon Devices",
  "Yarrow Travel",
  "Zephyr Commerce",
  "Atlas Freight",
  "Beacon Telecom",
  "Cedar Realty",
  "Drift Software",
];

const TITLES = [
  "Data Engineer",
  "Senior Data Engineer",
  "Software Engineer",
  "Backend Engineer",
  "Machine Learning Engineer",
  "Product Manager",
  "Frontend Developer",
  "Data Analyst",
  "DevOps Engineer",
  "QA Engineer",
];
const LOCATIONS = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Remote (India)",
  "Mumbai",
  "Gurugram",
  "Chennai",
];

/** Same idea as the backend's synonym groups: each phrase also searches its neighbours. */
const SYNONYMS: string[][] = [
  ["software engineer", "software developer", "sde"],
  ["machine learning engineer", "ml engineer"],
  ["frontend developer", "frontend engineer", "react developer"],
  ["product manager", "pm"],
];

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function careersUrl(platform: string, slug: string): string {
  switch (platform) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "workday":
      return `https://${slug}.wd3.myworkdayjobs.com/en-US/careers`;
    case "recruitee":
      return `https://${slug}.recruitee.com`;
    default:
      return `https://jobs.${platform}.example/${slug}`;
  }
}

export function newCompany(
  name: string,
  platform: string,
  extra: Partial<AtsCompany> = {},
): AtsCompany {
  const slug = slugOf(name);
  return {
    id: `atsc_${slug}`,
    name,
    platform,
    platform_name: PLATFORM_NAMES[platform] ?? platform,
    slug,
    careers_url: careersUrl(platform, slug),
    origin: "seed",
    active: true,
    job_count: 0,
    last_crawled_at: iso(2 * 3_600_000),
    last_ok_at: iso(2 * 3_600_000),
    next_crawl_at: iso(-4 * 3_600_000),
    last_error: null,
    created: false,
    ...extra,
  };
}

export function jobsFor(company: AtsCompany, seed: number, titles: string[]): MockAtsJob[] {
  return titles.map((title, j) => {
    const location = LOCATIONS[(seed + j) % LOCATIONS.length]!;
    return {
      id: `atsj_${company.slug}_${j}`,
      company_id: company.id,
      title,
      location,
      remote: location.startsWith("Remote"),
      department: title.includes("Product") ? "Product" : "Engineering",
      url: `${company.careers_url}/jobs/${4000 + seed * 10 + j}`,
      posted_at: iso((((seed * 7 + j * 5) % 40) + 0.5) * DAY),
      first_seen_at: iso((((seed * 7 + j * 5) % 40) + 0.5) * DAY),
      applied: false,
      closed: false,
    };
  });
}

function seed() {
  const companies: AtsCompany[] = [];
  const jobs: MockAtsJob[] = [];
  COMPANIES.forEach((name, i) => {
    const platform = PLATFORM_KEYS[i % PLATFORM_KEYS.length]!;
    const company = newCompany(name, platform);
    const titles = Array.from(
      { length: 3 + (i % 4) },
      (_, j) => TITLES[(i + j * 3) % TITLES.length]!,
    );
    // Every company has at least one data role so "data engineer" fills more than a page.
    if (!titles.some((t) => t.includes("Data Engineer"))) titles.push("Data Engineer");
    const rows = jobsFor(company, i, titles);
    company.job_count = rows.length;
    companies.push(company);
    jobs.push(...rows);
  });
  // One switched-off company (its slug left the platform) and one failing crawl, for the admin page.
  companies[companies.length - 1]!.active = false;
  companies[companies.length - 1]!.last_error = "404 three times — switched off";
  companies[3]!.last_error = "Timeout after 20 s";
  return { companies, jobs };
}

export const f6Db = {
  companies: [] as AtsCompany[],
  jobs: [] as MockAtsJob[],
  /** user id -> ats job ids the user applied to */
  applied: {} as Record<string, Set<string>>,
  topups: new Map<string, MockTopUp>(),
  platformsOff: new Set<string>(),
  descriptionsFetched: 0,
};

export function resetF6Mock(): void {
  const s = seed();
  f6Db.companies = s.companies;
  f6Db.jobs = s.jobs;
  f6Db.applied = { u_demo: new Set([s.jobs.find((j) => j.title === "Data Engineer")!.id]) };
  f6Db.topups.clear();
  f6Db.platformsOff.clear();
}
resetF6Mock();

const STOP = new Set(["senior", "sr", "junior", "jr", "lead", "staff", "principal"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));

export function normalizeQuery(q: string): string {
  return words(q).join(" ");
}

/** The phrases a query searches: itself plus its synonym group. */
export function expansions(q: string): string[] {
  const norm = normalizeQuery(q);
  const group = SYNONYMS.find((g) => g.includes(norm));
  return group ? [norm, ...group.filter((p) => p !== norm)] : [norm];
}

function titleMatches(title: string, phrases: string[]): boolean {
  const t = new Set(words(title));
  return phrases.some((p) => words(p).every((w) => t.has(w)));
}

export interface SearchArgs {
  q: string;
  platforms: string[];
  location: string;
  remote: boolean;
  postedWithinDays: number | null;
  hideApplied: boolean;
  page: number;
}

export function companyById(id: string): AtsCompany | undefined {
  return f6Db.companies.find((c) => c.id === id);
}

function isApplied(userId: string, jobId: string): boolean {
  return f6Db.applied[userId]?.has(jobId) ?? false;
}

export function jobOut(userId: string, j: MockAtsJob): AtsJob {
  const { company_id: _c, closed: _x, ...out } = j;
  return { ...out, applied: isApplied(userId, j.id) };
}

export function registryStats(): AtsRegistryStats {
  const active = f6Db.companies.filter((c) => c.active);
  const by_platform: Record<string, number> = {};
  for (const c of active) by_platform[c.platform] = (by_platform[c.platform] ?? 0) + 1;
  const last = active
    .map((c) => c.last_ok_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  return {
    companies: active.length,
    jobs: f6Db.jobs.filter((j) => !j.closed).length,
    last_refresh_at: last ?? null,
    by_platform,
  };
}

export const PAGE_SIZE = 25;

export function search(userId: string, a: SearchArgs) {
  const phrases = expansions(a.q);
  const cutoff = a.postedWithinDays ? Date.now() - a.postedWithinDays * DAY : null;
  const loc = a.location.trim().toLowerCase();
  const byCompany = new Map<string, MockAtsJob[]>();
  for (const j of f6Db.jobs) {
    const c = companyById(j.company_id);
    if (!c || !c.active || j.closed || f6Db.platformsOff.has(c.platform)) continue;
    if (a.platforms.length && !a.platforms.includes(c.platform)) continue;
    if (!titleMatches(j.title, phrases)) continue;
    if (a.remote && !j.remote) continue;
    if (loc && !j.location.toLowerCase().includes(loc)) continue;
    if (cutoff && new Date(j.posted_at ?? 0).getTime() < cutoff) continue;
    if (a.hideApplied && isApplied(userId, j.id)) continue;
    byCompany.set(c.id, [...(byCompany.get(c.id) ?? []), j]);
  }
  const groups: AtsCompanyGroup[] = [...byCompany.entries()]
    .map(([id, jobs]) => {
      const c = companyById(id)!;
      const sorted = [...jobs].sort((x, y) => (y.posted_at ?? "").localeCompare(x.posted_at ?? ""));
      return {
        company_id: c.id,
        name: c.name,
        platform: c.platform,
        platform_name: c.platform_name,
        careers_url: c.careers_url,
        open_jobs: f6Db.jobs.filter((j) => j.company_id === c.id && !j.closed).length,
        matching_jobs: jobs.length,
        top_jobs: sorted.slice(0, 3).map((j) => jobOut(userId, j)),
        locations: [...new Set(jobs.map((j) => j.location))],
        newest_posted_at: sorted[0]?.posted_at ?? null,
        last_refreshed_at: c.last_ok_at ?? null,
      };
    })
    .sort(
      (x, y) =>
        y.matching_jobs - x.matching_jobs ||
        (y.newest_posted_at ?? "").localeCompare(x.newest_posted_at ?? ""),
    );
  const start = (a.page - 1) * PAGE_SIZE;
  return {
    query: a.q,
    expansions: phrases.slice(1),
    expansion_pending: false,
    groups: groups.slice(start, start + PAGE_SIZE),
    total_companies: groups.length,
    total_jobs: groups.reduce((n, g) => n + g.matching_jobs, 0),
    page: a.page,
    page_size: PAGE_SIZE,
    registry: registryStats(),
  };
}

/** A finished top-up adds three companies hiring for the query, as if found live. */
export function finishTopUp(t: MockTopUp): number {
  const title = t.query.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const names = ["Ferro Labs", "Glimmer Tech", "Harbor AI"];
  let added = 0;
  names.forEach((name, i) => {
    if (f6Db.companies.some((c) => c.name === name)) return;
    const company = newCompany(name, ["workday", "smartrecruiters", "greenhouse"][i]!, {
      origin: "pipeline",
    });
    const rows = jobsFor(company, 40 + i, [title, `Senior ${title}`]);
    company.job_count = rows.length;
    f6Db.companies.push(company);
    f6Db.jobs.push(...rows);
    added += rows.length;
  });
  return added;
}

export function platformRows(): AtsPlatform[] {
  return PLATFORM_KEYS.map((key) => ({
    platform: key,
    name: PLATFORM_NAMES[key]!,
    enabled: !f6Db.platformsOff.has(key),
    companies: f6Db.companies.filter((c) => c.active && c.platform === key).length,
    consecutive_failures: key === "personio" ? 2 : 0,
    last_success_at: iso(3_600_000),
    last_error_at: key === "personio" ? iso(1_800_000) : null,
    last_error: key === "personio" ? "HTTP 503 from the XML feed" : null,
  }));
}

export { PLATFORM_NAMES };
