import { describe, expect, it, vi } from "vitest";
import { mountContentRuntime } from "./content";
import type { ExtensionRequest, ExtensionResponse } from "../../src/domain/buddy";

describe("content runtime", () => {
  it("names missing profile answers separately from manual custom selectors", async () => {
    const page = document.implementation.createHTMLDocument("Application");
    page.body.innerHTML = '<label>Street Name<input name="addressLine2" autocomplete="address-line2"></label><label>Country<input name="country" role="combobox"></label>';
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), observeMutations: false,
      sendMessage: worker({ mode: "approval", paused: false, enabledDomains: [] }) });
    runtime.panel.expand();
    const copy = runtime.panel.shadowRoot.textContent!;
    expect(copy).toMatch(/no saved answer[^.]*Street Name/);
    expect(copy).toMatch(/dropdowns[^.]*Country/);
    expect(copy).not.toMatch(/no saved answer[^.]*Country/);
    expect(runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.disabled).toBe(true);
    runtime.destroy();
  });
  it("keeps pairing retryable and identifies a connection failure", async () => {
    const page = applicationDocument();
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), observeMutations: false, sendMessage: async (message) => message.type === "status" ? { ok: true, type: "status", paired: false } : { ok: false, error: "companion-offline" } });
    runtime.panel.expand();
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('[name="pairing-code"]')!.value = "ABCDE-FGHJK";
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[type="submit"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("local companion"));
    expect(runtime.panel.shadowRoot.querySelector('[name="pairing-code"]')).not.toBeNull();
    runtime.destroy();
  });
  it("does not carry an approval from an old panel into a newer scan", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "approval", paused: false, enabledDomains: [] });
    let release: (() => void) | undefined;
    let delay = false;
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), observeMutations: false, sendMessage: async (message) => {
      if (delay && message.type === "select-profile") await new Promise<void>((resolve) => { release = resolve; });
      return sendMessage(message);
    } });
    runtime.panel.expand();
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('input[value="email"]')!.click();
    page.querySelector<HTMLInputElement>("#email")!.value = "my-choice@example.com";
    delay = true;
    const scan = runtime.rescan();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.click();
    release!();
    await scan;
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("changed"));
    expect(page.querySelector<HTMLInputElement>("#email")!.value).toBe("my-choice@example.com");
    runtime.destroy();
  });
  it("does not overwrite an answer entered while the profile is loading", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "automatic", paused: false, enabledDomains: [] });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), observeMutations: false, sendMessage: async (message) => {
      if (message.type === "select-profile") page.querySelector<HTMLInputElement>("#first-name")!.value = "My choice";
      return sendMessage(message);
    } });
    expect(page.querySelector<HTMLInputElement>("#first-name")!.value).toBe("My choice");
    runtime.destroy();
  });

  it("keeps a retry action when initial extension messaging is unavailable", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "approval", paused: false, enabledDomains: [] });
    let offline = true;
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), observeMutations: false, sendMessage: async (message) => {
      if (offline) throw new Error("offline");
      return sendMessage(message);
    } });
    runtime.panel.expand();
    expect(runtime.panel.shadowRoot.textContent).toContain("local companion");
    offline = false;
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="rescan"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("Choose fields to fill"));
    runtime.destroy();
  });
  it("refreshes pause settings before filling previously approved fields", async () => {
    const page = applicationDocument();
    const preferences = { mode: "approval" as const, paused: false, enabledDomains: [] as string[] };
    const sendMessage = worker(preferences);
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage: async (message) => structuredClone(await sendMessage(message)), observeMutations: false });
    runtime.panel.expand();
    preferences.paused = true;
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('input[value="first-name"]')!.click();
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("paused"));
    expect(page.querySelector<HTMLInputElement>("#first-name")!.value).toBe("");
    runtime.destroy();
  });
  it("keeps autofill accessible when salary evidence is also found", async () => {
    const page = applicationDocument();
    page.body.insertAdjacentHTML("afterbegin", '<p>Salary: SGD 120,000 to 165,000 a year</p>');
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage: worker({ mode: "approval", paused: false, enabledDomains: [] }), observeMutations: false });
    runtime.panel.expand();
    expect(runtime.panel.shadowRoot.textContent).toContain("Choose fields to fill");
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="review-salary"]')!.click();
    expect(runtime.panel.shadowRoot.textContent).toContain("Salary found");
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="rescan"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("Choose fields to fill"));
    runtime.destroy();
  });

  it("does not overwrite an existing value changed after the review was shown", async () => {
    const page = applicationDocument();
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage: worker({ mode: "approval", paused: false, enabledDomains: [] }), observeMutations: false });
    runtime.panel.expand();
    page.querySelector<HTMLInputElement>("#email")!.value = "new-choice@example.com";
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('input[value="email"]')!.click();
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("changed"));
    expect(page.querySelector<HTMLInputElement>("#email")!.value).toBe("new-choice@example.com");
    runtime.destroy();
  });

  it("keeps a rejected fill available for retry and explains it", async () => {
    const page = applicationDocument();
    page.querySelector<HTMLInputElement>("#first-name")!.addEventListener("input", (event) => { (event.target as HTMLInputElement).value = ""; });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage: worker({ mode: "approval", paused: false, enabledDomains: [] }), observeMutations: false });
    runtime.panel.expand();
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('input[value="first-name"]')!.click();
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.click();
    await vi.waitFor(() => expect(runtime.panel.shadowRoot.textContent).toContain("could not be filled"));
    expect(runtime.panel.shadowRoot.querySelector('input[value="first-name"]')).not.toBeNull();
    runtime.destroy();
  });

  it("explains missing saved answers instead of showing an empty review", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "approval", paused: false, enabledDomains: [] });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage: async (message) => message.type === "select-profile" ? { ok: true, type: "profile-selection", selection: {} } : sendMessage(message), observeMutations: false });
    runtime.panel.expand();
    expect(runtime.panel.shadowRoot.textContent).toMatch(/no saved answer[^.]*First name/);
    expect(runtime.panel.shadowRoot.textContent).toContain("Job Buddy Profile");
    expect(runtime.panel.shadowRoot.querySelector('[data-action="rescan"]')).not.toBeNull();
    runtime.destroy();
  });
  it("mounts one Buddy instance and reads pairing state through the worker", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, type: "status", paired: false });

    const first = await mountContentRuntime({ document, sendMessage });
    const second = await mountContentRuntime({ document, sendMessage });

    expect(first).toBe(second);
    expect(document.querySelectorAll("[data-job-buddy='panel']")).toHaveLength(1);
    expect(sendMessage).toHaveBeenCalledWith({ version: 1, type: "status" });
  });

  it("requests only matched paths and fills only fields explicitly approved", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "approval", paused: false, enabledDomains: ["jobs.example"] });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage, observeMutations: false });
    runtime.panel.expand();

    const requested = sendMessage.mock.calls.find(([message]) => message.type === "select-profile")?.[0];
    expect(requested).toEqual({ version: 1, type: "select-profile", paths: ["identity.givenName", "contact.email", "preferences.salarySGDAnnual"] });
    runtime.panel.shadowRoot.querySelector<HTMLInputElement>('input[value="first-name"]')!.click();
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>("button[data-action='fill-approved']")!.click();
    await vi.waitFor(() => expect(page.querySelector<HTMLInputElement>("#first-name")?.value).toBe("Alex"));
    expect(page.querySelector<HTMLInputElement>("#salary")?.value).toBe("");
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')?.dataset.clicked).toBeUndefined();
    runtime.destroy();
  });

  it("automatically fills only empty safe high-confidence fields", async () => {
    const page = applicationDocument();
    const sendMessage = worker({ mode: "automatic", paused: false, enabledDomains: ["jobs.example"] });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/apply"), sendMessage, observeMutations: false });

    expect(page.querySelector<HTMLInputElement>("#first-name")?.value).toBe("Alex");
    expect(page.querySelector<HTMLInputElement>("#email")?.value).toBe("already@example.com");
    expect(page.querySelector<HTMLInputElement>("#salary")?.value).toBe("");
    expect(page.querySelector<HTMLInputElement>("#resume")?.value).toBe("");
    runtime.panel.expand();
    expect(runtime.panel.shadowRoot.textContent).toContain("1 filled");
    runtime.destroy();
  });

  it("queues metadata only after a submit interaction, confirmation state, and explicit send", async () => {
    const page = applicationDocument();
    page.querySelector("form")!.setAttribute("data-company", "Summit Pay");
    page.querySelector("form")!.setAttribute("data-location", "Singapore");
    const sendMessage = worker({ mode: "approval", paused: false, enabledDomains: ["jobs.example"] });
    const values = new Map<string, string>();
    const runtime = await mountContentRuntime({
      document: page,
      url: new URL("https://jobs.example/apply"),
      sendMessage,
      observeMutations: false,
      allowUntrustedSubmitForTest: true,
      intentStore: { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } },
    });

    page.querySelector("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(sendMessage.mock.calls.some(([message]) => message.type === "queue-capture")).toBe(false);
    page.body.innerHTML = `<main><h2 data-qa="application-success">Application submitted</h2></main>`;
    await runtime.rescan();
    runtime.panel.expand();
    expect(sendMessage.mock.calls.some(([message]) => message.type === "queue-capture")).toBe(false);
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>("button[data-action='send-capture']")!.click();

    await vi.waitFor(() => expect(sendMessage.mock.calls.some(([message]) => message.type === "queue-capture")).toBe(true));
    const queued = sendMessage.mock.calls.find(([message]) => message.type === "queue-capture")?.[0];
    expect(JSON.stringify(queued)).not.toContain("alex@example.com");
    runtime.destroy();
  });

  it("detects salary but never sends it until an explicit panel confirmation", async () => {
    const page = document.implementation.createHTMLDocument("Software Engineer");
    page.body.innerHTML = `<main data-location="United States"><h1>Software Engineer</h1><p>Salary: $120,000 to $165,000 a year</p><form></form></main>`;
    const sendMessage = worker({ mode: "automatic", paused: false, enabledDomains: ["jobs.example"] });
    const runtime = await mountContentRuntime({ document: page, url: new URL("https://jobs.example/role"), sendMessage, observeMutations: false });

    expect(sendMessage.mock.calls.some(([message]) => message.type === "queue-salary-evidence")).toBe(false);
    runtime.panel.expand();
    expect(runtime.panel.shadowRoot.textContent).toContain("Salary found");
    runtime.panel.shadowRoot.querySelector<HTMLButtonElement>('button[data-action="add-salary-evidence"]')!.click();

    await vi.waitFor(() => expect(sendMessage.mock.calls.some(([message]) => message.type === "queue-salary-evidence")).toBe(true));
    runtime.destroy();
  });
});

function applicationDocument(): Document {
  const page = document.implementation.createHTMLDocument("Application");
  page.body.innerHTML = `<form>
    <label for="first-name">First name</label><input id="first-name" name="first_name" autocomplete="given-name">
    <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" value="already@example.com">
    <label for="salary">Expected annual salary (SGD)</label><input id="salary" name="salary_sgd">
    <label for="resume">Resume</label><input id="resume" name="resume" type="file">
    <button type="submit">Submit application</button>
  </form>`;
  return page;
}

function worker(preferences: { mode: "approval" | "automatic"; paused: boolean; enabledDomains: string[] }) {
  return vi.fn(async (message: ExtensionRequest): Promise<ExtensionResponse> => {
    if (message.type === "status") return { ok: true, type: "status", paired: true };
    if (message.type === "get-preferences") return { ok: true, type: "preferences", preferences };
    if (message.type === "select-profile") return { ok: true, type: "profile-selection", selection: {
      "identity.givenName": "Alex", "contact.email": "alex@example.com", "preferences.salarySGDAnnual": 120000,
    } };
    if (message.type === "record-activity") return { ok: true, type: "recorded" };
    if (message.type === "queue-capture") return { ok: true, type: "captured" };
    if (message.type === "queue-salary-evidence") return { ok: true, type: "salary-evidence-captured" };
    return { ok: false, error: "invalid-request" };
  });
}
