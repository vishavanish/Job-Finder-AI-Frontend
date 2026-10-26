/**
 * MSW handlers for the F6 screens, mirroring backend P6 (routes/ats.py):
 * /ats/search (grouped by company, filters, live top-up when few match),
 * /ats/stats, /ats/companies (add), /ats/companies/{id}/jobs, /ats/jobs/{id}
 * (+ /track), the top-up task on /tasks/{id}, and the admin registry routes.
 * State lives in mocks/f6State.ts.
 */
import { http, HttpResponse } from "msw";
import type { ApplyOption, ApplyOptions, AtsCompanyIn, StreamedJob } from "../lib/api/types";
import { entitlementsFor } from "./data";
import { f3Db } from "./f3State";
import {
  PLATFORM_NAMES,
  companyById,
  f6Db,
  finishTopUp,
  jobOut,
  newCompany,
  platformRows,
  registryStats,
  search,
} from "./f6State";
import { API, authenticate, newId, readJson, requireRole } from "./handlers";
import { isFollowed } from "./qa4";

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status });
const MIN_COMPANIES = 10;
const NOT_INCLUDED =
  "Your account does not include company career pages. Ask an admin to enable it.";

const on: ApplyOption = { available: true, reason: null };
const off = (reason: string): ApplyOption => ({ available: false, reason });

/** What the backend's apply_options says for a tracked ATS job (Auto apply on Greenhouse and Lever). */
function optionsFor(platform: string): ApplyOptions {
  const auto = platform === "greenhouse" || platform === "lever";
  return {
    adapter: auto ? platform : null,
    manual: on,
    fast: off("Fast apply works on LinkedIn Easy Apply jobs only."),
    auto: auto ? on : off("Auto apply works on Greenhouse and Lever job pages only."),
    email: off("The job post has no email address to apply to."),
    email_to: null,
  };
}

function description(title: string, company: string): string {
  return [
    `${company} is hiring a ${title}.`,
    "",
    "What you'll do",
    `- Build and run the systems behind ${company}'s products.`,
    "- Work with product and design on what to build next.",
    "",
    "What we look for",
    "- 3+ years of relevant experience.",
    "- Clear writing and ownership of your work.",
  ].join("\n");
}

/** Mirrors ats_registry.parse_user_url: only known ATS hosts, never private addresses. */
function parseUrl(raw: string): { platform: string; slug: string } | Response {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return fail(422, "ats_unsupported", "That doesn't look like a link.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /^(\d+\.){3}\d+$/.test(host)) {
    return fail(400, "ats_private_host", "That address isn't a public careers page.");
  }
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (/(^|\.)greenhouse\.io$/.test(host) && first) return { platform: "greenhouse", slug: first };
  if (host === "jobs.lever.co" && first) return { platform: "lever", slug: first };
  if (host.endsWith(".recruitee.com")) return { platform: "recruitee", slug: host.split(".")[0]! };
  if (host.endsWith(".myworkdayjobs.com"))
    return { platform: "workday", slug: host.split(".")[0]! };
  if (host === "jobs.ashbyhq.com" && first) return { platform: "ashby", slug: first };
  return fail(
    422,
    "ats_unsupported",
    "We can't read jobs from that page yet. Supported: Greenhouse, Lever, Workday, Recruitee, Ashby, SmartRecruiters, Workable, Personio, Breezy, Teamtailor, Rippling and Gem links.",
  );
}

function atsAllowed(userId: string): boolean {
  return entitlementsFor(userId).ats_discovery?.enabled !== false;
}

export const f6Handlers = [
  http.get(`${API}/ats/search`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!atsAllowed(auth.user.id)) return fail(403, "feature_disabled", NOT_INCLUDED);
    const p = new URL(request.url).searchParams;
    const q = (p.get("q") ?? "").trim();
    if (q.length < 2) {
      return HttpResponse.json(
        { detail: [{ msg: "String should have at least 2 characters" }] },
        { status: 422 },
      );
    }
    const page = Number(p.get("page") ?? 1);
    const result = search(auth.user.id, {
      q,
      platforms: p.getAll("platform"),
      location: p.get("location") ?? "",
      remote: p.get("remote") === "true",
      postedWithinDays: p.get("posted_within_days") ? Number(p.get("posted_within_days")) : null,
      hideApplied: p.get("hide_applied") === "true",
      page,
    });
    let topup_task_id: string | null = null;
    const running = [...f6Db.topups.values()].some(
      (t) => t.query === q.toLowerCase() && t.status !== "completed",
    );
    const done = [...f6Db.topups.values()].some((t) => t.query === q.toLowerCase());
    if (page === 1 && result.total_companies < MIN_COMPANIES && !running && !done) {
      const id = newId("topup");
      f6Db.topups.set(id, {
        id,
        user_id: auth.user.id,
        query: q.toLowerCase(),
        polls: 0,
        status: "pending",
        created_at: new Date().toISOString(),
      });
      topup_task_id = id;
    }
    const groups = result.groups.map((g) => ({
      ...g,
      followed: isFollowed(auth.user.id, g.company_id),
    }));
    return HttpResponse.json({ ...result, groups, topup_task_id });
  }),

  // The live top-up task (other task ids fall through to the generic /tasks mock).
  http.get(`${API}/tasks/:taskId`, ({ request, params }) => {
    const t = f6Db.topups.get(String(params.taskId));
    if (!t) return undefined;
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    t.polls += 1;
    let added = 0;
    if (t.status === "pending") t.status = "running";
    else if (t.status === "running" && t.polls >= 3) {
      t.status = "completed";
      added = finishTopUp(t);
    }
    return HttpResponse.json({
      task_id: t.id,
      status: t.status,
      created_at: t.created_at,
      updated_at: new Date().toISOString(),
      progress: t.status === "completed" ? null : "checking 12 company career pages live",
      result: t.status === "completed" ? { searched: 4, crawled: 8, added, errors: 0 } : null,
      error: null,
    });
  }),

  http.get(`${API}/ats/stats`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!atsAllowed(auth.user.id)) return fail(403, "feature_disabled", NOT_INCLUDED);
    return HttpResponse.json(registryStats());
  }),

  http.post(`${API}/ats/companies`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<AtsCompanyIn>(request);
    let ref: { platform: string; slug: string };
    if (body.url) {
      const parsed = parseUrl(body.url);
      if (parsed instanceof Response) return parsed;
      ref = parsed;
    } else if (body.platform && body.slug) {
      if (!PLATFORM_NAMES[body.platform]) {
        return fail(422, "ats_unknown_platform", `Unknown platform '${body.platform}'.`);
      }
      ref = { platform: body.platform, slug: body.slug.toLowerCase() };
    } else {
      return fail(422, "validation_error", "Give a careers page link, or platform and slug.");
    }
    const existing = f6Db.companies.find((c) => c.platform === ref.platform && c.slug === ref.slug);
    if (existing) return HttpResponse.json({ ...existing, created: false }, { status: 201 });
    const name =
      body.name?.trim() || ref.slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const company = newCompany(name, ref.platform, {
      slug: ref.slug,
      origin: "user",
      job_count: 0,
      last_crawled_at: null,
      last_ok_at: null,
      next_crawl_at: new Date().toISOString(),
      created: true,
    });
    company.id = `atsc_${ref.platform}_${ref.slug}`;
    f6Db.companies.push(company);
    return HttpResponse.json(company, { status: 201 });
  }),

  http.get(`${API}/ats/companies/:id/jobs`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const company = companyById(String(params.id));
    if (!company)
      return HttpResponse.json({ detail: "No such company in the registry." }, { status: 404 });
    const q = (new URL(request.url).searchParams.get("q") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const jobs = f6Db.jobs
      .filter((j) => j.company_id === company.id && !j.closed)
      .filter((j) => q.every((w) => j.title.toLowerCase().includes(w)))
      .map((j) => jobOut(auth.user.id, j));
    return HttpResponse.json({ company, jobs });
  }),

  http.get(`${API}/ats/jobs/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const job = f6Db.jobs.find((j) => j.id === params.id && !j.closed);
    if (!job) return HttpResponse.json({ detail: "This job is no longer open." }, { status: 404 });
    const company = companyById(job.company_id)!;
    f6Db.descriptionsFetched += 1;
    const tracked = [...f3Db.jobs.values()].find((j) => j.url === job.url);
    return HttpResponse.json({
      ...jobOut(auth.user.id, job),
      company_id: company.id,
      company: company.name,
      platform: company.platform,
      description: description(job.title, company.name),
      job_id: tracked?.id ?? null,
    });
  }),

  http.post(`${API}/ats/jobs/:id/track`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const job = f6Db.jobs.find((j) => j.id === params.id && !j.closed);
    if (!job) return HttpResponse.json({ detail: "This job is no longer open." }, { status: 404 });
    const company = companyById(job.company_id)!;
    let row = [...f3Db.jobs.values()].find((j) => j.url === job.url);
    if (!row) {
      const created: StreamedJob = {
        id: newId("job"),
        source: company.platform_name,
        title: job.title,
        company: company.name,
        location: job.location,
        url: job.url,
        description: description(job.title, company.name),
        posted: job.posted_at ?? "",
        keyword_score: null,
        llm_score: null,
        llm_reason: "",
        auto_apply_capable: false,
        created_at: new Date().toISOString(),
        posted_at: job.posted_at,
        apply_url: job.url,
        apply_options: optionsFor(company.platform),
      };
      f3Db.jobs.set(created.id, created);
      row = created;
    }
    return HttpResponse.json({ job_id: row.id });
  }),

  // ---- admin ----
  http.get(`${API}/admin/ats/health`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({
      registry: registryStats(),
      index_limit: 300_000,
      platforms: platformRows(),
      failing_companies: f6Db.companies.filter((c) => c.active && c.last_error),
      switched_off: f6Db.companies.filter((c) => !c.active).length,
    });
  }),

  http.get(`${API}/admin/ats/companies`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const p = new URL(request.url).searchParams;
    const q = (p.get("q") ?? "").toLowerCase();
    const platform = p.get("platform");
    const active = p.get("active");
    const rows = f6Db.companies
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
      .filter((c) => !platform || c.platform === platform)
      .filter((c) => active === null || String(c.active) === active)
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(rows.slice(0, Number(p.get("limit") ?? 100)));
  }),

  http.patch(`${API}/admin/ats/companies/:id`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const c = companyById(String(params.id));
    if (!c)
      return HttpResponse.json({ detail: "No such company in the registry." }, { status: 404 });
    const body = await readJson<{ name?: string; active?: boolean }>(request);
    if (body.name) Object.assign(c, { name: body.name.trim(), origin: "admin" });
    if (body.active !== undefined) {
      c.active = body.active;
      if (body.active)
        Object.assign(c, { last_error: null, next_crawl_at: new Date().toISOString() });
    }
    return HttpResponse.json(c);
  }),

  http.post(`${API}/admin/ats/companies/:id/crawl`, ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const c = companyById(String(params.id));
    if (!c)
      return HttpResponse.json({ detail: "No such company in the registry." }, { status: 404 });
    c.next_crawl_at = new Date().toISOString();
    return HttpResponse.json(c);
  }),

  http.patch(`${API}/admin/ats/platforms/:platform`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const key = String(params.platform);
    if (!PLATFORM_NAMES[key])
      return HttpResponse.json({ detail: "Unknown platform." }, { status: 404 });
    const { enabled } = await readJson<{ enabled: boolean }>(request);
    if (enabled) f6Db.platformsOff.delete(key);
    else f6Db.platformsOff.add(key);
    return HttpResponse.json(platformRows().find((p) => p.platform === key));
  }),
];
