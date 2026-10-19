/**
 * Answer bank (spec §6.4): screening answers the apply engine reuses. AI
 * drafts come first — they are never used to submit until approved here or
 * by approving a run that used them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { SavedAnswer } from "../../lib/api/types";
import {
  applyKeys,
  approveAnswer,
  deleteAnswer,
  listAnswers,
  saveAnswer,
  updateAnswer,
} from "./applyApi";

function AnswerItem({ a }: { a: SavedAnswer }) {
  const qc = useQueryClient();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.answer);
  const done = () => void qc.invalidateQueries({ queryKey: applyKeys.answers });
  const save = useMutation({
    mutationFn: () => updateAnswer(a.id, { answer: draft }),
    onSuccess: () => (setEditing(false), done()),
  });
  const approve = useMutation({ mutationFn: () => approveAnswer(a.id), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteAnswer(a.id), onSuccess: done });
  const error = save.error ?? approve.error ?? remove.error;

  return (
    <li className={`answer-item${a.approved ? "" : " is-draft"}`}>
      <p className="answer-q">
        {a.question}{" "}
        {a.approved ? (
          <span className="badge tone-positive">Approved</span>
        ) : (
          <span className="badge tone-attention">AI draft — check it</span>
        )}
      </p>
      {editing ? (
        <>
          <label className="sr-only" htmlFor={`${id}-a`}>
            Answer
          </label>
          <textarea
            id={`${id}-a`}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="prep-row">
            <button
              type="button"
              className="btn-run"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Save and approve
            </button>
            <button
              type="button"
              className="btn-small"
              onClick={() => (setEditing(false), setDraft(a.answer))}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <p className="answer-a">{a.answer || <em>No answer</em>}</p>
      )}
      {!editing && (
        <div className="prep-row">
          {!a.approved && (
            <button
              type="button"
              className="btn-small"
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              Approve
            </button>
          )}
          <button type="button" className="btn-small" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="btn-small"
            disabled={remove.isPending}
            aria-label={`Delete the answer to: ${a.question}`}
            onClick={() => remove.mutate()}
          >
            Delete
          </button>
          {a.uses > 0 && <span className="field-hint">Used {a.uses}×</span>}
        </div>
      )}
      {error && (
        <p className="login-error" role="alert">
          {errorMessage(error, "Couldn't update this answer.")}
        </p>
      )}
    </li>
  );
}

export function AnswerBankPanel() {
  const qc = useQueryClient();
  const answers = useQuery({ queryKey: applyKeys.answers, queryFn: listAnswers });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const add = useMutation({
    mutationFn: () =>
      saveAnswer({ question: question.trim(), answer: answer.trim(), field_type: "text" }),
    onSuccess: () => {
      setQuestion("");
      setAnswer("");
      void qc.invalidateQueries({ queryKey: applyKeys.answers });
    },
  });

  const list = [...(answers.data?.answers ?? [])].sort(
    (x, y) => Number(x.approved) - Number(y.approved),
  );
  const drafts = list.filter((a) => !a.approved).length;

  return (
    <div className="answer-bank">
      <p className="field-hint">
        Answers the app reuses on application forms. Only approved answers are ever submitted
        without you seeing them.
        {drafts > 0 && (
          <strong>
            {" "}
            {drafts} AI draft{drafts === 1 ? "" : "s"} to check.
          </strong>
        )}
      </p>
      {answers.isLoading && (
        <p className="empty-state" role="status">
          Loading…
        </p>
      )}
      {answers.isError && (
        <p className="login-error" role="alert">
          {errorMessage(answers.error, "Couldn't load your answers.")}
        </p>
      )}
      {answers.isSuccess && list.length === 0 && (
        <p className="empty-state">
          No saved answers yet. They appear as you answer application questions.
        </p>
      )}
      <ul className="answer-list">
        {list.map((a) => (
          <AnswerItem key={a.id} a={a} />
        ))}
      </ul>

      <form
        className="answer-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 3) add.mutate();
        }}
      >
        <h3>Add an answer</h3>
        <label htmlFor="ab-q">Question</label>
        <input
          id="ab-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
        />
        <label htmlFor="ab-a">Your answer</label>
        <textarea
          id="ab-a"
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={4000}
        />
        <button
          type="submit"
          className="btn-run"
          disabled={add.isPending || question.trim().length < 3}
        >
          Save answer
        </button>
        {add.isError && (
          <p className="login-error" role="alert">
            {errorMessage(add.error, "Couldn't save the answer.")}
          </p>
        )}
      </form>
    </div>
  );
}
