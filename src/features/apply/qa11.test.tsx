/** QA11 A: "Sign in to continue" — the live view of the run's browser, then the run carries on. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { f4Db } from "../../mocks/f4State";
import { renderApp, signIn } from "../../test/renderApp";
import { keyFor } from "./liveKeys";

function loginRun(available = true) {
  const now = new Date();
  f4Db.runs.set("run_login", {
    id: "run_login",
    user_id: "u_demo",
    polls: 0,
    job_id: "job_acme",
    title: "Backend Engineer",
    company: "Acme",
    mode: "auto",
    runner: "worker",
    level: 2,
    adapter: "generic",
    apply_url: "https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1",
    state: "awaiting_login",
    message:
      "acme.wd3.myworkdayjobs.com asks you to sign in. Open this run and do it on the live view.",
    fields: [],
    files: {},
    resume_id: null,
    pack_id: null,
    application_id: null,
    proofs: 0,
    steps: [],
    vision: null,
    takeover: {
      kind: "login",
      site: "acme.wd3.myworkdayjobs.com",
      reason: "The application page asks you to sign in.",
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 2 * 3600_000).toISOString(),
      available,
      sessions_left_today: 9,
    },
    approved_at: null,
    submitted_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:frame"), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Sign in to continue", () => {
  it("opens the live view, sends typing, and carries on once signed in", async () => {
    loginRun();
    renderApp("/apply/runs/run_login");
    const user = await signIn();
    expect(
      await screen.findByText(/acme\.wd3\.myworkdayjobs\.com wants you to sign in/),
    ).toBeInTheDocument();
    expect(screen.getByText(/9 live sign-ins left today/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in to continue" }));
    const screenButton = await screen.findByRole("button", {
      name: /Live view of acme\.wd3\.myworkdayjobs\.com/,
    });
    await waitFor(() => expect(screenButton).toBeEnabled());
    expect(screen.getByRole("button", { name: "I'm signed in — continue" })).toBeInTheDocument();

    screenButton.focus();
    await user.keyboard("{Enter}");
    const ready = await screen.findByText(/Looks like you're in/);
    expect(ready).toHaveTextContent(/Carrying on in \d s/);
    await user.click(within(ready.closest("div")!).getByRole("button", { name: "Continue now" }));
    expect(await screen.findByText(/Signed in — every question answered/)).toBeInTheDocument();
    expect(f4Db.runs.get("run_login")!.state).toBe("awaiting_review");
  }, 20000);

  it("can be handed back to the user, and says when it's switched off", async () => {
    loginRun(false);
    renderApp("/apply/runs/run_login");
    const user = await signIn();
    expect(await screen.findByText(/Signing in here is switched off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in to continue" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I'll finish it on the job page" }));
    expect(await screen.findByText(/You chose to finish this application/)).toBeInTheDocument();
    expect(f4Db.runs.get("run_login")!.state).toBe("needs_user");
  }, 20000);

  it("shows in the Needs-you list with its own next step", async () => {
    loginRun();
    renderApp("/apply");
    await signIn();
    expect(
      await screen.findByText("Sign in on the live view so it can carry on"),
    ).toBeInTheDocument();
  }, 20000);
});

describe("keyFor", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  it("maps keys for the live browser", () => {
    expect(keyFor({ ...base, key: "a" })).toEqual({ type: "text", text: "a" });
    expect(keyFor({ ...base, key: "Enter" })).toEqual({ type: "key", key: "Enter" });
    expect(keyFor({ ...base, key: "Tab", shiftKey: true })).toEqual({
      type: "key",
      key: "Shift+Tab",
    });
    expect(keyFor({ ...base, key: "V", ctrlKey: true })).toEqual({ type: "key", key: "Control+v" });
    expect(keyFor({ ...base, key: "Shift" })).toBeNull();
    expect(keyFor({ ...base, key: "é", altKey: true })).toBeNull();
  });
});
