/**
 * MSW handlers for the F3 screens, mirroring backend P3–P3.2 and the F3
 * endpoints: /profile, /preferences, /resumes, /search-profiles, /jobs,
 * /applications/manual and /alerts. State lives in mocks/f3State.ts.
 */
import { http, HttpResponse } from "msw";
import type {
  AlertIn,
  AlertOut,
  AlertRunOut,
  EeoAnswers,
  ParsedResume,
  PreferencesIn,
  PreferencesOut,
  ProfileIn,
  ProfileOut,
  SearchProfileIn,
  SearchProfileOut,
  StreamedJob,
} from "../lib/api/types";
import { mockDb } from "./data";
import {
  EMPTY_EEO,
  SAMPLE_PARSED,
  enrich,
  f3Db,
  setUserJob,
  userJobs,
  type MockResume,
} from "./f3State";
import { API, authenticate, newId, readJson } from "./handlers";

const MAX_ALERTS = 3;
const notFound = (code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status: 404 });
const unprocessable = (code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status: 422 });
const nowIso = () => new Date().toISOString();

function profileOut(userId: string, email: string): ProfileOut {
  const p =
    f3Db.profiles[userId] ??
    ({
      headline: null,
      summary: null,
      applicant_info: { email },
      work_authorization: [],
    } as unknown as ProfileOut);
  return { ...p, eeo: f3Db.eeo[userId] ?? EMPTY_EEO } as ProfileOut;
}

function emptyPrefs(): PreferencesOut {
  return {
    titles: [],
    seniority: [],
    locations: [],
    work_modes: [],
    job_types: [],
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    notice_period_days: null,
    industries: [],
    avoid_companies: [],
    posted_within_hours: null,
    languages: [],
    updated_at: null,
  };
}

function resumeOut(r: MockResume) {
  const { parsed: _parsed, text: _text, pendingPolls: _polls, ...out } = r;
  return out;
}

function resumes(userId: string): MockResume[] {
  f3Db.resumes[userId] ??= [];
  return f3Db.resumes[userId];
}

function searchProfiles(userId: string): SearchProfileOut[] {
  f3Db.searchProfiles[userId] ??= [];
  return f3Db.searchProfiles[userId];
}

function saveSearchProfile(
  userId: string,
  body: Partial<SearchProfileIn>,
  existing?: SearchProfileOut,
) {
  const list = searchProfiles(userId);
  const name = (body.name ?? "").trim();
  if (!name) return { error: unprocessable("search_profile_invalid", "Give the profile a name.") };
  if (list.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== existing?.id)) {
    return {
      error: HttpResponse.json(
        {
          detail: {
            code: "search_profile_name_taken",
            message: "You already have a profile with this name.",
          },
        },
        { status: 409 },
      ),
    };
  }
  const row: SearchProfileOut = {
    id: existing?.id ?? newId("sp"),
    name,
    is_default: Boolean(body.is_default) || list.length === 0 || (existing?.is_default ?? false),
    titles: body.titles ?? [],
    skills: body.skills ?? [],
    must_have: body.must_have ?? [],
    nice_to_have: body.nice_to_have ?? [],
    exclude: body.exclude ?? [],
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
  };
  if (row.is_default) list.forEach((p) => (p.is_default = false));
  if (existing) list.splice(list.indexOf(existing), 1, row);
  else list.push(row);
  return { row };
}

function userJobOut(userId: string, job: StreamedJob) {
  const uj = userJobs(userId)[job.id];
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    source: job.source,
    posted: job.posted,
    state: uj?.state ?? "seen",
    keyword_score: job.keyword_score,
    llm_score: job.llm_score,
    reason: job.llm_reason,
    sources: [job.source],
    match: job.match ?? null,
    posted_at: job.posted_at ?? null,
    posted_hours_ago: job.posted_hours_ago ?? null,
    early: Boolean(job.early),
    applicants: job.applicants ?? null,
    apply_url: job.apply_url ?? null,
    apply_options: job.apply_options ?? null,
    updated_at: uj?.updated_at ?? nowIso(),
  };
}

function nextRun(hour: number): string {
  const d = new Date();
  d.setUTCHours(hour, 15, 0, 0);
  if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export const f3Handlers = [
  // ---- profile & preferences ----
  http.get(`${API}/profile`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(profileOut(auth.user.id, auth.user.email));
  }),

  http.put(`${API}/profile`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<ProfileIn & { eeo?: EeoAnswers | null }>(request);
    const allowedEeo = Object.keys(EMPTY_EEO);
    if (body.eeo && Object.keys(body.eeo).some((k) => !allowedEeo.includes(k))) {
      return HttpResponse.json(
        { detail: [{ msg: "Extra inputs are not permitted", loc: ["body", "eeo"] }] },
        { status: 422 },
      );
    }
    f3Db.profiles[auth.user.id] = {
      headline: body.headline ?? null,
      summary: body.summary ?? null,
      applicant_info: body.applicant_info ?? {},
      work_authorization: body.work_authorization ?? [],
      updated_at: nowIso(),
    } as ProfileOut;
    if (body.eeo) f3Db.eeo[auth.user.id] = { ...EMPTY_EEO, ...body.eeo };
    return HttpResponse.json(profileOut(auth.user.id, auth.user.email));
  }),

  http.get(`${API}/preferences`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(f3Db.prefs[auth.user.id] ?? emptyPrefs());
  }),

  http.put(`${API}/preferences`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<PreferencesIn>(request);
    f3Db.prefs[auth.user.id] = { ...emptyPrefs(), ...body, updated_at: nowIso() } as PreferencesOut;
    return HttpResponse.json(f3Db.prefs[auth.user.id]);
  }),

  // ---- resumes ----
  http.get(`${API}/resumes`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = resumes(auth.user.id);
    for (const r of list) {
      if (r.parse_status === "pending" && --r.pendingPolls <= 0) {
        r.parse_status = "parsed";
        r.parsed = { ...SAMPLE_PARSED };
      }
    }
    return HttpResponse.json({
      resumes: [...list].reverse().map(resumeOut),
      master_id: list.find((r) => r.is_master)?.id ?? null,
    });
  }),

  http.post(`${API}/resumes`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    // Browsers send real multipart; under jsdom formData() can throw, so fall back to the raw body.
    let fileName = "";
    let fileType = "";
    let fileSize = 0;
    let label: string | null = null;
    try {
      const form = await request.clone().formData();
      const file = form.get("file");
      if (file && typeof file === "object" && "name" in file) {
        fileName = (file as File).name;
        fileType = (file as File).type;
        fileSize = (file as File).size;
      }
      label = (form.get("label") as string | null) || null;
    } catch {
      const raw = await request.text();
      fileName = /filename="([^"]+)"/.exec(raw)?.[1] ?? "";
      fileType = /Content-Type: ([^\r\n]+)/.exec(raw.split("filename=")[1] ?? "")?.[1] ?? "";
      fileSize = raw.length;
    }
    // jsdom -> undici can drop the file name ("blob") on either path (Node 22 does it
    // through formData()); name it from the part's content type.
    if (fileName === "blob") {
      fileName = fileType.includes("pdf")
        ? "resume.pdf"
        : fileType.includes("word")
          ? "resume.docx"
          : "resume.bin";
    }
    if (!fileName) return unprocessable("resume_missing", "Attach a file.");
    if (!/\.(pdf|docx)$/i.test(fileName))
      return unprocessable("resume_type", "Upload a PDF or DOCX file.");
    const list = resumes(auth.user.id);
    const row: MockResume = {
      id: newId("r"),
      version: list.length + 1,
      is_master: list.length === 0,
      parent_id: null,
      label,
      file_name: fileName,
      content_type: fileName.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      size_bytes: fileSize,
      parse_status: "pending",
      parse_error: null,
      parsed_by: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      parsed: null,
      text: "",
      pendingPolls: 1,
    };
    list.push(row);
    return HttpResponse.json(resumeOut(row), { status: 201 });
  }),

  http.get(`${API}/resumes/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const r = resumes(auth.user.id).find((x) => x.id === params.id);
    if (!r) return notFound("resume_not_found", "No resume with this id.");
    return HttpResponse.json({ ...resumeOut(r), text: r.text, parsed: r.parsed });
  }),

  http.put(`${API}/resumes/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const r = resumes(auth.user.id).find((x) => x.id === params.id);
    if (!r) return notFound("resume_not_found", "No resume with this id.");
    const body = await readJson<{ parsed: ParsedResume; label: string | null }>(request);
    if (body.parsed) {
      r.parsed = body.parsed;
      r.parse_status = "reviewed";
    }
    if (body.label !== undefined) r.label = body.label;
    r.updated_at = nowIso();
    return HttpResponse.json({ ...resumeOut(r), text: r.text, parsed: r.parsed });
  }),

  http.post(`${API}/resumes/:id/:action`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = resumes(auth.user.id);
    const r = list.find((x) => x.id === params.id);
    if (!r) return notFound("resume_not_found", "No resume with this id.");
    if (params.action === "master") list.forEach((x) => (x.is_master = x.id === r.id));
    else if (params.action === "parse") {
      r.parse_status = "pending";
      r.pendingPolls = 1;
    } else return notFound("not_found", "Unknown action.");
    return HttpResponse.json(resumeOut(r));
  }),

  http.delete(`${API}/resumes/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = resumes(auth.user.id);
    const i = list.findIndex((x) => x.id === params.id);
    if (i < 0) return notFound("resume_not_found", "No resume with this id.");
    const [gone] = list.splice(i, 1);
    if (gone?.is_master && list[0]) list[list.length - 1]!.is_master = true;
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- search profiles ----
  http.get(`${API}/search-profiles`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({ profiles: searchProfiles(auth.user.id) });
  }),

  http.post(`${API}/search-profiles/from-resume`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const master = resumes(auth.user.id).find((r) => r.is_master);
    if (!master?.parsed) {
      return unprocessable(
        "resume_required",
        "Upload a resume and let it be read before creating a profile from it.",
      );
    }
    const { name } = await readJson<{ name: string }>(request);
    let candidate = name || "From my resume";
    for (let n = 2; searchProfiles(auth.user.id).some((p) => p.name === candidate); n += 1)
      candidate = `${name} (${n})`;
    const res = saveSearchProfile(auth.user.id, {
      name: candidate,
      titles: [master.parsed.headline || "Software Engineer"],
      skills: (master.parsed.skills ?? []).map((s) => ({
        name: s,
        weight: "strong",
        synonyms: [],
        years: null,
      })),
    });
    return res.error ?? HttpResponse.json(res.row, { status: 201 });
  }),

  http.post(`${API}/search-profiles/:id/suggest-titles`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!searchProfiles(auth.user.id).some((p) => p.id === params.id))
      return notFound("search_profile_not_found", "No search profile with this id.");
    return HttpResponse.json({
      titles: ["Backend Engineer", "Platform Engineer", "LLM Engineer"],
      engine: "mock",
    });
  }),

  http.post(`${API}/search-profiles`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const res = saveSearchProfile(auth.user.id, await readJson<SearchProfileIn>(request));
    return res.error ?? HttpResponse.json(res.row, { status: 201 });
  }),

  http.put(`${API}/search-profiles/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const existing = searchProfiles(auth.user.id).find((p) => p.id === params.id);
    if (!existing) return notFound("search_profile_not_found", "No search profile with this id.");
    const res = saveSearchProfile(auth.user.id, await readJson<SearchProfileIn>(request), existing);
    return res.error ?? HttpResponse.json(res.row);
  }),

  http.delete(`${API}/search-profiles/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = searchProfiles(auth.user.id);
    const i = list.findIndex((p) => p.id === params.id);
    if (i < 0) return notFound("search_profile_not_found", "No search profile with this id.");
    const [gone] = list.splice(i, 1);
    if (gone?.is_default && list[0]) list[0].is_default = true;
    f3Db.alerts[auth.user.id] = (f3Db.alerts[auth.user.id] ?? []).filter(
      (a) => a.search_profile_id !== params.id,
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- the user's jobs ----
  http.get(`${API}/jobs`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const state = new URL(request.url).searchParams.get("state") ?? "saved";
    const mine = userJobs(auth.user.id);
    const jobs = Object.entries(mine)
      .filter(([, uj]) => uj.state === state)
      .map(([id]) => f3Db.jobs.get(id))
      .filter((j): j is StreamedJob => Boolean(j))
      .map((j) => userJobOut(auth.user.id, j));
    return HttpResponse.json({ jobs, total: jobs.length });
  }),

  http.post(`${API}/jobs/:id/:action`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const job = f3Db.jobs.get(String(params.id));
    if (!job) return notFound("job_not_found", "No job with this id.");
    const states: Record<string, "saved" | "hidden" | "seen"> = {
      save: "saved",
      hide: "hidden",
      seen: "seen",
    };
    const next = states[String(params.action)];
    if (!next) return notFound("not_found", "Unknown action.");
    if (userJobs(auth.user.id)[job.id]?.state === "applied") {
      return HttpResponse.json(
        {
          detail: {
            code: "job_applied",
            message: "You applied to this job; its state follows the application.",
          },
        },
        { status: 409 },
      );
    }
    setUserJob(auth.user.id, job.id, next);
    return HttpResponse.json(userJobOut(auth.user.id, job));
  }),

  http.post(`${API}/applications/manual`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const { job_id, via } = await readJson<{ job_id: string; via: "manual" | "email" }>(request);
    const status = via === "email" ? "emailed" : "submitted";
    const job = f3Db.jobs.get(String(job_id));
    if (!job) return notFound("job_not_found", "No job with this id.");
    let row = mockDb.applications.find((a) => a.url === job.url);
    if (!row) {
      row = {
        id: newId("app"),
        date: nowIso().slice(0, 10),
        title: job.title,
        company: job.company,
        source: job.source,
        url: job.url,
        status,
        status_source: "manual",
        updated_at: nowIso(),
      };
      mockDb.applications.unshift(row);
    } else {
      Object.assign(row, { status, status_source: "manual", updated_at: nowIso() });
    }
    setUserJob(auth.user.id, job.id, "applied");
    return HttpResponse.json(row, { status: 201 });
  }),

  // ---- alerts ----
  http.get(`${API}/alerts`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({ alerts: f3Db.alerts[auth.user.id] ?? [], max_alerts: MAX_ALERTS });
  }),

  http.post(`${API}/alerts/:id/run-now`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const alert = (f3Db.alerts[auth.user.id] ?? []).find((a) => a.id === params.id);
    if (!alert) return notFound("alert_not_found", "No alert with this id.");
    const jobs = mockDb.sampleJobs.slice(0, 2).map((j, i) => enrich(j, i + 10));
    jobs.forEach((j) => {
      f3Db.jobs.set(j.id, j);
      setUserJob(auth.user.id, j.id, "seen");
    });
    const run: AlertRunOut = {
      id: newId("ar"),
      alert_id: alert.id,
      trigger: "manual",
      status: "done",
      started_at: nowIso(),
      finished_at: nowIso(),
      counts: { kept: jobs.length },
      new_jobs: jobs.length,
      emailed_at: alert.email_digest ? nowIso() : null,
      error: null,
    };
    (f3Db.alertRuns[alert.id] ??= []).unshift(run);
    (run as AlertRunOut & { job_ids?: string[] }).job_ids = jobs.map((j) => j.id);
    alert.last_run_at = nowIso();
    const taskId = crypto.randomUUID();
    return HttpResponse.json(
      {
        task_id: taskId,
        status: "pending",
        created_at: nowIso(),
        updated_at: nowIso(),
        progress: null,
      },
      { status: 202 },
    );
  }),

  http.get(`${API}/alerts/runs/:runId/jobs`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = Object.values(f3Db.alertRuns)
      .flat()
      .find((r) => r.id === params.runId) as (AlertRunOut & { job_ids?: string[] }) | undefined;
    if (!run) return notFound("alert_run_not_found", "No alert run with this id.");
    const jobs = (run.job_ids ?? [])
      .map((id) => f3Db.jobs.get(id))
      .filter((j): j is StreamedJob => Boolean(j));
    return HttpResponse.json({ run, jobs: jobs.map((j) => userJobOut(auth.user.id, j)) });
  }),

  http.get(`${API}/alerts/:id/runs`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!(f3Db.alerts[auth.user.id] ?? []).some((a) => a.id === params.id))
      return notFound("alert_not_found", "No alert with this id.");
    return HttpResponse.json({ runs: f3Db.alertRuns[String(params.id)] ?? [] });
  }),

  http.post(`${API}/alerts`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = (f3Db.alerts[auth.user.id] ??= []);
    if (list.length >= MAX_ALERTS) {
      return HttpResponse.json(
        {
          detail: {
            code: "alert_limit",
            message: `You can keep up to ${MAX_ALERTS} alerts. Delete one first.`,
          },
        },
        { status: 409 },
      );
    }
    const body = await readJson<AlertIn>(request);
    if (!searchProfiles(auth.user.id).some((p) => p.id === body.search_profile_id)) {
      return unprocessable("search_profile_not_found", "Pick one of your saved search profiles.");
    }
    const alert: AlertOut = {
      id: newId("al"),
      name: body.name ?? "Alert",
      search_profile_id: body.search_profile_id!,
      hour_local: body.hour_local ?? 9,
      timezone: body.timezone ?? "Asia/Kolkata",
      min_score: body.min_score ?? 75,
      email_digest: body.email_digest ?? true,
      enabled: body.enabled ?? true,
      last_run_at: null,
      next_run_at: null,
      created_at: nowIso(),
    };
    alert.next_run_at = alert.enabled ? nextRun(alert.hour_local ?? 9) : null;
    list.push(alert);
    return HttpResponse.json(alert, { status: 201 });
  }),

  http.put(`${API}/alerts/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const alert = (f3Db.alerts[auth.user.id] ?? []).find((a) => a.id === params.id);
    if (!alert) return notFound("alert_not_found", "No alert with this id.");
    Object.assign(alert, await readJson<AlertIn>(request));
    alert.next_run_at = alert.enabled ? nextRun(alert.hour_local ?? 9) : null;
    return HttpResponse.json(alert);
  }),

  http.delete(`${API}/alerts/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = f3Db.alerts[auth.user.id] ?? [];
    const i = list.findIndex((a) => a.id === params.id);
    if (i < 0) return notFound("alert_not_found", "No alert with this id.");
    list.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
