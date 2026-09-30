import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { candidateProfileSchema, type CandidateProfile } from "../../src/domain/profile";
import { DpapiUnavailableError, WindowsDpapi, type CommandRunner } from "../secrets/WindowsDpapi";
import type { ProfileVault } from "./ProfileVault";

export interface WindowsDpapiProfileVaultOptions {
  root?: string;
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
}

function defaultRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? join(localAppData, "JobBuddy") : join(homedir(), ".job-buddy");
}

export class WindowsDpapiProfileVault implements ProfileVault {
  readonly profilePath: string;
  private readonly dpapi: WindowsDpapi;

  constructor(options: WindowsDpapiProfileVaultOptions = {}) {
    this.profilePath = join(options.root ?? defaultRoot(), "profile", "candidate-profile.bin");
    this.dpapi = new WindowsDpapi({ runner: options.runner, platform: options.platform });
  }

  isSupported(): boolean {
    return this.dpapi.isSupported();
  }

  async read(): Promise<CandidateProfile | null> {
    this.assertSupported();
    let protectedBytes: Buffer;
    try {
      protectedBytes = await readFile(this.profilePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Protected candidate profile could not be read");
    }
    try {
      const plaintext = await this.dpapi.unprotect(protectedBytes);
      return candidateProfileSchema.parse(JSON.parse(plaintext.toString("utf8")));
    } catch (error) {
      if (error instanceof DpapiUnavailableError) throw error;
      throw new Error("Protected candidate profile is invalid");
    }
  }

  async replace(profile: CandidateProfile): Promise<void> {
    this.assertSupported();
    const validated = candidateProfileSchema.parse(profile);
    const protectedBytes = await this.dpapi.protect(Buffer.from(JSON.stringify(validated), "utf8"));
    const directory = dirname(this.profilePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.profilePath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(protectedBytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.profilePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async delete(): Promise<void> {
    this.assertSupported();
    await rm(this.profilePath, { force: true });
  }

  private assertSupported(): void {
    if (!this.isSupported()) throw new DpapiUnavailableError();
  }
}
