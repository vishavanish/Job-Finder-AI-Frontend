/**
 * Job Finder — fills one form control the way a person would, so sites built with React (LinkedIn) accept
 * the value: the native value setter, then input / change / blur events. Radios and checkboxes are
 * clicked; options are picked by their text. Never clicks a Next, Review or Submit button.
 */

const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
const norm = (t) => clean(t).toLowerCase();

function fire(el, type) {
  const view = el.ownerDocument.defaultView;
  el.dispatchEvent(new view.Event(type, { bubbles: true }));
}

/** Sets a text-like value through the prototype setter (React tracks the element's own setter). */
export function setValue(el, value) {
  const view = el.ownerDocument.defaultView;
  const proto =
    el.tagName === "TEXTAREA"
      ? view.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
        ? view.HTMLSelectElement.prototype
        : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  el.focus();
  setter.call(el, value);
  fire(el, "input");
  fire(el, "change");
  el.blur();
  fire(el, "blur");
}

/** Index of the option matching `value` (exact text first, then a word match), or -1. */
export function chooseOption(options, value) {
  const v = norm(value);
  if (!v) return -1;
  let i = options.findIndex((o) => norm(o) === v);
  if (i >= 0) return i;
  i = options.findIndex((o) => norm(o).startsWith(v) || v.startsWith(norm(o)));
  return i;
}

function marked(doc, field) {
  return field.marks.map((m) => doc.querySelector(`[data-jf="${m}"]`)).filter(Boolean);
}

/** Fills one field read by formreader.readFields. Returns true when the value went in. */
export function fillField(doc, field, value) {
  if (value == null || value === "") return false;
  const els = marked(doc, field);
  if (!els.length) return false;
  const el = els[0];
  switch (field.type) {
    case "radio": {
      const i = chooseOption(field.options, value);
      if (i < 0 || !els[i]) return false;
      if (!els[i].checked) els[i].click();
      return els[i].checked;
    }
    case "checkbox": {
      if (els.length > 1) {
        const wanted = String(value)
          .split(/\s*[,;]\s*/)
          .map((v) => chooseOption(field.options, v));
        els.forEach((e, i) => {
          if (wanted.includes(i) !== e.checked) e.click();
        });
        return true;
      }
      const on = /^(yes|true|1|checked|agree)/i.test(String(value));
      if (on !== el.checked) el.click();
      return true;
    }
    case "select": {
      const opts = Array.from(el.options);
      const i = chooseOption(
        opts.map((o) => clean(o.text)),
        value,
      );
      if (i < 0) return false;
      setValue(el, opts[i].value);
      return true;
    }
    case "file":
      return false; // attachFile
    default:
      setValue(el, String(value));
      return true;
  }
}

/** Puts a file into a file input (the resume), as if the user picked it. */
export function attachFile(doc, field, bytes, name, type) {
  const el = marked(doc, field)[0];
  if (!el) return false;
  const view = doc.defaultView;
  const file = new view.File([bytes], name, { type: type || "application/octet-stream" });
  const dt = new view.DataTransfer();
  dt.items.add(file);
  el.files = dt.files;
  fire(el, "input");
  fire(el, "change");
  return el.files.length === 1;
}
