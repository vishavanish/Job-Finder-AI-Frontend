/**
 * Story bank (F7 plan §1.8): the STAR stories that ground model answers in
 * Practice and Live Copilot suggestions. "Draft from my resume" queues an AI
 * task (shown in the activity tray); drafts are used only after approval.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useActivity } from "../../app/activity";
import { ChipInput } from "../../components/ChipInput";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { errorMessage } from "../../lib/api/errors";
import type { Story, StoryIn } from "../../lib/api/types";
import { InterviewNav } from "./parts";
import {
  approveStory,
  createStory,
  deleteStory,
  draftStories,
  getTask,
  listStories,
  updateStory,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const EMPTY: StoryIn = { title: "", situation: "", task: "", action: "", result: "", skills: [] };
const PARTS = [
  ["situation", "Situation"],
  ["task", "Task"],
  ["action", "Action"],
  ["result", "Result"],
] as const;

function StoryDialog({ story, onClose }: { story: Story | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StoryIn>(story ? { ...story } : EMPTY);
  const save = useMutation({
    mutationFn: () => (story ? updateStory(story.id, draft) : createStory(draft)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: voiceKeys.stories });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Dialog
      title={story ? (story.approved ? "Edit story" : "Review draft story") : "Add a story"}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="story-form"
            className="btn-run"
            disabled={!draft.title.trim() || save.isPending}
          >
            {story && !story.approved ? "Save and use" : "Save"}
          </button>
        </>
      }
    >
      <form id="story-form" onSubmit={submit} className="iv-story-form">
        <label className="field">
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            maxLength={200}
            required
          />
        </label>
        {PARTS.map(([key, label]) => (
          <label key={key} className="field">
            <span>{label}</span>
            <textarea
              rows={2}
              value={draft[key] ?? ""}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <ChipInput
          label="Skills"
          values={draft.skills ?? []}
          onChange={(skills) => setDraft({ ...draft, skills })}
          max={20}
        />
        <p className="field-hint">
          Only write what really happened — model answers quote these facts.
        </p>
        {save.error && (
          <p className="login-error" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export default function StoryBankPage() {
  const qc = useQueryClient();
  const { track } = useActivity();
  const [editing, setEditing] = useState<Story | null | "new">(null);
  const [removing, setRemoving] = useState<Story | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const stories = useQuery({ queryKey: voiceKeys.stories, queryFn: listStories });
  const task = useQuery({
    queryKey: ["voice", "story-draft", taskId],
    queryFn: () => getTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: (q) =>
      q.state.data && ["completed", "failed", "cancelled"].includes(q.state.data.status)
        ? false
        : 2000,
  });
  const draft = useMutation({
    mutationFn: draftStories,
    onSuccess: (r) => {
      setTaskId(r.task_id);
      track({
        id: r.task_id,
        kind: "task",
        label: "Drafting stories from your resume",
        status: "running",
        href: "/interview/stories",
      });
    },
  });
  useEffect(() => {
    const t = task.data;
    if (!t || !taskId) return;
    if (t.status === "completed" || t.status === "failed") {
      const message = (t.result as { message?: string } | null | undefined)?.message;
      track({
        id: taskId,
        status: t.status === "completed" ? "completed" : "failed",
        detail: message ?? undefined,
      });
      void qc.invalidateQueries({ queryKey: voiceKeys.stories });
      setTaskId(null);
    }
  }, [task.data, taskId, track, qc]);
  const approve = useMutation({
    mutationFn: approveStory,
    onSuccess: () => qc.invalidateQueries({ queryKey: voiceKeys.stories }),
  });

  const list = stories.data?.stories ?? [];
  const drafts = list.filter((s) => !s.approved);
  const approved = list.filter((s) => s.approved);

  const row = (s: Story) => (
    <li key={s.id} className="card iv-story">
      <div className="iv-story-head">
        <h4>{s.title}</h4>
        {s.origin === "ai" && <span className="badge">AI draft</span>}
        {(s.skills ?? []).map((k) => (
          <span key={k} className="chip">
            {k}
          </span>
        ))}
      </div>
      <dl className="iv-star-list">
        {PARTS.filter(([k]) => s[k]).map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd>{s[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="row-actions">
        {!s.approved && (
          <button
            type="button"
            className="btn-small"
            onClick={() => approve.mutate(s.id)}
            disabled={approve.isPending}
          >
            Use this story
          </button>
        )}
        <button type="button" className="btn-small" onClick={() => setEditing(s)}>
          {s.approved ? "Edit" : "Review"}
        </button>
        <button type="button" className="btn-small" onClick={() => setRemoving(s)}>
          Delete
        </button>
      </div>
    </li>
  );

  return (
    <div className="iv-page">
      <div className="page-header">
        <div>
          <h2>Story bank</h2>
          <p>
            Your real STAR stories. Model answers and copilot suggestions use only these and your
            resume.
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => draft.mutate()}
            disabled={draft.isPending || Boolean(taskId)}
          >
            {taskId ? "Drafting…" : "Draft from my resume"}
          </button>
          <button type="button" className="btn-run" onClick={() => setEditing("new")}>
            Add a story
          </button>
        </div>
      </div>
      <InterviewNav />
      {draft.error && (
        <p className="login-error" role="alert">
          {errorMessage(draft.error)}
        </p>
      )}
      {taskId && (
        <p className="iv-notice" role="status">
          Drafting stories from your resume — they'll appear below for you to review.
        </p>
      )}
      {stories.isLoading ? (
        <p className="field-hint" role="status">
          Loading stories…
        </p>
      ) : stories.error ? (
        <p className="login-error" role="alert">
          {errorMessage(stories.error)}
        </p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <p>No stories yet. Add one, or draft a few from your resume and review them.</p>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <section aria-labelledby="drafts-title">
              <h3 id="drafts-title">Needs your review ({drafts.length})</h3>
              <p className="field-hint">Drafts aren't used until you approve them.</p>
              <ul className="iv-stories">{drafts.map(row)}</ul>
            </section>
          )}
          <section aria-labelledby="stories-title">
            <h3 id="stories-title">In use ({approved.length})</h3>
            <ul className="iv-stories">{approved.map(row)}</ul>
          </section>
        </>
      )}
      {editing && (
        <StoryDialog story={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmDialog
          title="Delete this story?"
          confirmLabel="Delete story"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteStory(removing.id);
            await qc.invalidateQueries({ queryKey: voiceKeys.stories });
            setRemoving(null);
          }}
        >
          “{removing.title}” won't be used in model answers or copilot suggestions any more.
        </ConfirmDialog>
      )}
    </div>
  );
}
