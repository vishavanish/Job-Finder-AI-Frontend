/**
 * Job Finder — fills one page of an application form (backend plan P8b): reads the fields, asks the API
 * for answers, fills the empty ones (never overwrites what the site pre-filled or the user typed), attaches
 * the resume to a required upload (offers it otherwise) and hands the questions nobody could answer to the
 * panel. Shared by LinkedIn Easy Apply (linkedin_apply.js) and "Fill this form" on any site (page_fill.js).
 *
 * api:  {fill(runId, fields), answer(runId, field, value), resume(runId)} → {ok, data, error}
 *       runId null = a page Job Finder has no run for (answers from the profile; nothing tracked)
 * ui:   {status(text, tone?), ask(fields, onAnswer), offerResume(onClick), suggest(picks)}
 *       suggest: [{label, value}] answers for search-style dropdowns the user picks themselves (typed text
 *       there is not a choice; see filler.js)
 */
import { attachFile, fillField } from "./filler.js";
import { forApi, hasValue, isVisible, readFields } from "./formreader.js";

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createFiller({ doc, api, ui, visible = isVisible }) {
  const pages = new Set();
  let resumeFile = null;

  async function attach(runId, field) {
    try {
      if (!resumeFile) {
        const r = await api.resume(runId);
        if (!r.ok) throw new Error(r.error || "Couldn't get your resume.");
        resumeFile = { bytes: fromBase64(r.data.base64), name: r.data.name, type: r.data.type };
      }
      return attachFile(doc, field, resumeFile.bytes, resumeFile.name, resumeFile.type);
    } catch (e) {
      ui.status(e.message, "error");
      return false;
    }
  }

  return {
    /**
     * Fills the form in `root` once per distinct page (a page = its fields' keys and labels).
     * Returns "empty" (no fields), "seen" (already filled this page) or "filled".
     */
    async fillPage(root, runId, { next = "click Next or Submit" } = {}) {
      const fields = readFields(root, { visible });
      if (!fields.length) return "empty";
      const page = fields.map((f) => `${f.key}:${f.label}`).join("|");
      if (pages.has(page)) return "seen";
      pages.add(page);
      ui.status("Filling this page…");
      const r = await api.fill(runId, forApi(fields));
      if (!r.ok) {
        pages.delete(page);
        ui.status(r.error || "Couldn't get answers from Job Finder.", "error");
        return "filled";
      }
      const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
      const ask = [];
      const picks = [];
      let filled = 0;
      for (const a of r.data.answers) {
        const f = byKey[a.key];
        if (!f || hasValue(f, root)) continue;
        if (f.type === "combobox" && a.value) picks.push({ label: f.label, value: a.value });
        else if (a.value && fillField(doc, f, a.value)) filled++;
        else if (a.needs_input || (f.required && !a.value)) ask.push(f);
      }
      if (picks.length) ui.suggest(picks);
      for (const key of Object.keys(r.data.files || {})) {
        const f = byKey[key];
        if (!f) continue;
        if (f.required) {
          if (await attach(runId, f)) filled++;
        } else {
          ui.offerResume(() => attach(runId, f));
        }
      }
      if (ask.length) {
        ui.ask(ask, async (f, value) => {
          const saved = await api.answer(runId, f, value);
          if (!saved.ok) return saved.error || "Couldn't save that answer.";
          if (f.type === "combobox") ui.suggest([{ label: f.label, value }]);
          else fillField(doc, f, value);
          return null;
        });
      }
      const todo = [
        ask.length ? `answer ${ask.length} question${ask.length === 1 ? "" : "s"} below` : "",
        picks.length
          ? `pick ${picks.length} answer${picks.length === 1 ? "" : "s"} in the dropdowns`
          : "",
      ].filter(Boolean);
      ui.status(
        todo.length
          ? `Filled ${filled} — ${todo.join(" and ")}, then ${next}.`
          : `Filled ${filled} field${filled === 1 ? "" : "s"} — check them, then ${next}.`,
      );
      return "filled";
    },
    /** Forget filled pages (the user pressed the button again: fill what's empty now). */
    reset() {
      pages.clear();
    },
  };
}
