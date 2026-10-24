/**
 * Voice socket protocol (backend P7: app/services/practice_session.py and
 * copilot_session.py). JSON text messages carry `type`; audio goes up as
 * binary frames: byte 0 channel, bytes 1-4 uint32 LE ms since start, then
 * 16 kHz mono PCM16 (≤ 100 ms). Server voice for Practice comes down as
 * byte 9 + uint32 LE sentence index + MP3 bytes.
 */
import { API_ORIGIN, WS_ORIGIN } from "../../lib/env";

export const CHANNEL = { interviewer: 0, user: 1, mixed: 2 } as const;
export type ChannelName = keyof typeof CHANNEL;
export const AUDIO_OUT = 9;
export const SAMPLE_RATE = 16000;
export const FRAME_MS = 40;
export const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;

export type SocketState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface StatusMsg {
  type: "status";
  state: string;
  reason?: string;
  message?: string;
  providers?: {
    stt?: { name: string; streaming?: boolean } | null;
    tts?: { name: string; kind?: string };
  };
  streaming?: boolean;
  speculative?: boolean;
  cost_capped?: boolean;
  stt_available?: boolean;
  question_no?: number;
  of?: number;
}

export interface TurnSnapshot {
  id: string;
  seq: number;
  speaker: string;
  kind: string;
  text: string;
  question_id?: string | null;
  parent_id?: string | null;
  is_followup?: boolean;
  state: string;
  metrics?: Record<string, unknown>;
}

export type ServerMsg =
  | StatusMsg
  | { type: "session.resumed"; turns: TurnSnapshot[] }
  | {
      type: "transcript.partial" | "transcript.final";
      channel: string;
      text: string;
      typed?: boolean;
    }
  | { type: "interviewer.delta"; turn_id: string; index: number; text: string; repeat?: boolean }
  | {
      type: "turn.done";
      turn_id: string;
      kind: string;
      text: string;
      is_followup?: boolean;
      question_no?: number;
      of?: number;
      interrupted?: boolean;
      repeat?: boolean;
      latency?: Record<string, number>;
    }
  | {
      type: "question.detected";
      question_id: string;
      text: string;
      qtype: string;
      is_followup: boolean;
      parent_id: string | null;
      multipart: boolean;
      speculative: boolean;
      forced?: boolean;
    }
  | { type: "question.updated"; question_id: string; text: string; qtype?: string }
  | { type: "answer.delta"; question_id: string; text: string }
  | {
      type: "answer.done";
      question_id: string;
      text: string;
      not_sure: boolean;
      unverified?: string[];
      model?: string | null;
      latency?: Record<string, number | boolean | string>;
    }
  | { type: "answer.cancelled"; question_id: string; reason: string }
  | { type: "session.ended"; reason: string; feedback_pending: boolean }
  | { type: "error"; code: string; message: string; retryable: boolean }
  | { type: "pong" };

/** Close codes that end the session for good (no reconnect), with what to tell the user. */
export const FINAL_CLOSE: Record<number, string> = {
  4401: "The session's sign-in expired. Start a new session.",
  4402: "This session reached its cost limit.",
  4403: "This feature isn't available on your account (or the notice wasn't accepted).",
  4404: "This session has ended.",
  4409: "Another voice session is open in this or another tab. End it first.",
  1009: "The audio format was rejected.",
};

/** ws(s):// URL for a stream path from the API ("/api/v1/voice/..."). */
export function socketUrl(streamPath: string): string {
  const origin =
    WS_ORIGIN ||
    API_ORIGIN ||
    (typeof window !== "undefined" && window.location
      ? window.location.origin
      : "http://localhost");
  const url = new URL(streamPath, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/** One upstream audio frame. */
export function encodeFrame(channel: number, tsMs: number, pcm: Int16Array): ArrayBuffer {
  const out = new ArrayBuffer(5 + pcm.byteLength);
  const view = new DataView(out);
  view.setUint8(0, channel);
  view.setUint32(1, Math.max(0, Math.floor(tsMs)) >>> 0, true);
  // Byte copy: an Int16Array view at offset 5 would be unaligned. PCM16 is little-endian, like every browser.
  new Uint8Array(out, 5).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return out;
}

/** Server voice (Practice): [index, mp3 bytes] or null for any other binary message. */
export function decodeAudioOut(data: ArrayBuffer): { index: number; audio: ArrayBuffer } | null {
  if (data.byteLength < 5) return null;
  const view = new DataView(data);
  if (view.getUint8(0) !== AUDIO_OUT) return null;
  return { index: view.getUint32(1, true), audio: data.slice(5) };
}
