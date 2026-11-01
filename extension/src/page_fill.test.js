import { beforeEach, describe, expect, it, vi } from "vitest";
import { bestForm, createPageFill, SUCCESS } from "./page_fill.js";

const visible = (el) => !el.closest("[hidden]");

// A company career page on a Workday-like suite after the user signed in, with a newsletter box below.
const PAGE = `
  <form id="apply">
    <div class="form-group"><label for="fn">First Name *</label><input id="fn" required></div>
    <div class="form-group"><label for="ln">Last Name *</label><input id="ln" required value="Doe"></div>
    <div class="form-group"><label for="cv">Resume/CV *</label><input id="cv" type="file" required></div>
    <div class="form-group"><label for="notice">Notice period</label>
      <select id="notice"><option value="">Select…</option><option>Immediate</option><option>30 days</option></select></div>
    <div class="form-group"><label for="why">Why do you want to work here? *</label><textarea id="why" required></textarea></div>
    <div class="form-group"><label for="country">Country *</label><input id="country" role="combobox" aria-required="true"></div>
    <button type="submit">Submit application</button>
  </form>
  <form id="news"><label for="em">Newsletter email</label><input id="em" type="email"><button>Sign up</button></form>`;

function fakes({ run = null } = {}) {
  const calls = { fill: [], answer: [], result: [], runIds: [] };
  const api = {
    forPage: vi.fn(async () => ({ ok: true, data: run || { run_id: null } })),
    fill: vi.fn(async (runId, fields) => {
      calls.runIds.push(runId);
      calls.fill.push(fields);
      const known = { fn: "Jane", ln: "Smith", notice: "30 days", country: "India" };
      return {
        ok: true,
        data: {
          answers: fields
            .filter((f) => f.type !== "file")
            .map((f) => ({
              key: f.key,
              value: known[f.key] ?? null,
              source: known[f.key] ? "profile" : "none",
              needs_input: !known[f.key] && f.required,
            })),
          files: Object.fromEntries(
            fields.filter((f) => f.type === "file").map((f) => [f.key, "resume"]),
          ),
        },
      };
    }),
    answer: vi.fn(async (runId, field, value) => {
      calls.answer.push([runId, field.label, value]);
      return { ok: true, data: { value } };
    }),
    resume: vi.fn(async () => ({
      ok: true,
      data: { base64: btoa("PK-cv"), name: "Jane Doe.pdf", type: "application/pdf" },
    })),
    result: vi.fn(async (runId, outcome) => {
      calls.result.push([runId, outcome]);
      return { ok: true };
    }),
  };
  const ui = {
    status: vi.fn(),
    ask: vi.fn(),
    offerResume: vi.fn(),
    done: vi.fn(),
    suggest: vi.fn(),
  };
  return { api, ui, calls };
}

beforeEach(() => {
  class FakeDataTransfer {
    constructor() {
      const list = [];
      this.items = { add: (f) => list.push(f) };
      this.files = list;
    }
  }
  window.DataTransfer = FakeDataTransfer;
  Object.defineProperty(window.HTMLInputElement.prototype, "files", {
    configurable: true,
    get() {
      return this._files || [];
    },
    set(v) {
      this._files = v;
    },
  });
  document.body.innerHTML = PAGE;
});

describe("Fill this form", () => {
  it("picks the application form, not the newsletter box", () => {
    expect(bestForm(document, visible).id).toBe("apply");
  });

  it("fills a page Job Finder has no run for from the profile, keeps typed values, asks the rest", async () => {
    const { api, ui, calls } = fakes();
    const fill = createPageFill({ doc: document, api, ui, visible, debounceMs: 0 });
    await fill.start("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/123/apply");
    expect(calls.runIds).toEqual([null]); // page mode
    expect(calls.fill[0].map((f) => f.key)).toEqual(["fn", "ln", "cv", "notice", "why", "country"]);
    // A search-style dropdown is never typed into (Greenhouse drops typed text): the panel lists the pick.
    expect(document.getElementById("country").value).toBe("");
    expect(ui.suggest).toHaveBeenCalledWith([{ label: "Country *", value: "India" }]);
    expect(ui.status).toHaveBeenLastCalledWith(
      expect.stringMatching(/answer 1 question below and pick 1 answer in the dropdowns/),
    );
    expect(document.getElementById("fn").value).toBe("Jane");
    expect(document.getElementById("ln").value).toBe("Doe"); // typed by the user: left alone
    expect(document.getElementById("notice").selectedOptions[0].text).toBe("30 days");
    expect(document.getElementById("cv").files[0].name).toBe("Jane Doe.pdf");
    expect(document.getElementById("em").value).toBe("");

    const [asked, onAnswer] = ui.ask.mock.calls[0];
    expect(asked.map((f) => f.key)).toEqual(["why"]);
    expect(await onAnswer(asked[0], "I like the product.")).toBeNull();
    expect(calls.answer).toEqual([
      [null, "Why do you want to work here? *", "I like the product."],
    ]);
    expect(document.getElementById("why").value).toBe("I like the product.");

    await fill.step(); // same page again: no second API call
    expect(calls.fill).toHaveLength(1);
    document.getElementById("fn").value = "";
    await fill.again(); // the user pressed the button again: fill what's empty now
    expect(calls.fill).toHaveLength(2);
    expect(document.getElementById("fn").value).toBe("Jane");
    expect(api.result).not.toHaveBeenCalled(); // nothing to track without a run
  });

  it("uses a reopened run's answers and marks it applied when the page confirms", async () => {
    const { api, ui, calls } = fakes({
      run: { run_id: "run-7", title: "Engineer", company: "Acme" },
    });
    const fill = createPageFill({ doc: document, api, ui, visible, debounceMs: 0 });
    await fill.start("https://careers.acme.com/apply");
    expect(calls.runIds).toEqual(["run-7"]);
    document.body.innerHTML = `<h1>Thank you for applying to Acme!</h1>`;
    await fill.step();
    expect(calls.result).toEqual([["run-7", "submitted"]]);
    expect(ui.done).toHaveBeenCalled();
    expect(SUCCESS.test("Your application has been received")).toBe(true);
    expect(SUCCESS.test("Apply now")).toBe(false);
  });
});
