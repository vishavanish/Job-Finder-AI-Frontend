/**
 * Keywords & Skills — one combined editor (spec §6.9). Named search profiles
 * with weighted skills (synonyms, years), target titles with "Suggest from my
 * skills", must-have / nice-to-have / exclude terms, and a live preview of
 * exactly what a search will use. Replaces the old /keywords and /skills.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChipInput } from "../../components/ChipInput";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { SearchProfileIn, SearchProfileOut, SkillIn } from "../../lib/api/types";
import {
  getProfile,
  profileBody,
  profileKeys,
  putPreferences,
  putProfile,
  getPreferences,
} from "../profile/profileApi";
import {
  createSearchProfile,
  deleteSearchProfile,
  emptyProfile,
  listSearchProfiles,
  profileFromResume,
  searchProfileKeys,
  suggestTitles,
  toInput,
  updateSearchProfile,
} from "./searchProfileApi";
import {
  forgetLegacySettings,
  legacyApplicant,
  legacyToProfile,
  readLegacySettings,
} from "./legacyImport";
import "../profile/profile.css";

const WEIGHTS: { value: SkillIn["weight"]; label: string }[] = [
  { value: "core", label: "Core" },
  { value: "strong", label: "Strong" },
  { value: "familiar", label: "Familiar" },
];

function SkillsEditor({
  skills,
  onChange,
}: {
  skills: SkillIn[];
  onChange: (s: SkillIn[]) => void;
}) {
  const [name, setName] = useState("");
  const id = useId();
  const set = (i: number, patch: Partial<SkillIn>) =>
    onChange(skills.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    const n = name.trim();
    if (!n || skills.some((s) => s.name.toLowerCase() === n.toLowerCase())) return setName("");
    onChange([...skills, { name: n, weight: "strong", synonyms: [], years: null }]);
    setName("");
  };
  return (
    <fieldset className="skills-editor">
      <legend>Skills</legend>
      <p className="field-hint">
        Core skills count most when jobs are pre-filtered. Synonyms match too (k8s = Kubernetes).
      </p>
      {skills.length === 0 && (
        <p className="empty-state">
          No skills yet. Add one below or create a profile from your resume.
        </p>
      )}
      <ul className="skill-rows">
        {skills.map((s, i) => (
          <li key={s.name} className="skill-row">
            <span className="skill-name">{s.name}</span>
            <label className="field narrow">
              <span className="sr-only">Weight for {s.name}</span>
              <select
                value={s.weight ?? "strong"}
                onChange={(e) => set(i, { weight: e.target.value as SkillIn["weight"] })}
              >
                {WEIGHTS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field narrow">
              <span className="sr-only">Years of {s.name}</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                placeholder="Years"
                value={s.years ?? ""}
                onChange={(e) =>
                  set(i, { years: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <div className="skill-synonyms">
              <ChipInput
                label={`Synonyms for ${s.name}`}
                values={s.synonyms ?? []}
                max={10}
                onChange={(synonyms) => set(i, { synonyms })}
                placeholder="Add synonym"
              />
            </div>
            <button
              type="button"
              className="btn-danger-small"
              aria-label={`Remove ${s.name}`}
              onClick={() => onChange(skills.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <label htmlFor={`${id}-new`} className="sr-only">
          New skill
        </label>
        <input
          id={`${id}-new`}
          value={name}
          placeholder="Add a skill, e.g. FastAPI"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-small" onClick={add}>
          Add skill
        </button>
      </div>
    </fieldset>
  );
}

function Preview({ p }: { p: SearchProfileIn }) {
  const terms = (p.skills ?? []).flatMap((s) => [s.name, ...(s.synonyms ?? [])]);
  return (
    <aside className="card preview-card" aria-label="Search preview">
      <h4>What a search will use</h4>
      <dl>
        <dt>Searches for</dt>
        <dd>
          {p.titles?.length ? (
            p.titles.join(" · ")
          ) : (
            <em>No titles yet — your preferences' titles are used.</em>
          )}
        </dd>
        <dt>Scores against</dt>
        <dd>
          {terms.length ? terms.join(", ") : <em>No skills yet</em>}
          {p.nice_to_have?.length ? `, plus ${p.nice_to_have.join(", ")}` : ""}
        </dd>
        {p.must_have?.length ? (
          <>
            <dt>Must mention</dt>
            <dd>{p.must_have.join(", ")}</dd>
          </>
        ) : null}
        {p.exclude?.length ? (
          <>
            <dt>Dropped if they mention</dt>
            <dd>{p.exclude.join(", ")}</dd>
          </>
        ) : null}
      </dl>
    </aside>
  );
}

function Editor({
  profile,
  onSaved,
  onDeleted,
}: {
  profile: SearchProfileOut | null;
  onSaved: (p: SearchProfileOut) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [p, setP] = useState<SearchProfileIn>(profile ? toInput(profile) : emptyProfile());
  const [saved, setSaved] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<SearchProfileIn>) => {
    setSaved(false);
    setP((prev) => ({ ...prev, ...patch }));
  };
  const save = useMutation({
    mutationFn: () => (profile ? updateSearchProfile(profile.id, p) : createSearchProfile(p)),
    onSuccess: (out) => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: searchProfileKeys.all });
      onSaved(out);
    },
  });
  const suggest = useMutation({
    mutationFn: () => suggestTitles(profile!.id),
    onSuccess: (r) => setSuggested(r.titles.filter((t) => !(p.titles ?? []).includes(t))),
  });

  return (
    <form
      className="card profile-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="form-grid">
        <label className="field">
          <span>Profile name</span>
          <input
            required
            maxLength={100}
            value={p.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={Boolean(p.is_default)}
            onChange={(e) => set({ is_default: e.target.checked })}
          />
          Use this profile by default
        </label>
      </div>

      <ChipInput
        label="Target job titles"
        values={p.titles ?? []}
        onChange={(titles) => set({ titles })}
        max={30}
        hint="Each title becomes one search keyword."
      />
      <div className="suggest-row">
        <button
          type="button"
          className="btn-small"
          disabled={!profile || suggest.isPending}
          title={profile ? undefined : "Save the profile first"}
          onClick={() => suggest.mutate()}
        >
          {suggest.isPending ? "Asking the AI…" : "Suggest titles from my skills"}
        </button>
        {!profile && <span className="field-hint">Save the profile first to get suggestions.</span>}
        {suggest.isError && (
          <span className="login-error" role="alert">
            {errorMessage(suggest.error, "No suggestions right now.")}
          </span>
        )}
        {suggested.length > 0 && (
          <ul className="suggestions" aria-label="Suggested titles">
            {suggested.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="chip chip-add"
                  onClick={() => {
                    set({ titles: [...(p.titles ?? []), t] });
                    setSuggested(suggested.filter((x) => x !== t));
                  }}
                >
                  + {t}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SkillsEditor skills={p.skills ?? []} onChange={(skills) => set({ skills })} />

      <div className="term-grid">
        <ChipInput
          label="Must mention"
          values={p.must_have ?? []}
          onChange={(must_have) => set({ must_have })}
          hint="Jobs that don't mention all of these are dropped."
        />
        <ChipInput
          label="Nice to have"
          values={p.nice_to_have ?? []}
          onChange={(nice_to_have) => set({ nice_to_have })}
          hint="Raise the score when present."
        />
        <ChipInput
          label="Exclude"
          values={p.exclude ?? []}
          onChange={(exclude) => set({ exclude })}
          hint="Jobs mentioning any of these are dropped."
        />
      </div>

      <Preview p={p} />

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : profile ? "Save changes" : "Create profile"}
        </button>
        {saved && (
          <span className="flash-ok" role="status">
            Saved
          </span>
        )}
        {save.isError && (
          <span className="login-error" role="alert">
            {errorMessage(save.error, "Couldn't save. Try again.")}
          </span>
        )}
        {profile && (
          <button
            type="button"
            className="btn-danger-small push-right"
            onClick={() => setConfirmDelete(true)}
          >
            Delete profile
          </button>
        )}
      </div>
      {confirmDelete && profile && (
        <ConfirmDialog
          title={`Delete "${profile.name}"?`}
          confirmLabel="Delete profile"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteSearchProfile(profile.id);
            await qc.invalidateQueries({ queryKey: searchProfileKeys.all });
            onDeleted();
          }}
        >
          Alerts that use this profile are deleted with it. Jobs you've already seen stay in your
          lists.
        </ConfirmDialog>
      )}
    </form>
  );
}

function LegacyImportBanner({ onImported }: { onImported: (p: SearchProfileOut) => void }) {
  const qc = useQueryClient();
  const [legacy, setLegacy] = useState(readLegacySettings);
  const run = useMutation({
    mutationFn: async () => {
      const s = legacy!;
      const created = await createSearchProfile(legacyToProfile(s));
      const [profile, prefs] = await Promise.all([getProfile(), getPreferences()]);
      await putProfile(
        profileBody(profile, { applicant_info: legacyApplicant(s, profile.applicant_info ?? {}) }),
      );
      if (s.locations?.length && !(prefs.locations ?? []).length) {
        await putPreferences({ ...prefs, locations: s.locations.slice(0, 30) });
      }
      return created;
    },
    onSuccess: (created) => {
      forgetLegacySettings();
      setLegacy(null);
      void qc.invalidateQueries({ queryKey: searchProfileKeys.all });
      void qc.invalidateQueries({ queryKey: profileKeys.profile });
      void qc.invalidateQueries({ queryKey: profileKeys.preferences });
      onImported(created);
    },
  });
  if (!legacy) return null;
  return (
    <div className="card notice-card" role="region" aria-label="Old settings found">
      <p>
        This browser still has search settings from the old version of the app (
        {legacy.keywords?.length ?? 0} keywords, {legacy.skills?.length ?? 0} skills). Move them to
        your account so they work on every device.
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Importing…" : "Import my old settings"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            forgetLegacySettings();
            setLegacy(null);
          }}
        >
          Discard them
        </button>
        {run.isError && (
          <span className="login-error" role="alert">
            {errorMessage(run.error, "Import failed. Try again.")}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SearchProfilePage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: searchProfileKeys.all, queryFn: listSearchProfiles });
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const profiles = useMemo(() => list.data?.profiles ?? [], [list.data]);
  const current = selected === "new" ? null : (profiles.find((p) => p.id === selected) ?? null);

  useEffect(() => {
    const first = profiles.find((p) => p.is_default) ?? profiles[0];
    if (selected === null && first) setSelected(first.id);
  }, [profiles, selected]);

  const fromResume = useMutation({
    mutationFn: () => profileFromResume("From my resume"),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: searchProfileKeys.all });
      setSelected(p.id);
    },
  });

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h2>Keywords and skills</h2>
          <p>
            Each search profile is one complete search: titles to look for and skills to score
            against.
          </p>
        </div>
      </div>

      <LegacyImportBanner onImported={(p) => setSelected(p.id)} />

      {list.isLoading && (
        <p className="empty-state" role="status">
          Loading your search profiles…
        </p>
      )}
      {list.isError && (
        <p className="login-error" role="alert">
          {errorMessage(list.error, "Couldn't load your search profiles.")}{" "}
          <button type="button" className="link-button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}

      {list.isSuccess && (
        <div className="split">
          <nav className="profile-list" aria-label="Search profiles">
            <ul>
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={p.id === selected ? "list-item is-active" : "list-item"}
                    aria-current={p.id === selected ? "true" : undefined}
                    onClick={() => setSelected(p.id)}
                  >
                    <span>{p.name}</span>
                    {p.is_default && <span className="badge tone-progress">Default</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-small" onClick={() => setSelected("new")}>
              New profile
            </button>
            <button
              type="button"
              className="btn-small"
              disabled={fromResume.isPending}
              onClick={() => fromResume.mutate()}
            >
              {fromResume.isPending ? "Reading your resume…" : "Create from my resume"}
            </button>
            {fromResume.isError && (
              <p className="login-error" role="alert">
                {errorMessage(fromResume.error, "Couldn't build a profile from your resume.")}{" "}
                <Link to="/profile">Check your resume</Link>
              </p>
            )}
          </nav>
          <div className="split-main">
            {profiles.length === 0 && selected !== "new" ? (
              <div className="empty-state">
                <p>No search profiles yet.</p>
                <button type="button" className="btn-primary" onClick={() => setSelected("new")}>
                  Create a profile
                </button>
              </div>
            ) : (
              <Editor
                key={current?.id ?? "new"}
                profile={current}
                onSaved={(p) => setSelected(p.id)}
                onDeleted={() => setSelected(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
