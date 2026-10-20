/**
 * Bounded send queue for audio frames (spec §7.2): when the socket stalls,
 * the OLDEST frames are dropped instead of building up lag.
 */
export class SendQueue<T> {
  private items: T[] = [];
  dropped = 0;

  constructor(private readonly max: number) {}

  push(item: T): void {
    this.items.push(item);
    while (this.items.length > this.max) {
      this.items.shift();
      this.dropped += 1;
    }
  }

  /** Takes everything queued, oldest first. */
  drain(): T[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}
