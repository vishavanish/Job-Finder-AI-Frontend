/**
 * One voice WebSocket (spec §7.3): the first message is {type:"auth"} with a
 * single-use stream token (tokens never go in the URL); a dropped socket
 * reconnects with backoff (0.5 s → 8 s, 6 tries) using a FRESH token, and the
 * server resumes the session; codes in FINAL_CLOSE end it for good.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FINAL_CLOSE, socketUrl, type ServerMsg, type SocketState } from "./protocol";

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 8000];

export interface VoiceSocketOptions {
  /** Called for every JSON message. */
  onMessage: (msg: ServerMsg) => void;
  /** Called for binary messages (server voice). */
  onBinary?: (data: ArrayBuffer) => void;
  /** A fresh single-use token for a reconnect; throw when the session can't continue. */
  refreshToken: () => Promise<string>;
  /** Socket state changes (for "Reconnecting"). */
  onState?: (state: SocketState) => void;
}

export interface VoiceSocket {
  state: SocketState;
  closeReason: string | null;
  connect: (streamPath: string, token: string) => void;
  sendJson: (msg: Record<string, unknown>) => void;
  sendBinary: (data: ArrayBuffer) => boolean;
  /** Bytes waiting in the socket's own buffer (for the bounded send queue). */
  buffered: () => number;
  close: () => void;
}

export function useVoiceSocket(opts: VoiceSocketOptions): VoiceSocket {
  const [state, setState] = useState<SocketState>("idle");
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const path = useRef("");
  const attempts = useRef(0);
  const ended = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const set = useCallback((s: SocketState) => {
    setState(s);
    optsRef.current.onState?.(s);
  }, []);

  const open = useCallback(
    (token: string) => {
      const socket = new WebSocket(socketUrl(path.current));
      socket.binaryType = "arraybuffer";
      ws.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "auth", token }));
      };
      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          let msg: ServerMsg;
          try {
            msg = JSON.parse(event.data) as ServerMsg;
          } catch {
            return;
          }
          if (msg.type === "status" || msg.type === "session.resumed") {
            attempts.current = 0;
            set("open");
          }
          if (msg.type === "session.ended") ended.current = true;
          optsRef.current.onMessage(msg);
        } else if (event.data instanceof ArrayBuffer) {
          optsRef.current.onBinary?.(event.data);
        }
      };
      socket.onclose = (event: CloseEvent) => {
        if (ws.current !== socket) return;
        ws.current = null;
        const final = FINAL_CLOSE[event.code];
        if (ended.current || event.code === 1000 || final) {
          if (final && !ended.current) setCloseReason(final);
          set("closed");
          return;
        }
        if (attempts.current >= BACKOFF_MS.length) {
          setCloseReason("The connection was lost. Start a new session to continue.");
          set("closed");
          return;
        }
        set("reconnecting");
        const delay = BACKOFF_MS[attempts.current];
        attempts.current += 1;
        timer.current = window.setTimeout(async () => {
          try {
            open(await optsRef.current.refreshToken());
          } catch (err) {
            setCloseReason(err instanceof Error ? err.message : "The session can't continue.");
            set("closed");
          }
        }, delay);
      };
    },
    [set],
  );

  const connect = useCallback(
    (streamPath: string, token: string) => {
      path.current = streamPath;
      ended.current = false;
      attempts.current = 0;
      setCloseReason(null);
      set("connecting");
      open(token);
    },
    [open, set],
  );

  const sendJson = useCallback((msg: Record<string, unknown>) => {
    const socket = ws.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(data);
    return true;
  }, []);

  const buffered = useCallback(() => ws.current?.bufferedAmount ?? 0, []);

  const close = useCallback(() => {
    ended.current = true;
    window.clearTimeout(timer.current);
    const socket = ws.current;
    ws.current = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000);
    set("closed");
  }, [set]);

  useEffect(
    () => () => {
      ended.current = true;
      window.clearTimeout(timer.current);
      ws.current?.close(1000);
      ws.current = null;
    },
    [],
  );

  return { state, closeReason, connect, sendJson, sendBinary, buffered, close };
}
