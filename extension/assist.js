/**
 * Job Finder — Fast apply panel on LinkedIn job pages (backend plan P8b E3a).
 *
 * Does nothing unless the user clicked Fast apply for this job in Job Finder. Then a small panel at the
 * bottom left says what it is doing, asks the questions Job Finder can't answer, and offers the resume.
 * The filling itself is src/linkedin_apply.js; every API call goes through the background worker.
 */
(async () => {
  const { createAssist } = await import(chrome.runtime.getURL("src/linkedin_apply.js"));
  const send = (msg) =>
    new Promise((resolve) =>
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: "No answer." })),
    );

  const api = {
    forPage: (url) => send({ type: "assistForPage", url }),
    fill: (run_id, fields) => send({ type: "assistFill", run_id, fields }),
    answer: (run_id, key, value) => send({ type: "assistAnswer", run_id, key, value }),
    resume: (run_id) => send({ type: "assistResume", run_id }),
    result: (run_id, outcome) => send({ type: "assistResult", run_id, outcome }),
  };

  const host = document.createElement("div");
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
    </style>
    <div class="p" role="region" aria-label="Job Finder Fast apply">
      <div class="h"><span class="dot" aria-hidden="true">J</span><span>Job Finder · Fast apply</span>
        <button class="x" type="button" aria-label="Hide">×</button></div>
      <div class="b">
        <p class="s" aria-live="polite"></p>
        <div class="qs"></div>
        <div class="files"></div>
        <p class="note">Job Finder fills the form. You check it and click Next and Submit.</p>
      </div>
    </div>`;
  const statusEl = root.querySelector(".s");
  const qs = root.querySelector(".qs");
  const files = root.querySelector(".files");
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
    },
    offerResume(onClick) {
      files.replaceChildren();
      const b = document.createElement("button");
      b.className = "go";
      b.type = "button";
      b.textContent = "Attach my Job Finder resume";
      b.addEventListener("click", async () => {
        b.disabled = true;
        b.textContent = (await onClick()) ? "Resume attached ✓" : "Couldn't attach it";
      });
      files.appendChild(b);
    },
    ask(fields, onAnswer) {
      qs.replaceChildren();
      fields.forEach((f, i) => {
        const box = document.createElement("form");
        box.className = "q";
        const id = `jf-q-${i}`;
        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = f.label || "Question";
        const row = document.createElement("div");
        row.className = "row";
        let input;
        if (f.options && f.options.length) {
          input = document.createElement("select");
          input.append(new Option("Choose…", ""), ...f.options.map((o) => new Option(o, o)));
        } else {
          input = document.createElement("input");
          input.type = f.type === "number" ? "number" : "text";
        }
        input.id = id;
        const go = document.createElement("button");
        go.className = "go";
        go.type = "submit";
        go.textContent = "Fill";
        const err = document.createElement("p");
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

  const assist = createAssist({ doc: document, api, ui });
  let started = false;
  let lastUrl = "";

  async function check() {
    if (started || location.href === lastUrl) return;
    lastUrl = location.href;
    started = await assist.start(location.href);
  }

  document.documentElement.appendChild(host);
  window.addEventListener("pagehide", () => assist.leave());
  // LinkedIn changes the job on screen without reloading; look again when the address changes.
  setInterval(check, 1500);
  check();
})();
