/**
 * F7 pure pieces: resampling and framing, the bounded send queue, frame
 * encoding, the copilot and practice reducers, and the mock voice socket
 * contract (first-message auth, single-use token).
 */
import { describe, expect, it, vi } from "vitest";
import { FrameChunker, downsample, rms } from "./audio/resample";
import { SendQueue } from "./audio/sendQueue";
import {
  copilotReducer,
  initialCopilot,
  threads,
  timingLine,
  type CopilotState,
} from "./copilotReducer";
import { initialPractice, practiceReducer } from "./practiceReducer";
import { FRAME_SAMPLES, decodeAudioOut, encodeFrame, socketUrl, type ServerMsg } from "./protocol";
import { f7Db, issueToken, emptySession } from "../../mocks/f7State";

describe("audio framing", () => {
  it("downsamples 48 kHz to 16 kHz PCM16 and cuts 40 ms frames without losing samples", () => {
    const tone = new Float32Array(4800).map((_, i) => Math.sin(i / 10) * 0.5);
    expect(downsample(tone, 48000)).toHaveLength(1600);
    const chunker = new FrameChunker(48000);
    const frames = [...chunker.push(tone.subarray(0, 1000)), ...chunker.push(tone.subarray(1000))];
    expect(frames).toHaveLength(Math.floor(1600 / FRAME_SAMPLES));
    expect(frames.every((f) => f.length === FRAME_SAMPLES)).toBe(true);
    expect(rms(frames[0]!)).toBeGreaterThan(0.5);
    expect(rms(new Int16Array(640))).toBe(0);
  });

  it("clips to the PCM16 range", () => {
    expect([...downsample(new Float32Array([2, -2]), 16000)]).toEqual([32767, -32768]);
  });

  it("encodes the frame header and decodes server audio", () => {
    const buf = encodeFrame(0, 1234, new Int16Array([1, -1]));
    const view = new DataView(buf);
    expect(view.getUint8(0)).toBe(0);
    expect(view.getUint32(1, true)).toBe(1234);
    expect(buf.byteLength).toBe(9);
    const out = new Uint8Array([9, 2, 0, 0, 0, 0xff, 0xfb]).buffer;
    expect(decodeAudioOut(out)).toMatchObject({ index: 2 });
    expect(decodeAudioOut(new Uint8Array([1, 0, 0, 0, 0]).buffer)).toBeNull();
    expect(socketUrl("/api/v1/voice/copilot/x/stream")).toMatch(
      /^ws:\/\/.+\/api\/v1\/voice\/copilot\/x\/stream$/,
    );
  });

  it("sends voice sockets to VITE_WS_ORIGIN when the API sits behind a proxy (QA1 §1)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_WS_ORIGIN", "https://api.example.test/");
    vi.resetModules();
    try {
      const { socketUrl: proxied } = await import("./protocol");
      expect(proxied("/api/v1/voice/sessions/s1/stream")).toBe(
        "wss://api.example.test/api/v1/voice/sessions/s1/stream",
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("drops the oldest frames when the socket stalls", () => {
    const q = new SendQueue<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => q.push(n));
    expect(q.drain()).toEqual([3, 4, 5]);
    expect(q.dropped).toBe(2);
    expect(q.size).toBe(0);
  });
});

const run = (state: CopilotState, ...msgs: ServerMsg[]) =>
  msgs.reduce((s, msg) => copilotReducer(s, { type: "server", msg }), state);

describe("copilot reducer", () => {
  const detected = (id: string, text: string, parent: string | null = null): ServerMsg => ({
    type: "question.detected",
    question_id: id,
    text,
    qtype: "general",
    is_followup: Boolean(parent),
    parent_id: parent,
    multipart: false,
    speculative: false,
  });

  it("streams an answer into its card, interrupts it, and threads follow-ups", () => {
    let s = run(initialCopilot, detected("a", "Tell me about a project."));
    s = copilotReducer(s, { type: "deltas", chunks: { a: "- Led " } });
    s = copilotReducer(s, { type: "deltas", chunks: { a: "the rewrite" } });
    expect(s.cards.a!.answer).toBe("- Led the rewrite");
    s = run(
      s,
      { type: "answer.cancelled", question_id: "a", reason: "interrupted" },
      detected("b", "Why?", "a"),
    );
    expect(s.cards.a!.state).toBe("interrupted");
    expect(s.activeId).toBe("b");
    const t = threads(s);
    expect(t).toHaveLength(1);
    expect(t[0]!.followups.map((c) => c.id)).toEqual(["b"]);
    s = run(s, {
      type: "answer.done",
      question_id: "b",
      text: "- Deadline.",
      not_sure: true,
      latency: { first_visible_ms: 800 },
    });
    expect(s.cards.b).toMatchObject({ state: "done", notSure: true, firstVisibleMs: 800 });
    expect(timingLine(s.cards.b!)).toBe("first words 0.80 s");
    s = run(s, {
      type: "answer.done",
      question_id: "a",
      text: "- Led it.",
      not_sure: false,
      model: "GPT-OSS 120B (Groq)",
      latency: { first_visible_ms: 350, total_ms: 1250, end_wait_ms: 450, stt_ms: 400 },
    });
    expect(timingLine(s.cards.a!)).toBe(
      "1.3 s · wait 0.45 · speech→text 0.40 · AI 0.35 · GPT-OSS 120B (Groq)",
    );
  });

  it("clears the answer on restart / regenerate and rebuilds cards after a reconnect", () => {
    let s = run(initialCopilot, detected("a", "What is your notice period?"));
    s = run(s, { type: "answer.delta", question_id: "a", text: "30" });
    s = run(s, { type: "answer.cancelled", question_id: "a", reason: "restarted" });
    expect(s.cards.a).toMatchObject({ answer: "", state: "streaming" });
    s = run(s, {
      type: "question.updated",
      question_id: "a",
      text: "What is your notice period and CTC?",
    });
    expect(s.cards.a!.text).toContain("CTC");
    const resumed = run(initialCopilot, {
      type: "session.resumed",
      turns: [
        {
          id: "1",
          seq: 1,
          speaker: "interviewer",
          kind: "question",
          text: "Q1?",
          question_id: "q1",
          state: "shown",
        },
        {
          id: "2",
          seq: 2,
          speaker: "assistant",
          kind: "suggestion",
          text: "- A1",
          question_id: "q1",
          state: "shown",
        },
      ],
    });
    expect(resumed.order).toEqual(["q1"]);
    expect(resumed.cards.q1).toMatchObject({ answer: "- A1", state: "done" });
  });
});

describe("practice reducer", () => {
  it("shows the interviewer sentence by sentence and closes the user's answer", () => {
    let s = practiceReducer(initialPractice, {
      type: "server",
      msg: { type: "status", state: "ready", of: 2 },
    });
    s = practiceReducer(s, {
      type: "server",
      msg: { type: "interviewer.delta", turn_id: "t1", index: 0, text: "Hi." },
    });
    s = practiceReducer(s, {
      type: "server",
      msg: { type: "interviewer.delta", turn_id: "t1", index: 1, text: "Why us?" },
    });
    expect(s.draft?.sentences).toEqual(["Hi.", "Why us?"]);
    s = practiceReducer(s, {
      type: "server",
      msg: {
        type: "turn.done",
        turn_id: "t1",
        kind: "question",
        text: "Hi. Why us?",
        question_no: 1,
        of: 2,
      },
    });
    s = practiceReducer(s, {
      type: "server",
      msg: { type: "transcript.final", channel: "user", text: "Because of the product." },
    });
    s = practiceReducer(s, {
      type: "server",
      msg: { type: "turn.done", turn_id: "t2", kind: "closing", text: "Thanks." },
    });
    expect(s.lines.map((l) => [l.speaker, l.text])).toEqual([
      ["interviewer", "Hi. Why us?"],
      ["user", "Because of the product."],
      ["interviewer", "Thanks."],
    ]);
    expect(s.lines.at(-1)!.closing).toBe(true);
  });
});

describe("mock voice socket", () => {
  it("needs the stream token as the first message and accepts it once", async () => {
    f7Db.sessions.set("s1", {
      userId: "u",
      session: emptySession("s1", "mock", { length: 1 }),
      turns: [],
      feedback: { state: "none", answers: [] } as never,
      feedbackPolls: 0,
    });
    const token = issueToken("s1");
    const open = (t: string) =>
      new Promise<{ first?: Record<string, unknown>; code?: number }>((resolve) => {
        const socket = new WebSocket(socketUrl("/api/v1/voice/sessions/s1/stream"));
        socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token: t }));
        socket.onmessage = (e) => {
          resolve({ first: JSON.parse(String(e.data)) as Record<string, unknown> });
          socket.close();
        };
        socket.onclose = (e) => resolve({ code: e.code });
      });
    expect((await open(token)).first).toMatchObject({ type: "status", state: "ready" });
    const second = await open(token);
    expect(second.code === 4401 || second.first?.code === "auth_failed").toBe(true);
  });
});
