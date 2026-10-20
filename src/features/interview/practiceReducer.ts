/**
 * Practice (mock interviewer) screen state from socket events: the
 * conversation with live captions, the interviewer's reply as it is spoken
 * sentence by sentence, and Listening / Thinking / Speaking.
 */
import type { ServerMsg, TurnSnapshot } from "./protocol";

export interface PracticeLine {
  id: string;
  speaker: "interviewer" | "user";
  text: string;
  followup?: boolean;
  closing?: boolean;
  interrupted?: boolean;
  typed?: boolean;
}

export interface PracticeState {
  phase:
    | "connecting"
    | "ready"
    | "listening"
    | "thinking"
    | "speaking"
    | "paused"
    | "reconnecting"
    | "ended";
  questionNo: number;
  of: number;
  sttAvailable: boolean;
  ttsKind: "browser" | "server";
  sttName: string | null;
  costCapped: boolean;
  lines: PracticeLine[];
  draft: { id: string; sentences: string[] } | null;
  answerDraft: string[];
  notice: string | null;
  error: { code: string; message: string } | null;
  ended: { reason: string; feedbackPending: boolean } | null;
}

export const initialPractice: PracticeState = {
  phase: "connecting",
  questionNo: 0,
  of: 0,
  sttAvailable: true,
  ttsKind: "browser",
  sttName: null,
  costCapped: false,
  lines: [],
  draft: null,
  answerDraft: [],
  notice: null,
  error: null,
  ended: null,
};

export type PracticeAction =
  | { type: "server"; msg: ServerMsg }
  | { type: "socket"; state: "reconnecting" | "open" }
  | { type: "clearError" };

function fromTurns(turns: TurnSnapshot[]): PracticeLine[] {
  return turns.map((t) => ({
    id: t.id,
    speaker: t.speaker === "interviewer" ? "interviewer" : "user",
    text: t.text,
    followup: Boolean(t.is_followup),
    closing: t.kind === "closing",
    interrupted: t.state === "interrupted",
  }));
}

const PHASES = new Set(["ready", "listening", "thinking", "speaking", "paused", "ended"]);

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  if (action.type === "clearError") return { ...state, error: null };
  if (action.type === "socket") {
    if (action.state === "reconnecting") return { ...state, phase: "reconnecting" };
    return state;
  }
  const msg = action.msg;
  switch (msg.type) {
    case "status":
      return {
        ...state,
        phase: PHASES.has(msg.state) ? (msg.state as PracticeState["phase"]) : state.phase,
        questionNo: msg.question_no ?? state.questionNo,
        of: msg.of ?? state.of,
        sttAvailable: msg.stt_available ?? state.sttAvailable,
        ttsKind:
          msg.providers?.tts?.kind === "server"
            ? "server"
            : msg.providers
              ? "browser"
              : state.ttsKind,
        sttName: msg.providers?.stt?.name ?? state.sttName,
        costCapped: msg.cost_capped ?? state.costCapped,
        notice:
          msg.message ??
          (msg.reason === "idle" ? "Paused — we didn't hear anything for a while." : null),
      };
    case "session.resumed":
      return { ...state, lines: fromTurns(msg.turns) };
    case "transcript.final":
      if (msg.channel !== "user") return state;
      return { ...state, answerDraft: [...state.answerDraft, msg.text] };
    case "interviewer.delta": {
      const draft =
        state.draft && state.draft.id === msg.turn_id
          ? { ...state.draft, sentences: [...state.draft.sentences, msg.text] }
          : { id: msg.turn_id, sentences: [msg.text] };
      // The user's answer is final once the interviewer starts the next turn.
      const lines = state.answerDraft.length
        ? [
            ...state.lines,
            { id: `a-${msg.turn_id}`, speaker: "user" as const, text: state.answerDraft.join(" ") },
          ]
        : state.lines;
      return { ...state, draft: msg.repeat ? state.draft : draft, lines, answerDraft: [] };
    }
    case "turn.done": {
      if (msg.repeat) return { ...state, draft: null };
      const answer = state.answerDraft.length
        ? [{ id: `a-${msg.turn_id}`, speaker: "user" as const, text: state.answerDraft.join(" ") }]
        : [];
      const line: PracticeLine = {
        id: msg.turn_id,
        speaker: "interviewer",
        text: msg.text,
        followup: msg.is_followup,
        closing: msg.kind === "closing",
        interrupted: msg.interrupted,
      };
      return {
        ...state,
        lines: [...state.lines.filter((l) => l.id !== msg.turn_id), ...answer, line],
        draft: null,
        answerDraft: [],
        questionNo: msg.question_no ?? state.questionNo,
        of: msg.of ?? state.of,
      };
    }
    case "session.ended":
      return {
        ...state,
        phase: "ended",
        ended: { reason: msg.reason, feedbackPending: msg.feedback_pending },
      };
    case "error":
      return { ...state, error: { code: msg.code, message: msg.message } };
    default:
      return state;
  }
}
