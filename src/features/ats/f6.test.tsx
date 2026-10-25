/**
 * F6 screens against the MSW mocks (backend P6): title search grouped by
 * company with the scope line, quick picks, filters in the URL, load more,
 * the live top-up, job details with Save and the F4 apply buttons, adding a
 * company, importing the old local targets, the admin registry and the
 * Job sources group.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { f3Db } from "../../mocks/f3State";
import { f6Db } from "../../mocks/f6State";
import { renderApp, signIn } from "../../test/renderApp";

const ADMIN = "admin@jobfinder.test";

function company(name: string): HTMLElement {
  return screen.getByRole("heading", { name, level: 3 }).closest("li.ats-company") as HTMLElement;
}

describe("ATS targets search", () => {
  it("groups companies, states the scope, hides applied jobs and loads more", async () => {
    renderApp("/ats-targets?tab=browse");
    const user = await signIn();
    expect(
      await screen.findByRole("heading", { name: "Target companies", level: 2 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Searching/)).toHaveTextContent(
      /29 companies.*open jobs on 13 career-page platforms/,
    );
    await user.type(screen.getByLabelText("Job title"), "Data Engineer");
    await user.click(screen.getByRole("button", { name: "Search" }));

    // Acme's only data job is one the demo user applied to, so it's hidden by default.
    expect(await screen.findByText(/companies ·/)).toHaveTextContent(/28 companies/);
    expect(screen.queryByRole("heading", { name: "Acme Analytics" })).not.toBeInTheDocument();
    const bluefin = company("Bluefin Labs");
    expect(within(bluefin).getByText("Lever")).toBeInTheDocument();
    expect(within(bluefin).getByRole("link", { name: /Careers page/ })).toHaveAttribute(
      "href",
      "https://jobs.lever.co/bluefinlabs",
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Load more (25 of 28)" }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(28));
    expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Hide jobs I applied to"));
    const acme = await waitFor(() => company("Acme Analytics"));
    expect(within(acme).getByText("Applied")).toBeInTheDocument();
  });

  it("runs a quick pick and filters by platform, kept in the URL", async () => {
    renderApp("/ats-targets?q=data+engineer&platform=greenhouse");
    const user = await signIn();
    expect(await screen.findByText(/companies ·/)).toHaveTextContent(/2 companies/);
    expect(company("Nimbus AI")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Greenhouse" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Greenhouse" }));
    await waitFor(() => expect(screen.getByText(/companies ·/)).toHaveTextContent(/28 companies/));

    // Quick picks come from the search profile's titles.
    await user.click(screen.getByRole("button", { name: "AI Engineer" }));
    expect(screen.getByLabelText("Job title")).toHaveValue("AI Engineer");
  });

  it("checks more career pages live when few companies match", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/ats-targets?q=Rust+Engineer");
      await signIn();
      expect(
        await screen.findByText(/No companies in the registry are hiring for “Rust Engineer”/),
      ).toBeInTheDocument();
      expect(screen.getByText(/checking up to 40 more career pages live/)).toBeInTheDocument();
      for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(2100);
      expect(
        await screen.findByText("Checked more career pages live and found 6 more jobs."),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText(/companies ·/)).toHaveTextContent(/3 companies/));
      expect(company("Ferro Labs")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ATS job details", () => {
  it("shows the description, saves the job and offers Auto apply on Greenhouse", async () => {
    renderApp("/ats-targets?q=data+engineer&platform=greenhouse");
    const user = await signIn();
    const nimbus = await waitFor(() => company("Nimbus AI"));
    await user.click(within(nimbus).getAllByRole("button", { name: /^Details:/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Nimbus AI is hiring a/)).toBeInTheDocument();
    expect(f6Db.descriptionsFetched).toBe(1);

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("button", { name: "Saved to Jobs" })).toBeDisabled();
    const tracked = [...f3Db.jobs.values()].find((j) => j.company === "Nimbus AI")!;
    expect(f3Db.userJobs.u_demo?.[tracked.id]?.state).toBe("saved");

    await user.click(within(dialog).getByRole("button", { name: "Apply…" }));
    expect(await within(dialog).findByRole("button", { name: "Auto apply" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Apply manually" })).toBeEnabled();
  });
});

describe("Adding companies", () => {
  it("adds a company by its careers link and says when it's already there", async () => {
    renderApp("/ats-targets?tab=browse");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Add a company" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a company" });
    const input = within(dialog).getByLabelText("Careers page or job link");
    await user.type(input, "https://jobs.lever.co/newco");
    await user.click(within(dialog).getByRole("button", { name: "Add company" }));
    expect(await within(dialog).findByText(/Added Newco \(Lever\)/)).toBeInTheDocument();
    expect(f6Db.companies.some((c) => c.slug === "newco" && c.origin === "user")).toBe(true);

    await user.type(input, "https://jobs.lever.co/bluefinlabs");
    await user.click(within(dialog).getByRole("button", { name: "Add company" }));
    expect(await within(dialog).findByText(/already in the registry/)).toBeInTheDocument();

    await user.type(input, "http://127.0.0.1/careers");
    await user.click(within(dialog).getByRole("button", { name: "Add company" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That address isn't a public careers page.",
    );
  });

  it("imports the old browser-only targets once, then forgets them", async () => {
    window.localStorage.setItem(
      "job_finder_ats_targets_v1",
      JSON.stringify([
        { platform: "lever", slug: "acme" },
        { platform: "custom", slug: "intranet", custom_endpoint_url: "https://x.example" },
      ]),
    );
    renderApp("/ats-targets?tab=browse");
    const user = await signIn();
    const card = await screen.findByRole("region", { name: "Your saved companies" });
    expect(within(card).getByText(/You saved 2 companies/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Add these 2" }));
    expect(await within(card).findByText("acme (Lever) — added")).toBeInTheDocument();
    expect(
      within(card).getByText("intranet (custom) — custom pages can't go in the registry"),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("job_finder_ats_targets_v1")).toBeNull();
  });
});

describe("Admin ATS registry", () => {
  it("shows index size and platform health, and turns a company off", async () => {
    renderApp("/admin/ats");
    const user = await signIn(ADMIN);
    expect(
      await screen.findByRole("heading", { name: "ATS registry", level: 2 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/% of 3,00,000\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 failures · HTTP 503 from the XML feed/)).toBeInTheDocument();
    await screen.findByRole("table", { name: "Registry companies" }, { timeout: 3000 });
    await user.click(screen.getByRole("button", { name: "Turn off Bluefin Labs" }));
    expect(await screen.findByText("Bluefin Labs is off.")).toBeInTheDocument();
    expect(f6Db.companies.find((c) => c.name === "Bluefin Labs")?.active).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "Workday on for everyone" }));
    await waitFor(() => expect(f6Db.platformsOff.has("workday")).toBe(true));
  });

  it("is not in a normal user's nav", async () => {
    renderApp("/");
    await signIn();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Target companies" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "ATS registry" })).not.toBeInTheDocument();
  });
});

describe("Job sources", () => {
  it("lists Company career pages with a link to ATS targets", async () => {
    renderApp("/providers");
    await signIn();
    expect(await screen.findByText("Company career pages", { selector: "h4" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search the registry by job title" })).toHaveAttribute(
      "href",
      "/ats-targets",
    );
  });
});
