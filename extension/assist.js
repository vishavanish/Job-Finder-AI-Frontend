/**
 * Job Finder — Fast apply panel on LinkedIn job pages (backend plan P8b E3a).
 *
 * Does nothing unless the user clicked Fast apply for this job in Job Finder. Then a small panel at the
 * bottom left says what it is doing, asks the questions Job Finder can't answer, and offers the resume.
 * The filling itself is src/linkedin_apply.js; every API call goes through the background worker.
 */
(async () => {
  const { createAssist } = await import(chrome.runtime.getURL("src/linkedin_apply.js"));
  const { createPanel } = await import(chrome.runtime.getURL("src/panel.js"));
  const send = (msg) =>
    new Promise((resolve) =>
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: "No answer." })),
    );

  const api = {
    forPage: (url) => send({ type: "assistForPage", url }),
    fill: (run_id, fields) => send({ type: "assistFill", run_id, fields }),
    answer: (run_id, field, value) =>
      send({
        type: "assistAnswer",
        run_id,
        key: field.key,
        label: field.label,
        options: field.options,
        value,
      }),
    resume: (run_id) => send({ type: "assistResume", run_id }),
    result: (run_id, outcome) => send({ type: "assistResult", run_id, outcome }),
  };

  const ui = createPanel(document);
  const assist = createAssist({ doc: document, api, ui });
  window.__jobFinderAssist = assist; // "Fill this form" on this page uses the running Fast apply
  let started = false;
  let lastUrl = "";

  async function check() {
    if (started || location.href === lastUrl) return;
    lastUrl = location.href;
    started = await assist.start(location.href);
  }

  window.addEventListener("pagehide", () => assist.leave());
  // LinkedIn changes the job on screen without reloading; look again when the address changes.
  setInterval(check, 1500);
  check();
})();
