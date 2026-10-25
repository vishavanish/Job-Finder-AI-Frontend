/** Target companies calls (backend QA4): follow companies, new matching roles, alert settings, suggestions. */
import { api } from "../../lib/api/client";
import type {
  FollowByNameOut,
  FollowedCompany,
  FollowingOut,
  FollowSettings,
  FollowSettingsIn,
  NewRolesOut,
  SuggestionsOut,
} from "../../lib/api/types";

const enc = encodeURIComponent;

export const targetKeys = {
  all: ["ats", "following"] as const,
  following: ["ats", "following", "list"] as const,
  newRoles: (companyId: string) => ["ats", "following", "new", companyId] as const,
  suggestions: ["ats", "following", "suggestions"] as const,
};

export const getFollowing = () => api.get<FollowingOut>("/ats/following");
export const followCompany = (companyId: string) =>
  api.put<FollowedCompany>(`/ats/companies/${enc(companyId)}/follow`);
export const unfollowCompany = (companyId: string) =>
  api.delete<void>(`/ats/companies/${enc(companyId)}/follow`);
export const removeFollow = (followId: string) =>
  api.delete<void>(`/ats/following/${enc(followId)}`);
export const followByName = (name: string) =>
  api.post<FollowByNameOut>("/ats/following/by-name", { name });
export const getNewRoles = (companyId?: string) =>
  api.get<NewRolesOut>("/ats/following/new", { params: { company_id: companyId || undefined } });
export const markSeen = (companyId?: string) =>
  api.post<{ marked: number }>("/ats/following/seen", { company_id: companyId ?? null });
export const getSuggestions = () => api.get<SuggestionsOut>("/ats/suggestions");
export const saveFollowSettings = (body: FollowSettingsIn) =>
  api.put<FollowSettings>("/ats/following/settings", body);
