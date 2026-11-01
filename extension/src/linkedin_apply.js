/**
 * Job Finder — Fast apply on LinkedIn Easy Apply, in the user's own signed-in tab (backend plan P8b E3a).
 *
 * Only when the user started Fast apply for this job in Job Finder (the API has an `in_browser` run whose
 * LinkedIn job id matches this page). Then:
 *   1. clicks "Easy Apply" once to open the dialog (the only click it makes);
 *   2. each time a new page of the dialog appears, reads its fields, asks the API for answers and fills the
 *      empty ones (never overwrites what LinkedIn pre-filled or the user typed);
 *   3. questions nobody can answer go to the panel; the user's answer is typed in and saved for next time;
 *   4. when LinkedIn says the application was sent, Job Finder marks the job applied.
 * It never clicks Next, Review or Submit, and stops at anything LinkedIn asks the user to check.
 *
 * Pure of the extension APIs: `api` (the background calls) and `ui` (the panel) are passed in, so tests run
 * it on a saved page with fakes.
 */
import { createFiller } from "./fill_core.js";
import { isVisible } from "./formreader.js";

// Only LinkedIn's own confirmation; "Applied 3 days ago" on the job page is an older application.
export const CONFIRMED =
  /your application was sent|application (was )?sent to|application submitted/i;
const EASY_APPLY = /easy apply/i;
const CHECK_NEEDED = /verify|security check|captcha|are you a (human|robot)/i;

/** The Easy Apply dialog, if open. */
export function findDialog(doc) {
  const modal = doc.querySelector(".jobs-easy-apply-modal");
  if (modal) return modal;
  return (
    Array.from(doc.querySelectorAll('[role="dialog"]')).find(
      (d) =>
        /apply to|easy apply/i.test(d.textContent || "") || d.querySelector("form, input, select"),
    ) || null
  );
}

/** The job's own Easy Apply button (not one in a list of other jobs). */
export function easyApplyButton(doc) {
  const buttons = Array.from(doc.querySelectorAll("button")).filter(
    (b) => EASY_APPLY.test(b.textContent || b.getAttribute("aria-label") || "") && !b.disabled,
  );
  return buttons.find((b) => b.classList.contains("jobs-apply-button")) || buttons[0] || null;
}

export function confirmed(doc) {
  const dialog = doc.querySelector('[role="dialog"]');
  const text = (dialog || doc.body).textContent || "";
  return CONFIRMED.test(text);
}

/**
 * api: {forPage(url), fill(runId, fields), answer(runId, field, value), resume(runId), result(runId, outcome)}
 *      each resolving to {ok, data, error}
 * ui:  {status(text, tone?), ask(fields, onAnswer), offerResume(onClick), done(text)}
 */
export function createAssist({ doc, api, ui, visible = isVisible, debounceMs = 600 }) {
  let run = null;
  let finished = false;
  let busy = false;
  let again = false;
  let timer = 0;
  let observer = null;
  const filler = createFiller({ doc, api, ui, visible });

  async function finish() {
    finished = true;
    if (observer) observer.disconnect();
    const r = await api.result(run.run_id, "submitted");
    ui.done(
      r.ok
        ? "Applied ✓ — marked in Job Finder."
        : "Applied ✓ (Job Finder couldn't record it — mark it there).",
    );
  }

  async function step() {
    if (!run || finished) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      if (confirmed(doc)) return await finish();
      const dialog = findDialog(doc);
      if (!dialog) return;
      if (
        CHECK_NEEDED.test(dialog.textContent || "") &&
        !dialog.querySelector("input, select, textarea")
      ) {
        ui.status("LinkedIn wants you to check something — do it, then carry on.", "warn");
        return;
      }
      const done = await filler.fillPage(dialog, run.run_id, {
        next: "click Next or Submit in LinkedIn",
      });
      if (done === "empty") ui.status("Check this page, then click Next or Submit in LinkedIn.");
    } finally {
      busy = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(step, debounceMs);
  }

  return {
    get run() {
      return run;
    },
    get finished() {
      return finished;
    },
    step,
    /** The user pressed "Fill this form": fill what's empty on the open page again. */
    fillNow() {
      filler.reset();
      return step();
    },
    /** Finds this page's Fast apply run; false when the user didn't start one for this job. */
    async start(url) {
      const r = await api.forPage(url);
      if (!r.ok || !r.data.run_id) return false;
      run = r.data;
      ui.status(`Fast apply · ${run.title}${run.company ? ` at ${run.company}` : ""}`);
      if (!findDialog(doc)) {
        const button = easyApplyButton(doc);
        if (button) button.click();
        else
          ui.status(
            "No Easy Apply button here — sign in to LinkedIn, or apply on the company's site.",
            "warn",
          );
      }
      const view = doc.defaultView;
      observer = new view.MutationObserver(() => schedule());
      observer.observe(doc.body, { childList: true, subtree: true });
      await step();
      return true;
    },
    /** The tab is going away before LinkedIn confirmed anything. */
    leave() {
      if (run && !finished) {
        finished = true;
        api.result(run.run_id, "closed");
      }
    },
  };
}
