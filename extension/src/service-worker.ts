import {
  extensionRequestSchema,
  type BuddyActivityEntry,
  type BuddyPreferences,
  type ExtensionResponse,
  type PendingCapture,
  type PendingSalaryEvidence,
} from "../../src/domain/buddy";
import type { ProfileSelection } from "../../src/domain/profile";
import { companionClient } from "./companionClient";

export interface ExtensionWorkerClient {
  status(): Promise<{ paired: boolean }>;
  pair(code: string): Promise<{ paired: true }>;
  selectProfile(paths: readonly string[]): Promise<ProfileSelection>;
  getPreferences(): Promise<BuddyPreferences>;
  updatePreferences(patch: unknown): Promise<BuddyPreferences>;
  recordActivity(activity: BuddyActivityEntry): Promise<void>;
  queueCapture(capture: PendingCapture): Promise<void>;
  queueSalaryEvidence(evidence: PendingSalaryEvidence): Promise<void>;
}

export function createMessageHandler(client: ExtensionWorkerClient, extensionId: string) {
  return async (input: unknown, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> => {
    if (sender.id !== extensionId) return { ok: false, error: "invalid-request" };
    const parsed = extensionRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid-request" };
    try {
      switch (parsed.data.type) {
        case "status": return { ok: true, type: "status", paired: (await client.status()).paired };
        case "pair": await client.pair(parsed.data.code); return { ok: true, type: "paired" };
        case "select-profile": return { ok: true, type: "profile-selection", selection: await client.selectProfile(parsed.data.paths) };
        case "get-preferences": return { ok: true, type: "preferences", preferences: await client.getPreferences() };
        case "update-preferences": return { ok: true, type: "preferences", preferences: await client.updatePreferences(parsed.data.patch) };
        case "record-activity": await client.recordActivity(parsed.data.activity); return { ok: true, type: "recorded" };
        case "queue-capture": await client.queueCapture(parsed.data.capture); return { ok: true, type: "captured" };
        case "queue-salary-evidence": await client.queueSalaryEvidence(parsed.data.evidence); return { ok: true, type: "salary-evidence-captured" };
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "request-failed";
      return { ok: false, error: code === "unpaired" || code === "companion-offline" || code === "invalid-pairing" || code === "origin-not-allowed" ? code : "request-failed" };
    }
  };
}

export interface SiteEnableDependencies {
  requestPermission(input: chrome.permissions.Permissions): Promise<boolean>;
  register(input: chrome.scripting.RegisteredContentScript): Promise<void>;
  execute(input: { target: { tabId: number }; files: string[] }): Promise<unknown>;
}

class SiteEnableError extends Error {
  constructor(readonly code: "https-required" | "permission-denied" | "invalid-tab") { super(code); }
}

export async function enableSiteForTab(tab: chrome.tabs.Tab, dependencies: SiteEnableDependencies): Promise<void> {
  if (typeof tab.id !== "number" || !tab.url) throw new SiteEnableError("invalid-tab");
  const url = new URL(tab.url);
  if (url.protocol !== "https:") throw new SiteEnableError("https-required");
  const match = `${url.origin}/*`;
  if (!await dependencies.requestPermission({ origins: [match] })) throw new SiteEnableError("permission-denied");
  const script: chrome.scripting.RegisteredContentScript = {
    id: `job-buddy-${url.hostname.replace(/[^a-z0-9-]/gi, "-").slice(0, 48)}`,
    matches: [match],
    js: ["content.js"],
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
  try { await dependencies.register(script); }
  catch { /* The same persistent script may already be registered. */ }
  await dependencies.execute({ target: { tabId: tab.id }, files: ["content.js"] });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  const handler = createMessageHandler(companionClient, chrome.runtime.id);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handler(message, sender).then(sendResponse);
    return true;
  });
  chrome.action.onClicked.addListener((tab) => {
    void enableSiteForTab(tab, {
      requestPermission: (input) => chrome.permissions.request(input),
      register: (input) => chrome.scripting.registerContentScripts([input]),
      execute: (input) => chrome.scripting.executeScript(input),
    });
  });
}
