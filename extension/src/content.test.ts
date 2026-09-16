import { describe, expect, it, vi } from "vitest";
import { mountContentRuntime } from "./content";
import type { ExtensionRequest, ExtensionResponse } from "../../src/domain/buddy";

describe("content runtime", () => {
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
