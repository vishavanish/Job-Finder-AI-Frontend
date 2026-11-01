/**
 * Job Finder — "Fill this form" on any page (backend plan P8b E3b). Runs only when the user presses the
 * extension's button or Alt+Shift+F on the page, never by itself.
 *
 * With a run reopened in the browser for this site (an Auto apply run that stopped at a sign-in page, say),
 * the answers come from that run and a confirmation on the page marks it applied. Without one, the answers
 * come from the profile and answer bank and nothing is tracked. Forms that show their next step on the same
 * page are filled as each step appears; after a page load the user presses the button again.
 */
import { createFiller } from "./fill_core.js";
import { isVisible } from "./formreader.js";

// The backend's success wording (app/apply/forms.py SUCCESS_TEXT).
export const SUCCESS =
  /thank(s| you) for (applying|your application|your interest)|application (has been |was )?(submitted|received)|we('ve| have) received your application|your application (has been|was) (sent|submitted|received)|successfully (applied|submitted)/i;

/** The form with the most fields a person can fill (a footer newsletter box never wins), else the page. */
export function bestForm(doc, visible = isVisible) {
  let best = null;
  let most = 1;
  doc.querySelectorAll("form").forEach((f) => {
    const n = Array.from(f.querySelectorAll("input, select, textarea")).filter((e) => {
      const t = (e.getAttribute("type") || "").toLowerCase();
      return !["hidden", "submit", "button", "search"].includes(t) && visible(e);
    }).length;
    if (n > most) {
      best = f;
      most = n;
    }
  });
  return best || doc.body;
}

/**
 * api: {forPage(url), fill(runId, fields), answer(runId, field, value), resume(runId), result(runId, outcome)}
 * ui:  the panel (status, ask, offerResume, done)
 */
export function createPageFill({ doc, api, ui, visible = isVisible, debounceMs = 800 }) {
  const filler = createFiller({ doc, api, ui, visible });
  let run = null;
  let finished = false;
  let busy = false;
  let timer = 0;
  let observer = null;

  async function step() {
    if (finished || busy) return;
    busy = true;
    try {
      if (run && SUCCESS.test((doc.body && doc.body.textContent) || "")) {
        finished = true;
        if (observer) observer.disconnect();
        const r = await api.result(run.run_id, "submitted");
        ui.done(r.ok ? "Applied ✓ — marked in Job Finder." : "Applied ✓ — mark it in Job Finder.");
        return;
      }
      const done = await filler.fillPage(bestForm(doc, visible), run ? run.run_id : null, {
        next: "continue or submit",
      });
      if (done === "empty") ui.status("No form fields found on this page.", "warn");
    } finally {
      busy = false;
    }
  }

  return {
    get run() {
      return run;
    },
    step,
    /** First press on this page: find a run for it, fill, then watch for the form's next step. */
    async start(url) {
      const r = await api.forPage(url);
      if (!r.ok) {
        ui.status(r.error || "Couldn't reach Job Finder.", "error");
        return;
      }
      run = r.data.run_id ? r.data : null;
      ui.status(
        run
          ? `Filling the application for ${run.title}${run.company ? ` at ${run.company}` : ""}…`
          : "Filling this form from your Job Finder profile…",
      );
      await step();
      const view = doc.defaultView;
      observer = new view.MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(step, debounceMs);
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    },
    /** A later press: fill whatever is empty now. */
    again() {
      filler.reset();
      return step();
    },
  };
}
