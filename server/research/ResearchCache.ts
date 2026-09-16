import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Market } from "../../src/domain/research";
import { parseValidatedResearchRelease, validateResearchRelease, type ValidatedResearchRelease } from "./ResearchSource";

export interface ResearchCacheOptions { root?: string; now?: () => number }
export interface CachedResearchRelease { release: ValidatedResearchRelease; activatedAt: string }
export interface ResearchCacheStatus {
  market: Market;
  activeReleaseId?: string;
  activatedAt?: string;
  quarantineCount: number;
  latestQuarantinePath?: string;
}

function defaultRoot(): string {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "JobBuddy") : join(homedir(), ".job-buddy");
  return join(base, "research");
}

export class ResearchCache {
  private readonly root: string;
  private readonly now: () => number;

  constructor(options: ResearchCacheOptions = {}) {
    this.root = options.root ?? defaultRoot();
    this.now = options.now ?? Date.now;
  }

  async stage(input: unknown): Promise<{ release: ValidatedResearchRelease; path: string }> {
    let release: ValidatedResearchRelease;
    try {
      release = validateResearchRelease(input);
    } catch (error) {
      await this.quarantine(input, error instanceof Error ? error.message : "validation-failed");
      throw new Error("invalid-research-release", { cause: error });
    }
    const path = join(this.marketDirectory(release.market), "staged.json");
    const wrapper = { release, activatedAt: new Date(this.now()).toISOString() };
    await this.writeAtomic(path, wrapper);
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as CachedResearchRelease;
      parseValidatedResearchRelease(parsed.release);
    } catch (error) {
      await rm(path, { force: true });
      await this.quarantine(release, error instanceof Error ? error.message : "staged-readback-failed");
      throw new Error("invalid-research-release", { cause: error });
    }
    return { release, path };
  }

  async promote(input: unknown): Promise<ValidatedResearchRelease> {
    const staged = await this.stage(input);
    const activePath = join(this.marketDirectory(staged.release.market), "active.json");
    try {
      await rename(staged.path, activePath);
    } catch (error) {
      const backupPath = `${activePath}.${randomUUID()}.backup`;
      try {
        await rename(activePath, backupPath);
        await rename(staged.path, activePath);
        await rm(backupPath, { force: true });
      } catch (replacementError) {
        try { await rename(backupPath, activePath); } catch { /* keep the original error */ }
        throw replacementError;
      }
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
    return staged.release;
  }

  async active(market: Market): Promise<CachedResearchRelease | undefined> {
    try {
      const parsed = JSON.parse(await readFile(join(this.marketDirectory(market), "active.json"), "utf8")) as CachedResearchRelease;
      return { release: parseValidatedResearchRelease(parsed.release), activatedAt: parsed.activatedAt };
    } catch { return undefined; }
  }

  async quarantine(input: unknown, reason: string): Promise<string> {
    const market = input && typeof input === "object" && ["SG", "HK", "US"].includes(String((input as Record<string, unknown>).market))
      ? String((input as Record<string, unknown>).market) as Market : "SG";
    const path = join(this.marketDirectory(market), "quarantine", `${this.now()}-${randomUUID()}.json`);
    await this.writeAtomic(path, {
      market,
      quarantinedAt: new Date(this.now()).toISOString(),
      reason: reason.slice(0, 500),
      releaseId: input && typeof input === "object" && typeof (input as Record<string, unknown>).id === "string" ? (input as Record<string, unknown>).id : undefined,
    });
    return path;
  }

  async status(market: Market): Promise<ResearchCacheStatus> {
    const active = await this.active(market);
    const quarantineDirectory = join(this.marketDirectory(market), "quarantine");
    let files: string[] = [];
    try { files = (await readdir(quarantineDirectory)).filter((file) => file.endsWith(".json")).sort(); } catch { /* empty */ }
    return {
      market,
      ...(active ? { activeReleaseId: active.release.id, activatedAt: active.activatedAt } : {}),
      quarantineCount: files.length,
      ...(files.length ? { latestQuarantinePath: join(quarantineDirectory, files.at(-1)!) } : {}),
    };
  }

  private marketDirectory(market: Market): string { return join(this.root, market); }

  private async writeAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporaryPath, path);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
