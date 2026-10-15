import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { entitlementsFor, mockDb } from "../../mocks/data";
import { renderApp, signIn } from "../../test/renderApp";

const ADMIN = "admin@jobfinder.test";
const MANAGER = "manager@jobfinder.test";

async function openDemoAsAdmin() {
  renderApp("/admin/users");
  const user = await signIn(ADMIN);
  await user.click(await screen.findByRole("link", { name: "Dev Demo" }));
  await screen.findByRole("heading", { name: "Dev Demo" });
  return user;
}

describe("guards", () => {
  it("hides the Admin section from regular users and explains a direct visit", async () => {
    renderApp("/admin/users");
    await signIn();
    expect(
      await screen.findByRole("heading", { name: "You don't have access to this page" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("marks a feature the account lacks as Off and says why", async () => {
    entitlementsFor("u_demo").ats_discovery = {
      enabled: false,
      max_level: null,
      quota_per_day: null,
      quota_remaining: null,
    };
    renderApp("/ats-targets");
    await signIn();
    expect(
      await screen.findByText(/Your account doesn't include company career pages/, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    const link = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
      name: /ATS targets/,
    });
    expect(link).toHaveTextContent("Off");
  });

  it("explains a used-up daily limit", async () => {
    entitlementsFor("u_demo").job_search = {
      enabled: true,
      max_level: null,
      quota_per_day: 10,
      quota_remaining: 0,
    };
    renderApp("/");
    await signIn();
    expect(
      await screen.findByText(/used all 10 of today's job search runs/, { selector: "p" }),
    ).toBeInTheDocument();
  });
});

describe("admin users", () => {
  it("lists everyone for an admin and filters by search", async () => {
    renderApp("/admin/users");
    const user = await signIn(ADMIN);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(1 + mockDb.users.length);

    await user.type(screen.getByLabelText("Search"), "mira");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    expect(screen.getByRole("link", { name: "Mira Manager" })).toBeInTheDocument();
  });

  it("adds a person", async () => {
    renderApp("/admin/users");
    const user = await signIn(ADMIN);
    await user.click(await screen.findByRole("button", { name: "Add person" }));
    await user.type(
      screen.getByLabelText("Email", { selector: "input[type=email]" }),
      "new@jobfinder.test",
    );
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(
      await screen.findByText("Added new@jobfinder.test. They can sign in now."),
    ).toBeVisible();
    expect(await screen.findByRole("link", { name: "new@jobfinder.test" })).toBeInTheDocument();
  });

  it("disables an account only after confirming the consequence", async () => {
    const user = await openDemoAsAdmin();
    await user.click(screen.getByRole("button", { name: "Disable account" }));
    const dialog = screen.getByRole("alertdialog", { name: "Disable Dev Demo?" });
    expect(dialog).toHaveTextContent("signs them out on every device right away");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Disable account" }));
    expect(await screen.findByText("Dev Demo is disabled and signed out.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Enable account" })).toBeInTheDocument();
    expect(mockDb.users.find((u) => u.id === "u_demo")?.is_active).toBe(false);
  });

  it("changes a role", async () => {
    const user = await openDemoAsAdmin();
    await user.selectOptions(screen.getByLabelText("Role"), "manager");
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText("Role saved. Dev Demo is now Manager.")).toBeVisible();
  });

  it("sets and resets a feature for one person", async () => {
    const user = await openDemoAsAdmin();
    const row = (await screen.findByRole("rowheader", { name: /Job search/ })).closest("tr")!;
    await user.click(within(row).getByRole("checkbox", { name: /Job search/ }));
    await user.click(within(row).getByRole("button", { name: "Save" }));
    expect(await within(row).findByText("Custom")).toBeInTheDocument();
    expect(entitlementsFor("u_demo").job_search?.enabled).toBe(false);

    await user.click(within(row).getByRole("button", { name: "Reset to default" }));
    expect(await within(row).findByText("Default")).toBeInTheDocument();
    expect(entitlementsFor("u_demo").job_search?.enabled).toBe(true);
  });

  it("rejects a non-number daily limit", async () => {
    const user = await openDemoAsAdmin();
    const row = (await screen.findByRole("rowheader", { name: /AI job scoring/ })).closest("tr")!;
    await user.type(within(row).getByLabelText(/daily limit/), "ten");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    expect(within(row).getByRole("alert")).toHaveTextContent("whole number");
  });

  it("shows a manager only their team, without invite or role controls", async () => {
    renderApp("/admin/users");
    const user = await signIn(MANAGER);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Add person" })).not.toBeInTheDocument();

    await user.click(within(table).getByRole("link", { name: "Dev Demo" }));
    expect(await screen.findByLabelText("Role")).toBeDisabled();
    expect(screen.getByText("Only admins can change roles.")).toBeInTheDocument();
  });

  it("lists feature defaults", async () => {
    renderApp("/admin/features");
    await signIn(ADMIN);
    const row = (await screen.findByRole("rowheader", { name: "Live Copilot" })).closest("tr")!;
    expect(row).toHaveTextContent("Off");
  });
});
