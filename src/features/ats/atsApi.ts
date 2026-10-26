/** ATS Discovery calls (backend P6): title search grouped by company, company jobs, job details, the registry. */
import { api } from "../../lib/api/client";
import type {
  AtsCompany,
  AtsCompanyIn,
  AtsCompanyJobs,
  AtsHealth,
  AtsJobDetail,
  AtsPlatform,
  AtsRegistryStats,
  AtsSearchResult,
  AtsTracked,
  TaskResponse,
} from "../../lib/api/types";

const enc = encodeURIComponent;

export interface AtsFilters {
  platform: string[];
  location: string; // one or more places, comma-separated
  remote: boolean;
  posted: string; // days, "" = last 90 days (server default), "any" = every age
  hideApplied: boolean;
}

export const atsKeys = {
  all: ["ats"] as const,
  search: (q: string, f: AtsFilters) => ["ats", "search", q, f] as const,
  companyJobs: (id: string, q: string) => ["ats", "company", id, q] as const,
  job: (id: string) => ["ats", "job", id] as const,
  stats: ["ats", "stats"] as const,
  adminHealth: ["ats", "admin", "health"] as const,
  adminCompanies: (q: string, platform: string, active: string) =>
    ["ats", "admin", "companies", q, platform, active] as const,
};

/** "Mumbai, India, Remote" → ["Mumbai", "India", "Remote"]; undefined when empty. */
export function splitPlaces(text: string): string[] | undefined {
  const places = [
    ...new Set(
      text
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  return places.length ? places : undefined;
}

export const searchAts = (q: string, f: AtsFilters, page: number) =>
  api.get<AtsSearchResult>("/ats/search", {
    params: {
      q,
      platform: f.platform.length ? f.platform : undefined,
      location: splitPlaces(f.location),
      remote: f.remote || undefined,
      posted_within_days: f.posted && f.posted !== "any" ? f.posted : undefined,
      any_age: f.posted === "any" || undefined,
      hide_applied: f.hideApplied,
      page,
    },
  });

export const getAtsStats = () => api.get<AtsRegistryStats>("/ats/stats");
export const addAtsCompany = (body: AtsCompanyIn) => api.post<AtsCompany>("/ats/companies", body);
export const getCompanyJobs = (id: string, q?: string) =>
  api.get<AtsCompanyJobs>(`/ats/companies/${enc(id)}/jobs`, { params: { q: q || undefined } });
export const getAtsJob = (id: string) => api.get<AtsJobDetail>(`/ats/jobs/${enc(id)}`);
export const trackAtsJob = (id: string) => api.post<AtsTracked>(`/ats/jobs/${enc(id)}/track`);
export const getTopUp = (taskId: string) => api.get<TaskResponse>(`/tasks/${enc(taskId)}`);

// ---- admin ----
export const getAtsHealth = () => api.get<AtsHealth>("/admin/ats/health");
export const listAtsCompanies = (q: string, platform: string, active: string) =>
  api.get<AtsCompany[]>("/admin/ats/companies", {
    params: {
      q: q.trim() || undefined,
      platform: platform || undefined,
      active: active === "" ? undefined : active === "on",
      limit: 200,
    },
  });
export const updateAtsCompany = (id: string, body: { name?: string; active?: boolean }) =>
  api.patch<AtsCompany>(`/admin/ats/companies/${enc(id)}`, body);
export const crawlAtsCompany = (id: string) =>
  api.post<AtsCompany>(`/admin/ats/companies/${enc(id)}/crawl`);
export const updateAtsPlatform = (platform: string, enabled: boolean) =>
  api.patch<AtsPlatform>(`/admin/ats/platforms/${enc(platform)}`, { enabled });
