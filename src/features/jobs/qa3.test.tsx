/** QA3 §E: career-page jobs come with Job search — a "Company site" badge and an "only company career pages" filter. */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { StreamedJob } from "../../lib/api/types";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";
import { isCompanySite } from "../ats/platforms";

const job = (id: string, extra: Partial<StreamedJob> = {}): StreamedJob => ({
  id,
  source: "Indeed",
  title: `Job ${id}`,
  company: "Co",
  location: "Pune",
  url: `https://indeed.example/${id}`,
  description: "",
  posted: "",
  keyword_score: 50,
  llm_score: 85,
  llm_reason: "fit",
  auto_apply_capable: false,
  created_at: "2026-10-25T10:00:00Z",
  ...extra,
});

describe("company career-page jobs in Job search", () => {
  it("knows which sources are company career pages", () => {
    expect(isCompanySite("Greenhouse")).toBe(true);
    expect(isCompanySite("SmartRecruiters")).toBe(true);
    expect(isCompanySite("LinkedIn")).toBe(false);
  });

  it("badges them and can show only them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      server.use(
        http.get(`${API}/pipeline/:runId/jobs`, ({ request }) => {
          const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
          const jobs =
            offset === 0
              ? [
                  job("gh", { source: "Greenhouse", title: "Backend Engineer", company: "Acme" }),
                  job("li", { source: "LinkedIn", title: "Python Developer", company: "Hooli" }),
                ]
              : [];
          return HttpResponse.json({
            run_status: "running",
            jobs,
            next_offset: offset + jobs.length,
          });
        }),
      );
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));
      await vi.advanceTimersByTimeAsync(2100);
      const card = (await screen.findByRole("link", { name: "Backend Engineer" })).closest(
        "li.job-card",
      ) as HTMLElement;
      expect(within(card).getByText("Company site · Greenhouse")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Python Developer" })).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: "Only company career pages" }));
      expect(screen.getByRole("link", { name: "Backend Engineer" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Python Developer" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Browse by company" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
