import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile } from "../../src/domain/profile";
import type { CommandRunner } from "../secrets/WindowsDpapi";
import { WindowsDpapiProfileVault } from "./WindowsDpapiProfileVault";

describe("WindowsDpapiProfileVault", () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-profile-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("atomically stores protected bytes without plaintext", async () => {
    const runner = xorRunner();
    const vault = new WindowsDpapiProfileVault({ root, runner, platform: "win32" });
    const profile = {
      ...emptyCandidateProfile,
      identity: { givenName: "Alex", familyName: "Tan" },
      contact: { email: "alex@example.com" },
    };

    await vault.replace(profile);

    const bytes = await readFile(vault.profilePath);
    expect(bytes.toString("utf8")).not.toContain("alex@example.com");
    expect(await vault.read()).toEqual(profile);
  });

  it("leaves no plaintext or destination file when protection fails", async () => {
    const vault = new WindowsDpapiProfileVault({
      root,
      runner: { run: vi.fn().mockRejectedValue(new Error("helper failed")) },
      platform: "win32",
    });

    await expect(vault.replace({
      ...emptyCandidateProfile,
      contact: { email: "alex@example.com" },
    })).rejects.toThrow("helper failed");
    await expect(access(vault.profilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never falls back to plaintext off Windows", async () => {
    const vault = new WindowsDpapiProfileVault({ root, runner: xorRunner(), platform: "darwin" });

    expect(vault.isSupported()).toBe(false);
    await expect(vault.replace(emptyCandidateProfile)).rejects.toMatchObject({ code: "platform-unsupported" });
    await expect(access(vault.profilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns null for a missing profile and deletes idempotently", async () => {
    const vault = new WindowsDpapiProfileVault({ root, runner: xorRunner(), platform: "win32" });

    await expect(vault.read()).resolves.toBeNull();
    await expect(vault.delete()).resolves.toBeUndefined();
  });
});

function xorRunner(): CommandRunner {
  return {
    async run({ stdin }) {
      const transformed = Buffer.from(stdin, "base64").map((byte) => byte ^ 0xa5);
      return { stdout: Buffer.from(transformed).toString("base64") };
    },
  };
}
