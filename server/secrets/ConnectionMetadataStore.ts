import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface GmailConnectionMetadata {
  accountEmail: string;
  connectedAt: string;
  state: "connected" | "reconnect-required";
}

function defaultRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable");
  return join(localAppData, "JobBuddy");
}

function validMetadata(value: unknown): value is GmailConnectionMetadata {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",") === "accountEmail,connectedAt,state"
    && typeof record.accountEmail === "string"
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.accountEmail)
    && typeof record.connectedAt === "string"
    && Number.isFinite(Date.parse(record.connectedAt))
    && (record.state === "connected" || record.state === "reconnect-required");
}

export class ConnectionMetadataStore {
  readonly path: string;

  constructor(root = defaultRoot()) {
    this.path = join(root, "gmail-connection.json");
  }

  async get(): Promise<GmailConnectionMetadata | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (!validMetadata(parsed)) return null;
      return { accountEmail: parsed.accountEmail, connectedAt: parsed.connectedAt, state: parsed.state };
    } catch {
      return null;
    }
  }

  async set(metadata: GmailConnectionMetadata): Promise<void> {
    if (!validMetadata(metadata)) throw new Error("Invalid Gmail connection metadata");
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.path);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async delete(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
