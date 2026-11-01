/**
 * Job Finder — injected into the active tab when the user clicks "Fill this form" or presses Alt+Shift+F
 * (backend plan P8b E3b; the activeTab permission allows only that tab, only then). Fills the form there
 * with src/page_fill.js; on a LinkedIn job with a running Fast apply it nudges that instead.
 */
(async () => {
  if (window.__jobFinderAssist && window.__jobFinderAssist.run) {
    window.__jobFinderAssist.fillNow();
    return;
  }
  if (window.__jobFinderPageFill) {
    window.__jobFinderPageFill.again();
    return;
  }
  const { createPageFill } = await import(chrome.runtime.getURL("src/page_fill.js"));
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
  const fill = createPageFill({ doc: document, api, ui: createPanel(document) });
  window.__jobFinderPageFill = fill;
  await fill.start(location.href);
})();
