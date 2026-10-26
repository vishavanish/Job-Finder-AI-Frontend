/**
 * MSW handlers for the F4 screens, mirroring backend P4a / P4b: /apply/runs
 * (a scripted run that moves on each poll), /apply/prep, /apply/options,
 * /apply/settings, /answer-bank and the authenticated file/screenshot
 * downloads. State lives in mocks/f4State.ts.
 */
import { http, HttpResponse } from "msw";
import type { ApplyRun, ApplySettingsIn, SavedAnswer } from "../lib/api/types";
import { entitlementsFor } from "./data";
import { f3Db, setUserJob } from "./f3State";
import {
  RISK_NOTICE,
  advance,
  answersFor,
  f4Db,
  packFor,
  settingsFor,
  settingsOut,
  type MockPack,
  type MockRun,
} from "./f4State";
import { API, authenticate, newId, readJson } from "./handlers";

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status });
const nowIso = () => new Date().toISOString();
const WAITING = ["awaiting_input", "awaiting_review", "needs_user"];
const ACTIVE = ["queued", "preparing", "awaiting_input", "awaiting_review", "submitting"];

/** A 1×1 PNG, standing in for a confirmation screenshot. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function maxLevel(userId: string): number {
  return entitlementsFor(userId).auto_apply?.max_level ?? 1;
}

function runOut(run: MockRun): ApplyRun {
  const { user_id: _u, polls: _p, stage: _s, ...out } = run;
  return out;
}

function ownRun(userId: string, id: string): MockRun | undefined {
  const run = f4Db.runs.get(id);
  return run && run.user_id === userId ? run : undefined;
}

export const f4Handlers = [
  // ---- settings ----
  http.get(`${API}/apply/settings`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(settingsOut(auth.user.id, maxLevel(auth.user.id)));
  }),

  http.put(`${API}/apply/settings`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<ApplySettingsIn>(request);
    const s = settingsFor(auth.user.id);
    if (body.accept_risk_notice === true && !s.risk_accepted_at) s.risk_accepted_at = nowIso();
    if (body.accept_risk_notice === false) s.risk_accepted_at = null;
    if (body.level != null) {
      if (body.level >= 2 && maxLevel(auth.user.id) < 2) {
        return fail(
          403,
          "level_not_allowed",
          "Your account allows level 1 (Assist) only. Ask an admin to allow level 2.",
        );
      }
      if (body.level >= 2 && !s.risk_accepted_at) {
        return fail(
          409,
          "risk_notice_required",
          "Accept the auto-apply risk notice before turning on level 2.",
        );
      }
      s.level = body.level;
    }
    if (body.hours_start != null) s.hours_start = body.hours_start;
    if (body.hours_end != null) s.hours_end = body.hours_end;
    if (body.timezone) s.timezone = body.timezone;
    if (body.allow_generic != null) {
      s.allow_generic = body.allow_generic;
      if (!body.allow_generic) {
        for (const r of f4Db.runs.values()) {
          if (r.user_id === auth.user.id && r.adapter === "generic" && ACTIVE.includes(r.state)) {
            Object.assign(r, {
              state: "cancelled",
              message: "You turned off the AI form reader.",
              updated_at: nowIso(),
            });
          }
        }
      }
    }
    if (s.hours_start >= s.hours_end)
      return fail(422, "bad_hours", "Apply hours must start before they end.");
    if (body.paused != null) {
      s.paused = body.paused;
      if (body.paused) {
        for (const r of f4Db.runs.values()) {
          if (r.user_id === auth.user.id && ACTIVE.includes(r.state)) {
            Object.assign(r, {
              state: "cancelled",
              message: "You paused auto apply.",
              updated_at: nowIso(),
            });
          }
        }
      }
    }
    return HttpResponse.json(settingsOut(auth.user.id, maxLevel(auth.user.id)));
  }),

  // ---- runs ----
  http.post(`${API}/apply/runs`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const { job_id, mode = "auto" } = await readJson<{ job_id: string; mode: "auto" | "fast" }>(
      request,
    );
    const job = f3Db.jobs.get(String(job_id));
    if (!job) return fail(404, "job_not_found", "No job with this id.");
    const s = settingsFor(auth.user.id);
    if (s.paused)
      return fail(409, "apply_paused", "You paused auto apply. Turn it back on in Apply settings.");
    const opts = job.apply_options;
    if (mode === "auto") {
      if (!opts?.auto.available) {
        return fail(
          409,
          "auto_not_supported",
          opts?.auto.reason ?? "Auto apply doesn't support this job.",
        );
      }
      if (maxLevel(auth.user.id) < 2) {
        return fail(
          403,
          "level_not_allowed",
          "Your account allows level 1 (Assist) only. Ask an admin to allow level 2.",
        );
      }
      if (!s.risk_accepted_at)
        return fail(
          409,
          "risk_notice_required",
          "Accept the auto-apply risk notice in Apply settings first.",
        );
      if (s.level < 2)
        return fail(409, "level_off", "Turn on level 2 (review & submit) in Apply settings first.");
      if (opts.adapter === "generic" && !s.allow_generic)
        return fail(
          409,
          "generic_off",
          "This job uses the AI form reader (beta). Turn it on in Apply settings first.",
        );
      const genericToday = [...f4Db.runs.values()].filter(
        (r) => r.user_id === auth.user.id && r.adapter === "generic" && r.state === "submitted",
      ).length;
      if (opts.adapter === "generic" && genericToday >= 5)
        return fail(429, "generic_cap", "AI form reader limit reached for today (5/day).");
    } else if (!opts?.fast.available) {
      return fail(
        409,
        "fast_not_supported",
        opts?.fast.reason ?? "Fast apply doesn't support this job.",
      );
    }
    const active = [...f4Db.runs.values()].find(
      (r) => r.user_id === auth.user.id && r.job_id === job.id && ACTIVE.includes(r.state),
    );
    if (active) return fail(409, "run_active", "This job already has an apply run in progress.");
    const now = nowIso();
    const run: MockRun = {
      id: newId("run"),
      user_id: auth.user.id,
      polls: 0,
      job_id: job.id,
      title: job.title,
      company: job.company,
      mode,
      level: mode === "auto" ? 2 : 1,
      adapter: opts?.adapter ?? "linkedin",
      apply_url: job.apply_url ?? job.url,
      state: "queued",
      message: "Waiting for a browser on the apply worker.",
      fields: [],
      files: {},
      resume_id: null,
      pack_id: null,
      application_id: null,
      proofs: 0,
      steps: [],
      vision: null,
      approved_at: null,
      submitted_at: null,
      created_at: now,
      updated_at: now,
    };
    f4Db.runs.set(run.id, run);
    return HttpResponse.json(runOut(run), { status: 202 });
  }),

  http.get(`${API}/apply/runs`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const jobId = url.searchParams.get("job_id");
    const runs = [...f4Db.runs.values()]
      .filter((r) => r.user_id === auth.user.id)
      .filter((r) => !jobId || r.job_id === jobId)
      .filter(
        (r) => !state || (state === "waiting" ? WAITING.includes(r.state) : r.state === state),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return HttpResponse.json({ runs: runs.map(runOut), total: runs.length });
  }),

  http.get(`${API}/apply/runs/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    advance(run);
    return HttpResponse.json(runOut(run));
  }),

  http.post(`${API}/apply/runs/:id/answer`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    if (!["awaiting_input", "awaiting_review"].includes(run.state)) {
      return fail(409, "run_not_waiting", "This run is not waiting for answers.");
    }
    const { answers = {} } = await readJson<{ answers: Record<string, string> }>(request);
    const fields = run.fields ?? [];
    for (const [key, value] of Object.entries(answers)) {
      const f = fields.find((x) => x.key === key);
      if (!f) return fail(422, "unknown_field", `Unknown field(s): ${key}`);
      const options = f.options ?? [];
      if (options.length && value && !options.includes(value)) {
        return fail(422, "bad_option", `'${f.label}' must be one of: ${options.join(", ")}`);
      }
      Object.assign(f, {
        value: value || null,
        source: "user",
        approved: true,
        needs_input: f.required && !value,
      });
    }
    const missing = fields.filter((f) => f.needs_input);
    if (!missing.length && run.adapter === "generic" && run.stage === 1) {
      // A multi-page form stopped at a question: the worker reads the rest now.
      Object.assign(run, {
        state: "queued",
        message: "Your answers are saved — reading the next page of the form.",
        polls: 1,
        updated_at: nowIso(),
      });
      return HttpResponse.json(runOut(run));
    }
    Object.assign(run, {
      state: missing.length ? "awaiting_input" : "awaiting_review",
      message: missing.length
        ? `${missing.length} required question(s) need your answer.`
        : "Ready for your review. 1 answer(s) were drafted by AI — check them.",
      updated_at: nowIso(),
    });
    return HttpResponse.json(runOut(run));
  }),

  http.post(`${API}/apply/runs/:id/approve`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    if (run.state !== "awaiting_review")
      return fail(409, "run_not_ready", "This run is not waiting for your review.");
    if (run.adapter === "generic" && !f4Db.genericSubmit)
      return fail(
        409,
        "generic_test_mode",
        "The AI form reader is in test mode — submit this application yourself on the job page, then mark it done.",
      );
    for (const f of run.fields ?? []) if (f.source === "ai") f.approved = true;
    Object.assign(run, {
      state: "submitting",
      message: "Approved — submitting shortly.",
      approved_at: nowIso(),
      polls: 1,
      updated_at: nowIso(),
    });
    return HttpResponse.json(runOut(run));
  }),

  http.post(`${API}/apply/runs/:id/cancel`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    if (!ACTIVE.includes(run.state))
      return fail(409, "run_finished", "This run has already finished.");
    Object.assign(run, { state: "cancelled", message: "Cancelled by you.", updated_at: nowIso() });
    return HttpResponse.json(runOut(run));
  }),

  http.post(`${API}/apply/runs/:id/done`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    if (!WAITING.includes(run.state))
      return fail(409, "run_not_waiting", "This run is not waiting for you.");
    const { submitted = true } = await readJson<{ submitted: boolean }>(request);
    if (submitted) {
      Object.assign(run, {
        state: "done",
        message: "You submitted this application yourself.",
        submitted_at: nowIso(),
      });
      setUserJob(auth.user.id, run.job_id, "applied");
    } else {
      Object.assign(run, { state: "cancelled", message: "You didn't submit this application." });
    }
    run.updated_at = nowIso();
    return HttpResponse.json(runOut(run));
  }),

  http.get(`${API}/apply/runs/:id/proofs`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = ownRun(auth.user.id, String(params.id));
    if (!run) return fail(404, "run_not_found", "No apply run with this id.");
    if (!run.proofs) return HttpResponse.json([]);
    if (run.adapter === "generic") {
      const pages = (run.steps ?? []).map((st, i) => ({
        id: `proof_${run.id}_p${i + 1}`,
        kind: "step",
        confirmation_text: `Page ${(st as { page: number }).page}`,
        page_url: (st as { url: string }).url,
        created_at: run.updated_at,
      }));
      const end =
        run.state === "submitted"
          ? [
              {
                id: `proof_${run.id}`,
                kind: "confirmation",
                confirmation_text: "Thank you for applying.",
                page_url: run.apply_url,
                created_at: run.updated_at,
              },
            ]
          : [];
      return HttpResponse.json([...pages, ...end]);
    }
    return HttpResponse.json([
      {
        id: `proof_${run.id}`,
        kind: run.state === "submitted" ? "confirmation" : "stopped",
        confirmation_text: run.state === "submitted" ? "Thank you for applying." : null,
        page_url: run.apply_url,
        created_at: run.updated_at,
      },
    ]);
  }),

  http.get(`${API}/apply/runs/:id/proofs/:proofId`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!ownRun(auth.user.id, String(params.id)))
      return fail(404, "run_not_found", "No apply run with this id.");
    return new HttpResponse(PNG, { headers: { "Content-Type": "image/png" } });
  }),

  // ---- options and prep pack ----
  http.get(`${API}/apply/options/:jobId`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const job = f3Db.jobs.get(String(params.jobId));
    if (!job?.apply_options) return fail(404, "job_not_found", "No job with this id.");
    return HttpResponse.json(job.apply_options);
  }),

  http.post(`${API}/apply/prep`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const { job_id, regenerate } = await readJson<{ job_id: string; regenerate: boolean }>(request);
    const job = f3Db.jobs.get(String(job_id));
    if (!job) return fail(404, "job_not_found", "No job with this id.");
    const hasResume = (f3Db.resumes[auth.user.id] ?? []).some((r) => r.is_master);
    if (!hasResume) return fail(422, "resume_required", "Upload a resume in Profile first.");
    let pack = [...f4Db.packs.values()].find(
      (p) => p.user_id === auth.user.id && p.job_id === job.id,
    );
    if (pack && pack.status === "ready" && !regenerate) return HttpResponse.json(pack);
    if (!pack) {
      pack = {
        id: newId("pack"),
        user_id: auth.user.id,
        job_id: job.id,
        polls: 1,
        status: "pending",
        tailored_resume_id: null,
        cover_letter: null,
        email_to: null,
        email_subject: null,
        email_body: null,
        mailto: null,
        dropped: [],
        error: null,
        updated_at: nowIso(),
      } as MockPack;
      f4Db.packs.set(pack.id, pack);
    } else {
      Object.assign(pack, { status: "pending", polls: 1, updated_at: nowIso() });
    }
    return HttpResponse.json(pack, { status: 202 });
  }),

  http.get(`${API}/apply/prep/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const pack = f4Db.packs.get(String(params.id));
    if (!pack || pack.user_id !== auth.user.id)
      return fail(404, "pack_not_found", "No prep pack with this id.");
    if (pack.status === "pending") packFor(pack, f3Db.jobs.get(pack.job_id));
    const { user_id: _u, polls: _p, ...out } = pack;
    return HttpResponse.json(out);
  }),

  http.get(`${API}/resumes/:id/file`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  }),

  // ---- answer bank ----
  http.get(`${API}/answer-bank`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = answersFor(auth.user.id);
    return HttpResponse.json({ answers: list, total: list.length });
  }),

  http.post(`${API}/answer-bank`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<{ question: string; answer: string; field_type: string }>(request);
    const list = answersFor(auth.user.id);
    const question = String(body.question ?? "").trim();
    let row = list.find((a) => a.question.toLowerCase() === question.toLowerCase());
    if (!row) {
      row = {
        id: newId("ans"),
        question,
        answer: "",
        field_type: body.field_type ?? "text",
        approved: true,
        origin: "user",
        uses: 0,
        last_used_at: null,
        updated_at: nowIso(),
      } satisfies SavedAnswer;
      list.unshift(row);
    }
    Object.assign(row, {
      answer: body.answer ?? "",
      approved: true,
      origin: "user",
      updated_at: nowIso(),
    });
    return HttpResponse.json(row, { status: 201 });
  }),

  http.put(`${API}/answer-bank/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = answersFor(auth.user.id).find((a) => a.id === params.id);
    if (!row) return fail(404, "answer_not_found", "No saved answer with this id.");
    const body = await readJson<{ answer: string; approved: boolean }>(request);
    if (body.answer != null)
      Object.assign(row, { answer: body.answer, approved: body.approved ?? true });
    else if (body.approved != null) row.approved = body.approved;
    row.updated_at = nowIso();
    return HttpResponse.json(row);
  }),

  http.post(`${API}/answer-bank/:id/approve`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = answersFor(auth.user.id).find((a) => a.id === params.id);
    if (!row) return fail(404, "answer_not_found", "No saved answer with this id.");
    Object.assign(row, { approved: true, updated_at: nowIso() });
    return HttpResponse.json(row);
  }),

  http.delete(`${API}/answer-bank/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = answersFor(auth.user.id);
    const i = list.findIndex((a) => a.id === params.id);
    if (i < 0) return fail(404, "answer_not_found", "No saved answer with this id.");
    list.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

export { RISK_NOTICE };
