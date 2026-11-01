/**
 * Job Finder — popup: connect with a pairing code, see what was saved, auto-save per site, and
 * "Fill this form" on the page the user is looking at (backend plan P8b E3b).
 */

const SITE_NAMES = {
  naukri: "Naukri",
  foundit: "Foundit",
  glassdoor: "Glassdoor",
  linkedin: "LinkedIn",
  indeed: "Indeed",
};

const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

function show(connected) {
  $("connect").hidden = connected;
  $("connected").hidden = !connected;
}

function renderAuto(autoSave) {
  const box = $("auto");
  box.replaceChildren();
  for (const [key, name] of Object.entries(SITE_NAMES)) {
    const row = document.createElement("label");
    row.className = "toggle";
    const text = document.createElement("span");
    text.textContent = name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(autoSave[key]);
    input.addEventListener("change", () =>
      send({ type: "setAutoSave", site: key, on: input.checked }),
    );
    row.append(text, input);
    box.append(row);
  }
}

async function load() {
  const status = await send({ type: "status" });
  const data = (status && status.data) || {};
  show(Boolean(data.connected));
  if (!data.connected) return;
  $("email").textContent = data.email;
  renderAuto(data.autoSave || {});
  const me = await send({ type: "me" });
  if (me && me.ok) {
    $("today").textContent = me.data.saved_today;
    $("total").textContent = me.data.saved_total;
    $("me-error").textContent = "";
  } else if (me && me.status === 401) {
    show(false);
    $("connect-error").textContent = "This connection was removed. Connect again with a new code.";
  } else {
    $("me-error").textContent = (me && me.error) || "";
  }
}

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("connect-error").textContent = "";
  const code = $("code").value.trim();
  if (!/^\d{6}$/.test(code)) {
    $("connect-error").textContent = "The code is 6 digits.";
    return;
  }
  const name = `${navigator.userAgent.includes("Edg/") ? "Edge" : "Chrome"} extension`;
  const r = await send({ type: "connect", code, target: $("target").value, name });
  if (r && r.ok) {
    $("code").value = "";
    load();
  } else {
    $("connect-error").textContent = (r && r.error) || "Couldn't connect.";
  }
});

$("disconnect").addEventListener("click", async () => {
  await send({ type: "disconnect" });
  show(false);
  $("connect-error").textContent =
    "Disconnected here. To remove it from your account too, use Settings → Browser extension.";
});

load();

$("fill").addEventListener("click", async () => {
  $("fill-error").textContent = "";
  const r = await send({ type: "fillActiveTab" });
  if (r && r.ok) window.close();
  else $("fill-error").textContent = (r && r.error) || "Couldn't fill this page.";
});
