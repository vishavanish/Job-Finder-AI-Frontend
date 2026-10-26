/**
 * MSW handlers for F7, mirroring backend P7 (routes/voice.py, story_bank.py,
 * practice_session.py, copilot_session.py): REST for providers, settings,
 * the copilot acknowledgement, sessions, feedback, history, progress, the
 * story bank and admin voice health; and two scripted WebSocket servers —
 * Practice (questions, typed or "spoken" answers, follow-up, closing) and
 * Live Copilot (interviewer lines → cards with streamed answers, controls,
 * screenshot, resume after a drop). State lives in mocks/f7State.ts.
 */
import { http, HttpResponse, ws } from "msw";
import type { Story, StoryIn, VoiceSessionCreate, VoiceSettingsIn } from "../lib/api/types";
import { entitlementsFor } from "./data";
import { f3Db } from "./f3State";
import {
  ACK_VERSION,
  emptySession,
  f7Db,
  issueToken,
  newTurn,
  seedFor,
  sessionsOf,
  settingsFor,
  storiesOf,
  consumeToken,
  type MockSession,
} from "./f7State";
import { API, authenticate, newId, readJson, requireRole } from "./handlers";

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status });
const LIVE_STATES = new Set(["created", "active", "paused"]);
const STREAM = {
  mock: (id: string) => `/api/v1/voice/sessions/${id}/stream`,
  copilot: (id: string) => `/api/v1/voice/copilot/${id}/stream`,
};
const PROVIDERS = {
  stt: {
    name: "Whisper Large v3 Turbo (Groq)",
    provider: "groq",
    model_id: "whisper-large-v3-turbo",
    tier: "free",
    streaming: false,
  },
  tts: {
    name: "Browser voice",
    provider: "browser",
    model_id: "speech-synthesis",
    tier: "free",
    kind: "browser",
  },
};
const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

function owned(userId: string, id: string): MockSession | undefined {
  seedFor(userId);
  const s = f7Db.sessions.get(id);
  return s && s.userId === userId ? s : undefined;
}

function liveSessionOf(userId: string): MockSession | undefined {
  return [...f7Db.live.values()]
    .map((l) => f7Db.sessions.get(l.sessionId))
    .find((s) => s && s.userId === userId);
}

// ------------------------------------------------------------------ REST

export const f7RestHandlers = [
  http.get(`${API}/voice/providers`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({
      ...PROVIDERS,
      llm_fast: "GPT-OSS 120B (Groq)",
      llm_strong: "Gemini 2.5 Flash",
      streaming_stt: false,
      diarization: false,
      expected_first_word_ms: 1550,
      ready: true,
      reason: null,
    });
  }),

  http.get(`${API}/voice/settings`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(settingsFor(auth.user.id));
  }),

  http.put(`${API}/voice/settings`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<VoiceSettingsIn>(request);
    const s = settingsFor(auth.user.id);
    for (const [k, v] of Object.entries(body))
      if (v !== null && v !== undefined) (s as Record<string, unknown>)[k] = v;
    return HttpResponse.json(s);
  }),

  http.post(`${API}/voice/copilot/acknowledge`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const { version } = await readJson<{ version: string }>(request);
    if (version !== ACK_VERSION)
      return fail(
        409,
        "ack_version_changed",
        "The notice changed — read the new one and accept it.",
      );
    const s = settingsFor(auth.user.id);
    s.copilot_acknowledged = true;
    s.copilot_ack_at = new Date().toISOString();
    return HttpResponse.json(s);
  }),

  http.post(`${API}/voice/sessions`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<VoiceSessionCreate>(request);
    const mode = body.mode ?? "mock";
    const ent = entitlementsFor(auth.user.id);
    const settings = settingsFor(auth.user.id);
    if (mode === "mock" && ent.voice_prep?.enabled === false) {
      return HttpResponse.json(
        { detail: "Your account does not include interview practice." },
        { status: 403 },
      );
    }
    if (mode === "copilot") {
      if (!ent.live_copilot?.enabled) {
        return HttpResponse.json(
          { detail: "Your account does not include Live Copilot. Ask an admin to enable it." },
          { status: 403 },
        );
      }
      if (!settings.copilot_acknowledged) {
        return fail(
          403,
          "copilot_ack_required",
          "Read and accept the Live Copilot notice before the first session.",
        );
      }
    }
    if (liveSessionOf(auth.user.id)) {
      return fail(
        409,
        "voice_session_busy",
        "Another voice session is open. End it first (only one at a time).",
      );
    }
    const id = newId("vs");
    const job = body.job_id ? f3Db.jobs.get(body.job_id) : undefined;
    const config =
      mode === "copilot"
        ? {
            answer_style: body.answer_style ?? settings.answer_style,
            answer_length: body.answer_length ?? settings.answer_length,
            sources: body.sources ?? settings.default_sources,
            language: body.language ?? settings.language,
          }
        : {
            interview_type: body.interview_type ?? "behavioral",
            difficulty: body.difficulty ?? "medium",
            length: body.length ?? 5,
            language: body.language ?? settings.language,
            focus_questions: body.focus_questions ?? [],
          };
    const session = emptySession(id, mode, config, {
      job_id: job?.id ?? null,
      job_title: job?.title ?? null,
      company: job?.company ?? null,
      role: body.role ?? null,
    });
    seedFor(auth.user.id);
    f7Db.sessions.set(id, {
      userId: auth.user.id,
      session,
      turns: [],
      feedback: { state: "none", answers: [] } as never,
      feedbackPolls: 0,
    });
    return HttpResponse.json(
      { session, stream_token: issueToken(id), stream_path: STREAM[mode](id), expires_in: 60 },
      { status: 201 },
    );
  }),

  http.post(`${API}/voice/sessions/:id/token`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const s = owned(auth.user.id, String(params.id));
    if (!s) return fail(404, "voice_session_not_found", "No voice session with this id.");
    if (!LIVE_STATES.has(s.session.state))
      return fail(409, "session_ended", "This session has ended. Start a new one.");
    return HttpResponse.json({ stream_token: issueToken(s.session.id), expires_in: 60 });
  }),

  http.get(`${API}/voice/sessions/:id/feedback`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const s = owned(auth.user.id, String(params.id));
    if (!s) return fail(404, "voice_session_not_found", "No voice session with this id.");
    if (s.session.feedback_state === "pending") {
      s.feedbackPolls += 1;
      if (s.feedbackPolls >= 2) finishFeedback(s);
    }
    return HttpResponse.json(
      s.session.feedback_state === "ready"
        ? s.feedback
        : { state: s.session.feedback_state, answers: [] },
    );
  }),

  http.post(`${API}/voice/sessions/:id/feedback/retry`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const s = owned(auth.user.id, String(params.id));
    if (!s) return fail(404, "voice_session_not_found", "No voice session with this id.");
    if (s.session.feedback_state !== "failed")
      return fail(409, "feedback_not_failed", "Feedback can only be retried after it failed.");
    s.session.feedback_state = "pending";
    s.feedbackPolls = 0;
    return HttpResponse.json({ state: "pending", answers: [] }, { status: 202 });
  }),

  http.get(`${API}/voice/sessions/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const s = owned(auth.user.id, String(params.id));
    if (!s) return fail(404, "voice_session_not_found", "No voice session with this id.");
    return HttpResponse.json({ session: s.session, turns: s.turns });
  }),

  http.delete(`${API}/voice/sessions/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const s = owned(auth.user.id, String(params.id));
    if (!s) return fail(404, "voice_session_not_found", "No voice session with this id.");
    f7Db.sessions.delete(s.session.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/voice/history`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const p = new URL(request.url).searchParams;
    const mode = p.get("mode");
    const all = sessionsOf(auth.user.id).filter((s) => !mode || s.session.mode === mode);
    const limit = Number(p.get("limit") ?? 20);
    const offset = Number(p.get("offset") ?? 0);
    return HttpResponse.json({
      sessions: all.slice(offset, offset + limit).map((s) => s.session),
      total: all.length,
    });
  }),

  http.delete(`${API}/voice/history`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const mine = sessionsOf(auth.user.id);
    mine.forEach((s) => f7Db.sessions.delete(s.session.id));
    return HttpResponse.json({ deleted: mine.length });
  }),

  http.get(`${API}/voice/progress`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const done = sessionsOf(auth.user.id).filter(
      (s) => s.session.mode === "mock" && s.session.feedback_state === "ready",
    );
    const areas = new Map<
      string,
      { scores: number[]; trend: { session_id: string; date: string; score: number }[] }
    >();
    for (const s of done) {
      for (const a of s.feedback.answers ?? []) {
        const values = Object.values(a.scores).filter((v): v is number => typeof v === "number");
        if (!values.length) continue;
        const avg = values.reduce((x, y) => x + y, 0) / values.length;
        const area = a.skill_area ?? "general";
        const entry = areas.get(area) ?? { scores: [], trend: [] };
        entry.scores.push(avg);
        entry.trend.push({
          session_id: s.session.id,
          date: s.session.ended_at ?? s.session.created_at,
          score: Math.round(avg * 100) / 100,
        });
        areas.set(area, entry);
      }
    }
    const scores = done.map((s) => s.session.overall_score).filter((v): v is number => v !== null);
    return HttpResponse.json({
      sessions: done.length,
      average: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      areas: [...areas.entries()].map(([skill_area, e]) => ({
        skill_area,
        answers: e.scores.length,
        average: Math.round((e.scores.reduce((a, b) => a + b, 0) / e.scores.length) * 100) / 100,
        trend: e.trend,
      })),
      by_type: {},
      weak_questions: done.flatMap((s) => s.feedback.weak_questions ?? []).slice(0, 10),
    });
  }),

  // ---- story bank ----
  http.get(`${API}/story-bank`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const stories = [...storiesOf(auth.user.id)].sort(
      (a, b) => Number(a.approved) - Number(b.approved),
    );
    return HttpResponse.json({
      stories,
      total: stories.length,
      needs_review: stories.filter((s) => !s.approved).length,
    });
  }),

  http.post(`${API}/story-bank/draft-from-resume`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const taskId = newId("task");
    f7Db.draftTasks.set(taskId, { userId: auth.user.id, polls: 0 });
    return HttpResponse.json(
      {
        task_id: taskId,
        message: "Drafting stories from your resume — they'll appear here for you to review.",
      },
      { status: 202 },
    );
  }),

  http.post(`${API}/story-bank`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<StoryIn>(request);
    if (!body.title?.trim())
      return HttpResponse.json({ detail: [{ msg: "Title is required" }] }, { status: 422 });
    const story = makeStory(body, "user");
    storiesOf(auth.user.id).unshift(story);
    return HttpResponse.json(story, { status: 201 });
  }),

  http.put(`${API}/story-bank/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const story = storiesOf(auth.user.id).find((s) => s.id === params.id);
    if (!story) return fail(404, "story_not_found", "No story with this id.");
    Object.assign(story, await readJson<StoryIn>(request), {
      approved: true,
      updated_at: new Date().toISOString(),
    });
    return HttpResponse.json(story);
  }),

  http.post(`${API}/story-bank/:id/approve`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const story = storiesOf(auth.user.id).find((s) => s.id === params.id);
    if (!story) return fail(404, "story_not_found", "No story with this id.");
    story.approved = true;
    return HttpResponse.json(story);
  }),

  http.delete(`${API}/story-bank/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = storiesOf(auth.user.id);
    const i = list.findIndex((s) => s.id === params.id);
    if (i < 0) return fail(404, "story_not_found", "No story with this id.");
    list.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // The draft task; any other task id falls through to the generic /tasks/:id mock.
  http.get(`${API}/tasks/:id`, ({ params }) => {
    const task = f7Db.draftTasks.get(String(params.id));
    if (!task) return undefined;
    task.polls += 1;
    const at = new Date().toISOString();
    if (task.polls < 2) {
      return HttpResponse.json({
        task_id: params.id,
        status: "running",
        created_at: at,
        updated_at: at,
        progress: "Reading your resume",
      });
    }
    if (task.polls === 2) {
      storiesOf(task.userId).unshift(
        makeStory(
          {
            title: "API latency fix",
            situation: "Checkout calls took 2 s.",
            task: "",
            action: "Added caching in Redis.",
            result: "",
            skills: ["Redis"],
          },
          "ai",
        ),
      );
    }
    return HttpResponse.json({
      task_id: params.id,
      status: "completed",
      created_at: at,
      updated_at: at,
      progress: null,
      result: { created: 1, message: "1 draft story is waiting for your review." },
    });
  }),

  http.get(`${API}/admin/voice/health`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({
      days: 7,
      sessions: {
        mock: { total: 12, "ended:length": 9, "ended:user": 3 },
        copilot: { total: 4, "ended:user": 4 },
      },
      latency: {
        mock: {
          stt_ms: { p50: 420, p95: 910, n: 40 },
          first_token_ms: { p50: 380, p95: 720, n: 40 },
          first_word_ms: { p50: 1480, p95: 2300, n: 40 },
        },
        copilot: {
          gate_ms: { p50: 1, p95: 3, n: 22 },
          first_visible_ms: { p50: 1180, p95: 1900, n: 22 },
          speculative_share: 0,
        },
      },
      speech: [
        {
          task: "stt",
          provider: "groq",
          model_id: "whisper-large-v3-turbo",
          calls: 180,
          failures: 2,
          error_rate: 0.011,
          latency_ms: { p50: 410, p95: 900, n: 178 },
          cost_usd: 0,
          last_error: "HTTP 429 from speech endpoint",
          units: 1520,
        },
      ],
      llm: [
        {
          task: "copilot_answer",
          provider: "groq",
          model_id: "openai/gpt-oss-120b",
          calls: 22,
          failures: 0,
          error_rate: 0,
          latency_ms: { p50: 900, p95: 1700, n: 22 },
          cost_usd: 0,
          last_error: null,
        },
      ],
      spend_usd: 0.31,
      flags: { live_copilot_enabled: true },
    });
  }),
];

function makeStory(body: Partial<StoryIn>, origin: "user" | "ai"): Story {
  const at = new Date().toISOString();
  return {
    id: newId("st"),
    title: body.title ?? "",
    situation: body.situation ?? "",
    task: body.task ?? "",
    action: body.action ?? "",
    result: body.result ?? "",
    skills: body.skills ?? [],
    origin,
    approved: origin === "user",
    uses: 0,
    created_at: at,
    updated_at: at,
  };
}

function finishFeedback(s: MockSession): void {
  const qa: { q: string; a: string; id: string | null }[] = [];
  let lastQ = "";
  for (const t of s.turns) {
    if (t.speaker === "interviewer" && t.kind === "question") lastQ = t.text;
    else if (t.speaker === "user" && t.kind === "answer")
      qa.push({ q: lastQ, a: t.text, id: t.id });
    else if (t.kind === "question" && t.question_id) qa.push({ q: t.text, a: "", id: null });
    else if (t.kind === "suggestion" && qa.length) qa[qa.length - 1]!.a = t.text;
  }
  s.session.feedback_state = "ready";
  s.session.overall_score = s.session.mode === "mock" ? 3.4 : null;
  s.feedback = {
    state: "ready",
    overall_score: s.session.overall_score,
    summary:
      s.session.mode === "mock"
        ? "Good structure; add numbers to your results."
        : `${qa.length} questions were detected.`,
    scores:
      s.session.mode === "mock" ? { accuracy: 4, relevance: 4, structure: 3, clarity: 3 } : {},
    strengths: s.session.mode === "mock" ? ["You stayed on the question."] : [],
    improvements: ["Lead with the outcome."],
    weak_questions: qa.slice(0, 2).map((x) => x.q),
    delivery:
      s.session.mode === "mock"
        ? { wpm: 138, filler_count: 2, long_pauses: 0 }
        : { weak_topics: [] },
    answers: qa.map((x) => ({
      turn_id: x.id,
      question: x.q,
      answer: x.a,
      skill_area: "general",
      scores:
        s.session.mode === "mock" ? { accuracy: 4, relevance: 4, structure: 3, clarity: 3 } : {},
      star: {},
      strengths: [],
      improvements: [],
      model_answer: null,
      metrics: {},
    })),
  };
}

// ------------------------------------------------------------------ sockets

type Client = { send: (data: string) => void; close: (code?: number, reason?: string) => void };

function endSession(s: MockSession, reason: string): void {
  s.session.state = "ended";
  s.session.end_reason = reason;
  s.session.ended_at = new Date().toISOString();
  s.session.duration_s = 95;
  s.session.feedback_state = "pending";
  s.session.question_count = s.turns.filter((t) => t.kind === "question").length;
}

function authFirst(
  client: Client,
  data: unknown,
  mode: "mock" | "copilot",
  pathId: string,
): MockSession | null {
  let msg: { type?: string; token?: string } = {};
  try {
    msg = JSON.parse(String(data));
  } catch {
    // not JSON
  }
  const sessionId = msg.type === "auth" && msg.token ? consumeToken(msg.token) : null;
  const s = sessionId === pathId ? f7Db.sessions.get(pathId) : undefined;
  const reject = (code: number, err: string, message: string) => {
    client.send(JSON.stringify({ type: "error", code: err, message, retryable: false }));
    client.close(code, err);
    return null;
  };
  if (!s || s.session.mode !== mode)
    return reject(4401, "auth_failed", "This stream token is invalid, expired or already used.");
  if (!LIVE_STATES.has(s.session.state))
    return reject(4404, "session_ended", "This session has ended. Start a new one.");
  if (mode === "copilot") {
    if (!entitlementsFor(s.userId).live_copilot?.enabled)
      return reject(4403, "feature_disabled", "Your account does not include Live Copilot.");
    if (!settingsFor(s.userId).copilot_acknowledged)
      return reject(4403, "copilot_ack_required", "Read and accept the Live Copilot notice first.");
  }
  s.session.state = "active";
  s.session.started_at ??= new Date().toISOString();
  return s;
}

const PRACTICE_QUESTIONS = [
  ["Hi, thanks for joining.", "Tell me about a project you led recently."],
  ["What was the hardest decision in that project?"],
  ["How do you handle disagreement with a teammate?"],
  ["Where do you want to grow next?"],
];

const practiceLink = ws.link("*/api/v1/voice/sessions/:sessionId/stream");
const copilotLink = ws.link("*/api/v1/voice/copilot/:sessionId/stream");

const practiceSocket = practiceLink.addEventListener("connection", ({ client, params }) => {
  const pathId = String(params.sessionId);
  let s: MockSession | null = null;
  let frames = 0;
  let paused = false;
  let lastQuestion = "";
  const send = (msg: Record<string, unknown>) => client.send(JSON.stringify(msg));
  const asked = () =>
    s!.turns.filter((t) => t.speaker === "interviewer" && t.kind === "question").length;
  const length = () => Number((s!.session.config as { length?: number }).length ?? 3);

  const interviewer = (sentences: string[], kind: "question" | "closing") => {
    send({ type: "status", state: "thinking" });
    const turnId = newId("turn");
    sentences.forEach((text, index) =>
      later(10 + index * 10, () => {
        if (index === 0) send({ type: "status", state: "speaking" });
        send({ type: "interviewer.delta", turn_id: turnId, index, text });
      }),
    );
    later(20 + sentences.length * 10, () => {
      const text = sentences.join(" ");
      newTurn(s!, "interviewer", kind, text, { id: turnId });
      lastQuestion = text;
      send({
        type: "turn.done",
        turn_id: turnId,
        kind,
        text,
        is_followup: false,
        question_no: asked(),
        of: length(),
        latency: { first_word_ms: 1200 },
      });
      if (kind === "closing") {
        endSession(s!, "length");
        send({ type: "status", state: "ended", reason: "length" });
        send({ type: "session.ended", reason: "length", feedback_pending: true });
        f7Db.live.delete(pathId);
        later(20, () => client.close(1000)); // let the last messages reach the client first
      } else {
        send({ type: "status", state: "listening" });
      }
    });
  };
  const next = () => {
    const n = asked();
    if (n >= length())
      interviewer(
        ["Thank you, that's all from me.", "Your feedback is being prepared."],
        "closing",
      );
    else interviewer(PRACTICE_QUESTIONS[n % PRACTICE_QUESTIONS.length]!, "question");
  };
  const answer = (text: string, typed: boolean) => {
    newTurn(s!, "user", "answer", text);
    send({ type: "transcript.final", channel: "user", text, typed });
    next();
  };

  client.addEventListener("message", (event) => {
    if (!s) {
      s = authFirst(client, event.data, "mock", pathId);
      if (!s) return;
      f7Db.live.set(pathId, {
        sessionId: pathId,
        mode: "mock",
        send,
        say: (text) => answer(text, false),
        drop: () => {
          f7Db.live.delete(pathId);
          client.close(4500, "dropped");
        },
      });
      if (s.turns.length) send({ type: "session.resumed", turns: s.turns });
      send({
        type: "status",
        state: s.turns.length ? "listening" : "ready",
        providers: PROVIDERS,
        question_no: asked(),
        of: length(),
        stt_available: true,
        cost_capped: false,
      });
      return;
    }
    if (typeof event.data !== "string") {
      f7Db.framesReceived += 1;
      frames += 1;
      if (!paused && frames % 50 === 0 && asked() > 0)
        answer("I led the billing rewrite with three engineers.", false);
      return;
    }
    const msg = JSON.parse(event.data) as { type: string; action?: string; text?: string };
    if (msg.type === "ping") send({ type: "pong" });
    else if (msg.type === "text" && msg.text?.trim()) answer(msg.text.trim(), true);
    else if (msg.type === "control") {
      if (msg.action === "start" && !s.turns.length) next();
      else if (msg.action === "pause") {
        paused = true;
        send({ type: "status", state: "paused", reason: "user" });
      } else if (msg.action === "resume") {
        paused = false;
        send({ type: "status", state: "listening" });
      } else if (msg.action === "skip") answer("(skipped)", true);
      else if (msg.action === "repeat" && lastQuestion) {
        send({
          type: "interviewer.delta",
          turn_id: "repeat",
          index: 0,
          text: lastQuestion,
          repeat: true,
        });
        send({
          type: "turn.done",
          turn_id: "repeat",
          kind: "question",
          text: lastQuestion,
          repeat: true,
        });
      } else if (msg.action === "end") {
        endSession(s, "user");
        send({ type: "status", state: "ended", reason: "user" });
        send({ type: "session.ended", reason: "user", feedback_pending: true });
        f7Db.live.delete(pathId);
        later(20, () => client.close(1000)); // let the last messages reach the client first
      }
    }
  });
  client.addEventListener("close", () => {
    if (f7Db.live.get(pathId)?.mode === "mock") f7Db.live.delete(pathId);
  });
});

const COPILOT_LINES = [
  "Can you hear me okay?",
  "Tell me about a time you led a project.",
  "Why?",
  "What is your notice period?",
];
const QUESTION = /\?$|^(tell|describe|explain|walk)/i;

function answerFor(text: string): string[] {
  if (/notice/i.test(text)) return ["- 30 days, ", "negotiable for ", "the right role."];
  if (/^why\??$/i.test(text.trim())) return ["- Because the deadline ", "was fixed by a customer."];
  if (/screenshot|problem/i.test(text)) return ["Approach: ", "two pointers, ", "O(n) time."];
  return ["- Led the billing rewrite ", "with three engineers.\n", "- Shipped in six weeks."];
}

const copilotSocket = copilotLink.addEventListener("connection", ({ client, params }) => {
  const pathId = String(params.sessionId);
  let s: MockSession | null = null;
  let frames = 0;
  let line = 0;
  let paused = false;
  let lastCard: { id: string; at: number } | null = null;
  let running: { id: string; timers: ReturnType<typeof setTimeout>[] } | null = null;
  let lastHeard = "";
  const send = (msg: Record<string, unknown>) => client.send(JSON.stringify(msg));

  const stream = (id: string, pieces: string[], slow = false) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const gap = slow ? 400 : 10;
    pieces.forEach((text, i) =>
      timers.push(
        later(gap * (i + 1), () => send({ type: "answer.delta", question_id: id, text })),
      ),
    );
    timers.push(
      later(gap * (pieces.length + 1), () => {
        running = null;
        const text = pieces.join("");
        newTurn(s!, "assistant", "suggestion", text, { question_id: id });
        send({
          type: "answer.done",
          question_id: id,
          text,
          not_sure: /notice/i.test(text) ? false : pieces.length === 2,
          unverified: [],
          model: "GPT-OSS 120B (Groq)",
          latency: { first_visible_ms: 840, speculative: false },
        });
      }),
    );
    running = { id, timers };
  };
  const stop = (reason: string) => {
    if (!running) return;
    running.timers.forEach(clearTimeout);
    send({ type: "answer.cancelled", question_id: running.id, reason });
    running = null;
  };
  const card = (text: string, opts: { slow?: boolean; forced?: boolean; qtype?: string } = {}) => {
    stop("interrupted");
    const followup =
      /^(why|how so|tell me more)\??$/i.test(text.trim()) &&
      lastCard !== null &&
      Date.now() - lastCard.at < 30_000;
    const id = newId("q");
    newTurn(s!, "interviewer", "question", text, {
      question_id: id,
      parent_id: followup ? lastCard!.id : null,
      is_followup: followup,
    });
    send({
      type: "question.detected",
      question_id: id,
      text,
      qtype:
        opts.qtype ??
        (/notice/i.test(text) ? "hr" : /time you/i.test(text) ? "behavioral" : "general"),
      is_followup: followup,
      parent_id: followup ? lastCard!.id : null,
      multipart: false,
      speculative: false,
      forced: Boolean(opts.forced),
    });
    lastCard = followup ? lastCard : { id, at: Date.now() };
    if (followup && lastCard) lastCard.at = Date.now();
    stream(id, answerFor(text), opts.slow);
  };
  const say = (text: string, opts: { slow?: boolean; channel?: string } = {}) => {
    if (paused) return;
    send({ type: "transcript.final", channel: opts.channel ?? "interviewer", text });
    if (opts.channel === "user") return;
    lastHeard = text;
    if (QUESTION.test(text.trim()) && !/hear me/i.test(text)) card(text, opts);
    else newTurn(s!, "interviewer", "utterance", text);
  };

  client.addEventListener("message", (event) => {
    if (!s) {
      s = authFirst(client, event.data, "copilot", pathId);
      if (!s) return;
      f7Db.live.set(pathId, {
        sessionId: pathId,
        mode: "copilot",
        send,
        say,
        drop: () => {
          f7Db.live.delete(pathId);
          client.close(4500, "dropped");
        },
      });
      if (s.turns.length) send({ type: "session.resumed", turns: s.turns });
      send({
        type: "status",
        state: "listening",
        providers: { stt: PROVIDERS.stt },
        streaming: false,
        speculative: false,
        cost_capped: false,
        stt_available: true,
        sources: (s.session.config as { sources?: string }).sources,
      });
      return;
    }
    if (typeof event.data !== "string") {
      f7Db.framesReceived += 1;
      frames += 1;
      if (!paused && frames % 60 === 0) say(COPILOT_LINES[line++ % COPILOT_LINES.length]!);
      return;
    }
    const msg = JSON.parse(event.data) as {
      type: string;
      action?: string;
      question_id?: string;
      image?: string;
      text?: string;
    };
    if (msg.type === "ping") send({ type: "pong" });
    else if (msg.type === "screenshot") {
      if (!String(msg.image ?? "").startsWith("data:image/")) {
        send({
          type: "error",
          code: "bad_screenshot",
          message: "Send one PNG, JPEG or WebP image as a data URL, at most 2 MB.",
          retryable: false,
        });
      } else
        card(msg.text || "Solve the problem shown in this screenshot.", {
          forced: true,
          qtype: "coding",
        });
    } else if (msg.type === "control") {
      const known = s.turns.some((t) => t.question_id === msg.question_id);
      switch (msg.action) {
        case "pause":
          paused = true;
          send({ type: "status", state: "paused", reason: "user" });
          break;
        case "resume":
          paused = false;
          send({ type: "status", state: "listening" });
          break;
        case "answer_now":
          if (lastHeard) card(lastHeard, { forced: true });
          else
            send({
              type: "error",
              code: "nothing_to_answer",
              message: "Nothing was said in the last 20 seconds.",
              retryable: false,
            });
          break;
        case "expand":
        case "shorter":
        case "regenerate":
          if (!known) {
            send({
              type: "error",
              code: "unknown_question",
              message: "No card with this question_id.",
              retryable: false,
            });
            break;
          }
          if (running && running.id !== msg.question_id) stop("interrupted");
          else if (running) running.timers.forEach(clearTimeout);
          send({ type: "answer.cancelled", question_id: msg.question_id, reason: "regenerating" });
          stream(
            msg.question_id!,
            msg.action === "shorter"
              ? ["- 30 days."]
              : msg.action === "expand"
                ? ["- A longer answer ", "with an example ", "from your resume."]
                : ["- A fresh take ", "on the same answer."],
          );
          break;
        case "dismiss":
        case "that_was_me":
          if (running && running.id === msg.question_id) {
            running.timers.forEach(clearTimeout);
            running = null;
          }
          send({ type: "answer.cancelled", question_id: msg.question_id, reason: "dismissed" });
          break;
        case "stop":
          stop("interrupted");
          endSession(s, "user");
          send({ type: "status", state: "ended", reason: "user" });
          send({ type: "session.ended", reason: "user", feedback_pending: true });
          f7Db.live.delete(pathId);
          later(20, () => client.close(1000)); // let the last messages reach the client first
          break;
        default:
          send({
            type: "error",
            code: "bad_control",
            message: `Unknown control '${msg.action}'.`,
            retryable: false,
          });
      }
    }
  });
  client.addEventListener("close", () => {
    running?.timers.forEach(clearTimeout);
    if (f7Db.live.get(pathId)?.mode === "copilot") f7Db.live.delete(pathId);
  });
});

export const f7Handlers = [...f7RestHandlers, practiceSocket, copilotSocket];
