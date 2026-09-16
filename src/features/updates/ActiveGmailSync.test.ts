import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { gmailPreferences } from "../settings/gmailPreferences";
import { updateRepository } from "./updateRepository";
import { checkActiveGmail } from "./ActiveGmailSync";

afterEach(async () => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); await jobBuddyDb.delete(); await jobBuddyDb.open(); });
const now = Date.now();
async function enabled() {
  await gmailPreferences.save({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true, automationMode: "approval" });
  await updateRepository.saveScanState("gmail", { cursor: "100", lastSuccessfulScanAt: new Date(now - 2 * 86400000).toISOString() });
}
it("syncs on an active non-overview page then avoids another daily scan", async () => {
  await enabled();
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    requests.push(path);
    return new Response(JSON.stringify(path === "/api/gmail/status" ? { state: "connected", platformSupported: true } : {
      source: "gmail", messages: [], nextCursor: "200", scannedAt: new Date(now).toISOString(), diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 },
    }));
  });
  expect(await checkActiveGmail(now)).toBe(true);
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("200");
  expect(await checkActiveGmail(now + 60000)).toBe(false);
  expect(requests).toEqual(["/api/gmail/status", "/api/gmail/scan"]);
});
it("does not contact Gmail without consent or immediately after a failed attempt", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await checkActiveGmail(now)).toBe(false);
  await enabled();
  await updateRepository.saveScanState("gmail", { cursor: "100", lastAttemptedScanAt: new Date(now - 60000).toISOString(), error: "network" });
  expect(await checkActiveGmail(now)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("keeps the cursor and tracker unchanged when reconnection is required", async () => {
  await enabled();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ state: "reconnect-required", platformSupported: true })));
  expect(await checkActiveGmail(now)).toBe(false);
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("100");
});
it("does not race the account reset on the OAuth return page", async () => {
  await enabled();
  window.history.replaceState({}, "", "/settings?gmail=connected");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await checkActiveGmail(now)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
