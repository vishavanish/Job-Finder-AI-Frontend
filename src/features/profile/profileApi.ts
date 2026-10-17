/** Profile, preferences and resumes (backend P3, P3.2). */
import { api } from "../../lib/api/client";
import type {
  ApplicantInfoIn,
  ParsedResume,
  PreferencesIn,
  PreferencesOut,
  ProfileIn,
  ProfileOut,
  ResumeDetail,
  ResumeList,
  ResumeOut,
} from "../../lib/api/types";

export const profileKeys = {
  profile: ["profile"] as const,
  preferences: ["preferences"] as const,
  resumes: ["resumes"] as const,
  resume: (id: string) => ["resumes", id] as const,
};

export const getProfile = () => api.get<ProfileOut>("/profile");
export const putProfile = (body: ProfileIn) => api.put<ProfileOut>("/profile", body);

export const getPreferences = () => api.get<PreferencesOut>("/preferences");
export const putPreferences = (body: PreferencesIn) =>
  api.put<PreferencesOut>("/preferences", body);

export const listResumes = () => api.get<ResumeList>("/resumes");
export const getResume = (id: string) =>
  api.get<ResumeDetail>(`/resumes/${encodeURIComponent(id)}`);

export function uploadResume(file: File, label?: string) {
  const form = new FormData();
  form.append("file", file, file.name);
  if (label) form.append("label", label);
  return api.post<ResumeOut>("/resumes", form);
}

export const saveReviewedResume = (id: string, parsed: ParsedResume, label?: string | null) =>
  api.put<ResumeDetail>(`/resumes/${encodeURIComponent(id)}`, { parsed, label: label ?? null });

export const makeMaster = (id: string) =>
  api.post<ResumeOut>(`/resumes/${encodeURIComponent(id)}/master`);
export const reparseResume = (id: string) =>
  api.post<ResumeOut>(`/resumes/${encodeURIComponent(id)}/parse`);
export const deleteResume = (id: string) => api.delete<void>(`/resumes/${encodeURIComponent(id)}`);

const EMPTY_APPLICANT = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  city: "",
  country: "",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
};

export function fullApplicant(
  a: ApplicantInfoIn | undefined | null,
): ProfileIn["applicant_info"] & object {
  return { ...EMPTY_APPLICANT, ...(a ?? {}) } as ProfileIn["applicant_info"] & object;
}

/** The editable fields of a ProfileIn, so one section can save without dropping another's. */
export function profileBody(
  p: ProfileOut,
  patch: Omit<Partial<ProfileIn>, "applicant_info"> & { applicant_info?: ApplicantInfoIn } = {},
): ProfileIn {
  const { applicant_info, ...rest } = patch;
  return {
    headline: p.headline ?? null,
    summary: p.summary ?? null,
    work_authorization: p.work_authorization ?? [],
    ...rest,
    applicant_info: fullApplicant(applicant_info ?? p.applicant_info),
  };
}
