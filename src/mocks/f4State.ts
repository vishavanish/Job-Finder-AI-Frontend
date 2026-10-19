/**
 * In-memory state for the F4 mocks (backend P4a / P4b): apply runs (a
 * scripted run that moves on each poll), prep packs, the answer bank and
 * apply settings. Also what the backend adds to every job: `apply_url` and
 * `apply_options`. Reset between tests.
 */
import type {
  ApplyOptions,
  ApplyRun,
  ApplyRunField,
  ApplySettings,
  PrepPack,
  SavedAnswer,
  StreamedJob,
} from "../lib/api/types";

export const RISK_NOTICE =
  "Auto apply fills and submits applications on company career sites (Greenhouse, Lever) for you, only after " +
  "you review and approve each one. Some sites limit automated applications, answers can still be wrong, and a " +
  "submitted application can't be taken back. You stay responsible for every application sent in your name. " +
  "LinkedIn applications are never submitted by the app.";

export interface MockRun extends ApplyRun {
  user_id: string;
  /** Polls left before the run moves to its next state. */
  polls: number;
}

export interface MockPack extends PrepPack {
  user_id: string;
  polls: number;
}

export interface MockSettings {
  level: number;
  risk_accepted_at: string | null;
  hours_start: number;
  hours_end: number;
  timezone: string;
  paused: boolean;
}

export const f4Db = {
  runs: new Map<string, MockRun>(),
  packs: new Map<string, MockPack>(),
  answers: {} as Record<string, SavedAnswer[]>,
  settings: {} as Record<string, MockSettings>,
  /** Auto submits so far today, per user. */
  submittedToday: {} as Record<string, number>,
};

export function resetF4Mock(): void {
  f4Db.runs.clear();
  f4Db.packs.clear();
  f4Db.answers = {};
  f4Db.settings = {};
  f4Db.submittedToday = {};
}

export function settingsFor(userId: string): MockSettings {
  f4Db.settings[userId] ??= {
    level: 1,
    risk_accepted_at: null,
    hours_start: 8,
    hours_end: 22,
    timezone: "Asia/Kolkata",
    paused: false,
  };
  return f4Db.settings[userId];
}

export const CAPS = {
  auto_per_day: 20,
  per_platform_per_day: 15,
  fast_per_day: 25,
  company_cooldown_days: 30,
};

export function settingsOut(userId: string, maxLevel: number): ApplySettings {
  const s = settingsFor(userId);
  const runs = [...f4Db.runs.values()].filter((r) => r.user_id === userId);
  const byPlatform: Record<string, number> = {};
  for (const r of runs) {
    if (r.mode === "auto" && r.state === "submitted")
      byPlatform[r.adapter] = (byPlatform[r.adapter] ?? 0) + 1;
  }
  return {
    ...s,
    max_level: maxLevel,
    risk_notice: RISK_NOTICE,
    usage_today: {
      auto_submitted: Object.values(byPlatform).reduce((a, b) => a + b, 0),
      by_platform: byPlatform,
      fast: runs.filter((r) => r.mode === "fast").length,
    },
    caps: CAPS,
  };
}

export function answersFor(userId: string): SavedAnswer[] {
  f4Db.answers[userId] ??= [
    {
      id: "ans_seed_1",
      question: "Are you legally authorized to work in India?",
      answer: "Yes",
      field_type: "select",
      approved: true,
      origin: "user",
      uses: 3,
      last_used_at: "2026-10-18T10:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
    },
    {
      id: "ans_seed_2",
      question: "How many years of Python experience do you have?",
      answer: "3",
      field_type: "number",
      approved: false,
      origin: "ai",
      uses: 0,
      last_used_at: null,
      updated_at: "2026-10-18T11:00:00Z",
    },
  ];
  return f4Db.answers[userId];
}

// ---------------------------------------------------------------- what every job gets

type JobKind = "easy" | "greenhouse" | "lever" | "email" | "site";
const KINDS: JobKind[] = ["easy", "greenhouse", "lever", "email", "site"];
const on = { available: true, reason: null };
const off = (reason: string) => ({ available: false, reason });
const MANUAL_ONLY_AUTO = "Auto apply works on Greenhouse and Lever job pages only.";
const FAST_ONLY_LINKEDIN = "Fast apply works on LinkedIn Easy Apply jobs.";
const NO_EMAIL = "This job post gives no email address to apply to.";

/** The backend's apply_url + apply_options for the i-th sample job, cycling through every kind. */
export function applyFields(
  job: Pick<StreamedJob, "company" | "description">,
  i: number,
): Pick<StreamedJob, "apply_url" | "apply_options" | "description"> {
  const kind = KINDS[i % KINDS.length] ?? "site";
  const slug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const email = `careers@${slug}.example`;
  const options: Record<JobKind, ApplyOptions> = {
    easy: {
      adapter: "linkedin",
      manual: on,
      fast: on,
      auto: off("LinkedIn jobs are never submitted automatically — use Fast apply."),
      email: off(NO_EMAIL),
      email_to: null,
    },
    greenhouse: {
      adapter: "greenhouse",
      manual: on,
      fast: off(FAST_ONLY_LINKEDIN),
      auto: on,
      email: off(NO_EMAIL),
      email_to: null,
    },
    lever: {
      adapter: "lever",
      manual: on,
      fast: off(FAST_ONLY_LINKEDIN),
      auto: on,
      email: off(NO_EMAIL),
      email_to: null,
    },
    email: {
      adapter: null,
      manual: on,
      fast: off(FAST_ONLY_LINKEDIN),
      auto: off(MANUAL_ONLY_AUTO),
      email: on,
      email_to: email,
    },
    site: {
      adapter: null,
      manual: on,
      fast: off(FAST_ONLY_LINKEDIN),
      auto: off(MANUAL_ONLY_AUTO),
      email: off(NO_EMAIL),
      email_to: null,
    },
  };
  const applyUrl: Record<JobKind, string | null> = {
    easy: null,
    greenhouse: `https://job-boards.greenhouse.io/${slug}/jobs/${1000 + i}`,
    lever: `https://jobs.lever.co/${slug}/${1000 + i}`,
    email: null,
    site: `https://careers.${slug}.example/jobs/${1000 + i}`,
  };
  return {
    apply_url: applyUrl[kind],
    apply_options: options[kind],
    description:
      kind === "email" ? `${job.description} Send your CV to ${email} to apply.` : job.description,
  };
}

// ---------------------------------------------------------------- the scripted run

export function formFields(): ApplyRunField[] {
  return [
    {
      key: "first_name",
      label: "First Name *",
      type: "text",
      options: [],
      required: true,
      value: "Dev",
      source: "profile",
      approved: true,
      needs_input: false,
    },
    {
      key: "email",
      label: "Email *",
      type: "text",
      options: [],
      required: true,
      value: "demo@jobfinder.test",
      source: "profile",
      approved: true,
      needs_input: false,
    },
    {
      key: "q_auth",
      label: "Are you legally authorized to work in India? *",
      type: "select",
      options: ["Yes", "No"],
      required: true,
      value: "Yes",
      source: "answer_bank",
      approved: true,
      needs_input: false,
    },
    {
      key: "q_years",
      label: "Years of Python experience *",
      type: "number",
      options: [],
      required: true,
      value: "3",
      source: "ai",
      approved: false,
      needs_input: false,
    },
    {
      key: "q_why",
      label: "Why do you want to join us? *",
      type: "textarea",
      options: [],
      required: true,
      value: null,
      source: "none",
      approved: false,
      needs_input: true,
    },
    {
      key: "gender",
      label: "Gender",
      type: "select",
      options: ["Male", "Female", "Decline To Self Identify"],
      required: false,
      value: "Decline To Self Identify",
      source: "eeo",
      approved: true,
      needs_input: false,
    },
  ];
}

/** One step of the script per poll: queued → preparing → awaiting_input (auto) / needs_user (fast); submitting → submitted. */
export function advance(run: MockRun): void {
  if (run.polls > 0) {
    run.polls -= 1;
    return;
  }
  const now = new Date().toISOString();
  if (run.state === "queued") {
    Object.assign(run, {
      state: "preparing",
      message: "Reading the application form.",
      polls: 1,
      updated_at: now,
    });
  } else if (run.state === "preparing") {
    if (run.mode === "fast") {
      Object.assign(run, {
        state: "needs_user",
        message:
          "Check the answers in the LinkedIn window and click Submit yourself, then mark it done.",
        fields: formFields().slice(0, 2),
        updated_at: now,
      });
    } else {
      Object.assign(run, {
        state: "awaiting_input",
        message: "1 required question(s) need your answer: Why do you want to join us? *",
        fields: formFields(),
        files: { resume: "resume", cover_letter: "cover_letter" },
        resume_id: "res_tailored_1",
        updated_at: now,
      });
    }
  } else if (run.state === "submitting") {
    f4Db.submittedToday[run.user_id] = (f4Db.submittedToday[run.user_id] ?? 0) + 1;
    Object.assign(run, {
      state: "submitted",
      message: "Submitted. Thank you for applying — your application has been received.",
      submitted_at: now,
      proofs: 1,
      updated_at: now,
    });
  }
}

export function packFor(pack: MockPack, job: StreamedJob | undefined): void {
  if (pack.polls > 0) {
    pack.polls -= 1;
    return;
  }
  const email = job?.apply_options?.email_to ?? null;
  const letter =
    "Dear Hiring Team,\n\nI am applying for the " +
    (job?.title ?? "role") +
    " role. I have built Python and FastAPI services for three years and enjoy owning backend systems end to end.\n\n" +
    "At Acme Labs I built FastAPI services and LLM features that went to production.\n\n" +
    "Thank you for considering my application.\n\nBest regards,\nDev Demo";
  Object.assign(pack, {
    status: "ready",
    tailored_resume_id: "res_tailored_1",
    cover_letter: letter,
    email_to: email,
    email_subject: `Application for ${job?.title ?? "the role"} — Dev Demo`,
    email_body: `${letter}\n+91 90000 00000\ndemo@jobfinder.test`,
    mailto: email
      ? `mailto:${email}?subject=${encodeURIComponent(`Application for ${job?.title ?? "the role"} — Dev Demo`)}`
      : null,
    dropped: [
      "Skill not in your resume: Kubernetes",
      'Cover letter: "I led a team of 12 engineers."',
    ],
    updated_at: new Date().toISOString(),
  });
}
