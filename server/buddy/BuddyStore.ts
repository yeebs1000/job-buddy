import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  buddyActivityEntrySchema,
  buddyPreferencesSchema,
  defaultBuddyPreferences,
  parsePendingCapture,
  parsePendingSalaryEvidence,
  pendingCaptureSchema,
  pendingSalaryEvidenceSchema,
  type BuddyActivityEntry,
  type BuddyPreferences,
  type PendingCapture,
  type PendingSalaryEvidence,
} from "../../src/domain/buddy";

const pairingMetadataSchema = z.object({
  origin: z.string().regex(/^chrome-extension:\/\/[a-p]{32}$/),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  pairedAt: z.string().datetime(),
}).strict();

export type PairingMetadata = z.infer<typeof pairingMetadataSchema>;

export interface PairingMetadataStore {
  getPairing(): Promise<PairingMetadata | null>;
  savePairing(metadata: PairingMetadata): Promise<void>;
  clearPairing(): Promise<void>;
}

export interface BuddyStoreOptions {
  root?: string;
  now?: () => number;
}

function defaultRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? join(localAppData, "JobBuddy") : join(homedir(), ".job-buddy");
}

export class BuddyStore implements PairingMetadataStore {
  readonly preferencesPath: string;
  readonly activityPath: string;
  readonly capturesPath: string;
  readonly salaryEvidencePath: string;
  readonly pairingPath: string;
  private readonly now: () => number;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: BuddyStoreOptions = {}) {
    const directory = join(options.root ?? defaultRoot(), "buddy");
    this.preferencesPath = join(directory, "preferences.json");
    this.activityPath = join(directory, "activity.json");
    this.capturesPath = join(directory, "captures.json");
    this.salaryEvidencePath = join(directory, "salary-evidence.json");
    this.pairingPath = join(directory, "pairing.json");
    this.now = options.now ?? Date.now;
  }

  async getPreferences(): Promise<BuddyPreferences> {
    await this.mutationTail;
    return this.readParsed(this.preferencesPath, buddyPreferencesSchema, defaultBuddyPreferences);
  }

  setPreferences(input: unknown): Promise<BuddyPreferences> {
    return this.mutate(async () => {
      const preferences = buddyPreferencesSchema.parse(input);
      await this.writeJson(this.preferencesPath, preferences);
      return preferences;
    });
  }

  async listActivity(): Promise<BuddyActivityEntry[]> {
    await this.mutationTail;
    return this.readParsed(this.activityPath, z.array(buddyActivityEntrySchema), []);
  }

  appendActivity(input: unknown): Promise<void> {
    return this.mutate(async () => {
      const entry = buddyActivityEntrySchema.parse(input);
      const current = await this.readParsed(this.activityPath, z.array(buddyActivityEntrySchema), []);
      await this.writeJson(this.activityPath, [...current, entry].slice(-500));
    });
  }

  clearActivity(): Promise<void> {
    return this.mutate(() => this.writeJson(this.activityPath, []));
  }

  async listCaptures(): Promise<PendingCapture[]> {
    await this.mutationTail;
    const captures = await this.readParsed(this.capturesPath, z.array(pendingCaptureSchema), []);
    return captures.filter((capture) => !this.captureExpired(capture));
  }

  addCapture(input: unknown): Promise<PendingCapture> {
    return this.mutate(async () => {
      const capture = parsePendingCapture(input);
      const stored = await this.readParsed(this.capturesPath, z.array(pendingCaptureSchema), []);
      const current = stored.filter((item) => !this.captureExpired(item));
      const duplicate = current.find((item) => item.completionId === capture.completionId);
      if (duplicate) return duplicate;
      if (!this.captureExpired(capture)) await this.writeJson(this.capturesPath, [...current, capture].slice(-100));
      else if (current.length !== stored.length) await this.writeJson(this.capturesPath, current);
      return capture;
    });
  }

  deleteCapture(id: string): Promise<void> {
    return this.mutate(async () => {
      const captures = await this.readParsed(this.capturesPath, z.array(pendingCaptureSchema), []);
      await this.writeJson(this.capturesPath, captures.filter((capture) => capture.id !== id));
    });
  }

  async listSalaryEvidence(): Promise<PendingSalaryEvidence[]> {
    await this.mutationTail;
    const evidence = await this.readParsed(this.salaryEvidencePath, z.array(pendingSalaryEvidenceSchema), []);
    return evidence.filter((item) => !this.salaryEvidenceExpired(item));
  }

  addSalaryEvidence(input: unknown): Promise<PendingSalaryEvidence> {
    return this.mutate(async () => {
      const evidence = parsePendingSalaryEvidence(input);
      const stored = await this.readParsed(this.salaryEvidencePath, z.array(pendingSalaryEvidenceSchema), []);
      const current = stored.filter((item) => !this.salaryEvidenceExpired(item));
      const duplicate = current.find((item) => item.id === evidence.id || item.sourceUrl === evidence.sourceUrl);
      if (duplicate) return duplicate;
      if (!this.salaryEvidenceExpired(evidence)) await this.writeJson(this.salaryEvidencePath, [...current, evidence].slice(-100));
      else if (current.length !== stored.length) await this.writeJson(this.salaryEvidencePath, current);
      return evidence;
    });
  }

  deleteSalaryEvidence(id: string): Promise<void> {
    return this.mutate(async () => {
      const evidence = await this.readParsed(this.salaryEvidencePath, z.array(pendingSalaryEvidenceSchema), []);
      await this.writeJson(this.salaryEvidencePath, evidence.filter((item) => item.id !== id));
    });
  }

  async getPairing(): Promise<PairingMetadata | null> {
    await this.mutationTail;
    return this.readParsed(this.pairingPath, pairingMetadataSchema.nullable(), null);
  }

  savePairing(input: PairingMetadata): Promise<void> {
    return this.mutate(async () => {
      await this.writeJson(this.pairingPath, pairingMetadataSchema.parse(input));
    });
  }

  clearPairing(): Promise<void> {
    return this.mutate(async () => { await rm(this.pairingPath, { force: true }); });
  }

  private captureExpired(capture: PendingCapture): boolean {
    const detectedAt = Date.parse(capture.detectedAt);
    return !Number.isFinite(detectedAt) || this.now() - detectedAt > 30 * 24 * 60 * 60 * 1_000;
  }

  private salaryEvidenceExpired(evidence: PendingSalaryEvidence): boolean {
    const detectedAt = Date.parse(evidence.detectedAt);
    return !Number.isFinite(detectedAt) || this.now() - detectedAt > 30 * 24 * 60 * 60 * 1_000;
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readParsed<T>(path: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
    try {
      return schema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch {
      return structuredClone(fallback);
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, path);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
