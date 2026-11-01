/** A search keeps going until it finishes or the user presses Stop, whichever tab or page they move to. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";
import { ACTIVITY_POLL_MS } from "./useSearchActivity";
import { HIDDEN_POLL_MS } from "./usePipelineRun";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

const runRequests = () => {
  const urls: string[] = [];
  const log = ({ request }: { request: Request }) => {
    const m = new URL(request.url).pathname.match(/\/pipeline\/([^/]+)\/jobs$/);
    if (m?.[1]) urls.push(m[1]);
  };
  server.events.on("request:start", log);
  return urls;
};

afterEach(() => {
  server.events.removeAllListeners();
  setHidden(false);
  vi.useRealTimers();
});

describe("The Activity tray on other pages", () => {
  const leaveJobs = async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const polls = runRequests();
    renderApp("/jobs");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Run search" }));
    await waitFor(() => expect(polls.length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("link", { name: "Dashboard" })[0]!);
    await screen.findByRole("heading", { name: "Dashboard" });
    return user;
  };
  const trayText = async (user: Awaited<ReturnType<typeof signIn>>) => {
    await user.click(screen.getByRole("button", { name: /^Activity/ }));
    return within(await screen.findByRole("region", { name: "Activity" }));
  };

  it("says a search finished while the user is on another page", async () => {
    const user = await leaveJobs();
    server.use(
      http.get(`${API}/pipeline/:runId`, () =>
        HttpResponse.json({
          user_id: "u_demo",
          status: "completed",
          total_keywords: 3,
          keywords_completed: 3,
          error: "",
          created_at: "2026-11-01T08:15:00Z",
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_MS + 100);
    expect((await trayText(user)).getByText("Search finished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Activity/ })).not.toHaveAccessibleName(/running/);
  });

  it("shows progress, and an expired search stops being checked", async () => {
    const user = await leaveJobs();
    let checks = 0;
    const answer = (keywords_completed: number) =>
      server.use(
        http.get(`${API}/pipeline/:runId`, () => {
          checks += 1;
          return HttpResponse.json({
            user_id: "u_demo",
            status: "running",
            total_keywords: 7,
            keywords_completed,
            error: "",
            created_at: "2026-11-01T08:15:00Z",
          });
        }),
      );
    answer(2);
    await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_MS + 100);
    expect((await trayText(user)).getByText(/2\/7 searches done/)).toBeInTheDocument();

    server.use(
      http.get(`${API}/pipeline/:runId`, () => {
        checks += 1;
        return HttpResponse.json({ detail: "no run found with this id" }, { status: 404 });
      }),
    );
    await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_MS + 100);
    expect(await screen.findByText("These results have expired")).toBeInTheDocument();
    const after = checks;
    await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_MS * 3);
    expect(checks).toBe(after);
  });
});

describe("A running search and other tabs", () => {
  it("keeps following the search while the browser tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp("/jobs");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Run search" }));
    setHidden(true);
    for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(HIDDEN_POLL_MS + 100);
    expect(await screen.findByText(/Search finished/)).toBeInTheDocument();
  });

  it("catches up at once when the tab is visible again, and never starts a second poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const polls = runRequests();
    renderApp("/jobs");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Run search" }));
    await waitFor(() => expect(polls.length).toBeGreaterThan(0));
    setHidden(true);
    await vi.advanceTimersByTimeAsync(100);
    const before = polls.length;
    setHidden(false);
    await waitFor(() => expect(polls.length).toBe(before + 1)); // no waiting for the slow timer
    setHidden(true);
    setHidden(false);
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(polls.length).toBeLessThanOrEqual(before + 2);
  });

  it("shows the running search, not a cached older one, after visiting another page", async () => {
    const old = {
      run_id: "run_old",
      status: "completed",
      created_at: "2026-11-01T08:00:00Z",
      keywords: [],
      skipped_sources: [],
    };
    let latest: typeof old = old;
    server.use(
      http.get(`${API}/pipeline/runs/latest`, () => HttpResponse.json(latest)),
      http.get(`${API}/pipeline/run_old`, () =>
        HttpResponse.json({
          ...old,
          user_id: "u_demo",
          total_keywords: 1,
          keywords_completed: 1,
          error: "",
        }),
      ),
      http.get(`${API}/pipeline/run_old/jobs`, () =>
        HttpResponse.json({ run_status: "completed", jobs: [], next_offset: 0 }),
      ),
    );
    const polls = runRequests();
    renderApp("/jobs");
    const user = await signIn();
    await waitFor(() => expect(polls).toContain("run_old"));
    await user.click(await screen.findByRole("button", { name: "Run search" }));
    await waitFor(() => expect(polls.some((id) => id !== "run_old")).toBe(true));
    const running = polls.find((id) => id !== "run_old")!;
    latest = { ...old, run_id: running, status: "running" };

    await user.click(screen.getAllByRole("link", { name: "Dashboard" })[0]!);
    await screen.findByRole("heading", { name: "Dashboard" });
    polls.length = 0;
    await user.click(screen.getAllByRole("link", { name: "Jobs" })[0]!);
    await waitFor(() => expect(polls).toContain(running));
    expect(polls).not.toContain("run_old");
  });
});
