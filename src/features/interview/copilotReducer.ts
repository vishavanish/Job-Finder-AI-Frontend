/**
 * Live Copilot screen state from socket events (spec §7.1, §7.3). Cards are
 * keyed by question_id; follow-ups hang under their root question; the
 * newest card is the highlighted one. Answer text arrives in batches (one
 * flush per animation frame, see useRafBuffer).
 */
import type { ServerMsg, TurnSnapshot } from "./protocol";

export type CardState = "streaming" | "done" | "interrupted" | "dismissed" | "error";

export interface CopilotCard {
  id: string;
  text: string;
  qtype: string;
  isFollowup: boolean;
  parentId: string | null;
  multipart: boolean;
  speculative: boolean;
  forced: boolean;
  answer: string;
  state: CardState;
  notSure: boolean;
  unverified: string[];
  model: string | null;
  firstVisibleMs: number | null;
  /** From the end of the interviewer's speech (per-utterance STT only). */
  timing: { totalMs: number; endWaitMs: number; sttMs: number } | null;
}

function readTiming(latency: Record<string, unknown> | undefined): CopilotCard["timing"] {
  const n = (k: string) => (typeof latency?.[k] === "number" ? (latency[k] as number) : null);
  const totalMs = n("total_ms");
  if (totalMs === null) return null;
  return { totalMs, endWaitMs: n("end_wait_ms") ?? 0, sttMs: n("stt_ms") ?? 0 };
}

/** "1.2 s · wait 0.45 · speech→text 0.40 · AI 0.35 · GPT-OSS 120B (Groq)" */
export function timingLine(c: CopilotCard): string | null {
  const s = (ms: number) => (ms / 1000).toFixed(ms < 1000 ? 2 : 1);
  const parts: string[] = [];
  if (c.timing) {
    parts.push(
      `${s(c.timing.totalMs)} s`,
      `wait ${s(c.timing.endWaitMs)}`,
      `speech→text ${s(c.timing.sttMs)}`,
    );
    if (c.firstVisibleMs !== null) parts.push(`AI ${s(c.firstVisibleMs)}`);
  } else if (c.firstVisibleMs !== null) {
    parts.push(`first words ${s(c.firstVisibleMs)} s`);
  }
  if (!parts.length) return null;
  if (c.model) parts.push(c.model);
  return parts.join(" · ");
}

export interface CopilotState {
  status: "idle" | "listening" | "paused" | "reconnecting" | "ended";
  streaming: boolean;
  costCapped: boolean;
  sttName: string | null;
  notice: string | null;
  order: string[];
  cards: Record<string, CopilotCard>;
  activeId: string | null;
  heard: { channel: string; text: string; partial: boolean }[];
  error: { code: string; message: string } | null;
  ended: { reason: string; feedbackPending: boolean } | null;
}

export const initialCopilot: CopilotState = {
  status: "idle",
  streaming: false,
  costCapped: false,
  sttName: null,
  notice: null,
  order: [],
  cards: {},
  activeId: null,
  heard: [],
  error: null,
  ended: null,
};

export type CopilotAction =
  | { type: "server"; msg: ServerMsg }
  | { type: "deltas"; chunks: Record<string, string> }
  | { type: "socket"; state: "reconnecting" | "open" }
  | { type: "reset" }
  | { type: "clearError" };

const HEARD_MAX = 6;
const CANCEL_STATE: Record<string, CardState> = {
  interrupted: "interrupted",
  dismissed: "dismissed",
};

function card(partial: Partial<CopilotCard> & { id: string; text: string }): CopilotCard {
  return {
    qtype: "general",
    isFollowup: false,
    parentId: null,
    multipart: false,
    speculative: false,
    forced: false,
    answer: "",
    state: "streaming",
    notSure: false,
    unverified: [],
    model: null,
    firstVisibleMs: null,
    timing: null,
    ...partial,
  };
}

function update(state: CopilotState, id: string, patch: Partial<CopilotCard>): CopilotState {
  const current = state.cards[id];
  if (!current) return state;
  return { ...state, cards: { ...state.cards, [id]: { ...current, ...patch } } };
}

/** Cards rebuilt from the saved transcript after a reconnect. */
export function cardsFromTurns(
  turns: TurnSnapshot[],
): Pick<CopilotState, "order" | "cards" | "activeId"> {
  const cards: Record<string, CopilotCard> = {};
  const order: string[] = [];
  for (const t of turns) {
    if (t.kind === "question" && t.question_id) {
      cards[t.question_id] = card({
        id: t.question_id,
        text: t.text,
        qtype: String(t.metrics?.qtype ?? "general"),
        isFollowup: Boolean(t.is_followup),
        parentId: t.parent_id ?? null,
        state: "done",
      });
      order.push(t.question_id);
    } else if (t.kind === "suggestion" && t.question_id && cards[t.question_id]) {
      const c = cards[t.question_id]!;
      c.answer = t.text === "(dismissed)" ? c.answer : t.text;
      c.state = t.state === "shown" ? "done" : (CANCEL_STATE[t.state] ?? "done");
      c.notSure = Boolean(t.metrics?.not_sure);
    }
  }
  return { order, cards, activeId: order.at(-1) ?? null };
}

export function copilotReducer(state: CopilotState, action: CopilotAction): CopilotState {
  switch (action.type) {
    case "reset":
      return initialCopilot;
    case "clearError":
      return { ...state, error: null };
    case "socket":
      return action.state === "reconnecting"
        ? { ...state, status: "reconnecting" }
        : state.status === "reconnecting"
          ? { ...state, status: "listening" }
          : state;
    case "deltas": {
      let next = state;
      for (const [id, text] of Object.entries(action.chunks)) {
        const c = next.cards[id];
        if (c && c.state === "streaming") next = update(next, id, { answer: c.answer + text });
      }
      return next;
    }
    case "server":
      return onServer(state, action.msg);
  }
}

function onServer(state: CopilotState, msg: ServerMsg): CopilotState {
  switch (msg.type) {
    case "status": {
      const status =
        msg.state === "paused" ? "paused" : msg.state === "ended" ? "ended" : "listening";
      return {
        ...state,
        status,
        streaming: msg.streaming ?? state.streaming,
        costCapped: msg.cost_capped ?? state.costCapped,
        sttName: msg.providers?.stt?.name ?? state.sttName,
        notice:
          msg.message ?? (msg.reason === "idle" ? "Paused — no audio for a while." : state.notice),
      };
    }
    case "session.resumed": {
      // The server's copy wins, but an answer that was still streaming when the
      // connection dropped wasn't saved: keep what the user already saw, marked interrupted.
      const resumed = cardsFromTurns(msg.turns);
      for (const [id, c] of Object.entries(resumed.cards)) {
        const seen = state.cards[id];
        if (!c.answer && seen?.answer)
          resumed.cards[id] = { ...c, answer: seen.answer, state: "interrupted" };
      }
      return { ...state, ...resumed };
    }
    case "transcript.partial":
    case "transcript.final": {
      const heard = [...state.heard];
      const last = heard.at(-1);
      const entry = {
        channel: msg.channel,
        text: msg.text,
        partial: msg.type === "transcript.partial",
      };
      if (last && last.partial && last.channel === msg.channel) heard[heard.length - 1] = entry;
      else heard.push(entry);
      return { ...state, heard: heard.slice(-HEARD_MAX) };
    }
    case "question.detected": {
      const next = card({
        id: msg.question_id,
        text: msg.text,
        qtype: msg.qtype,
        isFollowup: msg.is_followup,
        parentId: msg.parent_id,
        multipart: msg.multipart,
        speculative: msg.speculative,
        forced: Boolean(msg.forced),
      });
      const order = state.order.includes(msg.question_id)
        ? state.order
        : [...state.order, msg.question_id];
      return {
        ...state,
        cards: { ...state.cards, [msg.question_id]: next },
        order,
        activeId: msg.question_id,
      };
    }
    case "question.updated":
      return update(state, msg.question_id, {
        text: msg.text,
        ...(msg.qtype ? { qtype: msg.qtype } : {}),
      });
    case "answer.delta": {
      const c = state.cards[msg.question_id];
      return c
        ? update(state, msg.question_id, { answer: c.answer + msg.text, state: "streaming" })
        : state;
    }
    case "answer.done":
      return update(state, msg.question_id, {
        answer: msg.text,
        state: "done",
        notSure: msg.not_sure,
        unverified: msg.unverified ?? [],
        model: msg.model ?? null,
        firstVisibleMs:
          typeof msg.latency?.first_visible_ms === "number" ? msg.latency.first_visible_ms : null,
        timing: readTiming(msg.latency),
      });
    case "answer.cancelled": {
      const c = state.cards[msg.question_id];
      if (!c) return state;
      if (msg.reason === "restarted" || msg.reason === "regenerating") {
        return update(state, msg.question_id, {
          answer: "",
          state: "streaming",
          notSure: false,
          unverified: [],
        });
      }
      return update(state, msg.question_id, { state: CANCEL_STATE[msg.reason] ?? "error" });
    }
    case "session.ended":
      return {
        ...state,
        status: "ended",
        ended: { reason: msg.reason, feedbackPending: msg.feedback_pending },
      };
    case "error":
      return { ...state, error: { code: msg.code, message: msg.message } };
    default:
      return state;
  }
}

/** Root cards in order, each with its follow-ups (spec §7.1: a follow-up sits in its parent's thread). */
export function threads(state: CopilotState): { root: CopilotCard; followups: CopilotCard[] }[] {
  const roots: { root: CopilotCard; followups: CopilotCard[] }[] = [];
  const byRoot = new Map<string, { root: CopilotCard; followups: CopilotCard[] }>();
  for (const id of state.order) {
    const c = state.cards[id];
    if (!c) continue;
    const parent = c.parentId ? byRoot.get(c.parentId) : undefined;
    if (parent) parent.followups.push(c);
    else {
      const t = { root: c, followups: [] as CopilotCard[] };
      roots.push(t);
      byRoot.set(c.id, t);
    }
  }
  return roots;
}
