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
      "Dashboard",
      "Jobs",
      "Job alerts",
      "Keywords and skills",
      "Profile and resume",
      "Target companies",
      "Job sources",
    ]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    // The tracker's name includes its review-count badge.
    expect(within(nav).getByRole("link", { name: /^Tracker/ })).toBeInTheDocument();
    // "/" opens the Dashboard (F5).
    expect(await screen.findByRole("heading", { name: "Dashboard", level: 2 })).toBeInTheDocument();

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

  it("signs a disabled user out with a clear message", async () => {
    renderApp("/");
    // The first request after sign-in (GET /auth/me) answers 403 account_disabled.
    await signIn(DISABLED_EMAIL);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This account has been disabled. Contact your admin.",
    );
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("streams a search into the job feed and the activity tray", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Activity, 1 running/ })).toBeInTheDocument(),
      );
      for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2100);

      expect(await screen.findByText(/Search finished: 6 new matching jobs/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Activity/ }));
      const tray = screen.getByRole("region", { name: "Activity" });
      expect(within(tray).getByText("Job search")).toBeInTheDocument();
      expect(within(tray).getByText("Search finished")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
