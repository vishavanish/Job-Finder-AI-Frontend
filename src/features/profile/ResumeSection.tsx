/**
 * Resume upload, versions (master marker) and the review-before-saving step
 * for the AI-parsed profile (spec §6.7). Parsing runs in a worker, so a
 * pending version is polled until it is parsed or failed.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type DragEvent } from "react";
import { ChipInput } from "../../components/ChipInput";
import { errorMessage } from "../../lib/api/errors";
import type { ExperienceItem, ParsedResume, ResumeOut } from "../../lib/api/types";
import {
  deleteResume,
  getResume,
  listResumes,
  makeMaster,
  profileKeys,
  reparseResume,
  saveReviewedResume,
  uploadResume,
} from "./profileApi";

const MAX_BYTES = 4 * 1024 * 1024; // matches RESUME_MAX_BYTES (Vercel proxies ~4.5 MB bodies)
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PARSE_LABEL: Record<string, string> = {
  unparsed: "Not read yet",
  pending: "Reading with AI…",
  parsed: "Ready to review",
  reviewed: "Reviewed",
  failed: "Couldn't read",
  no_text: "No text found (scanned PDF?)",
};

function parseTone(status: string): string {
  if (status === "reviewed") return "positive";
  if (status === "parsed") return "attention";
  if (status === "pending") return "active";
  if (status === "failed" || status === "no_text") return "negative";
  return "neutral";
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ReviewForm({ resume, onDone }: { resume: ResumeOut; onDone: (saved: boolean) => void }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: profileKeys.resume(resume.id),
    queryFn: () => getResume(resume.id),
  });
  const [draft, setDraft] = useState<ParsedResume | null>(null);
  const parsed: ParsedResume | null = draft ?? detail.data?.parsed ?? null;
  const save = useMutation({
    mutationFn: (p: ParsedResume) => saveReviewedResume(resume.id, p, resume.label),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKeys.resumes });
      onDone(true);
    },
  });
  const id = useId();

  if (detail.isLoading)
    return (
      <p className="empty-state" role="status">
        Loading the parsed resume…
      </p>
    );
  if (detail.isError || !parsed) {
    return (
      <p className="login-error" role="alert">
        {errorMessage(detail.error, "This version has no parsed profile to review yet.")}
      </p>
    );
  }
  const set = (patch: Partial<ParsedResume>) => setDraft({ ...parsed, ...patch });
  const setExp = (i: number, patch: Partial<ExperienceItem>) =>
    set({
      experience: (parsed.experience ?? []).map((e, j) => (j === i ? { ...e, ...patch } : e)),
    });

  return (
    <form
      className="review-form"
      aria-labelledby={`${id}-h`}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(parsed);
      }}
    >
      <h4 id={`${id}-h`}>Review what the AI read from version {resume.version}</h4>
      <p className="field-hint">
        Fix anything that's wrong, then save. Searches and scoring use the reviewed version.
      </p>
      <div className="form-grid">
        {(["name", "email", "phone", "location", "headline"] as const).map((field) => (
          <label key={field} className="field">
            <span>
              {field === "headline" ? "Headline" : field.charAt(0).toUpperCase() + field.slice(1)}
            </span>
            <input value={parsed[field] ?? ""} onChange={(e) => set({ [field]: e.target.value })} />
          </label>
        ))}
        <label className="field">
          <span>Years of experience</span>
          <input
            type="number"
            min={0}
            max={60}
            step={0.5}
            value={parsed.total_experience_years ?? ""}
            onChange={(e) =>
              set({ total_experience_years: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </label>
      </div>
      <label className="field">
        <span>Summary</span>
        <textarea
          rows={4}
          value={parsed.summary ?? ""}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </label>
      <ChipInput
        label="Skills"
        values={parsed.skills ?? []}
        onChange={(skills) => set({ skills })}
        max={100}
      />
      <fieldset className="exp-list">
        <legend>Experience</legend>
        {(parsed.experience ?? []).length === 0 && (
          <p className="field-hint">No roles were found.</p>
        )}
        {(parsed.experience ?? []).map((exp, i) => (
          <div key={i} className="exp-row">
            <label className="field">
              <span>Title</span>
              <input
                value={exp.title ?? ""}
                onChange={(e) => setExp(i, { title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Company</span>
              <input
                value={exp.company ?? ""}
                onChange={(e) => setExp(i, { company: e.target.value })}
              />
            </label>
            <label className="field narrow">
              <span>From</span>
              <input
                value={exp.start ?? ""}
                onChange={(e) => setExp(i, { start: e.target.value })}
              />
            </label>
            <label className="field narrow">
              <span>To</span>
              <input
                value={exp.current ? "Present" : (exp.end ?? "")}
                disabled={Boolean(exp.current)}
                onChange={(e) => setExp(i, { end: e.target.value })}
              />
            </label>
          </div>
        ))}
      </fieldset>
      {save.isError && (
        <p className="login-error" role="alert">
          {errorMessage(save.error, "Couldn't save the review. Try again.")}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save reviewed profile"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ResumeSection() {
  const qc = useQueryClient();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const resumes = useQuery({
    queryKey: profileKeys.resumes,
    queryFn: listResumes,
    // A version is being read by the worker: check again shortly.
    refetchInterval: (q) =>
      q.state.data?.resumes.some((r) => r.parse_status === "pending") ? 3000 : false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: profileKeys.resumes });

  const upload = useMutation({
    mutationFn: (file: File) => uploadResume(file),
    onSuccess: (r) => {
      setFlash(`Uploaded ${r.file_name}. Reading it with AI…`);
      refresh();
    },
  });
  const action = useMutation({
    mutationFn: async ({ kind, rid }: { kind: "master" | "parse" | "delete"; rid: string }) => {
      if (kind === "master") await makeMaster(rid);
      else if (kind === "parse") await reparseResume(rid);
      else await deleteResume(rid);
    },
    onSuccess: (_d, v) => {
      setFlash(
        v.kind === "master"
          ? "Master resume changed."
          : v.kind === "parse"
            ? "Reading it again…"
            : "Deleted.",
      );
      refresh();
    },
  });

  const pick = (file: File | undefined) => {
    setLocalError("");
    setFlash("");
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setLocalError("Choose a PDF or Word (.docx) file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("That file is over 4 MB. Export a smaller PDF and try again.");
      return;
    }
    upload.mutate(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const list = resumes.data?.resumes ?? [];
  const error =
    localError ||
    (upload.isError ? errorMessage(upload.error, "Upload failed. Try again.") : "") ||
    (action.isError ? errorMessage(action.error, "That didn't work. Try again.") : "");

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Resume</h3>
      <div
        className={dragging ? "drop-zone is-over" : "drop-zone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>
          Drop a PDF or Word file here, or{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            choose a file
          </button>
          . Up to 4 MB.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Resume file"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {upload.isPending && <p role="status">Uploading…</p>}
      </div>
      {flash && !error && (
        <p className="flash-ok" role="status">
          {flash}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {resumes.isLoading && (
        <p className="empty-state" role="status">
          Loading your resumes…
        </p>
      )}
      {resumes.isError && (
        <p className="login-error" role="alert">
          {errorMessage(resumes.error, "Couldn't load your resumes.")}{" "}
          <button type="button" className="link-button" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {resumes.isSuccess && list.length === 0 && (
        <p className="empty-state">
          No resume yet. Upload one so searches can score jobs against it.
        </p>
      )}
      {list.length > 0 && (
        <ul className="resume-list">
          {list.map((r) => (
            <li key={r.id} className="resume-row">
              <div className="resume-main">
                <span className="resume-name">
                  v{r.version} · {r.label || r.file_name}
                </span>
                {r.is_master && <span className="badge tone-progress">Master</span>}
                <span className={`badge tone-${parseTone(r.parse_status)}`}>
                  {PARSE_LABEL[r.parse_status] ?? r.parse_status}
                </span>
                <span className="resume-meta">
                  {sizeText(r.size_bytes)} · {new Date(r.created_at).toLocaleDateString()}
                </span>
                {r.parse_error && <span className="resume-meta">{r.parse_error}</span>}
              </div>
              <div className="row-actions">
                {(r.parse_status === "parsed" || r.parse_status === "reviewed") && (
                  <button type="button" className="btn-small" onClick={() => setReviewing(r.id)}>
                    {r.parse_status === "parsed" ? "Review" : "Edit review"}
                  </button>
                )}
                {!r.is_master && (
                  <button
                    type="button"
                    className="btn-small"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "master", rid: r.id })}
                  >
                    Make master
                  </button>
                )}
                {r.parse_status !== "pending" && (
                  <button
                    type="button"
                    className="btn-small"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "parse", rid: r.id })}
                  >
                    Read again
                  </button>
                )}
                <button
                  type="button"
                  className="btn-danger-small"
                  disabled={action.isPending}
                  aria-label={`Delete version ${r.version}`}
                  onClick={() => action.mutate({ kind: "delete", rid: r.id })}
                >
                  Delete
                </button>
              </div>
              {reviewing === r.id && (
                <ReviewForm
                  resume={r}
                  onDone={(saved) => {
                    setReviewing(null);
                    if (saved) setFlash("Saved your reviewed profile.");
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
