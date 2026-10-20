/**
 * "Continue with Google" via Google Identity Services. Google renders the
 * button and hands us an ID token, which the backend verifies (POST /auth/google).
 * Needs VITE_GOOGLE_CLIENT_ID (a public OAuth client id, not a secret); without
 * it the button is not shown. In mock mode a plain button sends a fake token.
 */
import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, USE_MOCKS } from "../../lib/env";

interface GoogleId {
  initialize: (opts: {
    client_id: string;
    callback: (resp: { credential?: string }) => void;
    ux_mode?: "popup" | "redirect";
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiLoad: Promise<GoogleId> | null = null;

function loadGsi(): Promise<GoogleId> {
  gsiLoad ??= new Promise<GoogleId>((resolve, reject) => {
    const ready = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("Google sign-in did not load."));
    };
    if (window.google?.accounts?.id) return ready();
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      gsiLoad = null;
      reject(
        new Error("Couldn't load Google sign-in. Check your connection or use an email code."),
      );
    };
    document.head.appendChild(script);
  });
  return gsiLoad;
}

export function GoogleButton({
  onToken,
  onError,
  disabled,
}: {
  onToken: (idToken: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (USE_MOCKS || !GOOGLE_CLIENT_ID) return;
    let active = true;
    loadGsi()
      .then((gsi) => {
        if (!active || !host.current) return;
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          callback: (resp) => {
            if (resp.credential) handlers.current.onToken(resp.credential);
            else handlers.current.onError("Google sign-in was cancelled.");
          },
        });
        gsi.renderButton(host.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: host.current.clientWidth || 316,
        });
        setLoaded(true);
      })
      .catch((err: Error) => active && handlers.current.onError(err.message));
    return () => {
      active = false;
    };
  }, []);

  if (USE_MOCKS) {
    return (
      <button
        type="button"
        className="btn-secondary btn-block"
        disabled={disabled}
        onClick={() => onToken("mock-google-id-token-for-local-testing")}
      >
        Continue with Google (mock)
      </button>
    );
  }
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div
      ref={host}
      className="google-button"
      aria-busy={!loaded}
      style={disabled ? { pointerEvents: "none", opacity: 0.55 } : undefined}
    />
  );
}
