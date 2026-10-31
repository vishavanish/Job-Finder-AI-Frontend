/**
 * Live Copilot (spec §7, F7 plan §1.3–1.6, §1.10). The user accepts the
 * notice once (a new version asks again), picks answer style and audio
 * source, presses Start once, and every interviewer question becomes a card
 * whose answer streams in until Stop.
 *
 * Transparency (CLAUDE.md 7.10, non-negotiable): the panel is always
 * visible, shows the listening indicator, and stops with one click. Its
 * opacity never goes below 40 %, the listening indicator can't be hidden,
 * and nothing here hides it from screen sharing or detection.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { CardHead, IconTile, PageHeader } from "../../components/PageKit";
import { ApiError, errorMessage } from "../../lib/api/errors";
import { readPref, writePref } from "../../lib/storage";
import { jobKeys, listJobs } from "../jobs/jobsApi";
import { CaptureError, startCapture, tabAudioSupported, type Capture } from "./audio/capture";
import { SendQueue } from "./audio/sendQueue";
import {
  copilotReducer,
  initialCopilot,
  threads,
  timingLine,
  type CopilotCard,
} from "./copilotReducer";
import { InterviewNav, LevelMeter, ProviderLine } from "./parts";
import { encodeFrame, type ServerMsg } from "./protocol";
import { useRafBuffer } from "./useRafBuffer";
import { useVoiceSocket } from "./useVoiceSocket";
import {
  QTYPE_LABELS,
  acknowledgeCopilot,
  createVoiceSession,
  getVoiceProviders,
  getVoiceSettings,
  refreshStreamToken,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const MIN_OPACITY = 40;
const MAX_BUFFERED = 64 * 1024;
const SCREENSHOT_MAX = 2 * 1024 * 1024;
const PREF_OPACITY = "copilot.opacity";
const PREF_POS = "copilot.pos";
const STYLES = [
  { value: "bullets", label: "Bullet talking points" },
  { value: "script", label: "Short script" },
  { value: "star", label: "STAR" },
] as const;

type Setup = {
  style: string;
  length: string;
  language: string;
  sources: "tab_mic" | "mic";
  jobId: string;
};

interface PipWindow extends Window {
  document: Document;
}
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (o: { width: number; height: number }) => Promise<PipWindow>;
    };
  }
}

// ------------------------------------------------------------------ acknowledgement

function AckDialog({
  text,
  version,
  onDone,
}: {
  text: string;
  version: string;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const ack = useMutation({ mutationFn: () => acknowledgeCopilot(version), onSuccess: onDone });
  // Closing without accepting goes back: the notice can't be skipped (spec §7.1).
  return (
    <Dialog
      title="Before you use Live Copilot"
      onClose={() => navigate("/interview")}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={() => navigate("/interview")}>
            Not now
          </button>
          <button
            type="button"
            className="btn-run"
            onClick={() => ack.mutate()}
            disabled={ack.isPending}
          >
            I understand
          </button>
        </>
      }
    >
      <p>{text}</p>
      <p className="field-hint">You'll see this again if the notice changes.</p>
      {ack.error && (
        <p className="login-error" role="alert">
          {errorMessage(ack.error)}
        </p>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ a card

function QuestionCard({
  card,
  followups,
  active,
  mixed,
  onAction,
}: {
  card: CopilotCard;
  followups: CopilotCard[];
  active: boolean;
  mixed: boolean;
  onAction: (action: string, id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const expanded = active || open;
  const one = (c: CopilotCard, child: boolean) => (
    <div className={`cp-qa${child ? " cp-followup" : ""}`} key={c.id}>
      <p className="cp-question">
        <span className="badge">{child ? "Follow-up" : (QTYPE_LABELS[c.qtype] ?? "Question")}</span>{" "}
        {c.forced && <span className="badge">asked by you</span>} {c.text}
      </p>
      {expanded && (
        <>
          <div className="cp-answer iv-pre" aria-live={active ? "polite" : "off"}>
            {c.answer || (c.state === "streaming" ? "…" : "")}
          </div>
          <p className="cp-tags">
            {c.state === "interrupted" && <span className="badge tone-muted">interrupted</span>}
            {c.state === "dismissed" && <span className="badge tone-muted">dismissed</span>}
            {c.state === "error" && <span className="badge tone-negative">couldn't finish</span>}
            {c.notSure && <span className="badge tone-attention">not sure</span>}
            {c.unverified.length > 0 && (
              <span className="field-hint"> Check before saying: {c.unverified.join(", ")}</span>
            )}
          </p>
          {c.state === "done" && timingLine(c) && (
            <p
              className="field-hint cp-timing"
              title="End of question → first words: silence wait, speech to text, AI first words"
            >
              {timingLine(c)}
            </p>
          )}
          {c.state !== "dismissed" && (
            <div className="cp-actions">
              <button type="button" className="btn-small" onClick={() => onAction("shorter", c.id)}>
                Shorter
              </button>
              <button type="button" className="btn-small" onClick={() => onAction("expand", c.id)}>
                Expand
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => onAction("regenerate", c.id)}
              >
                Regenerate
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  void navigator.clipboard?.writeText(c.answer).then(() => setCopied(true));
                }}
                disabled={!c.answer}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="btn-small" onClick={() => onAction("dismiss", c.id)}>
                Dismiss
              </button>
              {mixed && (
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => onAction("that_was_me", c.id)}
                >
                  That was me
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
  return (
    <li className={`card kit-card cp-card${active ? " active" : ""}`}>
      {!active && (
        <button
          type="button"
          className="link-button cp-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={expanded}
        >
          {expanded ? "Collapse" : "Show answer"}
        </button>
      )}
      {one(card, false)}
      {followups.map((f) => one(f, true))}
    </li>
  );
}

// ------------------------------------------------------------------ the page

export default function CopilotPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: voiceKeys.settings, queryFn: getVoiceSettings });
  const providers = useQuery({ queryKey: voiceKeys.providers, queryFn: getVoiceProviders });
  const saved = useQuery({ queryKey: jobKeys.list("saved"), queryFn: () => listJobs("saved", 50) });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [state, dispatch] = useReducer(copilotReducer, initialCopilot);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [levels, setLevels] = useState({ interviewer: 0, mic: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [mixed, setMixed] = useState(false);
  const capture = useRef<Capture | null>(null);
  const queue = useRef(new SendQueue<ArrayBuffer>(50));
  const startedAt = useRef(0);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (settings.data && !setup) {
      setSetup({
        style: settings.data.answer_style,
        length: settings.data.answer_length,
        language: settings.data.language,
        sources: tabAudioSupported() ? settings.data.default_sources : "mic",
        jobId: "",
      });
    }
  }, [settings.data, setup]);

  const raf = useRafBuffer((chunks) => dispatch({ type: "deltas", chunks }));
  const onMessage = useCallback(
    (msg: ServerMsg) => {
      if (msg.type === "answer.delta") {
        raf.push(msg.question_id, msg.text);
        return;
      }
      raf.flushNow();
      if (msg.type === "session.ended") {
        capture.current?.stop();
        capture.current = null;
        void qc.invalidateQueries({ queryKey: voiceKeys.all });
      }
      dispatch({ type: "server", msg });
    },
    [qc, raf],
  );
  const socket = useVoiceSocket({
    onMessage,
    refreshToken: async () => (await refreshStreamToken(sessionRef.current ?? "")).stream_token,
    onState: (s) => {
      if (s === "reconnecting") dispatch({ type: "socket", state: "reconnecting" });
      if (s === "open") dispatch({ type: "socket", state: "open" });
    },
  });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const stopAll = useCallback(() => {
    capture.current?.stop();
    capture.current = null;
    queue.current.clear();
  }, []);
  useEffect(
    () => () => {
      stopAll();
      socketRef.current.close();
    },
    [stopAll],
  );
  useEffect(() => {
    if (socket.state === "closed") stopAll(); // ended, rejected or given up: the mic stops too
  }, [socket.state, stopAll]);
  useEffect(() => {
    window.addEventListener("pagehide", stopAll);
    return () => window.removeEventListener("pagehide", stopAll);
  }, [stopAll]);

  const start = async () => {
    if (!setup) return;
    setStartError(null);
    setNotice(null);
    setStarting(true);
    // Capture first: browsers only show the tab-share picker right after the click.
    let cap: Capture;
    try {
      cap = await startCapture({
        mic: true,
        tab: setup.sources === "tab_mic",
        copilot: true,
        onLevel: (channel, level) =>
          setLevels((l) =>
            channel === "interviewer" ? { ...l, interviewer: level } : { ...l, mic: level },
          ),
        onFrame: (channel, pcm) => {
          const s = socketRef.current;
          queue.current.push(encodeFrame(channel, performance.now() - startedAt.current, pcm));
          if (s.buffered() > MAX_BUFFERED) return;
          for (const f of queue.current.drain()) s.sendBinary(f);
        },
        onTabEnded: () =>
          setNotice(
            "Tab sharing stopped — only your mic is heard now. Stop and start again to share the tab.",
          ),
      });
    } catch (err) {
      setStartError(err instanceof CaptureError ? err.message : "Audio capture couldn't start.");
      setStarting(false);
      return;
    }
    try {
      const created = await createVoiceSession({
        mode: "copilot",
        job_id: setup.jobId || null,
        answer_style: setup.style as "bullets",
        answer_length: setup.length as "short",
        language: setup.language,
        sources: setup.sources,
      });
      capture.current = cap;
      setMixed(cap.micChannel === "mixed");
      if (setup.sources === "tab_mic" && !cap.hasTab) {
        setNotice(
          "No tab audio was shared, so we listen through your mic only. Question detection will be less precise — use Answer this when needed.",
        );
      }
      startedAt.current = performance.now();
      sessionRef.current = created.session.id;
      setSessionId(created.session.id);
      dispatch({ type: "reset" });
      socket.connect(created.stream_path, created.stream_token);
    } catch (err) {
      cap.stop(); // no session: release the mic and the tab at once
      const code = err instanceof ApiError ? err.code : "";
      setStartError(
        code === "voice_session_busy"
          ? "Another voice session is open. End it first — only one runs at a time."
          : errorMessage(err),
      );
    } finally {
      setStarting(false);
    }
  };

  const control = useCallback((action: string, questionId?: string) => {
    socketRef.current.sendJson({
      type: "control",
      action,
      ...(questionId ? { question_id: questionId } : {}),
    });
  }, []);

  const sendScreenshot = (dataUrl: string) => {
    if (dataUrl.length > (SCREENSHOT_MAX * 4) / 3 + 64) {
      setNotice("That image is over 2 MB. Crop it and try again.");
      return;
    }
    socketRef.current.sendJson({ type: "screenshot", image: dataUrl });
  };
  const readImage = (file: File | null | undefined) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      if (file) setNotice("Send a PNG, JPEG or WebP image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => sendScreenshot(String(reader.result));
    reader.readAsDataURL(file);
  };

  const live = sessionId !== null && state.status !== "ended" && socket.state !== "closed";
  useEffect(() => {
    if (!live) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) readImage(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  if (settings.isLoading || !setup)
    return (
      <p className="field-hint" role="status">
        Loading Live Copilot…
      </p>
    );
  if (settings.error)
    return (
      <p className="login-error" role="alert">
        {errorMessage(settings.error)}
      </p>
    );
  const s = settings.data!;

  return (
    <div className="iv-page">
      <PageHeader
        eyebrow="Live interview help"
        title="Live Copilot"
        sub="Suggested answers to the interviewer's questions, from your own resume and stories, while you talk."
      />
      <InterviewNav />
      {!s.copilot_acknowledged && (
        <AckDialog
          text={s.copilot_ack_text}
          version={s.copilot_ack_version}
          onDone={() => void qc.invalidateQueries({ queryKey: voiceKeys.settings })}
        />
      )}

      {sessionId === null ? (
        <form
          className="card kit-card iv-setup iv-copilot-setup"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <CardHead
            icon="sliders"
            title="Set up"
            sub="How answers look and where the copilot listens"
          />
          <div className="iv-fields iv-fields--4">
            <label className="field">
              <span>Job (optional)</span>
              <select
                value={setup.jobId}
                onChange={(e) => setSetup({ ...setup, jobId: e.target.value })}
              >
                <option value="">No job</option>
                {(saved.data?.jobs ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} · {j.company}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Answer style</span>
              <select
                value={setup.style}
                onChange={(e) => setSetup({ ...setup, style: e.target.value })}
              >
                {STYLES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Length</span>
              <select
                value={setup.length}
                onChange={(e) => setSetup({ ...setup, length: e.target.value })}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
            <label className="field">
              <span>Language</span>
              <select
                value={setup.language}
                onChange={(e) => setSetup({ ...setup, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="multi">Hindi + English</option>
              </select>
            </label>
          </div>
          <fieldset className="iv-step iv-types">
            <legend className="iv-step-label">Audio</legend>
            <div className="iv-type-grid iv-type-grid--2">
              <label className={`iv-type${setup.sources === "tab_mic" ? " selected" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name="sources"
                  checked={setup.sources === "tab_mic"}
                  disabled={!tabAudioSupported()}
                  onChange={() => setSetup({ ...setup, sources: "tab_mic" })}
                />
                <IconTile icon="monitor" tone={setup.sources === "tab_mic" ? "accent" : "muted"} />
                <span className="iv-type-text">
                  <span className="iv-type-name">Tab audio + mic</span>
                  <span className="iv-type-hint">
                    {tabAudioSupported()
                      ? "Share the tab with your call (Meet, Zoom web, Teams web) and tick “Share tab audio”. Most precise."
                      : "Needs Chrome or Edge."}
                  </span>
                </span>
              </label>
              <label className={`iv-type${setup.sources === "mic" ? " selected" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name="sources"
                  checked={setup.sources === "mic"}
                  onChange={() => setSetup({ ...setup, sources: "mic" })}
                />
                <IconTile icon="mic" tone={setup.sources === "mic" ? "accent" : "muted"} />
                <span className="iv-type-text">
                  <span className="iv-type-name">Mic only</span>
                  <span className="iv-type-hint">
                    Works anywhere; detecting who asked is less precise. Headphones off so the mic
                    hears the call.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <ProviderLine providers={providers.data} copilot />
          <p className="field-hint">
            Hotkeys while this page has focus: Alt+Shift+A answer this · Alt+Shift+P pause ·
            Alt+Shift+S stop · Alt+Shift+H collapse the panel.
          </p>
          <p className="field-hint">
            Audio and screenshots are never stored. The transcript is kept encrypted for 90 days.
          </p>
          <p className="field-hint iv-desktop-note">Best on a desktop or laptop.</p>
          {startError && (
            <p className="login-error" role="alert">
              {startError}
            </p>
          )}
          <button
            type="submit"
            className="btn-run iv-start"
            disabled={starting || !s.copilot_acknowledged}
          >
            <Icon name="play" size={16} />
            {starting ? "Starting…" : "Start"}
          </button>
        </form>
      ) : (
        <CopilotPanel
          status={socket.state === "reconnecting" ? "reconnecting" : state.status}
          sttName={state.sttName}
          costCapped={state.costCapped}
          levels={levels}
          hasTab={!mixed}
          notice={notice ?? state.notice}
          error={state.error?.message ?? socket.closeReason}
          onClearError={() => dispatch({ type: "clearError" })}
          heard={state.heard}
          live={live}
          onControl={control}
          onScreenshot={readImage}
        >
          <ol className="cp-feed" aria-label="Questions">
            {[...threads(state)].reverse().map((t) => (
              <QuestionCard
                key={t.root.id}
                card={t.root}
                followups={t.followups}
                active={
                  t.root.id === state.activeId || t.followups.some((f) => f.id === state.activeId)
                }
                mixed={mixed}
                onAction={(action, id) => control(action, id)}
              />
            ))}
            {state.order.length === 0 && live && (
              <li className="empty-state">
                Listening… questions the interviewer asks will appear here.
              </li>
            )}
          </ol>
          {!live && (
            <div className="iv-ended" role="status">
              <p>
                {state.ended?.feedbackPending
                  ? "Session saved — your debrief is being prepared."
                  : "Session ended."}
              </p>
              <Link className="btn-run" to={`/interview/sessions/${sessionId}`}>
                See the debrief
              </Link>{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSessionId(null);
                  sessionRef.current = null;
                  dispatch({ type: "reset" });
                }}
              >
                New session
              </button>
            </div>
          )}
        </CopilotPanel>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the panel

function CopilotPanel({
  status,
  sttName,
  costCapped,
  levels,
  hasTab,
  notice,
  error,
  onClearError,
  heard,
  live,
  onControl,
  onScreenshot,
  children,
}: {
  status: string;
  sttName: string | null;
  costCapped: boolean;
  levels: { interviewer: number; mic: number };
  hasTab: boolean;
  notice: string | null;
  error: string | null;
  onClearError: () => void;
  heard: { channel: string; text: string; partial: boolean }[];
  live: boolean;
  onControl: (action: string, id?: string) => void;
  onScreenshot: (file: File | null | undefined) => void;
  children: ReactNode;
}) {
  const [opacity, setOpacity] = useState(() =>
    Math.max(MIN_OPACITY, Number(readPref(PREF_OPACITY) ?? 100) || 100),
  );
  const [floating, setFloating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      return JSON.parse(readPref(PREF_POS) ?? "") as { x: number; y: number };
    } catch {
      return { x: 24, y: 96 };
    }
  });
  const [pip, setPip] = useState<PipWindow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => writePref(PREF_OPACITY, String(opacity)), [opacity]);

  // In-page hotkeys (global hotkeys need the desktop app).
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "a") onControl("answer_now");
      else if (key === "p") onControl(status === "paused" ? "resume" : "pause");
      else if (key === "s") onControl("stop");
      else if (key === "h") setCollapsed((c) => !c);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, onControl, status]);

  const popOut = async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    const w = await api.requestWindow({ width: 420, height: 640 });
    [...document.styleSheets].forEach((sheet) => {
      try {
        const style = w.document.createElement("style");
        style.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n");
        w.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          w.document.head.appendChild(link);
        }
      }
    });
    w.document.body.className = "cp-pip-body";
    w.addEventListener("pagehide", () => setPip(null));
    setPip(w);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!floating) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, e.clientX - drag.current.dx),
      y: Math.max(0, e.clientY - drag.current.dy),
    });
  };
  const onPointerUp = () => {
    if (drag.current) writePref(PREF_POS, JSON.stringify(pos));
    drag.current = null;
  };

  const label =
    {
      listening: "Listening",
      paused: "Paused",
      reconnecting: "Reconnecting…",
      ended: "Ended",
      idle: "Starting…",
    }[status] ?? status;
  const panel = (
    <section
      className={`card kit-card cp-panel${floating && !pip ? " floating" : ""}${collapsed ? " collapsed" : ""}`}
      style={{ opacity: opacity / 100, ...(floating && !pip ? { left: pos.x, top: pos.y } : {}) }}
      aria-label="Live Copilot"
    >
      <header
        className="cp-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* The listening indicator is always shown, even when the panel is collapsed. */}
        <span
          className={`iv-status iv-status-${status === "listening" ? "listening" : status}`}
          role="status"
          aria-live="polite"
        >
          <span className="iv-dot" aria-hidden="true" />
          {label}
        </span>
        {sttName && <span className="field-hint">{sttName}</span>}
        {live && (
          <button
            type="button"
            className="btn-danger-small cp-stop"
            onClick={() => onControl("stop")}
          >
            Stop
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          <div className="cp-meters">
            {hasTab && <LevelMeter label="Interviewer (tab)" level={levels.interviewer} />}
            <LevelMeter label={hasTab ? "You (mic)" : "Mic"} level={levels.mic} />
          </div>
          {costCapped && (
            <p className="iv-notice">Cost limit reached — free AI models only from now on.</p>
          )}
          {notice && <p className="iv-notice">{notice}</p>}
          {error && (
            <p className="iv-notice warn" role="alert">
              {error}{" "}
              <button type="button" className="link-button" onClick={onClearError}>
                Dismiss
              </button>
            </p>
          )}
          {live && (
            <div className="cp-controls">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onControl(status === "paused" ? "resume" : "pause")}
              >
                {status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onControl("answer_now")}
              >
                Answer this
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileRef.current?.click()}
              >
                Send screenshot
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                aria-label="Screenshot file"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onScreenshot(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}
          {heard.length > 0 && (
            <p className="cp-heard" aria-live="off">
              <span className="iv-who">Heard</span> {heard.at(-1)!.text}
            </p>
          )}
          {children}
          <div className="cp-view">
            <label className="cp-opacity">
              Opacity
              <input
                type="range"
                min={MIN_OPACITY}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Math.max(MIN_OPACITY, Number(e.target.value)))}
              />
            </label>
            {!pip && (
              <button type="button" className="link-button" onClick={() => setFloating((f) => !f)}>
                {floating ? "Dock panel" : "Float panel"}
              </button>
            )}
            {window.documentPictureInPicture && !pip && (
              <button type="button" className="link-button" onClick={() => void popOut()}>
                Pop out (always on top of this browser)
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
  return pip ? (
    <>
      <p className="field-hint">The copilot is open in its own small window.</p>
      {createPortal(panel, pip.document.body)}
    </>
  ) : (
    panel
  );
}
