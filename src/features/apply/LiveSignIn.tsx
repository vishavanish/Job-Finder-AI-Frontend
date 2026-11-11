/**
 * QA11 A — "Sign in to continue". The run stopped at a page only you can get
 * past (sign in, create an account, a captcha). This shows that page live from
 * a browser on our server; you click and type on it yourself — your typing goes
 * straight to the page and is never stored — and when you're in, the run
 * carries on with that browser's sign-in.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { ApplyRun, LiveStart } from "../../lib/api/types";
import { socketUrl } from "../interview/protocol";
import { getProfile, profileKeys } from "../profile/profileApi";
import { continueLive, giveUpLive, liveStreamPath, startLive } from "./applyApi";
import { keyFor } from "./liveKeys";

const KIND_TEXT: Record<string, string> = {
  login: "wants you to sign in",
  account: "wants you to sign in or create an account",
  captcha: "shows a check only a person can do",
};
const AUTO_CONTINUE_SECONDS = 5;

type Status = "idle" | "connecting" | "live" | "ended";

export function LiveSignIn({ run, onRun }: { run: ApplyRun; onRun: (r: ApplyRun) => void }) {
  const t = run.takeover;
  const [status, setStatus] = useState<Status>("idle");
  const [frame, setFrame] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 1280, height: 860 });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const lastUrl = useRef<string | null>(null);
  const profile = useQuery({
    queryKey: profileKeys.profile,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const info = (profile.data?.applicant_info ?? {}) as { email?: string; phone?: string };

  const close = useCallback(() => {
    ws.current?.close();
    ws.current = null;
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = null;
  }, []);
  useEffect(() => close, [close]);

  const send = (msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  };

  const connect = (start: LiveStart) => {
    close();
    setSize({ width: start.width, height: start.height });
    setStatus("connecting");
    setNotice("");
    const socket = new WebSocket(socketUrl(liveStreamPath(run.id)));
    socket.binaryType = "blob";
    ws.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token: start.token }));
    socket.onmessage = (ev) => {
      if (typeof ev.data !== "string") {
        const url = URL.createObjectURL(ev.data as Blob);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setFrame(url);
        setStatus("live");
        return;
      }
      let msg: Record<string, unknown> = {};
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.type === "hello") setStatus("live");
      else if (msg.type === "state") setReady(Boolean(msg.ready));
      else if (msg.type === "blocked")
        setNotice(String(msg.message ?? "That page was not opened."));
      else if (msg.type === "error") {
        setNotice(String(msg.message ?? "The live view closed."));
        setStatus("ended");
      }
    };
    socket.onclose = () => {
      if (ws.current === socket) {
        ws.current = null;
        setStatus((s) => (s === "idle" ? s : "ended"));
      }
    };
  };

  const open = useMutation({ mutationFn: () => startLive(run.id), onSuccess: connect });
  const cont = useMutation({
    mutationFn: () => continueLive(run.id),
    onSuccess: (r) => {
      close();
      onRun(r);
    },
  });
  const giveUp = useMutation({
    mutationFn: () => giveUpLive(run.id),
    onSuccess: (r) => {
      close();
      onRun(r);
    },
  });

  // Looks signed in: carry on by itself after a few seconds unless the user says "Not yet".
  useEffect(() => {
    if (!ready || held || status !== "live" || cont.isPending) {
      setCountdown(null);
      return;
    }
    setCountdown(AUTO_CONTINUE_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return c;
        if (c <= 1) {
          window.clearInterval(timer);
          cont.mutate();
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when these change
  }, [ready, held, status]);

  if (!t) return null;

  const point = (clientX: number, clientY: number) => {
    const box = img.current?.getBoundingClientRect();
    if (!box || !box.width) return { x: 0, y: 0 };
    return {
      x: Math.round(((clientX - box.left) / box.width) * size.width),
      y: Math.round(((clientY - box.top) / box.height) * size.height),
    };
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const msg = keyFor(e);
    if (!msg) return;
    e.preventDefault();
    send(msg);
  };
  const error =
    (open.isError && errorMessage(open.error, "Couldn't open the live view.")) ||
    (cont.isError && errorMessage(cont.error, "Couldn't carry on. Try again.")) ||
    (giveUp.isError && errorMessage(giveUp.error, "That didn't work.")) ||
    "";
  const expires = new Date(t.expires_at);

  return (
    <div className="run-hero-action handoff live-signin">
      <p>
        <strong>
          {t.site} {KIND_TEXT[t.kind] ?? "needs you"}.
        </strong>{" "}
        Do it here on a live view of our browser — your typing goes straight to the page and is
        never stored. Auto apply carries on as soon as you're in.
      </p>
      {!t.available && (
        <p className="login-error" role="alert">
          Signing in here is switched off right now. Finish this one on the job page.
        </p>
      )}
      {status === "idle" || status === "ended" ? (
        <div className="prep-row">
          {t.available && (
            <button
              type="button"
              className="btn-apply"
              disabled={open.isPending || t.sessions_left_today <= 0}
              onClick={() => open.mutate()}
            >
              {open.isPending
                ? "Opening…"
                : status === "ended"
                  ? "Open it again"
                  : "Sign in to continue"}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={giveUp.isPending}
            onClick={() => giveUp.mutate()}
          >
            I'll finish it on the job page
          </button>
          <span className="field-hint">
            Waits until {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {t.sessions_left_today} live sign-in{t.sessions_left_today === 1 ? "" : "s"} left today
          </span>
        </div>
      ) : (
        <>
          <div className="live-toolbar">
            {info.email && (
              <button
                type="button"
                className="btn-small"
                onClick={() => send({ type: "text", text: info.email })}
              >
                Type my email
              </button>
            )}
            {info.phone && (
              <button
                type="button"
                className="btn-small"
                onClick={() => send({ type: "text", text: info.phone })}
              >
                Type my phone
              </button>
            )}
            <button type="button" className="btn-small" onClick={() => send({ type: "back" })}>
              Back
            </button>
            <button type="button" className="btn-small" onClick={() => send({ type: "reload" })}>
              Reload
            </button>
            <span className="field-hint">Click the page first, then type.</span>
          </div>
          {/* One focusable control: clicks, wheel, keys and paste all go to the live page. */}
          <button
            type="button"
            className="live-screen"
            aria-label={`Live view of ${t.site}. Click on the page, then type.`}
            disabled={!frame}
            onKeyDown={onKey}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) {
                e.preventDefault();
                send({ type: "text", text: text.slice(0, 500) });
              }
            }}
            onClick={(e) => {
              if (e.detail === 0) return; // keyboard "click" (Enter/Space) is sent as a key instead
              send({ type: "click", ...point(e.clientX, e.clientY) });
            }}
            onDoubleClick={(e) =>
              send({ type: "click", double: true, ...point(e.clientX, e.clientY) })
            }
            onWheel={(e) =>
              send({ type: "wheel", dx: e.deltaX, dy: e.deltaY, ...point(e.clientX, e.clientY) })
            }
          >
            {frame ? (
              <img
                ref={img}
                src={frame}
                alt=""
                draggable={false}
                style={{ aspectRatio: `${size.width} / ${size.height}` }}
              />
            ) : (
              <span className="empty-state" role="status">
                Opening the page…
              </span>
            )}
          </button>
          {ready && (
            <div className="login-notice live-ready" role="status">
              Looks like you're in. {countdown !== null ? `Carrying on in ${countdown} s.` : ""}
              <div className="prep-row">
                <button
                  type="button"
                  className="btn-run"
                  disabled={cont.isPending}
                  onClick={() => cont.mutate()}
                >
                  Continue now
                </button>
                {!held && countdown !== null && (
                  <button type="button" className="btn-small" onClick={() => setHeld(true)}>
                    Not yet
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="prep-row">
            {!ready && (
              <button
                type="button"
                className="btn-run"
                disabled={cont.isPending}
                onClick={() => cont.mutate()}
              >
                I'm signed in — continue
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={giveUp.isPending}
              onClick={() => giveUp.mutate()}
            >
              I'll finish it on the job page
            </button>
          </div>
        </>
      )}
      {notice && (
        <p className="field-hint" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
