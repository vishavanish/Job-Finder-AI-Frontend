/**
 * Job Finder capture — runs on supported job-search pages.
 *
 * Shows one small button, "Save N jobs to Job Finder", for the jobs already on the page. A click sends
 * them to the background worker. With "Save automatically" on for this site (off by default), it saves
 * once per page view, never more often. It never clicks, scrolls, opens tabs or touches captchas.
 */
(async () => {
  const { readJobs, siteFor } = await import(chrome.runtime.getURL("src/reader.js"));
  const site = siteFor(location.href);
  if (!site) return;

  const host = document.createElement("div");
  host.setAttribute("data-job-finder-capture", "");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .jf { font: 600 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
            display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:999px; border:0;
            background:#6a3d98; color:#fff; box-shadow:0 6px 20px rgba(27,26,24,.25); cursor:pointer; }
      .jf:hover { background:#57307e; }
      .jf:focus-visible { outline:3px solid #c9a8f0; outline-offset:2px; }
      .jf[disabled] { opacity:.75; cursor:default; }
      .dot { width:18px; height:18px; border-radius:5px; background:#fff; color:#6a3d98;
             display:inline-grid; place-items:center; font-size:12px; font-weight:800; }
      .close { margin-left:4px; background:transparent; border:0; color:#fff; opacity:.8; cursor:pointer;
               font-size:16px; line-height:16px; padding:0 2px; }
    </style>
    <button class="jf" type="button" aria-live="polite"><span class="dot" aria-hidden="true">J</span>
      <span class="label">Job Finder</span><span class="close" role="button" tabindex="0" aria-label="Hide">×</span></button>`;
  const button = root.querySelector(".jf");
  const label = root.querySelector(".label");
  const close = root.querySelector(".close");
  let hidden = false;
  let jobs = [];
  let savedKey = "";
  let busy = false;

  const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  function render(text) {
    label.textContent =
      text ||
      (jobs.length ? `Save ${jobs.length} job${jobs.length === 1 ? "" : "s"} to Job Finder` : "");
    host.style.display = !hidden && (jobs.length || text) ? "block" : "none";
  }

  async function save(auto) {
    if (busy || !jobs.length) return;
    busy = true;
    button.disabled = true;
    render("Saving…");
    const r = await send({ type: "capture", site, page_url: location.href, jobs });
    busy = false;
    button.disabled = false;
    if (r && r.ok) {
      savedKey = `${location.href}#${jobs.length}`;
      const { saved, updated } = r.data;
      render(
        saved ? `Saved ${saved} new${updated ? ` · ${updated} updated` : ""} ✓` : `Already saved ✓`,
      );
      setTimeout(() => render(), auto ? 2500 : 4000);
    } else {
      render(r ? r.error : "Couldn't save.");
      setTimeout(() => render(), 5000);
    }
  }

  async function refresh() {
    jobs = readJobs(document, location.href).jobs;
    if (!busy) render();
    const status = await send({ type: "status" });
    const auto = status && status.ok && status.data.connected && status.data.autoSave[site];
    if (auto && jobs.length && savedKey !== `${location.href}#${jobs.length}`) save(true);
  }

  button.addEventListener("click", (e) => {
    if (e.target === close) return;
    save(false);
  });
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    hidden = true;
    render();
  });
  close.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") close.click();
  });
  document.documentElement.appendChild(host);

  // Job lists load and change without page reloads; re-read after things settle.
  let timer = 0;
  new MutationObserver((records) => {
    if (records.every((r) => host.contains(r.target))) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 1200);
  }).observe(document.body, { childList: true, subtree: true });
  refresh();
})();
