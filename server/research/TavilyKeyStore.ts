import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { WindowsDpapi, type WindowsDpapiOptions } from "../secrets/WindowsDpapi";
import { tavilyKeySchema } from "../../src/domain/researchSearch";

export interface SearchKeyStore {
  isSupported(): boolean;
  get(): Promise<string | null>;
  set(key: string): Promise<void>;
  delete(): Promise<void>;
}
export const researchDataRoot = () => process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "JobBuddy") : join(homedir(), ".job-buddy");

export class TavilyKeyStore implements SearchKeyStore {
  private readonly dpapi: WindowsDpapi;
  private readonly path: string;
  constructor(options: WindowsDpapiOptions & { root?: string } = {}) {
    this.dpapi = new WindowsDpapi(options);
    this.path = join(options.root ?? researchDataRoot(), "secrets", "tavily-key.bin");
  }
  isSupported() { return this.dpapi.isSupported(); }
  async get(): Promise<string | null> {
    if (!this.isSupported()) throw new Error("web-search-storage-unavailable");
    try {
      const encrypted = await readFile(this.path);
      if (encrypted.length > 16384) throw new Error();
      return tavilyKeySchema.parse((await this.dpapi.unprotect(encrypted)).toString("utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("web-search-storage-unavailable");
    }
  }
  async set(input: string): Promise<void> {
    const key = tavilyKeySchema.parse(input);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const encrypted = await this.dpapi.protect(Buffer.from(key, "utf8"));
      await mkdir(dirname(this.path), { recursive: true });
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(encrypted); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.path);
    } catch { throw new Error("web-search-storage-unavailable"); }
    finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
  async delete(): Promise<void> {
    if (!this.isSupported()) throw new Error("web-search-storage-unavailable");
    try { await rm(this.path, { force: true }); }
    catch { throw new Error("web-search-storage-unavailable"); }
  }
}
