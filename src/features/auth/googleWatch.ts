/** How long after a click we wait for Google's answer before saying it didn't finish. */
export const GOOGLE_SIGNIN_TIMEOUT_MS = 20_000;
export const GOOGLE_DID_NOT_FINISH =
  "Google sign-in didn't finish. Try again, or get a code by email.";

/**
 * Google never calls back when it refuses the site (an origin missing from the OAuth
 * client) or the pop-up is closed, so a click with no answer would look like nothing
 * happened (QA1 §2). `start` on each click, `done` when a credential arrives.
 */
export function createSignInWatch(onTimeout: () => void, ms = GOOGLE_SIGNIN_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return {
    start() {
      done();
      timer = setTimeout(() => {
        timer = undefined;
        onTimeout();
      }, ms);
    },
    done,
  };
}
