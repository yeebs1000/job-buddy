import { jobBuddyDb } from "../../db/database";
import type { CandidateProfile } from "../../domain/profile";
import { isWebMode } from "../../app/runtimeMode";
import { browserProfileClient, prepareBrowserProfile } from "../profile/browserProfileClient";
import { parseWorkspaceBackup, portableMetadata, workspaceTableNames, type WorkspaceBackup } from "./workspaceSchema";

const unsupported = ["researchSnapshots", "prepSessions", "profileFields"] as const;

/** An explicit profile argument is a separately captured companion snapshot (or deliberate tracker-only export). */
export async function readWorkspaceBackup(profile?: CandidateProfile | null): Promise<WorkspaceBackup> {
  const revision = (await jobBuddyDb.browserProfiles.get("candidate"))?.revision;
  const response = profile === undefined ? await browserProfileClient.get() : null;
  if (response && !response.platformSupported) throw new Error("Secure profile storage is unavailable. No profile backup was created.");
  const candidate = response ? response.profile : profile;
  const hasProfile = profile === undefined ? Boolean(revision) : profile !== null;
  return jobBuddyDb.transaction("r", jobBuddyDb.tables, async () => {
    if (profile === undefined && (await jobBuddyDb.browserProfiles.get("candidate"))?.revision !== revision) throw new Error("Profile changed during backup. Retry.");
    for (const name of unsupported) if (await jobBuddyDb.table(name).count()) throw new Error(`Unsupported populated store: ${name}. No partial backup was created.`);
    const tables = Object.fromEntries(await Promise.all(workspaceTableNames.map(async name => [name, await jobBuddyDb.table(name).toArray()])));
    const metadata = (await jobBuddyDb.metadata.toArray()).flatMap(record => { const item = portableMetadata(record); return item ? [item] : []; });
    return parseWorkspaceBackup({ version: 1, exportedAt: new Date().toISOString(), manifest: { counts: Object.fromEntries(workspaceTableNames.map(name => [name, tables[name].length])), profileIncluded: hasProfile }, tables, metadata, profile: hasProfile ? candidate : null });
  });
}

export async function restoreWorkspaceBackup(input: WorkspaceBackup): Promise<void> {
  if (!isWebMode) throw new Error("Restore is available in web mode only.");
  const backup = parseWorkspaceBackup(input);
  const prepared = backup.profile ? await prepareBrowserProfile(backup.profile) : null;
  await jobBuddyDb.transaction("rw", jobBuddyDb.tables, async () => {
    // Hold all stores, including metadata, to serialize this check with other tabs.
    for (const table of jobBuddyDb.tables) {
      if (table.name !== "metadata" && await table.count()) throw new Error("Restore requires an empty workspace. Keep this workspace and use a fresh browser profile.");
    }
    const metadata = await jobBuddyDb.metadata.toArray();
    for (const record of metadata) {
      const harmless = record.key === "demo-seeded-v1" || record.key === "live-workspace:v1"
        || (record.key === "live-workspace-backup:v1" && Array.isArray(JSON.parse(record.value).applications) && JSON.parse(record.value).applications.length === 0);
      if (!harmless) throw new Error("This workspace is occupied. Restore into an empty workspace.");
    }
    for (const name of workspaceTableNames) if (backup.tables[name].length) await jobBuddyDb.table(name).bulkAdd(backup.tables[name]);
    if (backup.metadata.length) await jobBuddyDb.metadata.bulkAdd(backup.metadata);
    // The imported tracker has already passed its own migration; do not reclassify it on boot.
    await jobBuddyDb.metadata.bulkPut([{ key: "demo-seeded-v1", value: "true" }, { key: "live-workspace:v1", value: "complete" }, { key: "restored-mail-unbound:v1", value: "true" }]);
    if (prepared) { await jobBuddyDb.profileKeys.add(prepared.key); await jobBuddyDb.browserProfiles.add(prepared.record); }
  });
}
