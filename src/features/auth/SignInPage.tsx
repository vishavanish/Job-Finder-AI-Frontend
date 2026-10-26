/**
 * Sign in (spec §6.1): "Continue with Google" or an emailed 6-digit code.
 * New accounts are created on first sign-in while signup is open; in
 * invite-only mode an admin creates them first. Wording never reveals
 * whether an address has an account.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError, errorMessage } from "../../lib/api/errors";
import { safeRedirectPath } from "../../lib/safeRedirect";
import type { TokenResponse } from "../../lib/api/types";
import { requestOtp, signInWithGoogle, verifyOtp } from "./authApi";
import { CodeInput } from "./CodeInput";
import { GOOGLE_CLIENT_ID, USE_MOCKS } from "../../lib/env";
import { GoogleButton } from "./GoogleButton";
import "./auth.css";

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "code";

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

function detailNumber(err: ApiError, key: string): number | null {
  const d = err.details as Record<string, unknown> | undefined;
  const v = d?.[key];
  return typeof v === "number" ? v : null;
}

/** Why a code request failed, stating plainly that no email went out. */
function sendCodeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0)
      return "Can't reach the server, so no code was sent. Check your connection and try again.";
    if (err.status >= 500) {
      return "The server hit an error, so no code was sent. Try again in a few minutes or continue with Google.";
    }
  }
  return errorMessage(err, "Couldn't send a code. Try again.");
}

export default function SignInPage() {
  const { acceptSession, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** The code can no longer be used (expired / locked): only "send a new code" helps. */
  const [codeDead, setCodeDead] = useState(false);
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useCountdown();
  const [helpOpen, setHelpOpen] = useState(false);
  const ids = { email: useId(), emailError: useId(), codeHelp: useId(), help: useId() };
  // A bad address is shown under the field it is about, and the field gets focus (QA2 §5).
  const [emailError, setEmailError] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);

  const finish = (data: TokenResponse) => {
    acceptSession(data);
    navigate(safeRedirectPath(from), { replace: true });
  };

  const sendCode = async () => {
    setError("");
    setBusy(true);
    clearNotice();
    try {
      const res = await requestOtp(email.trim());
      setInfo(res.detail);
      setStep("code");
      setCode("");
      setCodeDead(false);
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "otp_cooldown") {
        setResendIn(detailNumber(err, "retry_after") ?? err.retryAfterSeconds ?? RESEND_SECONDS);
        if (step === "code") {
          setInfo("We sent a code recently. Check your inbox, or wait to request a new one.");
        } else {
          // No code was sent from this page, so don't claim one was: an earlier
          // request may have failed before its email went out.
          setError(
            "A code was already requested for this email in the last minute. Check your inbox and spam folder, or try again when the timer ends.",
          );
        }
      } else {
        setError(sendCodeError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("");
      setEmailError("Enter a valid email address, like you@example.com.");
      emailInput.current?.focus();
      return;
    }
    setEmailError("");
    void sendCode();
  };

  const submitCode = async (value: string) => {
    if (value.length !== 6 || busy || codeDead) return;
    setError("");
    setBusy(true);
    try {
      finish(await verifyOtp(email.trim(), value));
    } catch (err) {
      setCode("");
      if (err instanceof ApiError && (err.code === "otp_locked" || err.code === "otp_expired")) {
        setCodeDead(true);
        setResendIn(0);
      }
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = "Sign in · Job Finder";
  }, []);

  // Submit as soon as the sixth digit lands (typed or pasted).
  useEffect(() => {
    if (code.length === 6) void submitCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on code change only
  }, [code]);

  const onGoogleToken = async (idToken: string) => {
    setError("");
    setBusy(true);
    clearNotice();
    try {
      finish(await signInWithGoogle(idToken));
    } catch (err) {
      setError(errorMessage(err, "Google sign-in failed. Try again or use an email code."));
    } finally {
      setBusy(false);
    }
  };

  const backToEmail = () => {
    setStep("email");
    setCode("");
    setError("");
    setInfo("");
    setCodeDead(false);
    setResendIn(0);
  };

  return (
    <div className="login-screen">
      <main className="login-card">
        <div className="logo-badge" aria-hidden="true">
          JF
        </div>
        <h1>Sign in to Job Finder</h1>
        <p className="subtitle">
          {step === "email"
            ? "Use Google or get a one-time code by email. No password needed."
            : `Enter the 6-digit code sent to ${email.trim()}.`}
        </p>

        {notice && !error && (
          <div className="login-notice" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        {step === "email" ? (
          <>
            {(USE_MOCKS || GOOGLE_CLIENT_ID) && (
              <>
                <GoogleButton onToken={onGoogleToken} onError={setError} disabled={busy} />
                <p className="auth-divider">
                  <span>Or continue with email</span>
                </p>
              </>
            )}
            <form onSubmit={submitEmail} noValidate>
              <div className="form-field">
                <label htmlFor={ids.email} className="auth-label">
                  Work or personal email
                </label>
                <div className="auth-input">
                  <MailIcon />
                  <input
                    ref={emailInput}
                    id={ids.email}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? ids.emailError : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError("");
                    }}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the only field on the screen
                    autoFocus
                  />
                </div>
                {emailError && (
                  <p className="field-error" id={ids.emailError} role="alert">
                    {emailError}
                  </p>
                )}
              </div>
              <div className="auth-help-row">
                <button
                  type="button"
                  className="link-button"
                  aria-expanded={helpOpen}
                  aria-controls={ids.help}
                  onClick={() => setHelpOpen((o) => !o)}
                >
                  Need help?
                </button>
              </div>
              {helpOpen && (
                <ul className="auth-help" id={ids.help}>
                  <li>No email? Check spam, or ask for a new code after a minute.</li>
                  <li>A code works once and expires in 10 minutes.</li>
                  <li>Can't get in at all? Ask your admin to check your account.</li>
                </ul>
              )}
              <button
                className="btn-primary btn-auth"
                type="submit"
                disabled={busy || resendIn > 0}
              >
                {busy ? (
                  "Sending code…"
                ) : resendIn > 0 ? (
                  `Email me a code in ${resendIn}s`
                ) : (
                  <>
                    Email me a code <ArrowIcon />
                  </>
                )}
              </button>
              {resendIn > 0 && (
                <div className="auth-row">
                  <button type="button" className="link-button" onClick={() => setStep("code")}>
                    I already have a code
                  </button>
                </div>
              )}
            </form>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode(code);
            }}
          >
            {info && !error && (
              <p className="field-hint auth-info" role="status">
                {info}
              </p>
            )}
            <CodeInput
              value={code}
              onChange={setCode}
              disabled={busy || codeDead}
              invalid={Boolean(error)}
              describedBy={ids.codeHelp}
            />
            <p className="field-hint" id={ids.codeHelp}>
              The code expires in 10 minutes and works once.
            </p>
            {!codeDead && (
              <button
                className="btn-primary btn-auth"
                type="submit"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
            )}
            <div className="auth-row">
              <button
                type="button"
                className={codeDead ? "btn-primary" : "link-button"}
                onClick={() => void sendCode()}
                disabled={busy || resendIn > 0}
              >
                {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
              </button>
              <button type="button" className="link-button" onClick={backToEmail}>
                Use a different email
              </button>
            </div>
          </form>
        )}

        <p className="auth-trust">
          <ShieldIcon /> Fast, passwordless &amp; encrypted security
        </p>
      </main>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
