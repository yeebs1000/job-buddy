import { useEffect } from "react";
import { gmailClient } from "../settings/gmailClient";
import { gmailPreferences } from "../settings/gmailPreferences";
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import { updateRepository } from "./updateRepository";
import { runMailScan } from "./runMailScan";
import { isDailyScanEligible } from "./useDailyActiveScan";

const adapter = new GmailMailAdapter();

export async function checkActiveGmail(now = Date.now()): Promise<boolean> {
  if (new URLSearchParams(window.location.search).has("gmail")) return false;
  const preferences = await gmailPreferences.get();
  if (preferences.selectedSource !== "gmail" || !preferences.initialSyncCompleted || !preferences.dailyActiveScanEnabled) return false;
  const state = await updateRepository.getScanState("gmail");
  // A failed network attempt should not be retried every minute.
  if (state.lastAttemptedScanAt && now - Date.parse(state.lastAttemptedScanAt) < 15 * 60_000) return false;
  if (!isDailyScanEligible({ connected: true, enabled: true, initialSyncCompleted: true, lastSuccessfulScanAt: state.lastSuccessfulScanAt, now: new Date(now).toISOString() })) return false;
  const status = await gmailClient.status();
  if (status.state !== "connected") return false;
  const result = await runMailScan({ adapter, mode: preferences.automationMode });
  if (!result.error) window.dispatchEvent(new Event("job-buddy-mail-updated"));
  return !result.error;
}

export function ActiveGmailSync() {
  useEffect(() => {
    let running = false;
    let stopped = false;
    const check = () => {
      if (running || stopped || document.visibilityState === "hidden") return;
      running = true;
      void checkActiveGmail().catch(() => undefined).finally(() => { running = false; });
    };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
  return null;
}
