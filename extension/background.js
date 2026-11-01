/**
 * Job Finder capture — background service worker. The only part that talks to the Job Finder API.
 *
 * Holds the capture-only token (chrome.storage.local) and sends:
 *   connect {code, apiBase}   -> POST /extension/token     (pairing; the code comes from Settings in the app)
 *   me                        -> GET  /extension/me
 *   capture {site, page_url, jobs} -> POST /extension/captures
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

async function call(path, { method = "GET", body, token, apiBase } = {}) {
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
    default:
      return { ok: false, error: "Unknown request." };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only this extension's own pages and content scripts talk to it.
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg).then(reply);
  return true; // async reply
});
