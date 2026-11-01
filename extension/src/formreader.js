/**
 * Job Finder — reads the application form the user has open (Fast apply, backend plan P8b E3a).
 *
 * A port of the server's reader (backend `app/apply/forms.py` `_EXTRACT_JS`) so a form is read the same
 * way in the user's browser as on the apply worker: every visible control in `root` with its question
 * label, type, options and required flag. Keep the two in step when one changes.
 *
 *   {key, label, type, options, required, marks}
 *   type: text | textarea | number | select | radio | checkbox | combobox | file
 *
 * `key` is the control's id or name (stable while the page lives); `marks` are data-jf attributes on the
 * controls so the filler finds them again. Reading never changes a value.
 */

const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
const GROUPS = [
  "fieldset",
  ".application-question",
  '[role="radiogroup"]',
  '[role="group"]',
  ".field-wrapper",
  ".field",
  ".form-group",
  ".question",
  // LinkedIn Easy Apply wraps each question in one of these.
  ".jobs-easy-apply-form-section__grouping",
  "[data-test-form-element]",
];
const SKIP_TYPES = ["hidden", "submit", "button", "reset", "image", "search"];
const PLACEHOLDER_OPTION = /^(select|choose|please select|--)/i;

/** What a person can see. Tests pass their own (jsdom has no layout). */
export function isVisible(el) {
  const view = el.ownerDocument.defaultView;
  if (el.type === "file") {
    // Often hidden behind a styled button; not when its whole section is hidden.
    const p = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
    return !p || p.width > 0 || p.height > 0;
  }
  const s = view.getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

function questionText(el, containers) {
  for (const cs of containers) {
    const c = el.closest(cs);
    if (!c) continue;
    for (const ls of [
      "legend",
      ".application-label",
      ".question-label",
      ".label",
      ":scope > label",
      "label",
    ]) {
      const l = c.querySelector(ls);
      if (l && !l.contains(el) && clean(l.textContent)) return clean(l.textContent);
    }
  }
  return "";
}

function labelOf(el, doc) {
  const group = el.type === "file" ? el.closest('[role="group"][aria-labelledby]') : null;
  if (group) {
    const g = doc.getElementById(group.getAttribute("aria-labelledby"));
    if (g && clean(g.textContent)) return clean(g.textContent);
  }
  if (el.id) {
    const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l && clean(l.textContent)) return clean(l.textContent);
  }
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = by
      .split(/\s+/)
      .map((i) => doc.getElementById(i))
      .filter(Boolean)
      .map((n) => n.textContent)
      .join(" ");
    if (clean(t)) return clean(t);
  }
  if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
  const wrap = el.closest("label");
  if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
  return (
    questionText(el, [...GROUPS, "li"]) || clean(el.getAttribute("placeholder") || el.name || "")
  );
}

function requiredOf(el, label) {
  return !!(
    el.required ||
    el.getAttribute("aria-required") === "true" ||
    /[*✱](\s|$)|\(required\)/i.test(label) ||
    el.closest('.required, [data-required="true"], [aria-required="true"]') !== null
  );
}

function optionLabel(el, doc) {
  const l = el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  if (l) return clean(l.textContent);
  return clean((el.closest("label") || {}).textContent || el.value);
}

/** The controls in `root` (an element or document). */
export function readFields(root, { visible = isVisible } = {}) {
  const doc = root.ownerDocument || root;
  doc.querySelectorAll("[data-jf]").forEach((e) => e.removeAttribute("data-jf"));
  const out = [];
  const groups = {};
  let n = 0;
  root.querySelectorAll("input, textarea, select").forEach((el) => {
    const t = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (SKIP_TYPES.includes(t)) return;
    if (!visible(el)) return;
    if (el.getAttribute("aria-hidden") === "true" && t !== "file") return;
    const mark = "f" + n++;
    el.setAttribute("data-jf", mark);
    const sameName =
      el.name &&
      root.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1;
    if (t === "radio" || (t === "checkbox" && sameName)) {
      const gkey = t + ":" + (el.name || mark);
      if (!groups[gkey]) {
        groups[gkey] = {
          key: el.name || mark,
          type: t === "radio" ? "radio" : "checkbox",
          label: questionText(el, GROUPS) || clean(el.name),
          options: [],
          marks: [],
          required: false,
        };
        out.push(groups[gkey]);
      }
      const g = groups[gkey];
      g.options.push(optionLabel(el, doc));
      g.marks.push(mark);
      g.required = g.required || requiredOf(el, g.label);
      return;
    }
    const label = labelOf(el, doc);
    const type =
      el.tagName === "TEXTAREA"
        ? "textarea"
        : el.tagName === "SELECT"
          ? "select"
          : t === "file"
            ? "file"
            : t === "checkbox"
              ? "checkbox"
              : t === "number"
                ? "number"
                : el.getAttribute("role") === "combobox"
                  ? "combobox"
                  : "text";
    const options =
      type === "select"
        ? Array.from(el.options)
            .filter(
              (o) => o.value !== "" && clean(o.text) && !PLACEHOLDER_OPTION.test(clean(o.text)),
            )
            .map((o) => clean(o.text))
        : [];
    out.push({
      key: el.id || el.name || mark,
      type,
      label,
      options,
      required: requiredOf(el, label),
      marks: [mark],
    });
  });
  return out;
}

/** True when the control already holds an answer (LinkedIn pre-fills contact details; never overwrite). */
export function hasValue(field, root) {
  const doc = root.ownerDocument || root;
  const els = field.marks.map((m) => doc.querySelector(`[data-jf="${m}"]`)).filter(Boolean);
  if (!els.length) return false;
  if (field.type === "radio" || field.type === "checkbox") return els.some((e) => e.checked);
  if (field.type === "file") return false;
  const el = els[0];
  if (el.tagName === "SELECT") {
    const opt = el.options[el.selectedIndex];
    return Boolean(opt && opt.value !== "" && !PLACEHOLDER_OPTION.test(clean(opt.text)));
  }
  return clean(el.value) !== "";
}

/** What the API takes: no marks. */
export function forApi(fields) {
  return fields.map(({ key, label, type, options, required }) => ({
    key,
    label,
    type,
    options,
    required,
  }));
}
