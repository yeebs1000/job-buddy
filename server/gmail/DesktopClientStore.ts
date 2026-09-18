import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { WindowsDpapi } from "../secrets/WindowsDpapi";

export const desktopClientIdSchema = z.string().trim().max(200).regex(/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/);
export const desktopClientSecretSchema = z.string().trim().min(1).max(512).regex(/^\S+$/);
const savedClientSchema = z.object({ clientId: desktopClientIdSchema, protectedClientSecret: z.string().min(1).max(16384).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional() }).strict();

// The Desktop client ID is public configuration, not an OAuth token or secret.
export class DesktopClientStore {
  private readonly dpapi = new WindowsDpapi();
  readonly path: string;
  constructor(root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "JobBuddy") : join(homedir(), ".job-buddy")) {
    this.path = join(root, "gmail-desktop-client.json");
  }
  async get(): Promise<string | null> {
    return (await this.read())?.clientId ?? null;
  }
  async getCredentials(): Promise<{ clientId: string; clientSecret?: string } | null> {
    const saved = await this.read();
    if (!saved) return null;
    if (!saved.protectedClientSecret) return { clientId: saved.clientId };
    try {
      const clientSecret = desktopClientSecretSchema.parse((await this.dpapi.unprotect(Buffer.from(saved.protectedClientSecret, "base64"))).toString("utf8"));
      return { clientId: saved.clientId, clientSecret };
    } catch { throw new Error("Saved Gmail client secret could not be decrypted for this Windows user"); }
  }
  private async read() {
    try { return savedClientSchema.parse(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Saved Gmail client configuration is invalid or unreadable");
    }
  }
  async save(input: string, secretInput?: string): Promise<void> {
    const clientId = desktopClientIdSchema.parse(input);
    const clientSecret = desktopClientSecretSchema.optional().parse(secretInput);
    const protectedClientSecret = clientSecret ? (await this.dpapi.protect(Buffer.from(clientSecret, "utf8"))).toString("base64") : undefined;
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ clientId, protectedClientSecret }) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.path);
    } finally { await rm(temporaryPath, { force: true }); }
  }
}
