/**
 * F3 screens against the MSW mocks: Jobs (live feed, breakdown, freshness,
 * upsert by id, save / apply manually / apply-option reasons, cancel), Profile &
 * Resume, Keywords & Skills (incl. the one-time import of old browser
 * settings), Alerts and the grouped Job sources page.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { aiDb } from "../mocks/aiState";
import { f3Db } from "../mocks/f3State";
import { mockDb } from "../mocks/data";
import { renderApp, signIn } from "../test/renderApp";

async function runSearch() {
  const user = await signIn();
  await user.click(await screen.findByRole("button", { name: "Run search" }));
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2100);
  await screen.findByText(/Search finished/);
  return user;
}

function card(title: string) {
  return screen.getByRole("link", { name: title }).closest("li")!;
}

describe("Jobs", () => {
  it("streams scored jobs once each, with ring, reason, breakdown and freshness", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      await runSearch();
      expect(screen.getByText(/Search finished: 6 new matching jobs/)).toBeInTheDocument();
      // 6 jobs plus one "replaces" entry for the first job -> still 6 cards.
      expect(screen.getAllByRole("img", { name: /Fit score/ })).toHaveLength(6);
      const first = card("Senior Python Engineer");
      expect(
        within(first).getByRole("img", { name: "Fit score 91 out of 100" }),
      ).toBeInTheDocument();
      expect(within(first).getByText(/Strong FastAPI and AWS overlap/)).toBeInTheDocument();
      expect(within(first).getByText("2 of 3")).toBeInTheDocument();
      expect(within(first).getByText("A step up for you")).toBeInTheDocument();
      expect(within(first).getByText("Asks for: Go")).toBeInTheDocument();
      expect(within(first).getByText("Early")).toBeInTheDocument();
      expect(within(first).getByText("Posted 2 h ago", { exact: false })).toBeInTheDocument();
      expect(within(first).getByText("Over 200")).toBeInTheDocument(); // from the replacement entry
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters and sorts the feed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      await user.selectOptions(screen.getByLabelText("Min score"), "80");
      expect(screen.getAllByRole("img", { name: /Fit score/ })).toHaveLength(3);
      await user.selectOptions(screen.getByLabelText("Source"), "LinkedIn");
      expect(screen.getAllByRole("img", { name: /Fit score/ })).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves a job and marks one applied after Apply manually", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      await user.click(
        within(card("AI Engineer (LLM apps)")).getByRole("button", { name: "Save" }),
      );
      await waitFor(() =>
        expect(within(card("AI Engineer (LLM apps)")).getByText("Saved")).toBeInTheDocument(),
      );

      const kestrel = card("Backend Developer, Platform");
      await user.click(within(kestrel).getByRole("button", { name: "Apply manually" }));
      const dialog = await screen.findByRole("dialog", { name: /Apply — Backend Developer/ });
      await user.click(within(dialog).getByRole("link", { name: "Open job page" }));
      await user.click(within(dialog).getByRole("button", { name: "Yes, I applied" }));
      await waitFor(() => expect(within(kestrel).getByText("Applied")).toBeInTheDocument());
      expect(mockDb.applications[0]).toMatchObject({
        company: "Kestrel Pay",
        status: "submitted",
        status_source: "manual",
      });

      await user.click(screen.getByRole("tab", { name: "Saved" }));
      expect(
        await screen.findByRole("link", { name: "AI Engineer (LLM apps)" }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("tab", { name: "Applied" }));
      expect(
        await screen.findByRole("link", { name: "Backend Developer, Platform" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains, from the backend's apply options, why a button is off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      await runSearch();
      const site = card("Software Engineer II, Data"); // applies on an unknown company site
      expect(within(site).getByRole("button", { name: "Apply manually" })).toBeEnabled();
      expect(within(site).getByRole("button", { name: "Auto apply" })).toBeDisabled();
      expect(
        within(site).getByText(/Auto apply works on Greenhouse and Lever job pages only/),
      ).toBeInTheDocument();
      const linkedin = card("Senior Python Engineer"); // LinkedIn Easy Apply
      expect(within(linkedin).getByRole("button", { name: "Fast apply" })).toBeEnabled();
      expect(within(linkedin).getByRole("button", { name: "Auto apply" })).toBeDisabled();
      expect(within(linkedin).getByText(/never submitted automatically/)).toBeInTheDocument();
      expect(
        within(card("AI Engineer (LLM apps)")).getByRole("button", { name: "Auto apply" }),
      ).toBeEnabled(); // Greenhouse
    } finally {
      vi.useRealTimers();
    }
  });

  it("Stop search cancels the run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));
      await user.click(await screen.findByRole("button", { name: "Stop search" }));
      for (let i = 0; i < 2; i += 1) await vi.advanceTimersByTimeAsync(2100);
      expect(await screen.findByText(/Search stopped/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Run search" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for a search profile when there is none", async () => {
    f3Db.searchProfiles.u_demo = [];
    renderApp("/jobs");
    await signIn();
    expect(
      await screen.findByRole("link", { name: "Create one in Keywords and skills" }),
    ).toBeInTheDocument();
  });
});

describe("Profile and resume", () => {
  it("uploads a resume, reads it and saves the reviewed profile", async () => {
    f3Db.resumes.u_demo = [];
    renderApp("/profile");
    const user = await signIn();
    expect(await screen.findByText(/No resume yet/)).toBeInTheDocument();
    const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Resume file"), file);
    expect(await screen.findByText(/^Uploaded .+. Reading it with AI/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Review" }, { timeout: 6000 }));
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Dev D.");
    await user.click(screen.getByRole("button", { name: "Save reviewed profile" }));
    expect(await screen.findByText("Saved your reviewed profile.")).toBeInTheDocument();
    expect(f3Db.resumes.u_demo![0]).toMatchObject({ parse_status: "reviewed" });
    expect(f3Db.resumes.u_demo![0]!.parsed?.name).toBe("Dev D.");
  }, 15000);

  it("rejects a file that isn't PDF or Word before uploading", async () => {
    renderApp("/profile");
    await signIn();
    await screen.findByText(/v1 · Main/);
    // fireEvent: user.upload would drop the file because of the input's accept list.
    fireEvent.change(screen.getByLabelText("Resume file"), {
      target: { files: [new File(["x"], "cv.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Choose a PDF or Word (.docx) file.")).toBeInTheDocument();
  });

  it("saves preferences, applicant info and EEO answers without one overwriting another", async () => {
    renderApp("/profile");
    const user = await signIn();
    const remote = await screen.findByRole("checkbox", { name: "Remote" });
    await user.click(remote);
    const prefsCard = screen
      .getByRole("heading", { name: "What you're looking for" })
      .closest("section")!;
    await user.click(within(prefsCard).getByRole("button", { name: "Save changes" }));
    await within(prefsCard).findByText("Saved");
    expect(f3Db.prefs.u_demo?.work_modes).toEqual(["remote"]);

    const applicant = screen.getByRole("heading", { name: "Applicant info" }).closest("section")!;
    await user.type(within(applicant).getByLabelText("First name"), "Dev");
    await user.selectOptions(within(applicant).getByLabelText("Willing to relocate"), "depends");
    await user.click(within(applicant).getByRole("button", { name: "Save changes" }));
    await within(applicant).findByText("Saved");

    const eeo = screen
      .getByRole("heading", { name: "Optional diversity answers" })
      .closest("section")!;
    expect(within(eeo).getByLabelText("Gender")).toHaveValue("prefer_not_to_say");
    await user.selectOptions(within(eeo).getByLabelText("Gender"), "woman");
    await user.click(within(eeo).getByRole("button", { name: "Save changes" }));
    await within(eeo).findByText("Saved");
    expect(f3Db.eeo.u_demo?.gender).toBe("woman");
    // The EEO save built on the applicant info saved a moment earlier.
    expect(f3Db.profiles.u_demo?.applicant_info).toMatchObject({
      first_name: "Dev",
      willing_to_relocate: "depends",
    });
  });
});

describe("Keywords and skills", () => {
  it("edits a profile, previews the search and adds suggested titles", async () => {
    renderApp("/search-profile");
    const user = await signIn();
    expect(await screen.findByDisplayValue("Backend and AI")).toBeInTheDocument();
    const preview = screen.getByRole("complementary", { name: "Search preview" });
    expect(within(preview).getByText("Senior Python Engineer · AI Engineer")).toBeInTheDocument();
    expect(within(preview).getByText(/Python, py, FastAPI, Kubernetes, k8s/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Suggest titles from my skills" }));
    await user.click(await screen.findByRole("button", { name: "+ Platform Engineer" }));
    await user.type(screen.getByLabelText("New skill"), "Postgres{Enter}");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Saved");
    const saved = f3Db.searchProfiles.u_demo![0]!;
    expect(saved.titles).toContain("Platform Engineer");
    expect(saved.skills?.map((s) => s.name)).toContain("Postgres");
  });

  it("old /keywords and /skills links open the combined editor", async () => {
    renderApp("/skills");
    await signIn();
    expect(await screen.findByRole("heading", { name: "Keywords and skills" })).toBeInTheDocument();
  });

  it("imports the old browser settings once, then deletes them", async () => {
    window.localStorage.setItem(
      "job_finder_settings_v1",
      JSON.stringify({
        keywords: ["Data Engineer"],
        skills: ["spark", "python"],
        locations: ["Hyderabad"],
        applicant: { first_name: "Old", last_name: "Settings", email: "", phone: "99" },
        atsTargets: [{ platform: "lever", slug: "acme" }],
      }),
    );
    renderApp("/search-profile");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Import my old settings" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Import my old settings" }),
      ).not.toBeInTheDocument(),
    );
    const imported = f3Db.searchProfiles.u_demo!.find((p) => p.name === "Imported search")!;
    expect(imported.titles).toEqual(["Data Engineer"]);
    expect(imported.skills?.map((s) => s.name)).toEqual(["spark", "python"]);
    expect(f3Db.profiles.u_demo?.applicant_info).toMatchObject({ first_name: "Old", phone: "99" });
    expect(f3Db.prefs.u_demo?.locations).toEqual(["Hyderabad"]);
    expect(window.localStorage.getItem("job_finder_settings_v1")).toBeNull();
    // ATS targets were moved to their own key, not lost.
    expect(JSON.parse(window.localStorage.getItem("job_finder_ats_targets_v1")!)).toEqual([
      { platform: "lever", slug: "acme" },
    ]);
  });
});

describe("Job alerts", () => {
  it("creates an alert, runs it now and shows the new jobs", async () => {
    renderApp("/alerts");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "New alert" }));
    await user.click(screen.getByRole("button", { name: "Create alert" }));
    expect(await screen.findByText("Daily matches")).toBeInTheDocument();
    expect(screen.getByText(/Next run/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(await screen.findByText(/Started\. New matches appear below/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Show jobs" }));
    expect(await screen.findByRole("link", { name: "Senior Python Engineer" })).toBeInTheDocument();
  });

  it("stops at the alert limit", async () => {
    renderApp("/alerts");
    const user = await signIn();
    for (let i = 0; i < 3; i += 1) {
      await user.click(await screen.findByRole("button", { name: "New alert" }));
      await user.click(screen.getByRole("button", { name: "Create alert" }));
      await screen.findByText(`${i + 1} of 3`);
    }
    expect(screen.getByRole("button", { name: "New alert" })).toBeDisabled();
    expect(screen.getByText(/You've reached 3 alerts/)).toBeInTheDocument();
  });
});

describe("Job sources (F3 additions)", () => {
  it("groups sources, marks off-by-default ones and takes several keys for Google Jobs", async () => {
    renderApp("/providers");
    const user = await signIn();
    for (const title of ["Job boards", "Job APIs with a free key", "Remote job feeds", "Naukri"]) {
      expect(await screen.findByRole("heading", { name: title, level: 4 })).toBeInTheDocument();
    }
    const google = screen
      .getByText("Google Jobs (your key)", { selector: ".source-name" })
      .closest("li")!;
    expect(within(google).getByText("Off unless you turn it on.")).toBeInTheDocument();
    await user.click(within(google).getByRole("checkbox"));
    expect(
      await within(google).findByLabelText("Your Bright Data key (API_KEY:ZONE)"),
    ).toBeInTheDocument();
    expect(within(google).getByLabelText("Your SerpApi key")).toBeInTheDocument();
    expect(within(google).getByLabelText("Your JSearch (RapidAPI) key")).toBeInTheDocument();
    expect(aiDb.sourceChoices.u_demo?.google_jobs_api).toBe(true);
  });
});
