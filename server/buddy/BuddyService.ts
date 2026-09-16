import { z } from "zod";
import {
  buddyActivityEntrySchema,
  buddyPreferencesSchema,
  parsePendingCapture,
  type BuddyActivityEntry,
  type BuddyPreferences,
  type PendingCapture,
} from "../../src/domain/buddy";
import type { CandidateProfile, ProfileSelection } from "../../src/domain/profile";

export interface ExtensionAuth {
  token: string;
  origin: string;
}

interface PairingPort {
  start(): { code: string; expiresAt: string };
  complete(input: { code: string; origin: string }): Promise<{ token: string }>;
  authorize(token: string, origin: string): Promise<boolean>;
  revoke(): Promise<void>;
  status(): Promise<{ paired: false } | { paired: true; origin: string; pairedAt: string }>;
}

interface ProfilePort {
  status(): Promise<{ platformSupported: boolean; hasProfile: boolean }>;
  read(): Promise<CandidateProfile>;
  replace(input: unknown): Promise<CandidateProfile>;
  select(paths: readonly string[]): Promise<ProfileSelection>;
  delete(): Promise<void>;
}

interface BuddyStorePort {
  getPreferences(): Promise<BuddyPreferences>;
  setPreferences(input: unknown): Promise<BuddyPreferences>;
  appendActivity(input: unknown): Promise<void>;
  listActivity(): Promise<BuddyActivityEntry[]>;
  clearActivity(): Promise<void>;
  addCapture(input: unknown): Promise<PendingCapture>;
  listCaptures(): Promise<PendingCapture[]>;
  deleteCapture(id: string): Promise<void>;
}

export interface BuddyServiceOptions {
  pairing: PairingPort;
  profile: ProfilePort;
  store: BuddyStorePort;
}

const extensionPreferencePatchSchema = z.object({
  paused: z.boolean().optional(),
  mode: z.enum(["approval", "automatic"]).optional(),
  domain: z.string().trim().min(1).max(253).optional(),
  domainEnabled: z.boolean().optional(),
  automaticModeConfirmed: z.literal(true).optional(),
}).strict();

class BuddyServiceError extends Error {
  constructor(readonly code: "unauthorized" | "confirmation-required" | "invalid-preference") {
    super(code);
  }
}

export class BuddyService {
  private readonly pairing: PairingPort;
  private readonly profile: ProfilePort;
  private readonly store: BuddyStorePort;

  constructor(options: BuddyServiceOptions) {
    this.pairing = options.pairing;
    this.profile = options.profile;
    this.store = options.store;
  }

  pairStart() { return this.pairing.start(); }
  pairComplete(input: { code: string; origin: string }) { return this.pairing.complete(input); }
  revoke() { return this.pairing.revoke(); }
  status() { return this.pairing.status(); }
  getPreferences() { return this.store.getPreferences(); }
  setPreferences(input: unknown) { return this.store.setPreferences(input); }
  listActivity() { return this.store.listActivity(); }
  clearActivity() { return this.store.clearActivity(); }
  listCaptures() { return this.store.listCaptures(); }
  deleteCapture(id: string) { return this.store.deleteCapture(id); }

  async selectProfile(auth: ExtensionAuth, paths: readonly string[]): Promise<ProfileSelection> {
    await this.requireAuthorization(auth);
    return this.profile.select(paths);
  }

  async readPreferences(auth: ExtensionAuth): Promise<BuddyPreferences> {
    await this.requireAuthorization(auth);
    return this.store.getPreferences();
  }

  async updateExtensionPreference(auth: ExtensionAuth, input: unknown): Promise<BuddyPreferences> {
    await this.requireAuthorization(auth);
    const parsed = extensionPreferencePatchSchema.safeParse(input);
    if (!parsed.success) throw new BuddyServiceError("invalid-preference");
    const patch = parsed.data;
    if (patch.mode === "automatic" && patch.automaticModeConfirmed !== true) throw new BuddyServiceError("confirmation-required");
    if ((patch.domain === undefined) !== (patch.domainEnabled === undefined)) throw new BuddyServiceError("invalid-preference");

    const current = await this.store.getPreferences();
    const enabledDomains = new Set(current.enabledDomains);
    if (patch.domain && patch.domainEnabled) enabledDomains.add(patch.domain.toLowerCase());
    if (patch.domain && patch.domainEnabled === false) enabledDomains.delete(patch.domain.toLowerCase());
    const candidate = {
      mode: patch.mode ?? current.mode,
      paused: patch.paused ?? current.paused,
      enabledDomains: [...enabledDomains].sort(),
    };
    const result = buddyPreferencesSchema.safeParse(candidate);
    if (!result.success) throw new BuddyServiceError("invalid-preference");
    return this.store.setPreferences(result.data);
  }

  async appendActivity(auth: ExtensionAuth, input: unknown): Promise<void> {
    await this.requireAuthorization(auth);
    await this.store.appendActivity(buddyActivityEntrySchema.parse(input));
  }

  async addCapture(auth: ExtensionAuth, input: unknown): Promise<PendingCapture> {
    await this.requireAuthorization(auth);
    return this.store.addCapture(parsePendingCapture(input));
  }

  private async requireAuthorization(auth: ExtensionAuth): Promise<void> {
    if (!await this.pairing.authorize(auth.token, auth.origin)) throw new BuddyServiceError("unauthorized");
  }
}
