/**
 * Story bank (F7 plan §1.8; restyled in F7.1): the STAR stories that ground model answers in
 * Practice and Live Copilot suggestions. "Draft from my resume" queues an AI
 * task (shown in the activity tray); drafts are used only after approval.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useActivity } from "../../app/activity";
import { ChipInput } from "../../components/ChipInput";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { EmptyState, IconTile, PageHeader, StatChip } from "../../components/PageKit";
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
    <li key={s.id} className={`card kit-card iv-story${s.approved ? "" : " is-draft"}`}>
      <div className="iv-story-head">
        <IconTile
          icon={s.approved ? "book" : "sparkle"}
          tone={s.approved ? "accent" : "attention"}
        />
        <div className="iv-story-title">
          <h4>{s.title}</h4>
          <div className="iv-story-tags">
            {s.origin === "ai" && <span className="badge tone-attention">AI draft</span>}
            {(s.skills ?? []).map((k) => (
              <span key={k} className="chip">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
      <dl className="iv-star-list">
        {PARTS.filter(([k]) => s[k]).map(([k, label]) => (
          <div key={k}>
            <dt>
              <span className="iv-star-letter" aria-hidden="true">
                {label[0]}
              </span>
              {label}
            </dt>
            <dd>{s[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="iv-story-actions">
        {!s.approved && (
          <button
            type="button"
            className="btn-run iv-icon-btn"
            onClick={() => approve.mutate(s.id)}
            disabled={approve.isPending}
          >
            <Icon name="check" size={14} />
            Use this story
          </button>
        )}
        <button type="button" className="btn-secondary iv-icon-btn" onClick={() => setEditing(s)}>
          <Icon name="pencil" size={14} />
          {s.approved ? "Edit" : "Review"}
        </button>
        <button type="button" className="btn-secondary iv-icon-btn" onClick={() => setRemoving(s)}>
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>
    </li>
  );

  return (
    <div className="iv-page">
      <PageHeader
        eyebrow="Interview prep"
        title="Story bank"
        sub="Your real STAR stories. Model answers and copilot suggestions use only these and your resume."
      >
        {list.length > 0 && (
          <StatChip dot="positive">
            <strong className="num">{approved.length}</strong> in use
          </StatChip>
        )}
        <button
          type="button"
          className="btn-secondary iv-icon-btn"
          onClick={() => draft.mutate()}
          disabled={draft.isPending || Boolean(taskId)}
        >
          <Icon name="sparkle" size={14} />
          {taskId ? "Drafting…" : "Draft from my resume"}
        </button>
        <button type="button" className="btn-run iv-icon-btn" onClick={() => setEditing("new")}>
          <Icon name="pencil" size={14} />
          Add a story
        </button>
      </PageHeader>
      <InterviewNav />
      {draft.error && (
        <p className="kit-banner bad" role="alert">
          {errorMessage(draft.error)}
        </p>
      )}
      {taskId && (
        <p className="kit-banner" role="status">
          <span className="spinner" aria-hidden="true" />
          Drafting stories from your resume — they&apos;ll appear below for you to review.
        </p>
      )}
      {stories.isLoading ? (
        <div className="iv-skeleton" role="status" aria-label="Loading stories">
          <span />
          <span />
          <span />
        </div>
      ) : stories.error ? (
        <p className="kit-banner bad" role="alert">
          {errorMessage(stories.error)}
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon="book" title="No stories yet.">
          <p>Add one, or draft a few from your resume and review them.</p>
        </EmptyState>
      ) : (
        <>
          {drafts.length > 0 && (
            <section className="iv-story-section" aria-labelledby="drafts-title">
              <div className="iv-section-head">
                <h3 id="drafts-title" className="iv-section-title">
                  Needs your review ({drafts.length})
                </h3>
                <p className="field-hint">Drafts aren&apos;t used until you approve them.</p>
              </div>
              <ul className="iv-stories kit-rise">{drafts.map(row)}</ul>
            </section>
          )}
          <section className="iv-story-section" aria-labelledby="stories-title">
            <div className="iv-section-head">
              <h3 id="stories-title" className="iv-section-title">
                In use ({approved.length})
              </h3>
            </div>
            <ul className="iv-stories kit-rise">{approved.map(row)}</ul>
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
