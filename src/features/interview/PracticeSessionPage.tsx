/**
 * A Practice session (spec §6.10, F7 plan §1.2): voice conversation with
 * live captions, a Listening / Thinking / Speaking indicator, a mic level
 * meter, Pause / Repeat / Skip / End, typed answers, and barge-in (speaking
 * over the interviewer stops its voice). While the interviewer speaks, mic
 * audio is held back unless the user clearly talks over it, so the
 * computer's own voice is never sent as the answer.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { IconTile, PageHeader, StatChip } from "../../components/PageKit";
import { CaptureError, startCapture, type Capture } from "./audio/capture";
import { SendQueue } from "./audio/sendQueue";
import { InterviewNav, LevelMeter } from "./parts";
import { initialPractice, practiceReducer } from "./practiceReducer";
import { decodeAudioOut, encodeFrame, type ServerMsg } from "./protocol";
import { useVoiceSocket } from "./useVoiceSocket";
import { createSpeaker, type Speaker } from "./voices";
import { END_REASONS, getVoiceSettings, refreshStreamToken, voiceKeys } from "./voiceApi";
import "./interview.css";

const BARGE_LEVEL = 0.12;
const BARGE_MS = 250;
const MAX_BUFFERED = 64 * 1024;

const PHASE_TEXT: Record<string, string> = {
  connecting: "Connecting…",
  ready: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  paused: "Paused",
  reconnecting: "Reconnecting…",
  ended: "Ended",
};

export default function PracticeSessionPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const qc = useQueryClient();
  const handoff = location.state as { token?: string; path?: string } | null;
  const path = handoff?.path ?? `/api/v1/voice/sessions/${id}/stream`;
  const [state, dispatch] = useReducer(practiceReducer, initialPractice);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const capture = useRef<Capture | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const queue = useRef(new SendQueue<ArrayBuffer>(50));
  const loudSince = useRef<number | null>(null);
  const startedAt = useRef(performance.now());
  const ttsKind = useRef<"browser" | "server">("browser");
  ttsKind.current = state.ttsKind;

  const onMessage = useCallback(
    (msg: ServerMsg) => {
      if (msg.type === "interviewer.delta" && ttsKind.current === "browser")
        speaker.current?.say(msg.text);
      if (msg.type === "session.ended") {
        capture.current?.stop();
        void qc.invalidateQueries({ queryKey: voiceKeys.all });
      }
      dispatch({ type: "server", msg });
    },
    [qc],
  );

  const socket = useVoiceSocket({
    onMessage,
    onBinary: (data) => {
      const out = decodeAudioOut(data);
      if (out) speaker.current?.play(out.audio);
    },
    refreshToken: async () => (await refreshStreamToken(id)).stream_token,
    onState: (s) => {
      if (s === "reconnecting") dispatch({ type: "socket", state: "reconnecting" });
    },
  });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const sendFrame = useCallback((channel: number, pcm: Int16Array) => {
    const s = socketRef.current;
    queue.current.push(encodeFrame(channel, performance.now() - startedAt.current, pcm));
    if (s.buffered() > MAX_BUFFERED) return; // the bounded queue drops the oldest meanwhile
    for (const frame of queue.current.drain()) s.sendBinary(frame);
  }, []);

  // Connect once, then open the mic.
  useEffect(() => {
    let cancelled = false;
    const frames = queue.current;
    (async () => {
      const settings = await getVoiceSettings().catch(() => null);
      speaker.current = createSpeaker(settings?.tts_voice, settings?.language ?? "en");
      const token =
        handoff?.token ?? (await refreshStreamToken(id).catch(() => null))?.stream_token;
      if (cancelled) return;
      if (!token) {
        dispatch({
          type: "server",
          msg: { type: "session.ended", reason: "ended", feedback_pending: false },
        });
        return;
      }
      socketRef.current.connect(path, token);
      try {
        const cap = await startCapture({
          mic: true,
          tab: false,
          onLevel: (_c, l) => setLevel(l),
          onFrame: (channel, pcm) => {
            const sp = speaker.current;
            if (sp?.speaking) {
              // Hold the mic back while the interviewer talks, unless the user clearly talks over it.
              const lv = Math.sqrt(pcm.reduce((s, v) => s + (v / 32768) ** 2, 0) / pcm.length) * 3;
              const now = performance.now();
              if (lv < BARGE_LEVEL) {
                loudSince.current = null;
                return;
              }
              loudSince.current ??= now;
              if (now - loudSince.current < BARGE_MS) return;
              sp.stop();
              socketRef.current.sendJson({ type: "control", action: "barge_in" });
            }
            loudSince.current = null;
            sendFrame(channel, pcm);
          },
        });
        if (cancelled) cap.stop();
        else capture.current = cap;
      } catch (err) {
        setMicError(err instanceof CaptureError ? err.message : "The microphone couldn't start.");
      }
    })();
    return () => {
      cancelled = true;
      capture.current?.stop();
      capture.current = null;
      speaker.current?.stop();
      frames.clear();
      socketRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once per session id
  }, [id]);

  // A closed socket (ended, rejected or given up) stops the mic too.
  useEffect(() => {
    if (socket.state === "closed") {
      capture.current?.stop();
      capture.current = null;
    }
  }, [socket.state]);

  // Leaving the page (or the tab closing) stops the mic at once.
  useEffect(() => {
    const stop = () => capture.current?.stop();
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, []);

  const control = (action: string) => {
    if (action === "end" || action === "skip" || action === "repeat") speaker.current?.stop();
    socket.sendJson({ type: "control", action });
  };

  const sendTyped = (e: FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || !canType) return;
    speaker.current?.stop();
    socket.sendJson({ type: "text", text });
    setTyped("");
  };

  const ended = state.phase === "ended" || socket.state === "closed";
  const asking = state.lines.at(-1)?.speaker === "interviewer" && !state.lines.at(-1)?.closing;
  // The server ignores answers while paused, so the box waits for Resume (and keeps the text).
  const canType = asking && state.phase !== "paused";

  // Session clock: runs from the first question until the end.
  const [elapsed, setElapsed] = useState(0);
  const running = state.lines.length > 0 && !ended;
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now() - elapsed * 1000;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume from the current value only
  }, [running]);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const phase = socket.state === "reconnecting" ? "reconnecting" : ended ? "ended" : state.phase;
  // Closed without session.ended: rejected or the connection was given up.
  const failed = ended && !state.ended;
  const steps = Math.min(state.of, 12);
  const current = Math.max(1, state.questionNo);

  return (
    <div className="iv-page">
      <PageHeader
        eyebrow="Practice session"
        title="Practice interview"
        sub={
          <>
            {state.of ? `Question ${current} of ${state.of}` : "Getting ready"}
            {state.sttName ? ` · ${state.sttName}` : ""}
          </>
        }
      >
        <StatChip icon="clock">
          <strong className="num">{clock}</strong>
        </StatChip>
      </PageHeader>
      <InterviewNav />

      <div className="iv-session">
        <section className="card kit-card iv-stage" aria-label="Interviewer">
          <div
            className={`iv-orb iv-orb--${phase}`}
            style={{ "--lvl": capture.current ? level : 0 } as CSSProperties}
            aria-hidden="true"
          >
            <span className="iv-orb-ring" />
            <span className="iv-orb-ring iv-orb-ring--2" />
            <span className="iv-orb-core">
              <Icon name={phase === "listening" ? "mic" : "sparkle"} size={28} />
            </span>
          </div>
          <span className={`iv-status iv-status-${phase}`} role="status" aria-live="polite">
            <span className="iv-dot" aria-hidden="true" />
            {PHASE_TEXT[phase]}
          </span>
          {steps > 0 && (
            <ol className="iv-stepper" aria-label={`Question ${current} of ${state.of}`}>
              {Array.from({ length: steps }, (_, n) => (
                <li key={n} className={n + 1 < current ? "done" : n + 1 === current ? "now" : ""} />
              ))}
            </ol>
          )}
          <LevelMeter label="Mic" level={capture.current ? level : 0} />

          {!ended &&
            (state.phase === "ready" && state.lines.length === 0 ? (
              <button
                type="button"
                className="btn-run iv-start"
                onClick={() => control("start")}
                disabled={socket.state !== "open"}
              >
                <Icon name="play" size={16} />
                Start the interview
              </button>
            ) : (
              <div className="iv-controls">
                {state.phase === "paused" ? (
                  <button type="button" className="iv-ctl" onClick={() => control("resume")}>
                    <Icon name="play" size={16} />
                    Resume
                  </button>
                ) : (
                  <button type="button" className="iv-ctl" onClick={() => control("pause")}>
                    <Icon name="pause" size={16} />
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="iv-ctl"
                  onClick={() => control("repeat")}
                  disabled={!asking}
                >
                  <Icon name="repeat" size={16} />
                  Repeat question
                </button>
                <button
                  type="button"
                  className="iv-ctl"
                  onClick={() => control("skip")}
                  disabled={!asking}
                >
                  <Icon name="skip" size={16} />
                  Skip
                </button>
                <button type="button" className="iv-ctl iv-ctl--end" onClick={() => control("end")}>
                  <Icon name="stop" size={16} />
                  End
                </button>
              </div>
            ))}
          {micError && (
            <p className="kit-banner warn" role="alert">
              {micError} You can type your answers below.
            </p>
          )}
          {!state.sttAvailable && (
            <p className="kit-banner warn">
              Speech-to-text isn't available right now — type your answers.
            </p>
          )}
          {state.notice && <p className="kit-banner">{state.notice}</p>}
          {state.costCapped && (
            <p className="kit-banner warn">
              This session reached its cost limit; free AI models only from now on.
            </p>
          )}
        </section>

        <section className="card kit-card iv-convo" aria-label="Conversation">
          {state.error && (
            <p className="kit-banner warn" role="alert">
              {state.error.message}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => dispatch({ type: "clearError" })}
              >
                Dismiss
              </button>
            </p>
          )}

          <ol className="iv-captions" aria-live="polite" aria-label="Captions">
            {state.lines.length === 0 && !state.draft && (
              <li className="iv-captions-empty">
                <Icon name="message" size={20} />
                The interviewer&apos;s questions and your answers appear here as captions.
              </li>
            )}
            {state.lines.map((l) => (
              <li key={l.id} className={`iv-line iv-line-${l.speaker}`}>
                <span className="iv-avatar" aria-hidden="true">
                  {l.speaker === "interviewer" ? <Icon name="sparkle" size={14} /> : "You"}
                </span>
                <span className="iv-bubble">
                  <span className="iv-who">
                    {l.speaker === "interviewer"
                      ? l.followup
                        ? "Interviewer · follow-up"
                        : "Interviewer"
                      : "You"}
                  </span>
                  <span>{l.text}</span>
                  {l.interrupted && <span className="badge"> interrupted</span>}
                </span>
              </li>
            ))}
            {state.draft && (
              <li className="iv-line iv-line-interviewer iv-line-live">
                <span className="iv-avatar" aria-hidden="true">
                  <Icon name="sparkle" size={14} />
                </span>
                <span className="iv-bubble">
                  <span className="iv-who">Interviewer</span>
                  <span>{state.draft.sentences.join(" ")}</span>
                </span>
              </li>
            )}
            {state.answerDraft.length > 0 && (
              <li className="iv-line iv-line-user iv-line-live">
                <span className="iv-avatar" aria-hidden="true">
                  You
                </span>
                <span className="iv-bubble">
                  <span className="iv-who">You</span>
                  <span>{state.answerDraft.join(" ")}</span>
                </span>
              </li>
            )}
          </ol>

          {!ended && (
            <form className="iv-typed" onSubmit={sendTyped}>
              <label className="field">
                <span>
                  {state.phase === "paused"
                    ? "Resume to send a typed answer"
                    : "Or type your answer"}
                </span>
                <textarea
                  rows={2}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  maxLength={4000}
                  disabled={!canType}
                  placeholder={canType ? "Type instead of speaking…" : undefined}
                />
              </label>
              <button
                type="submit"
                className="btn-run iv-send"
                disabled={!canType || !typed.trim()}
              >
                <Icon name="send" size={15} />
                Send answer
              </button>
            </form>
          )}

          {ended && (
            <div
              className={`iv-ended${failed ? " is-failed" : ""}`}
              role={failed ? "alert" : "status"}
            >
              <IconTile
                icon={failed ? "alert" : "check"}
                tone={failed ? "attention" : "positive"}
                size="lg"
              />
              <p>
                {state.ended
                  ? `${END_REASONS[state.ended.reason] ?? "Session ended"}.`
                  : (socket.closeReason ?? "Session ended.")}
                {state.ended?.feedbackPending ? " Your feedback is being prepared." : ""}
              </p>
              <Link className="btn-run" to={`/interview/sessions/${id}`}>
                See your feedback
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
