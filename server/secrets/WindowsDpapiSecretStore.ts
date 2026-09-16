import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SecretKey, SecretStore } from "./SecretStore";
import { WindowsDpapi, type CommandRunner } from "./WindowsDpapi";
export type { CommandRunner } from "./WindowsDpapi";

export interface WindowsDpapiSecretStoreOptions {
  root?: string;
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
}

function defaultRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? join(localAppData, "JobBuddy") : join(homedir(), ".job-buddy");
}

export class WindowsDpapiSecretStore implements SecretStore {
  readonly tokenPath: string;
  private readonly dpapi: WindowsDpapi;

  constructor(options: WindowsDpapiSecretStoreOptions = {}) {
    const root = options.root ?? defaultRoot();
    this.tokenPath = join(root, "secrets", "gmail-refresh-token.bin");
    this.dpapi = new WindowsDpapi({ runner: options.runner, platform: options.platform });
  }

  isSupported(): boolean {
    return this.dpapi.isSupported();
  }

  async get(key: SecretKey): Promise<string | null> {
    this.assertSupported();
    this.assertKey(key);
    let protectedBytes: Buffer;
    try {
      protectedBytes = await readFile(this.tokenPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Protected Gmail credential could not be read");
    }
    return (await this.dpapi.unprotect(protectedBytes)).toString("utf8");
  }

  async set(key: SecretKey, value: string): Promise<void> {
    this.assertSupported();
    this.assertKey(key);
    if (!value) throw new Error("Refresh token cannot be empty");
    const protectedBytes = await this.dpapi.protect(Buffer.from(value, "utf8"));
    const directory = dirname(this.tokenPath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.tokenPath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(protectedBytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.tokenPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async delete(key: SecretKey): Promise<void> {
    this.assertSupported();
    this.assertKey(key);
    await rm(this.tokenPath, { force: true });
  }

  private assertSupported(): void {
    if (!this.isSupported()) throw new Error("Windows current-user DPAPI is required for persistent Gmail credentials");
  }

  private assertKey(key: SecretKey): void {
    if (key !== "gmail-refresh-token") throw new Error("Unsupported secret key");
  }
}
