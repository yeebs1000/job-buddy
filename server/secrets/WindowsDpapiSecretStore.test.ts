import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WindowsDpapiSecretStore, type CommandRunner } from "./WindowsDpapiSecretStore";

describe("WindowsDpapiSecretStore", () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-secret-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("stores encrypted bytes and never passes plaintext in command arguments", async () => {
    const run = vi.fn<CommandRunner["run"]>(async ({ stdin }) => {
      const output = Buffer.from(stdin, "base64").map((byte) => byte ^ 0xa5);
      return { stdout: Buffer.from(output).toString("base64") };
    });
    const store = new WindowsDpapiSecretStore({ root, runner: { run }, platform: "win32" });

    await store.set("gmail-refresh-token", "refresh-canary");

    expect(await store.get("gmail-refresh-token")).toBe("refresh-canary");
    expect(await readFile(store.tokenPath, "utf8")).not.toContain("refresh-canary");
    expect(run.mock.calls.flatMap(([request]) => request.args).join(" ")).not.toContain("refresh-canary");
    expect(run.mock.calls.every(([request]) => request.executable === "powershell.exe")).toBe(true);
    expect(run.mock.calls.every(([request]) => {
      const encoded = request.args.at(-1) ?? "";
      return Buffer.from(encoded, "base64").toString("utf16le").includes("Add-Type -AssemblyName System.Security");
    })).toBe(true);
  });

  it("is idempotent when deleting a missing token", async () => {
    const runner: CommandRunner = { run: vi.fn() };
    const store = new WindowsDpapiSecretStore({ root, runner, platform: "win32" });

    await expect(store.delete("gmail-refresh-token")).resolves.toBeUndefined();
  });

  it("refuses to operate when current-user DPAPI is unavailable", async () => {
    const store = new WindowsDpapiSecretStore({ root, runner: { run: vi.fn() }, platform: "linux" });

    expect(store.isSupported()).toBe(false);
    await expect(store.set("gmail-refresh-token", "refresh-canary")).rejects.toThrow("Windows");
  });
});
