import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { aiDb } from "../../mocks/aiState";
import { entitlementsFor } from "../../mocks/data";
import { renderApp, signIn } from "../../test/renderApp";

const OWN_KEY = "sk-my-own-secret-key-7731";

function sourceRow(name: string) {
  return screen.getByText(name, { selector: ".source-name" }).closest("li")!;
}

describe("job sources", () => {
  it("lists sources from the server with tier, health and whether they run", async () => {
    renderApp("/providers");
    await signIn();
    const apify = sourceRow(
      await screen.findByText("Naukri via Apify").then((el) => el.textContent!),
    );
    expect(within(apify).getByText("Paid")).toBeInTheDocument();
    expect(
      within(sourceRow("LinkedIn")).getByText("Will run in your next search."),
    ).toBeInTheDocument();
    expect(within(sourceRow("LinkedIn")).getByText("Working")).toBeInTheDocument();
  });

  it("Free tools only stops paid sources and says why", async () => {
    renderApp("/providers");
    const user = await signIn();
    await screen.findByText("Naukri via Apify");
    await user.click(screen.getByRole("checkbox", { name: "Free tools only" }));
    await waitFor(() =>
      expect(
        within(sourceRow("Naukri via Apify")).getByText(/Won't run: paid source/),
      ).toBeInTheDocument(),
    );
    expect(aiDb.freeOnly.u_demo).toBe(true);
    expect(
      within(sourceRow("LinkedIn")).getByText("Will run in your next search."),
    ).toBeInTheDocument();
  });

  it("turning a source off is saved on the server", async () => {
    renderApp("/providers");
    const user = await signIn();
    await screen.findByText("LinkedIn", { selector: ".source-name" });
    await user.click(within(sourceRow("LinkedIn")).getByRole("checkbox"));
    await waitFor(() =>
      expect(
        within(sourceRow("LinkedIn")).getByText(/turned off in your Providers settings/),
      ).toBeInTheDocument(),
    );
    expect(aiDb.sourceChoices.u_demo?.linkedin).toBe(false);
  });

  it("saves an inline key and never shows it again", async () => {
    aiDb.keys = aiDb.keys.filter((k) => k.scope !== "apify");
    renderApp("/providers");
    const user = await signIn();
    await screen.findByText("Naukri via Apify");
    const input = within(sourceRow("Naukri via Apify")).getByLabelText("Your apify key");
    expect(input).toHaveAttribute("type", "password");
    await user.type(input, OWN_KEY);
    await user.click(
      within(sourceRow("Naukri via Apify")).getByRole("button", { name: "Save key" }),
    );
    expect(await screen.findByText(/won't be shown again/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", expect.stringContaining("••••7731"));
    expect(document.body.innerHTML).not.toContain(OWN_KEY);
  });

  it("a search sends the user's sources and reports skipped ones", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let sent: { sources?: string[]; enable_naukri_apify?: boolean } | undefined;
      server.events.on("request:start", async ({ request }) => {
        if (request.url.endsWith("/pipeline/run/stream")) {
          sent = ((await request.clone().json()) as { search: typeof sent }).search;
        }
      });
      aiDb.sourceChoices.u_demo = { indeed: false, naukri_apify: true };
      aiDb.freeOnly.u_demo = true;
      renderApp("/");
      const user = await signIn();
      await screen.findByText(/job source\(s\)/);
      await user.click(screen.getByRole("button", { name: /Run Job Search/ }));
      await waitFor(() => expect(sent).toBeDefined());
      expect(sent!.sources).toEqual(["linkedin", "naukri"]);
      expect(sent!.enable_naukri_apify).toBe(true); // asked for; the server skips it (Free tools only)
    } finally {
      server.events.removeAllListeners();
      vi.useRealTimers();
    }
  });
});

describe("AI models (user)", () => {
  it("groups models, explains why a paid one is unavailable and saves a choice", async () => {
    renderApp("/settings/ai");
    const user = await signIn();
    expect(await screen.findByRole("heading", { name: "Free", level: 4 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paid", level: 4 })).toBeInTheDocument();
    expect(
      screen.getByText(/needs the premium AI models feature or your own anthropic key/),
    ).toBeInTheDocument();

    const picker = screen.getByLabelText("Job scoring");
    expect(within(picker).getByRole("option", { name: /Claude Opus 5.5/ })).toBeDisabled();
    await user.selectOptions(picker, "m_groq");
    expect(await screen.findByText(/Job scoring will use your choice/)).toBeInTheDocument();
    expect(aiDb.prefs.u_demo).toEqual({ score: "m_groq" });
    expect(screen.getByRole("region", { name: "AI usage, last 30 days" })).toHaveTextContent(
      "Calls",
    );
  });

  it("the premium feature unlocks paid models", async () => {
    entitlementsFor("u_demo").premium_models = {
      enabled: true,
      max_level: null,
      quota_per_day: null,
      quota_remaining: null,
    };
    renderApp("/settings/ai");
    await signIn();
    const picker = await screen.findByLabelText("Job scoring");
    expect(within(picker).getByRole("option", { name: /Claude Opus 5.5/ })).toBeEnabled();
  });
});

describe("API keys (user)", () => {
  it("adds a key shown only as last 4, then deletes it after confirming", async () => {
    renderApp("/settings/keys");
    const user = await signIn();
    const input = await screen.findByLabelText("Add your Anthropic key");
    await user.type(input, OWN_KEY);
    await user.click(within(input.closest("form")!).getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Anthropic key saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Saved key ending 7731")).toHaveTextContent("••••7731");
    expect(document.body.innerHTML).not.toContain(OWN_KEY);

    await user.click(screen.getByRole("button", { name: "Delete key" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete your Anthropic key?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete key" }));
    expect(await screen.findByText("Anthropic key deleted.")).toBeInTheDocument();
    expect(aiDb.keys.some((k) => k.owner_type === "user")).toBe(false);
  });

  it("rejects something that isn't a key", async () => {
    renderApp("/settings/keys");
    const user = await signIn();
    const input = await screen.findByLabelText("Add your Groq key");
    await user.type(input, "short");
    await user.click(within(input.closest("form")!).getByRole("button", { name: "Save key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't look like an API key");
  });
});

describe("admin: AI models, keys, sources, usage", () => {
  it("adds an OpenAI-compatible model that users can see at once", async () => {
    renderApp("/admin/models");
    const user = await signIn("admin@jobfinder.test");
    await user.click(await screen.findByRole("button", { name: "Add model" }));
    await user.type(screen.getByLabelText("Model id"), "deepseek/deepseek-chat");
    await user.type(screen.getByLabelText("Display name"), "DeepSeek Chat");
    await user.type(screen.getByLabelText("Base URL"), "https://openrouter.ai/api/v1");
    expect(screen.getByLabelText("Key name")).toHaveValue("openrouter");
    await user.click(screen.getByRole("button", { name: "Add model" }));
    expect(
      await screen.findByText("DeepSeek Chat added. Users can see it now."),
    ).toBeInTheDocument();
    const added = aiDb.models.find((m) => m.model_id === "deepseek/deepseek-chat");
    expect(added).toMatchObject({ key_scope: "openrouter", tier: "free", enabled_global: true });
  });

  it("asks for a base URL for OpenAI-compatible models", async () => {
    renderApp("/admin/models");
    const user = await signIn("admin@jobfinder.test");
    await user.click(await screen.findByRole("button", { name: "Add model" }));
    await user.type(screen.getByLabelText("Model id"), "x");
    await user.type(screen.getByLabelText("Display name"), "X");
    await user.click(screen.getByRole("button", { name: "Add model" }));
    expect(screen.getByRole("alert")).toHaveTextContent("need a base URL");
  });

  it("tests a model, turns one off, and deletes after confirming", async () => {
    renderApp("/admin/models");
    const user = await signIn("admin@jobfinder.test");
    await user.click(await screen.findByRole("button", { name: "Test GPT-OSS 120B (Groq)" }));
    expect(await screen.findByText(/Test passed in 612 ms/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test Qwen3 8B (Hugging Face)" }));
    expect(await screen.findByText(/Test failed: HTTP 402/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Gemini 2.5 Flash: on" }));
    expect(await screen.findByText(/Gemini 2.5 Flash is off/)).toBeInTheDocument();
    expect(aiDb.models.find((m) => m.id === "m_gemini")?.enabled_global).toBe(false);

    await user.click(screen.getByRole("button", { name: "Delete Claude Opus 5.5" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete model" }),
    );
    expect(await screen.findByText("Claude Opus 5.5 deleted.")).toBeInTheDocument();
  });

  it("sets a default model per task", async () => {
    renderApp("/admin/models");
    const user = await signIn("admin@jobfinder.test");
    const picker = await screen.findByRole("combobox", { name: "Job scoring" });
    await user.selectOptions(picker, "m_groq");
    expect(await screen.findByText("Default for Job scoring saved.")).toBeInTheDocument();
    expect(aiDb.defaults).toEqual({ score: "m_groq" });
  });

  it("shows platform keys masked and .env fallbacks", async () => {
    renderApp("/admin/keys");
    await signIn("admin@jobfinder.test");
    expect(await screen.findAllByText("••••9f2c")).toHaveLength(3);
    expect(screen.getByText("Using the server .env key")).toBeInTheDocument();
  });

  it("turns a job source off for everyone", async () => {
    renderApp("/admin/sources");
    const user = await signIn("admin@jobfinder.test");
    await user.click(await screen.findByRole("checkbox", { name: "Indeed: on for everyone" }));
    expect(await screen.findByText("Indeed is off for everyone.")).toBeInTheDocument();
    expect(aiDb.sources.find((s) => s.key === "indeed")?.enabled_global).toBe(false);
  });

  it("shows usage by model and person", async () => {
    renderApp("/admin/usage");
    await signIn("admin@jobfinder.test");
    const card = await screen.findByRole("region", { name: "All AI usage, last 30 days" });
    expect(
      within(card).getByRole("rowheader", { name: "openai/gpt-oss-120b" }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("rowheader", { name: "demo@jobfinder.test" }),
    ).toBeInTheDocument();
  });

  it("managers don't see the AI & sources admin pages", async () => {
    renderApp("/admin/models");
    await signIn("manager@jobfinder.test");
    expect(
      await screen.findByRole("heading", { name: "You don't have access to this page" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Platform keys" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Users" })).toBeInTheDocument();
  });

  it("handles a failed model list", async () => {
    server.use(
      http.get("*/api/v1/admin/models", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    renderApp("/admin/models");
    await signIn("admin@jobfinder.test");
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
