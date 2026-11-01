/**
 * Job Finder — the small on-page panel for Fast apply and "Fill this form" (backend plan P8b): what it is
 * doing, the questions Job Finder can't answer (typed in, then filled and saved), the resume offer. A closed
 * shadow root keeps the page's styles out. One panel per page.
 */
const panels = new WeakMap();

export function createPanel(doc) {
  if (panels.has(doc)) return panels.get(doc);
  const host = doc.createElement("div");
  host.setAttribute("data-job-finder-assist", "");
  host.style.cssText = "position:fixed;left:20px;bottom:20px;z-index:2147483647;display:none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .p { font: 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
           width: 320px; max-height: 60vh; overflow:auto; background:#fff; color:#1b1a18; border-radius:14px;
           box-shadow:0 10px 30px rgba(27,26,24,.28); border:1px solid #e4dfd8; }
      .h { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#6a3d98; color:#fff;
           border-radius:14px 14px 0 0; font-weight:600; }
      .dot { width:18px; height:18px; border-radius:5px; background:#fff; color:#6a3d98; display:inline-grid;
             place-items:center; font-size:12px; font-weight:800; }
      .x { margin-left:auto; background:transparent; border:0; color:#fff; font-size:18px; cursor:pointer; }
      .b { padding:10px 12px; display:grid; gap:10px; }
      .s { margin:0; } .s.warn { color:#8a5300; } .s.error { color:#b3261e; } .s.ok { color:#1e7a3a; font-weight:600; }
      .q { display:grid; gap:4px; } .q label { font-weight:600; font-size:13px; }
      .q input, .q select { font:inherit; padding:6px 8px; border:1px solid #c9c2b8; border-radius:8px; }
      .row { display:flex; gap:6px; } .row input, .row select { flex:1; min-width:0; }
      button.go { font:inherit; font-weight:600; border:0; border-radius:8px; padding:6px 10px; background:#6a3d98;
                  color:#fff; cursor:pointer; } button.go[disabled] { opacity:.6; }
      .err { color:#b3261e; font-size:12px; margin:0; }
      .note { color:#6b655d; font-size:12px; margin:0; }
      .picks ul { margin:4px 0 0; padding-left:18px; display:grid; gap:4px; } .picks b { font-weight:600; }
    </style>
    <div class="p" role="region" aria-label="Job Finder form filling">
      <div class="h"><span class="dot" aria-hidden="true">J</span><span>Job Finder</span>
        <button class="x" type="button" aria-label="Hide">×</button></div>
      <div class="b">
        <p class="s" aria-live="polite"></p>
        <div class="qs"></div>
        <div class="picks" hidden><p class="note">Pick these in the form's dropdowns:</p><ul></ul></div>
        <div class="files"></div>
        <p class="note">Job Finder fills the form. You check it and click Next and Submit.</p>
      </div>
    </div>`;
  const statusEl = root.querySelector(".s");
  const qs = root.querySelector(".qs");
  const files = root.querySelector(".files");
  const picks = root.querySelector(".picks");
  const pickList = picks.querySelector("ul");
  root.querySelector(".x").addEventListener("click", () => (host.style.display = "none"));

  const ui = {
    status(text, tone = "") {
      host.style.display = "block";
      statusEl.textContent = text;
      statusEl.className = `s ${tone}`;
    },
    done(text) {
      ui.status(text, "ok");
      qs.replaceChildren();
      files.replaceChildren();
      pickList.replaceChildren();
      picks.hidden = true;
    },
    offerResume(onClick) {
      files.replaceChildren();
      const b = doc.createElement("button");
      b.className = "go";
      b.type = "button";
      b.textContent = "Attach my Job Finder resume";
      b.addEventListener("click", async () => {
        b.disabled = true;
        b.textContent = (await onClick()) ? "Resume attached ✓" : "Couldn't attach it";
      });
      files.appendChild(b);
    },
    suggest(items) {
      host.style.display = "block";
      for (const it of items) {
        const li = doc.createElement("li");
        const q = doc.createElement("span");
        q.textContent = `${it.label || "Question"}: `;
        const a = doc.createElement("b");
        a.textContent = it.value;
        li.append(q, a);
        pickList.appendChild(li);
      }
      picks.hidden = !pickList.children.length;
    },
    ask(fields, onAnswer) {
      qs.replaceChildren();
      fields.forEach((f, i) => {
        const box = doc.createElement("form");
        box.className = "q";
        const id = `jf-q-${i}`;
        const label = doc.createElement("label");
        label.htmlFor = id;
        label.textContent = f.label || "Question";
        const row = doc.createElement("div");
        row.className = "row";
        let input;
        if (f.options && f.options.length) {
          input = doc.createElement("select");
          input.append(new Option("Choose…", ""), ...f.options.map((o) => new Option(o, o)));
        } else {
          input = doc.createElement("input");
          input.type = f.type === "number" ? "number" : "text";
        }
        input.id = id;
        const go = doc.createElement("button");
        go.className = "go";
        go.type = "submit";
        go.textContent = "Fill";
        const err = doc.createElement("p");
        err.className = "err";
        row.append(input, go);
        box.append(label, row, err);
        box.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          go.disabled = true;
          const problem = await onAnswer(f, input.value.trim());
          go.disabled = false;
          if (problem) err.textContent = problem;
          else box.remove();
        });
        qs.appendChild(box);
      });
    },
  };

  doc.documentElement.appendChild(host);
  panels.set(doc, ui);
  return ui;
}
