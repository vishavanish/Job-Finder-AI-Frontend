/**
 * Microphone and tab-audio capture (spec §7.2). Each source runs through an
 * AudioWorklet that only forwards raw samples; the page resamples them to
 * 16 kHz mono PCM16 in FRAME_MS frames (resample.ts) and hands them to
 * `onFrame` with their channel. Nothing is recorded: there is no
 * MediaRecorder and no audio is kept after it is sent.
 *
 * Tab audio: getDisplayMedia({video, audio}); the video track is stopped at
 * once (only the audio is used). Browsers without tab audio, or a share
 * without "Share tab audio" ticked, fall back to the mic as the "mixed" channel.
 */
import { CHANNEL, type ChannelName } from "../protocol";
import { FrameChunker, rms } from "./resample";

const WORKLET = `
class JfCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("jf-capture", JfCapture);
`;

export interface CaptureOptions {
  mic: boolean;
  /** Ask for tab audio (Live Copilot). */
  tab: boolean;
  /** Live Copilot: without tab audio the mic carries both voices ("mixed"); Practice's mic is always "user". */
  copilot?: boolean;
  onFrame: (channel: number, pcm: Int16Array) => void;
  onLevel?: (channel: ChannelName, level: number) => void;
  /** The browser's "stop sharing" ended the tab audio. */
  onTabEnded?: () => void;
}

export interface Capture {
  /** Which channel the mic is sent on: "user" with tab audio, "mixed" without. */
  micChannel: ChannelName;
  hasTab: boolean;
  stop: () => void;
}

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly kind: "mic_denied" | "unsupported" | "tab_cancelled",
  ) {
    super(message);
  }
}

export function tabAudioSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

export async function startCapture(opts: CaptureOptions): Promise<Capture> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    !window.AudioWorkletNode
  ) {
    throw new CaptureError(
      "This browser can't capture audio. Use a recent Chrome, Edge or Firefox.",
      "unsupported",
    );
  }
  const streams: MediaStream[] = [];
  let tabStream: MediaStream | null = null;
  if (opts.tab && tabAudioSupported()) {
    try {
      tabStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      throw new CaptureError(
        "Tab sharing was cancelled. Choose the tab with your call, or use mic only.",
        "tab_cancelled",
      );
    }
    tabStream.getVideoTracks().forEach((t) => t.stop()); // only the tab's sound is used
    if (tabStream.getAudioTracks().length === 0) {
      tabStream.getTracks().forEach((t) => t.stop());
      tabStream = null; // "Share tab audio" wasn't ticked: mic only
    } else {
      streams.push(tabStream);
    }
  }
  let micStream: MediaStream | null = null;
  if (opts.mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      throw new CaptureError(
        "Microphone access was blocked. Allow it in the address bar, then try again.",
        "mic_denied",
      );
    }
    streams.push(micStream);
  }

  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const nodes: AudioNode[] = [];
  const micChannel: ChannelName = tabStream ? "user" : opts.copilot ? "mixed" : "user";

  const wire = (stream: MediaStream, channel: ChannelName) => {
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "jf-capture");
    const chunker = new FrameChunker(ctx.sampleRate);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      for (const frame of chunker.push(e.data)) {
        opts.onLevel?.(channel, rms(frame));
        opts.onFrame(CHANNEL[channel], frame);
      }
    };
    source.connect(node);
    nodes.push(source, node);
  };
  if (tabStream) {
    wire(tabStream, "interviewer");
    tabStream.getAudioTracks()[0]?.addEventListener("ended", () => opts.onTabEnded?.());
  }
  if (micStream) wire(micStream, micChannel);

  let stopped = false;
  return {
    micChannel,
    hasTab: Boolean(tabStream),
    stop: () => {
      if (stopped) return;
      stopped = true;
      nodes.forEach((n) => n.disconnect());
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      void ctx.close();
    },
  };
}
