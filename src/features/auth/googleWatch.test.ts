/** QA1 §2: a Google click with no answer ends in a message, not silence. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_SIGNIN_TIMEOUT_MS, createSignInWatch } from "./googleWatch";

describe("Google sign-in watch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports when Google never answers a click", () => {
    const onTimeout = vi.fn();
    const watch = createSignInWatch(onTimeout);
    watch.start();
    vi.advanceTimersByTime(GOOGLE_SIGNIN_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("stays quiet once a credential arrives", () => {
    const onTimeout = vi.fn();
    const watch = createSignInWatch(onTimeout);
    watch.start();
    watch.done();
    vi.advanceTimersByTime(GOOGLE_SIGNIN_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("restarts the wait on a second click", () => {
    const onTimeout = vi.fn();
    const watch = createSignInWatch(onTimeout, 1000);
    watch.start();
    vi.advanceTimersByTime(900);
    watch.start();
    vi.advanceTimersByTime(900);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
