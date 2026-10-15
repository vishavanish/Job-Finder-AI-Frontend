import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { DISABLED_EMAIL, mockDb } from "../mocks/data";
import { renderApp, signIn } from "../test/renderApp";

describe("app shell", () => {
  it("sends a signed-out visitor to sign in", async () => {
    renderApp("/applications");
    expect(await screen.findByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("restores the session from the refresh cookie without storing a token", async () => {
    mockDb.tokens.set("restored", "u_demo");
    server.use(
      http.post("*/api/v1/auth/refresh", () =>
        HttpResponse.json({
          access_token: "restored",
          token_type: "bearer",
          user: mockDb.users.find((u) => u.id === "u_demo"),
        }),
      ),
    );
    renderApp("/");
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getAllByText("Dev Demo").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("job_finder_access_token")).toBeNull();
  });

  it("signs in and shows sidebar, top bar and an empty activity tray", async () => {
    renderApp("/");
    const user = await signIn();

    const nav = await screen.findByRole("navigation", { name: "Main" });
    for (const name of [
      "Run and results",
      "Applications",
      "Keywords",
      "Skills and resume",
      "ATS targets",
      "Job sources",
    ]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Run & Results" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activity" }));
    const tray = screen.getByRole("region", { name: "Activity" });
    expect(within(tray).getByText(/Nothing running/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
  });

  it("cycles the theme and applies it to <html>", async () => {
    renderApp("/");
    const user = await signIn();
    const button = await screen.findByRole("button", { name: /^Theme: System/ });
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: /^Theme: Light/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("jf_theme")).toBe("dark");
  });

  it("keeps the existing Applications screen working, with status badges", async () => {
    renderApp("/applications");
    const user = await signIn();
    await user.click(await screen.findByRole("link", { name: "Applications" }));
    expect(await screen.findByText("Prefilled, awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Couldn't open")).toBeInTheDocument();
    expect(screen.getByText("History (6)")).toBeInTheDocument();
  });

  it("signs a disabled user out with a clear message", async () => {
    renderApp("/");
    // The first request after sign-in (GET /auth/me) answers 403 account_disabled.
    await signIn(DISABLED_EMAIL);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This account has been disabled. Contact your admin.",
    );
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("streams a search into the results table and the activity tray", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: /Run Job Search/ }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Activity, 1 running/ })).toBeInTheDocument(),
      );
      for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(2100);

      expect(await screen.findByText("Matching Jobs (6)")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Activity/ }));
      const tray = screen.getByRole("region", { name: "Activity" });
      expect(within(tray).getByText("Job search")).toBeInTheDocument();
      expect(within(tray).getByText("6 matching job(s)")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
