/**
 * Job Finder capture — background service worker. The only part that talks to the Job Finder API.
 *
 * Holds the capture-only token (chrome.storage.local) and sends:
 *   connect {code, apiBase}   -> POST /extension/token     (pairing; the code comes from Settings in the app)
 *   me                        -> GET  /extension/me
 *   capture {site, page_url, jobs} -> POST /extension/captures
 *   assist* (Fast apply, backend plan P8b) -> /extension/runs/... (for-page, fill, answer, resume, result);
 *           with no run_id ("Fill this form" on a page Job Finder has no run for) -> /extension/page/...
 *   fillActiveTab / the Alt+Shift+F command -> injects fill_page.js into the active tab (activeTab: only on
 *           the user's click or key press, only that tab)
 * It never reads cookies or other tabs, and never fetches the job sites itself.
 */

export const API_BASES = {
  production: "https://jobfinderai.duckdns.org/api/v1",
  local: "http://localhost:8000/api/v1",
};

async function settings() {
  const s = await chrome.storage.local.get(["token", "apiBase", "email", "autoSave"]);
  return { apiBase: API_BASES.production, autoSave: {}, ...s };
}

async function call(path, { method = "GET", body, token, apiBase, binary = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let resp;
  try {
    resp = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: "Can't reach Job Finder — check your connection." };
  }
  if (binary && resp.ok) return { ok: true, status: resp.status, data: await fileData(resp) };
  let data = null;
  try {
    data = await resp.json();
  } catch {
    /* empty body */
  }
  if (!resp.ok) {
    const detail = data && data.detail;
    const message =
      (detail && (detail.message || (typeof detail === "string" ? detail : ""))) ||
      `Job Finder answered ${resp.status}.`;
    if (resp.status === 401) await chrome.storage.local.remove(["token", "email"]);
    return { ok: false, status: resp.status, error: message };
  }
  return { ok: true, status: resp.status, data };
}

/** A file response as JSON-safe data for the content script: base64 bytes, name, type. */
async function fileData(resp) {
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const disposition = resp.headers.get("Content-Disposition") || "";
  const m =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition);
  return {
    base64: btoa(bin),
    name: m ? decodeURIComponent(m[1]) : "Resume.pdf",
    type: resp.headers.get("Content-Type") || "application/octet-stream",
  };
}

const NOT_CONNECTED = {
  ok: false,
  status: 401,
  error: "Connect the Job Finder extension first (click its icon).",
};
const runPath = (msg, rest) =>
  `/extension/runs/${encodeURIComponent(String(msg.run_id || ""))}/${rest}`;

async function handle(msg) {
  const s = await settings();
  switch (msg && msg.type) {
    case "status":
      return {
        ok: true,
        data: {
          connected: Boolean(s.token),
          email: s.email || "",
          apiBase: s.apiBase,
          autoSave: s.autoSave,
        },
      };
    case "connect": {
      const apiBase = API_BASES[msg.target] || API_BASES.production;
      const r = await call("/extension/token", {
        method: "POST",
        apiBase,
        body: { code: String(msg.code || "").trim(), name: msg.name || "Browser extension" },
      });
      if (r.ok)
        await chrome.storage.local.set({ token: r.data.token, email: r.data.email, apiBase });
      return r.ok ? { ok: true, data: { email: r.data.email } } : r;
    }
    case "disconnect":
      await chrome.storage.local.remove(["token", "email"]);
      return { ok: true };
    case "me":
      if (!s.token) return { ok: false, status: 401, error: "Not connected." };
      return call("/extension/me", { token: s.token, apiBase: s.apiBase });
    case "setAutoSave": {
      const autoSave = { ...s.autoSave, [msg.site]: Boolean(msg.on) };
      await chrome.storage.local.set({ autoSave });
      return { ok: true, data: { autoSave } };
    }
    case "capture":
      if (!s.token)
        return { ok: false, status: 401, error: "Connect the extension first (click its icon)." };
      return call("/extension/captures", {
        method: "POST",
        token: s.token,
        apiBase: s.apiBase,
        body: { site: msg.site, page_url: msg.page_url, jobs: (msg.jobs || []).slice(0, 100) },
      });
    case "assistForPage":
      if (!s.token) return { ok: true, data: { run_id: null } }; // not connected: nothing to fill
      return call(`/extension/runs/for-page?url=${encodeURIComponent(String(msg.url || ""))}`, {
        token: s.token,
        apiBase: s.apiBase,
      });
    case "assistFill":
      if (!s.token) return NOT_CONNECTED;
      return call(msg.run_id ? runPath(msg, "fill") : "/extension/page/fill", {
        method: "POST",
        token: s.token,
        apiBase: s.apiBase,
        body: { fields: (msg.fields || []).slice(0, 60) },
      });
    case "assistAnswer":
      if (!s.token) return NOT_CONNECTED;
      return call(msg.run_id ? runPath(msg, "answer") : "/extension/page/answer", {
        method: "POST",
        token: s.token,
        apiBase: s.apiBase,
        body: msg.run_id
          ? { key: String(msg.key || ""), value: String(msg.value || "") }
          : {
              label: String(msg.label || ""),
              value: String(msg.value || ""),
              options: (msg.options || []).slice(0, 200).map(String),
            },
      });
    case "assistResume":
      if (!s.token) return NOT_CONNECTED;
      return call(msg.run_id ? runPath(msg, "resume") : "/extension/page/resume", {
        token: s.token,
        apiBase: s.apiBase,
        binary: true,
      });
    case "fillActiveTab":
      return fillActiveTab();
    case "assistResult":
      if (!s.token) return NOT_CONNECTED;
      return call(runPath(msg, "result"), {
        method: "POST",
        token: s.token,
        apiBase: s.apiBase,
        body: { outcome: msg.outcome === "submitted" ? "submitted" : "closed" },
      });
    default:
      return { ok: false, error: "Unknown request." };
  }
}

/** "Fill this form": runs fill_page.js in the tab the user is looking at (activeTab grants it on the click). */
async function fillActiveTab() {
  const s = await settings();
  if (!s.token) return NOT_CONNECTED;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "https:"))
    return { ok: false, error: "Open the application form's page first." };
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill_page.js"] });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This page can't be filled (browser pages and the web store are off limits).",
    };
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "fill-form") fillActiveTab();
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only this extension's own pages and content scripts talk to it.
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg).then(reply);
  return true; // async reply
});
