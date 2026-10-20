/**
 * Turns the browser's float audio (usually 48 kHz) into 16 kHz mono PCM16
 * frames of FRAME_MS for the voice socket. Pure functions, unit-tested;
 * the AudioWorklet only forwards raw samples to the page.
 */
import { FRAME_SAMPLES, SAMPLE_RATE } from "../protocol";

/** Averages each output sample's input window (a cheap low-pass) and converts to PCM16. */
export function downsample(
  input: Float32Array,
  fromRate: number,
  toRate = SAMPLE_RATE,
): Int16Array {
  if (fromRate === toRate) return floatToPcm16(input);
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j]!;
    out[i] = toPcm16(end > start ? sum / (end - start) : 0);
  }
  return out;
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = toPcm16(input[i]!);
  return out;
}

function toPcm16(v: number): number {
  const s = Math.max(-1, Math.min(1, v));
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

/** 0–1 loudness for the level meter. */
export function rms(samples: Float32Array | Int16Array): number {
  if (!samples.length) return 0;
  const scale = samples instanceof Int16Array ? 32768 : 1;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]! / scale;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

/**
 * Collects resampled audio and hands out fixed-size frames. Leftover input
 * is carried to the next call so no sample is lost or duplicated.
 */
export class FrameChunker {
  private carryIn = new Float32Array(0);
  private carryOut = new Int16Array(0);

  constructor(private readonly fromRate: number) {}

  push(input: Float32Array): Int16Array[] {
    // Resample on whole input windows only; keep the remainder for next time.
    const ratio = this.fromRate / SAMPLE_RATE;
    const joined = concatF32(this.carryIn, input);
    const usable = Math.floor(joined.length / ratio) * ratio;
    const whole = Math.floor(usable);
    this.carryIn = joined.slice(whole);
    const pcm = concatI16(this.carryOut, downsample(joined.subarray(0, whole), this.fromRate));
    const frames: Int16Array[] = [];
    let offset = 0;
    while (offset + FRAME_SAMPLES <= pcm.length) {
      frames.push(pcm.slice(offset, offset + FRAME_SAMPLES));
      offset += FRAME_SAMPLES;
    }
    this.carryOut = pcm.slice(offset);
    return frames;
  }
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  if (!a.length) return b;
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function concatI16(a: Int16Array, b: Int16Array): Int16Array {
  if (!a.length) return b;
  const out = new Int16Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
