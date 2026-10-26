/**
 * Job preferences, applicant info (with relocation) and optional EEO answers
 * (spec §6.7, backend P3.2). Each section has its own explicit Save button —
 * nothing saves on blur (audit B9).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChipInput } from "../../components/ChipInput";
import { errorMessage } from "../../lib/api/errors";
import type {
  ApplicantInfoIn,
  EeoAnswers,
  PreferencesIn,
  PreferencesOut,
  ProfileOut,
} from "../../lib/api/types";
import { profileBody, profileKeys, putPreferences, putProfile } from "./profileApi";

const WORK_MODES = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;
const JOB_TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
] as const;
const POSTED_WITHIN = [
  [24, "Last 24 hours"],
  [72, "Last 3 days"],
  [168, "Last week"],
  [336, "Last 2 weeks"],
  [720, "Last 30 days"],
] as const;

function SaveRow({ pending, saved, error }: { pending: boolean; saved: boolean; error: unknown }) {
  return (
    <div className="form-actions">
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      {saved && !pending && (
        <span className="flash-ok" role="status">
          Saved
        </span>
      )}
      {Boolean(error) && (
        <span className="login-error" role="alert">
          {errorMessage(error, "Couldn't save. Try again.")}
        </span>
      )}
    </div>
  );
}

function useSave<T>(fn: (body: T) => Promise<unknown>, key: readonly unknown[]) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const m = useMutation({
    mutationFn: fn,
    onMutate: () => setSaved(false),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setSaved(true);
    },
  });
  return { ...m, saved };
}

/** Sections save the whole profile, so each one builds on what another section just saved. */
function useLatestProfile(initial: ProfileOut): () => ProfileOut {
  const qc = useQueryClient();
  return () => qc.getQueryData<ProfileOut>(profileKeys.profile) ?? initial;
}

function toggle<T extends string>(list: T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

// ---------------------------------------------------------------- preferences

export function PreferencesSection({ initial }: { initial: PreferencesOut }) {
  const id = useId();
  const [p, setP] = useState<PreferencesIn>({ ...initial });
  const save = useSave(putPreferences, profileKeys.preferences);
  const set = (patch: Partial<PreferencesIn>) => setP((prev) => ({ ...prev, ...patch }));
  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>What you're looking for</h3>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate(p);
        }}
      >
        <ChipInput
          label="Job titles"
          values={p.titles ?? []}
          onChange={(titles) => set({ titles })}
          hint="Used when a search profile has no titles of its own."
        />
        <ChipInput
          label="Locations"
          values={p.locations ?? []}
          onChange={(locations) => set({ locations })}
          placeholder="e.g. Pune, India or Remote"
        />
        <fieldset className="check-row">
          <legend>Work mode</legend>
          {WORK_MODES.map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={(p.work_modes ?? []).includes(value)}
                onChange={(e) =>
                  set({ work_modes: toggle(p.work_modes ?? [], value, e.target.checked) })
                }
              />
              {label}
            </label>
          ))}
          <p className="field-hint">
            Remote turns on the remote job feeds (RemoteOK, Remotive, HN and more).
          </p>
        </fieldset>
        <fieldset className="check-row">
          <legend>Job type</legend>
          {JOB_TYPES.map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={(p.job_types ?? []).includes(value)}
                onChange={(e) =>
                  set({ job_types: toggle(p.job_types ?? [], value, e.target.checked) })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label className="field">
            <span>Posted within</span>
            <select
              value={p.posted_within_hours ?? ""}
              onChange={(e) => set({ posted_within_hours: num(e.target.value) })}
            >
              <option value="">Use the search default</option>
              {POSTED_WITHIN.map(([h, label]) => (
                <option key={h} value={h}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Minimum salary</span>
            <input
              type="number"
              min={0}
              value={p.salary_min ?? ""}
              onChange={(e) => set({ salary_min: num(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Maximum salary</span>
            <input
              type="number"
              min={0}
              value={p.salary_max ?? ""}
              onChange={(e) => set({ salary_max: num(e.target.value) })}
            />
          </label>
          <label className="field narrow">
            <span>Currency</span>
            <input
              value={p.salary_currency ?? ""}
              maxLength={3}
              placeholder="INR"
              onChange={(e) => set({ salary_currency: e.target.value.toUpperCase() || null })}
            />
          </label>
          <label className="field">
            <span>Notice period (days)</span>
            <input
              type="number"
              min={0}
              max={365}
              value={p.notice_period_days ?? ""}
              onChange={(e) => set({ notice_period_days: num(e.target.value) })}
            />
          </label>
        </div>
        <ChipInput
          label="Companies to avoid"
          values={p.avoid_companies ?? []}
          onChange={(avoid_companies) => set({ avoid_companies })}
          hint="Jobs from these companies are dropped before scoring."
        />
        <ChipInput
          label="Industries"
          values={p.industries ?? []}
          onChange={(industries) => set({ industries })}
        />
        <SaveRow pending={save.isPending} saved={save.saved} error={save.error} />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- applicant info

const TEXT_FIELDS: [keyof ApplicantInfoIn, string, string?][] = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email", "Email", "email"],
  ["phone", "Phone", "tel"],
  ["city", "City"],
  ["country", "Country"],
  ["linkedin_url", "LinkedIn URL", "url"],
  ["github_url", "GitHub URL", "url"],
  ["portfolio_url", "Portfolio URL", "url"],
  ["current_ctc", "Current CTC"],
  ["expected_ctc", "Expected CTC"],
];

export function ApplicantSection({ profile }: { profile: ProfileOut }) {
  const id = useId();
  const [a, setA] = useState<ApplicantInfoIn>({ ...(profile.applicant_info ?? {}) });
  const latest = useLatestProfile(profile);
  const save = useSave(
    (info: ApplicantInfoIn) => putProfile(profileBody(latest(), { applicant_info: info })),
    profileKeys.profile,
  );
  const set = (patch: Partial<ApplicantInfoIn>) => setA((prev) => ({ ...prev, ...patch }));

  // The server fills empty fields from the resume after a parse (QA2 §3): take those values into
  // fields that are still empty here, never over what was typed.
  const server = profile.applicant_info;
  const seen = useRef<Record<string, unknown>>({ ...(server ?? {}) });
  useEffect(() => {
    if (!server) return;
    const before = seen.current;
    seen.current = { ...server };
    setA((prev) => {
      const next: Record<string, unknown> = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(server)) {
        const mine = next[k];
        const fresh = before[k] !== v; // only values the server just set, not ones the user cleared
        if (
          fresh &&
          (mine === undefined || mine === null || mine === "") &&
          v !== null &&
          v !== ""
        ) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? (next as ApplicantInfoIn) : prev;
    });
  }, [server]);

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Applicant info</h3>
      <p className="field-hint">Used word for word when apply forms are filled in for you.</p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate(a);
        }}
      >
        <div className="form-grid">
          {TEXT_FIELDS.map(([field, label, type]) => (
            <label key={field} className="field">
              <span>{label}</span>
              <input
                type={type ?? "text"}
                value={(a[field] as string | undefined) ?? ""}
                onChange={(e) => set({ [field]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span>Notice period (days)</span>
            <input
              type="number"
              min={0}
              max={365}
              value={a.notice_period_days ?? ""}
              onChange={(e) =>
                set({ notice_period_days: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>Years of experience</span>
            <input
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={a.total_experience_years ?? ""}
              onChange={(e) =>
                set({
                  total_experience_years: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="field">
            <span>Willing to relocate</span>
            <select
              value={a.willing_to_relocate ?? ""}
              onChange={(e) =>
                set({
                  willing_to_relocate: (e.target.value ||
                    null) as ApplicantInfoIn["willing_to_relocate"],
                })
              }
            >
              <option value="">Not answered</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="depends">Depends on the role</option>
            </select>
          </label>
          <label className="field">
            <span>Need visa sponsorship</span>
            <select
              value={
                a.requires_sponsorship === null || a.requires_sponsorship === undefined
                  ? ""
                  : String(a.requires_sponsorship)
              }
              onChange={(e) =>
                set({
                  requires_sponsorship: e.target.value === "" ? null : e.target.value === "true",
                })
              }
            >
              <option value="">Not answered</option>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
        </div>
        <ChipInput
          label="Cities you'd move to"
          values={a.relocation_locations ?? []}
          onChange={(relocation_locations) => set({ relocation_locations })}
          max={20}
        />
        <SaveRow pending={save.isPending} saved={save.saved} error={save.error} />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- EEO

const PREFER_NOT = "prefer_not_to_say";
const EEO_FIELDS: [keyof EeoAnswers, string, string[]][] = [
  ["gender", "Gender", ["woman", "man", "non_binary", "self_describe"]],
  ["ethnicity", "Ethnicity", []],
  ["veteran_status", "Veteran status", ["not_a_veteran", "veteran"]],
  ["disability_status", "Disability", ["no_disability", "has_disability"]],
  ["pronouns", "Pronouns", []],
];

function pretty(v: string): string {
  return v === PREFER_NOT
    ? "Prefer not to say"
    : (v.charAt(0).toUpperCase() + v.slice(1)).replace(/_/g, " ");
}

export function EeoSection({ profile }: { profile: ProfileOut }) {
  const id = useId();
  const [e, setE] = useState<EeoAnswers>({ ...(profile.eeo ?? {}) } as EeoAnswers);
  const latest = useLatestProfile(profile);
  const save = useSave(
    (eeo: EeoAnswers) => putProfile(profileBody(latest(), { eeo })),
    profileKeys.profile,
  );

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Optional diversity answers</h3>
      <p className="field-hint" id={`${id}-d`}>
        Some employers ask these. Every answer is optional and starts as "Prefer not to say".
        They're stored encrypted, only used to answer those optional questions, and never sent to an
        AI model.
      </p>
      <form
        aria-describedby={`${id}-d`}
        onSubmit={(ev: FormEvent) => {
          ev.preventDefault();
          save.mutate(e);
        }}
      >
        <div className="form-grid">
          {EEO_FIELDS.map(([field, label, options]) => (
            <label key={field} className="field">
              <span>{label}</span>
              {options.length ? (
                <select
                  value={e[field] ?? PREFER_NOT}
                  onChange={(ev) => setE({ ...e, [field]: ev.target.value })}
                >
                  {[PREFER_NOT, ...options].map((o) => (
                    <option key={o} value={o}>
                      {pretty(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={e[field] === PREFER_NOT ? "" : (e[field] ?? "")}
                  placeholder="Prefer not to say"
                  maxLength={field === "pronouns" ? 50 : 100}
                  onChange={(ev) => setE({ ...e, [field]: ev.target.value || PREFER_NOT })}
                />
              )}
            </label>
          ))}
        </div>
        <SaveRow pending={save.isPending} saved={save.saved} error={save.error} />
      </form>
    </section>
  );
}
