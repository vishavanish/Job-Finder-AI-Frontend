import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseOption, fillField } from "./filler.js";
import { forApi, hasValue, readFields } from "./formreader.js";
import { confirmed, createAssist, easyApplyButton, findDialog } from "./linkedin_apply.js";

const visible = (el) => !el.closest("[hidden]");

// Shaped like LinkedIn's Easy Apply dialog (2026): one section per question, ids carry the job id.
const ID = "urn-li-jobs-applyformcommon-easyApplyFormElement-4012345678";
const CONTACT = `
  <h3>Contact info</h3>
  <div class="jobs-easy-apply-form-section__grouping">
    <label for="${ID}-1-first">First name</label>
    <input id="${ID}-1-first" type="text" required value="">
  </div>
  <div class="jobs-easy-apply-form-section__grouping">
    <label for="${ID}-2-email">Email address</label>
    <select id="${ID}-2-email" required>
      <option value="">Select an option</option><option value="jane@example.com">jane@example.com</option>
    </select>
  </div>
  <div class="jobs-easy-apply-form-section__grouping">
    <label for="${ID}-3-phone">Mobile phone number</label>
    <input id="${ID}-3-phone" type="text" required value="+91 98765 43210">
  </div>
  <button aria-label="Continue to next step">Next</button>`;
const RESUME = `
  <h3>Resume</h3>
  <div class="jobs-document-upload">
    <label for="${ID}-4-resume">Upload resume</label>
    <input id="${ID}-4-resume" type="file" accept=".pdf,.docx" required>
  </div>
  <button>Next</button>`;
const QUESTIONS = `
  <h3>Additional questions</h3>
  <fieldset class="jobs-easy-apply-form-section__grouping" data-test-form-element>
    <legend>Are you legally authorized to work in India?</legend>
    <input type="radio" id="${ID}-5-yes" name="${ID}-5-auth" value="Yes" required><label for="${ID}-5-yes">Yes</label>
    <input type="radio" id="${ID}-5-no" name="${ID}-5-auth" value="No"><label for="${ID}-5-no">No</label>
  </fieldset>
  <div class="jobs-easy-apply-form-section__grouping">
    <label for="${ID}-6-k8s">How many years of work experience do you have with Kubernetes?</label>
    <input id="${ID}-6-k8s" type="text" required>
  </div>
  <div class="jobs-easy-apply-form-section__grouping" hidden>
    <label for="${ID}-7-hidden">Hidden question</label><input id="${ID}-7-hidden" type="text">
  </div>
  <button>Review</button>`;

function jobPage() {
  document.body.innerHTML = `
    <main><h1>Backend Engineer</h1>
      <button class="jobs-apply-button" aria-label="Easy Apply to Backend Engineer at Orbit Labs">Easy Apply</button>
    </main>`;
  document.querySelector(".jobs-apply-button").addEventListener("click", () => openDialog(CONTACT));
}

function openDialog(inner) {
  let d = document.querySelector(".jobs-easy-apply-modal");
  if (!d) {
    d = document.createElement("div");
    d.className = "jobs-easy-apply-modal";
    d.setAttribute("role", "dialog");
    document.body.appendChild(d);
  }
  d.innerHTML = `<h2>Apply to Orbit Labs</h2><form>${inner}</form>`;
}

const ANSWERS = {
  first: { value: "Jane", source: "profile", needs_input: false },
  email: { value: "jane@example.com", source: "profile", needs_input: false },
  phone: { value: "+91 90000 00000", source: "profile", needs_input: false },
  auth: { value: "Yes", source: "profile", needs_input: false },
  k8s: { value: null, source: "none", needs_input: true },
};
const answerFor = (key) => Object.entries(ANSWERS).find(([k]) => key.includes(k))?.[1];

function fakes() {
  const calls = { fill: [], answer: [], result: [], resume: 0 };
  const api = {
    forPage: vi.fn(async (url) => ({
      ok: true,
      data: url.includes("4012345678")
        ? { run_id: "run-1", title: "Backend Engineer", company: "Orbit Labs" }
        : { run_id: null },
    })),
    fill: vi.fn(async (runId, fields) => {
      calls.fill.push(fields);
      const files = {};
      const answers = [];
      for (const f of fields) {
        if (f.type === "file") files[f.key] = "resume";
        else
          answers.push({
            key: f.key,
            ...(answerFor(f.key) || { value: null, source: "none", needs_input: false }),
          });
      }
      return { ok: true, data: { answers, files } };
    }),
    answer: vi.fn(async (runId, field, value) => {
      calls.answer.push([field.key, value]);
      return { ok: true, data: { key: field.key, value, source: "user", needs_input: false } };
    }),
    resume: vi.fn(async () => {
      calls.resume++;
      return {
        ok: true,
        data: {
          base64: btoa("PK-resume"),
          name: "Jane Doe.docx",
          type: "application/octet-stream",
        },
      };
    }),
    result: vi.fn(async (runId, outcome) => {
      calls.result.push(outcome);
      return { ok: true, data: { state: "done" } };
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
  // jsdom has no DataTransfer; a minimal one is enough to put a File into input.files.
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
});

describe("form reader", () => {
  it("reads labels, types, options and required flags, skipping hidden controls", () => {
    jobPage();
    openDialog(QUESTIONS);
    const fields = readFields(findDialog(document), { visible });
    expect(forApi(fields)).toEqual([
      {
        key: `${ID}-5-auth`,
        label: "Are you legally authorized to work in India?",
        type: "radio",
        options: ["Yes", "No"],
        required: true,
      },
      {
        key: `${ID}-6-k8s`,
        label: "How many years of work experience do you have with Kubernetes?",
        type: "text",
        options: [],
        required: true,
      },
    ]);
  });

  it("drops select placeholders and sees pre-filled values", () => {
    jobPage();
    openDialog(CONTACT);
    const dialog = findDialog(document);
    const fields = readFields(dialog, { visible });
    const email = fields.find((f) => f.key.endsWith("email"));
    expect(email.options).toEqual(["jane@example.com"]);
    expect(hasValue(email, dialog)).toBe(false);
    expect(
      hasValue(
        fields.find((f) => f.key.endsWith("phone")),
        dialog,
      ),
    ).toBe(true);
  });
});

describe("filler", () => {
  it("sets values with input events, picks options by text and clicks radios", () => {
    jobPage();
    openDialog(CONTACT + QUESTIONS);
    const dialog = findDialog(document);
    const fields = readFields(dialog, { visible });
    const byEnd = (s) => fields.find((f) => f.key.endsWith(s));
    const seen = [];
    dialog.addEventListener("input", (e) => seen.push(e.target.id));
    expect(fillField(document, byEnd("first"), "Jane")).toBe(true);
    expect(document.getElementById(`${ID}-1-first`).value).toBe("Jane");
    expect(seen).toContain(`${ID}-1-first`);
    expect(fillField(document, byEnd("email"), "JANE@example.com")).toBe(true);
    expect(document.getElementById(`${ID}-2-email`).value).toBe("jane@example.com");
    expect(fillField(document, byEnd("auth"), "No")).toBe(true);
    expect(document.getElementById(`${ID}-5-no`).checked).toBe(true);
    expect(fillField(document, byEnd("auth"), "Maybe")).toBe(false);
    expect(chooseOption(["Yes", "No"], "yes")).toBe(0);
  });
});

describe("LinkedIn Easy Apply assist", () => {
  it("does nothing on a job the user didn't start Fast apply for", async () => {
    jobPage();
    const { api, ui } = fakes();
    const assist = createAssist({ doc: document, api, ui, visible });
    expect(await assist.start("https://www.linkedin.com/jobs/view/4099999999")).toBe(false);
    expect(findDialog(document)).toBeNull(); // Easy Apply not clicked
    expect(api.fill).not.toHaveBeenCalled();
  });

  it("opens Easy Apply once, fills each page, asks what it can't answer, never clicks Next", async () => {
    jobPage();
    const { api, ui, calls } = fakes();
    const nextClicks = vi.fn();
    document.addEventListener("click", (e) => {
      if (/next|review|submit/i.test(e.target.textContent || "")) nextClicks();
    });
    const assist = createAssist({ doc: document, api, ui, visible, debounceMs: 0 });
    expect(
      await assist.start(
        "https://www.linkedin.com/jobs/view/backend-engineer-at-orbit-labs-4012345678",
      ),
    ).toBe(true);

    // Page 1: contact info. The phone LinkedIn pre-filled is left alone.
    expect(findDialog(document)).not.toBeNull();
    expect(document.getElementById(`${ID}-1-first`).value).toBe("Jane");
    expect(document.getElementById(`${ID}-2-email`).value).toBe("jane@example.com");
    expect(document.getElementById(`${ID}-3-phone`).value).toBe("+91 98765 43210");
    await assist.step(); // the same page again (our own fills changed the DOM): no second API call
    expect(calls.fill).toHaveLength(1);

    // Page 2: the required resume upload gets the Job Finder resume.
    openDialog(RESUME);
    await assist.step();
    const file = document.getElementById(`${ID}-4-resume`).files[0];
    expect(file.name).toBe("Jane Doe.docx");
    expect(calls.resume).toBe(1);

    // Page 3: the radio is answered; Kubernetes goes to the panel.
    openDialog(QUESTIONS);
    await assist.step();
    expect(document.getElementById(`${ID}-5-yes`).checked).toBe(true);
    expect(ui.ask).toHaveBeenCalledTimes(1);
    const [asked, onAnswer] = ui.ask.mock.calls[0];
    expect(asked.map((f) => f.key)).toEqual([`${ID}-6-k8s`]);
    expect(await onAnswer(asked[0], "3")).toBeNull();
    expect(calls.answer).toEqual([[`${ID}-6-k8s`, "3"]]);
    expect(document.getElementById(`${ID}-6-k8s`).value).toBe("3");

    // The user submits in LinkedIn; the confirmation marks it applied.
    openDialog(`<h3>Your application was sent to Orbit Labs!</h3>`);
    await assist.step();
    expect(calls.result).toEqual(["submitted"]);
    expect(ui.done).toHaveBeenCalled();
    expect(assist.finished).toBe(true);
    assist.leave();
    expect(calls.result).toEqual(["submitted"]); // no "closed" after a confirmed application
    expect(nextClicks).not.toHaveBeenCalled();
  });

  it("reports a tab closed before LinkedIn confirmed anything", async () => {
    jobPage();
    const { api, ui, calls } = fakes();
    const assist = createAssist({ doc: document, api, ui, visible, debounceMs: 0 });
    await assist.start("https://www.linkedin.com/jobs/search/?currentJobId=4012345678");
    assist.leave();
    expect(calls.result).toEqual(["closed"]);
  });

  it("finds the right button and the confirmation text", () => {
    document.body.innerHTML = `<button>Save</button><button disabled>Easy Apply</button>
      <button class="jobs-apply-button">Easy Apply</button>`;
    expect(easyApplyButton(document).className).toBe("jobs-apply-button");
    expect(confirmed(document)).toBe(false);
    document.body.innerHTML = `<div role="dialog">Application sent to Orbit Labs</div>`;
    expect(confirmed(document)).toBe(true);
  });
});
