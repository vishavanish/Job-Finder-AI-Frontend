/**
 * The interviewer's voice in Practice: the browser's speechSynthesis
 * (default, free) speaks each sentence as it arrives; when the backend
 * uses a server voice, MP3 sentences are decoded and played in order.
 * Both stop at once on barge-in.
 */

export interface Speaker {
  /** Queue one sentence. */
  say: (text: string) => void;
  /** Queue server audio for sentence `index`. */
  play: (audio: ArrayBuffer) => void;
  stop: () => void;
  readonly speaking: boolean;
  onIdle?: () => void;
}

export function browserVoices(): SpeechSynthesisVoice[] {
  return typeof window !== "undefined" && window.speechSynthesis
    ? window.speechSynthesis.getVoices()
    : [];
}

export function createSpeaker(voiceName?: string | null, lang = "en"): Speaker {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  let pending = 0;
  let audioCtx: AudioContext | null = null;
  let chain: Promise<void> = Promise.resolve();
  let current: AudioBufferSourceNode | null = null;
  let epoch = 0;

  const speaker: Speaker = {
    get speaking() {
      return pending > 0;
    },
    say(text: string) {
      if (!synth || !text.trim()) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const voice = synth.getVoices().find((v) => v.name === voiceName);
      if (voice) u.voice = voice;
      pending += 1;
      const done = () => {
        pending = Math.max(0, pending - 1);
        if (pending === 0) speaker.onIdle?.();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    },
    play(audio: ArrayBuffer) {
      const mine = epoch;
      audioCtx ??= new AudioContext();
      const ctx = audioCtx;
      pending += 1;
      chain = chain.then(async () => {
        try {
          if (mine !== epoch) return;
          const buffer = await ctx.decodeAudioData(audio.slice(0));
          if (mine !== epoch) return;
          await new Promise<void>((resolve) => {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);
            src.onended = () => resolve();
            current = src;
            src.start();
          });
        } catch {
          // An undecodable sentence is skipped; the captions still show it.
        } finally {
          pending = Math.max(0, pending - 1);
          if (pending === 0) speaker.onIdle?.();
        }
      });
    },
    stop() {
      epoch += 1;
      synth?.cancel();
      try {
        current?.stop();
      } catch {
        // already stopped
      }
      current = null;
      pending = 0;
    },
  };
  return speaker;
}
