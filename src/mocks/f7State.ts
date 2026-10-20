/**
 * In-memory state for the F7 mocks (backend P7): voice settings and the
 * Live Copilot acknowledgement, sessions with transcripts and feedback,
 * the story bank, a story-drafting task, and the live sockets the tests
 * can drive (mockCopilotSay / mockDropSocket). Reset with resetF7Mock().
 */
import type {
  Story,
  VoiceFeedback,
  VoiceSession,
  VoiceSettings,
  VoiceTurn,
} from "../lib/api/types";

export const ACK_VERSION = "2026-10";
export const ACK_TEXT =
  "Some employers and interview platforms prohibit AI assistance during interviews, and using it where it " +
  "is not allowed can get you disqualified. You are responsible for following the rules of each interview. " +
  "Live Copilot stays visible on your screen and only listens while you allow it. Good uses: practice with " +
  "recorded or mock calls, meetings and learning, accessibility, and interviews where AI help is permitted.";

export interface MockSession {
  session: VoiceSession;
  userId: string;
  turns: VoiceTurn[];
  feedback: VoiceFeedback;
  feedbackPolls: number;
}

/** A live socket the tests can push events into. */
export interface LiveSocket {
  sessionId: string;
  mode: "mock" | "copilot";
  send: (msg: Record<string, unknown>) => void;
  say: (text: string, opts?: { slow?: boolean; channel?: string }) => void;
  drop: () => void;
}

export const f7Db = {
  settings: {} as Record<string, VoiceSettings>,
  sessions: new Map<string, MockSession>(),
  stories: {} as Record<string, Story[]>,
  seeded: new Set<string>(),
  tokens: new Map<string, string>(), // stream token -> session id (single use)
  draftTasks: new Map<string, { userId: string; polls: number }>(),
  live: new Map<string, LiveSocket>(),
  /** Every frame byte count the mock sockets received (tests: nothing stored, but frames did flow). */
  framesReceived: 0,
};

export function resetF7Mock(): void {
  f7Db.settings = {};
  f7Db.sessions.clear();
  f7Db.stories = {};
  f7Db.seeded.clear();
  f7Db.tokens.clear();
  f7Db.draftTasks.clear();
  f7Db.live.clear();
  f7Db.framesReceived = 0;
}

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export function settingsFor(userId: string): VoiceSettings {
  f7Db.settings[userId] ??= {
    answer_style: "bullets",
    answer_length: "short",
    language: "en",
    tts_voice: null,
    default_sources: "tab_mic",
    copilot_ack_version: ACK_VERSION,
    copilot_ack_text: ACK_TEXT,
    copilot_acknowledged: false,
    copilot_ack_at: null,
    transcript_retention_days: 90,
  };
  return f7Db.settings[userId];
}

export function emptySession(
  id: string,
  mode: "mock" | "copilot",
  config: Record<string, unknown>,
  extra: Partial<VoiceSession> = {},
): VoiceSession {
  return {
    id,
    mode,
    state: "created",
    job_id: null,
    job_title: null,
    company: null,
    role: null,
    config,
    providers: {},
    started_at: null,
    ended_at: null,
    end_reason: null,
    duration_s: 0,
    cost_usd: 0,
    cost_cap_usd: mode === "mock" ? 0.5 : 1,
    feedback_state: "none",
    overall_score: null,
    question_count: 0,
    created_at: now(),
    ...extra,
  };
}

function turn(
  seq: number,
  speaker: string,
  kind: string,
  text: string,
  extra: Partial<VoiceTurn> = {},
): VoiceTurn {
  return {
    id: `t-${Math.random().toString(36).slice(2, 10)}`,
    seq,
    speaker,
    kind,
    text,
    question_id: null,
    parent_id: null,
    is_followup: false,
    state: "shown",
    start_ms: null,
    end_ms: null,
    metrics: {},
    latency: {},
    ...extra,
  };
}

/** Two finished sessions for a user the first time they open Interview prep. */
export function seedFor(userId: string): void {
  if (f7Db.seeded.has(userId)) return;
  f7Db.seeded.add(userId);
  const mockId = `vs-${userId}-1`;
  const q1 = turn(
    1,
    "interviewer",
    "question",
    "Tell me about a time you led a project under a tight deadline.",
  );
  const a1 = turn(
    2,
    "user",
    "answer",
    "At Northwind I led the billing rewrite, um, with three engineers and we shipped in six weeks.",
    {
      metrics: { words: 18, wpm: 142, filler_count: 1, fillers: { um: 1 }, long_pauses: 0 },
    },
  );
  const q2 = turn(3, "interviewer", "question", "What was the measurable result?", {
    is_followup: true,
  });
  const a2 = turn(4, "user", "answer", "Invoices went out twice as fast.", {
    metrics: { words: 6, wpm: 120, filler_count: 0 },
  });
  const q3 = turn(5, "interviewer", "closing", "Thank you, your feedback is being prepared.");
  f7Db.sessions.set(mockId, {
    userId,
    session: emptySession(
      mockId,
      "mock",
      { interview_type: "behavioral", difficulty: "medium", length: 1, language: "en" },
      {
        state: "ended",
        started_at: daysAgo(3),
        ended_at: daysAgo(3),
        end_reason: "length",
        duration_s: 412,
        cost_usd: 0.012,
        feedback_state: "ready",
        overall_score: 3.6,
        question_count: 2,
        created_at: daysAgo(3),
      },
    ),
    turns: [q1, a1, q2, a2, q3],
    feedbackPolls: 0,
    feedback: {
      state: "ready",
      overall_score: 3.6,
      summary:
        "A clear, well-owned story. Add numbers to the result and keep the situation shorter.",
      scores: { accuracy: 4, relevance: 4, structure: 3, clarity: 4, delivery: 3 },
      strengths: ["Clear ownership of the work."],
      improvements: ["Lead with the result.", "Cut the filler words."],
      weak_questions: ["What was the measurable result?"],
      delivery: { wpm: 131, filler_count: 1, long_pauses: 0 },
      answers: [
        {
          turn_id: a1.id,
          question: q1.text,
          answer: a1.text,
          skill_area: "leadership",
          scores: { accuracy: 4, relevance: 5, structure: 3, clarity: 4, delivery: 4 },
          star: { situation: true, task: true, action: true, result: false },
          strengths: ["Names the team size and timeline."],
          improvements: ["Say what changed because of it."],
          model_answer:
            "At Northwind I led the billing rewrite with three engineers. We had six weeks, so I split the work into weekly releases. [your result]",
          metrics: a1.metrics,
        },
        {
          turn_id: a2.id,
          question: q2.text,
          answer: a2.text,
          skill_area: "impact",
          scores: { accuracy: 3, relevance: 4, structure: 2, clarity: 3 },
          star: { situation: false, task: false, action: false, result: true },
          strengths: ["A concrete outcome."],
          improvements: ["Add how you measured it."],
          model_answer: null,
          metrics: a2.metrics,
        },
      ],
    },
  });
  const copilotId = `vs-${userId}-2`;
  const cq = turn(1, "interviewer", "question", "What is your notice period?", {
    question_id: "q-seed-1",
    metrics: { qtype: "hr" },
  });
  const cs = turn(2, "assistant", "suggestion", "- 30 days, negotiable for the right role.", {
    question_id: "q-seed-1",
  });
  f7Db.sessions.set(copilotId, {
    userId,
    session: emptySession(
      copilotId,
      "copilot",
      { answer_style: "bullets", answer_length: "short", sources: "tab_mic", language: "en" },
      {
        state: "ended",
        started_at: daysAgo(1),
        ended_at: daysAgo(1),
        end_reason: "user",
        duration_s: 1260,
        cost_usd: 0.04,
        feedback_state: "ready",
        question_count: 1,
        created_at: daysAgo(1),
      },
    ),
    turns: [cq, cs],
    feedbackPolls: 0,
    feedback: {
      state: "ready",
      overall_score: null,
      summary: "An HR screening call focused on availability.",
      scores: {},
      strengths: [],
      improvements: ["Have your expected CTC ready."],
      weak_questions: ["What are your salary expectations?"],
      delivery: { weak_topics: ["compensation"] },
      answers: [
        {
          turn_id: null,
          question: cq.text,
          answer: "- 30 days, negotiable for the right role.",
          skill_area: "hr",
          scores: {},
          star: {},
          strengths: [],
          improvements: [],
          model_answer: null,
          metrics: { state: "shown", not_sure: false, is_followup: false },
        },
      ],
    },
  });
  f7Db.stories[userId] = [
    {
      id: `st-${userId}-1`,
      title: "Billing rewrite",
      situation: "Invoices took two days to go out.",
      task: "Lead the rewrite with three engineers in six weeks.",
      action: "Split the work into weekly releases and moved billing to a queue.",
      result: "Invoices went out twice as fast.",
      skills: ["Python", "Leadership"],
      origin: "user",
      approved: true,
      uses: 2,
      created_at: daysAgo(10),
      updated_at: daysAgo(10),
    },
    {
      id: `st-${userId}-2`,
      title: "On-call clean-up",
      situation: "Pages woke the team every night.",
      task: "",
      action: "Grouped alerts and wrote runbooks.",
      result: "",
      skills: ["Reliability"],
      origin: "ai",
      approved: false,
      uses: 0,
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
  ];
}

export function sessionsOf(userId: string): MockSession[] {
  seedFor(userId);
  return [...f7Db.sessions.values()]
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.session.created_at.localeCompare(a.session.created_at));
}

export function storiesOf(userId: string): Story[] {
  seedFor(userId);
  f7Db.stories[userId] ??= [];
  return f7Db.stories[userId];
}

export function issueToken(sessionId: string): string {
  const token = `vt-${Math.random().toString(36).slice(2)}`;
  f7Db.tokens.set(token, sessionId);
  return token;
}

/** Single use, like the backend's Redis jti. */
export function consumeToken(token: string): string | null {
  const id = f7Db.tokens.get(token) ?? null;
  f7Db.tokens.delete(token);
  return id;
}

export function newTurn(
  s: MockSession,
  speaker: string,
  kind: string,
  text: string,
  extra: Partial<VoiceTurn> = {},
): VoiceTurn {
  const t = turn(s.turns.length + 1, speaker, kind, text, extra);
  s.turns.push(t);
  return t;
}

/** Test helper: the interviewer says something in the open copilot (or practice) socket. */
export function mockCopilotSay(text: string, opts?: { slow?: boolean; channel?: string }): void {
  const live = [...f7Db.live.values()].at(-1);
  if (!live) throw new Error("no open voice socket");
  live.say(text, opts);
}

/** Test helper: the network drops the open socket (not a final close code, so the client reconnects). */
export function mockDropSocket(): void {
  [...f7Db.live.values()].at(-1)?.drop();
}
