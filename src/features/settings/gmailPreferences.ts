import { jobBuddyDb } from "../../db/database";
import type { MailScanMode } from "../updates/runMailScan";

export interface GmailPreferences {
  selectedSource: "gmail" | "simulated";
  initialSyncCompleted: boolean;
  dailyActiveScanEnabled: boolean;
  automationMode: MailScanMode;
}

export interface GmailPreferencesStore {
  get(): Promise<GmailPreferences>;
  save(value: GmailPreferences): Promise<void>;
}

export const defaultGmailPreferences: GmailPreferences = {
  selectedSource: "simulated",
  initialSyncCompleted: false,
  dailyActiveScanEnabled: false,
  automationMode: "approval",
};

const key = "gmail-preferences:v1";

function valid(value: unknown): value is GmailPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.selectedSource === "gmail" || item.selectedSource === "simulated")
    && typeof item.initialSyncCompleted === "boolean"
    && typeof item.dailyActiveScanEnabled === "boolean"
    && (item.automationMode === "approval" || item.automationMode === "unrestricted");
}

export const gmailPreferences: GmailPreferencesStore = {
  async get() {
    const record = await jobBuddyDb.metadata.get(key);
    if (!record) return { ...defaultGmailPreferences };
    try {
      const parsed: unknown = JSON.parse(record.value);
      return valid(parsed) ? { ...parsed } : { ...defaultGmailPreferences };
    } catch {
      return { ...defaultGmailPreferences };
    }
  },
  async save(value) {
    if (!valid(value)) throw new Error("Invalid Gmail preferences");
    await jobBuddyDb.metadata.put({ key, value: JSON.stringify(value) });
  },
};
