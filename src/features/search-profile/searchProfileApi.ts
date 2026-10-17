/** Saved search profiles — the combined Keywords & Skills (backend P3, CLAUDE.md 7.3). */
import { api } from "../../lib/api/client";
import type {
  SearchProfileIn,
  SearchProfileList,
  SearchProfileOut,
  TitleSuggestions,
} from "../../lib/api/types";

export const searchProfileKeys = { all: ["search-profiles"] as const };

export const listSearchProfiles = () => api.get<SearchProfileList>("/search-profiles");

export const createSearchProfile = (body: SearchProfileIn) =>
  api.post<SearchProfileOut>("/search-profiles", body);

export const updateSearchProfile = (id: string, body: SearchProfileIn) =>
  api.put<SearchProfileOut>(`/search-profiles/${encodeURIComponent(id)}`, body);

export const deleteSearchProfile = (id: string) =>
  api.delete<void>(`/search-profiles/${encodeURIComponent(id)}`);

export const profileFromResume = (name: string) =>
  api.post<SearchProfileOut>("/search-profiles/from-resume", { name });

export const suggestTitles = (id: string) =>
  api.post<TitleSuggestions>(`/search-profiles/${encodeURIComponent(id)}/suggest-titles`);

export function emptyProfile(name = "My search"): SearchProfileIn {
  return {
    name,
    is_default: false,
    skills: [],
    titles: [],
    must_have: [],
    nice_to_have: [],
    exclude: [],
  };
}

export function toInput(p: SearchProfileOut): SearchProfileIn {
  return {
    name: p.name,
    is_default: Boolean(p.is_default),
    skills: (p.skills ?? []).map((s) => ({ ...s })),
    titles: [...(p.titles ?? [])],
    must_have: [...(p.must_have ?? [])],
    nice_to_have: [...(p.nice_to_have ?? [])],
    exclude: [...(p.exclude ?? [])],
  };
}
