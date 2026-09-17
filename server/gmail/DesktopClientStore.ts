import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export const desktopClientIdSchema = z.string().trim().max(200).regex(/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/);
const savedClientSchema = z.object({ clientId: desktopClientIdSchema }).strict();

// The Desktop client ID is public configuration, not an OAuth token or secret.
export class DesktopClientStore {
  readonly path: string;
  constructor(root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "JobBuddy") : join(homedir(), ".job-buddy")) {
    this.path = join(root, "gmail-desktop-client.json");
  }
  async get(): Promise<string | null> {
    try { return savedClientSchema.parse(JSON.parse(await readFile(this.path, "utf8"))).clientId; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Saved Gmail client configuration is invalid or unreadable");
    }
  }
  async save(input: string): Promise<void> {
    const clientId = desktopClientIdSchema.parse(input);
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ clientId }) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.path);
    } finally { await rm(temporaryPath, { force: true }); }
  }
}
