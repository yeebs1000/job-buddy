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
    return { ok: false, error: "invalid-request" };
  });
}
