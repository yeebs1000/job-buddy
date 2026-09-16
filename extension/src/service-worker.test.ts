import { describe, expect, it, vi } from "vitest";
import { createMessageHandler, enableSiteForTab, type ExtensionWorkerClient } from "./service-worker";

const sender = { id: "extension-id", tab: { id: 3, url: "https://jobs.example/apply" } } as chrome.runtime.MessageSender;

describe("extension service worker", () => {
  it("validates messages and returns selected values without a token", async () => {
    const client = workerClient();
    const handler = createMessageHandler(client, "extension-id");

    const invalid = await handler({ version: 1, type: "eval", code: "alert(1)" }, sender);
    const selected = await handler({ version: 1, type: "select-profile", paths: ["identity.givenName"] }, sender);

    expect(invalid).toEqual({ ok: false, error: "invalid-request" });
    expect(selected).toEqual({ ok: true, type: "profile-selection", selection: { "identity.givenName": "Alex" } });
    expect(JSON.stringify(selected)).not.toContain("private-token");
  });

  it("rejects messages not sent by this extension", async () => {
    const handler = createMessageHandler(workerClient(), "extension-id");
    await expect(handler({ version: 1, type: "status" }, { ...sender, id: "other-extension" })).resolves.toEqual({ ok: false, error: "invalid-request" });
  });

  it("requests access for the exact HTTPS origin and injects once", async () => {
    const requestPermission = vi.fn().mockResolvedValue(true);
    const register = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue(undefined);

    await enableSiteForTab({ id: 3, url: "https://jobs.example/apply?token=private" } as chrome.tabs.Tab, {
      requestPermission,
      register,
      execute,
    });

    expect(requestPermission).toHaveBeenCalledWith({ origins: ["https://jobs.example/*"] });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ matches: ["https://jobs.example/*"], persistAcrossSessions: true }));
    expect(execute).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ["content.js"] });
  });

  it("refuses non-HTTPS application pages", async () => {
    await expect(enableSiteForTab({ id: 3, url: "http://jobs.example/apply" } as chrome.tabs.Tab, {
      requestPermission: vi.fn(), register: vi.fn(), execute: vi.fn(),
    })).rejects.toMatchObject({ code: "https-required" });
  });
});

function workerClient(): ExtensionWorkerClient {
  return {
    status: async () => ({ paired: true }),
    pair: async () => ({ paired: true }),
    selectProfile: async () => ({ "identity.givenName": "Alex" }),
    getPreferences: async () => ({ mode: "approval", paused: false, enabledDomains: [] }),
    updatePreferences: async () => ({ mode: "approval", paused: false, enabledDomains: [] }),
    recordActivity: async () => undefined,
    queueCapture: async () => undefined,
  };
}
