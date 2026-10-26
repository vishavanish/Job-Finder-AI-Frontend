/**
 * QA2 §4: ATS targets search the places from Profile by default (one click for
 * any location), "Any time" asks for old postings too, one role posted in many
 * places is one row, and Homerun is no longer offered.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse, passthrough } from "msw";
import type { PreferencesOut } from "../../lib/api/types";
import { f3Db } from "../../mocks/f3State";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";

function watchSearches(): URLSearchParams[] {
  const seen: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/ats/search`, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return passthrough();
    }),
  );
  return seen;
}

describe("ATS targets (QA2 §4)", () => {
  it("searches the places from Profile plus Remote until 'Any location' is picked", async () => {
    f3Db.prefs.u_demo = { locations: ["Pune", "India"] } as PreferencesOut;
    const seen = watchSearches();
    renderApp("/ats-targets?q=data+engineer");
    const user = await signIn();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.at(-1)!.getAll("location")).toEqual(["Pune", "India", "Remote"]);
    expect(screen.getByText(/Your places from Profile/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Any location" }));
    await waitFor(() => expect(seen.at(-1)!.getAll("location")).toEqual([]));
  });

  it("'Any time' asks for postings of every age", async () => {
    const seen = watchSearches();
    renderApp("/ats-targets?q=data+engineer");
    const user = await signIn();
    const posted = await screen.findByLabelText("Posted");
    expect(posted).toHaveValue(""); // "Last 90 days", the server's default
    await user.selectOptions(posted, "any");
    await waitFor(() => expect(seen.at(-1)!.get("any_age")).toBe("true"));
    expect(seen.at(-1)!.get("posted_within_days")).toBeNull();
  });

  it("shows a role posted in other places once, with +N locations, and no Homerun filter", async () => {
    server.use(
      http.get(`${API}/ats/search`, () =>
        HttpResponse.json({
          groups: [
            {
              company_id: "c1",
              name: "Bjak",
              platform: "ashby",
              platform_name: "Ashby",
              careers_url: "https://jobs.ashbyhq.com/bjak",
              open_jobs: 40,
              matching_jobs: 3,
              top_jobs: [
                {
                  id: "j1",
                  title: "Machine Learning Engineer",
                  location: "Germany (Remote)",
                  remote: true,
                  department: "",
                  url: "https://jobs.ashbyhq.com/bjak/1",
                  posted_at: null,
                  first_seen_at: null,
                  applied: false,
                  more_locations: ["Ireland (Remote)", "China (Remote)"],
                },
              ],
              locations: ["Germany (Remote)"],
              newest_posted_at: null,
              last_refreshed_at: null,
            },
          ],
          total_companies: 1,
          total_jobs: 3,
          page: 1,
          page_size: 25,
          expansions: ["machine learning engineer"],
          expansion_pending: false,
          registry: { companies: 1, jobs: 40, last_refresh_at: null, by_platform: { ashby: 1 } },
          topup_task_id: null,
        }),
      ),
    );
    renderApp("/ats-targets?q=machine+learning+engineer");
    await signIn();
    const more = await screen.findByText(/\+2 locations/);
    expect(more).toHaveAttribute("title", "Ireland (Remote) · China (Remote)");
    expect(screen.queryByRole("checkbox", { name: "Homerun" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Ashby" })).toBeInTheDocument();
  });
});
