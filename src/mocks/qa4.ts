/**
 * MSW handlers for Target companies (backend QA4, routes/target_companies.py):
 * follow / unfollow, follow by name (a known name follows at once, others
 * "searching"), new roles, seen, suggestions and alert settings. Uses the F6
 * company registry in mocks/f6State.ts.
 */
import { http, HttpResponse } from "msw";
import type { FollowedCompany, FollowSettings, NewRole } from "../lib/api/types";
import { entitlementsFor } from "./data";
import { companyById, f6Db } from "./f6State";
import { API, authenticate, newId, readJson } from "./handlers";

interface MockFollow {
  id: string;
  company_id: string | null;
  name: string;
  status: "following" | "searching" | "not_found";
  followed_at: string;
}

export const qa4Db = {
  follows: {} as Record<string, MockFollow[]>,
  newRoles: {} as Record<string, NewRole[]>,
  settings: {} as Record<string, Pick<FollowSettings, "alert_mode" | "titles" | "places">>,
  limit: 50,
};

export function resetQa4Mock(): void {
  qa4Db.follows = {};
  qa4Db.newRoles = {};
  qa4Db.settings = {};
  qa4Db.limit = 50;
}

export function isFollowed(userId: string, companyId: string): boolean {
  return (qa4Db.follows[userId] ?? []).some((f) => f.company_id === companyId);
}

const NOT_INCLUDED =
  "Your account does not include company career pages. Ask an admin to enable it.";
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|inc|llc|technologies|software|solutions)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function out(userId: string, f: MockFollow): FollowedCompany {
  const c = f.company_id ? companyById(f.company_id) : undefined;
  const open = c ? f6Db.jobs.filter((j) => j.company_id === c.id && !j.closed) : [];
  const fresh = (qa4Db.newRoles[userId] ?? []).filter(
    (r) => r.company_id === f.company_id && !r.seen,
  );
  return {
    id: f.id,
    status: f.status,
    name: c?.name ?? f.name,
    company_id: f.company_id,
    platform: c?.platform ?? null,
    platform_name: c?.platform_name ?? null,
    careers_url: c?.careers_url ?? null,
    open_jobs: open.length,
    open_matching: open.length,
    new_count: fresh.length,
    latest_posted_at: open[0]?.posted_at ?? null,
    last_refreshed_at: c?.last_ok_at ?? null,
    followed_at: f.followed_at,
  };
}

function settingsOut(userId: string): FollowSettings {
  const s = qa4Db.settings[userId] ?? { alert_mode: "daily", titles: [], places: [] };
  return {
    ...s,
    timezone: "Asia/Kolkata",
    default_titles: ["Data Engineer"],
    default_places: ["Bengaluru", "Remote"],
  };
}

function guard(request: Request): { userId: string } | Response {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  if (entitlementsFor(auth.user.id).ats_discovery?.enabled === false)
    return HttpResponse.json({ detail: NOT_INCLUDED }, { status: 403 });
  return { userId: auth.user.id };
}

function addFollow(
  userId: string,
  f: Omit<MockFollow, "id" | "followed_at">,
): MockFollow | Response {
  const list = (qa4Db.follows[userId] ??= []);
  if (list.length >= qa4Db.limit)
    return HttpResponse.json(
      { detail: `You can follow up to ${qa4Db.limit} companies. Unfollow one to add another.` },
      { status: 409 },
    );
  const row = { ...f, id: newId("follow"), followed_at: new Date().toISOString() };
  list.unshift(row);
  return row;
}

export const qa4Handlers = [
  http.get(`${API}/ats/following`, ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    return HttpResponse.json({
      companies: (qa4Db.follows[g.userId] ?? []).map((f) => out(g.userId, f)),
      limit: qa4Db.limit,
      settings: settingsOut(g.userId),
    });
  }),

  http.put(`${API}/ats/companies/:id/follow`, ({ request, params }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const c = companyById(String(params.id));
    if (!c)
      return HttpResponse.json({ detail: "No such company in the registry." }, { status: 404 });
    const existing = (qa4Db.follows[g.userId] ?? []).find((f) => f.company_id === c.id);
    const row =
      existing ?? addFollow(g.userId, { company_id: c.id, name: c.name, status: "following" });
    if (row instanceof Response) return row;
    return HttpResponse.json(out(g.userId, row));
  }),

  http.delete(`${API}/ats/companies/:id/follow`, ({ request, params }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const list = qa4Db.follows[g.userId] ?? [];
    if (!list.some((f) => f.company_id === params.id))
      return HttpResponse.json({ detail: "You don't follow this company." }, { status: 404 });
    qa4Db.follows[g.userId] = list.filter((f) => f.company_id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${API}/ats/following/:followId`, ({ request, params }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    qa4Db.follows[g.userId] = (qa4Db.follows[g.userId] ?? []).filter(
      (f) => f.id !== params.followId,
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/ats/following/by-name`, async ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const name = (await readJson<{ name?: string }>(request)).name ?? "";
    const known = f6Db.companies.find((c) => norm(c.name) === norm(name));
    const row = addFollow(g.userId, {
      company_id: known?.id ?? null,
      name: known?.name ?? name.trim(),
      status: known ? "following" : "searching",
    });
    if (row instanceof Response) return row;
    return HttpResponse.json({
      status: row.status,
      follow: out(g.userId, row),
      task_id: known ? null : newId("lookup"),
    });
  }),

  http.get(`${API}/ats/following/new`, ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const companyId = new URL(request.url).searchParams.get("company_id");
    const roles = (qa4Db.newRoles[g.userId] ?? []).filter(
      (r) => !companyId || r.company_id === companyId,
    );
    return HttpResponse.json({ roles });
  }),

  http.post(`${API}/ats/following/seen`, async ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const { company_id } = await readJson<{ company_id?: string | null }>(request);
    let marked = 0;
    for (const r of qa4Db.newRoles[g.userId] ?? []) {
      if (!r.seen && (!company_id || r.company_id === company_id)) {
        r.seen = true;
        marked += 1;
      }
    }
    return HttpResponse.json({ marked });
  }),

  http.get(`${API}/ats/suggestions`, ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const companies = f6Db.companies
      .filter((c) => c.active && !isFollowed(g.userId, c.id))
      .map((c) => ({
        company_id: c.id,
        name: c.name,
        platform: c.platform,
        platform_name: c.platform_name,
        open_matching: f6Db.jobs.filter((j) => j.company_id === c.id && !j.closed).length,
        reason: "hiring for your titles",
      }))
      .filter((c) => c.open_matching > 0)
      .sort((a, b) => b.open_matching - a.open_matching)
      .slice(0, 12);
    return HttpResponse.json({ companies });
  }),

  http.get(`${API}/ats/following/settings`, ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    return HttpResponse.json(settingsOut(g.userId));
  }),

  http.put(`${API}/ats/following/settings`, async ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const body = await readJson<Partial<FollowSettings>>(request);
    const cur = settingsOut(g.userId);
    if (body.alert_mode && !["instant", "daily", "off"].includes(body.alert_mode))
      return HttpResponse.json(
        { detail: "alert_mode must be one of instant, daily, off" },
        { status: 422 },
      );
    qa4Db.settings[g.userId] = {
      alert_mode: body.alert_mode ?? cur.alert_mode,
      titles: body.titles ?? cur.titles,
      places: body.places ?? cur.places,
    };
    return HttpResponse.json(settingsOut(g.userId));
  }),
];
